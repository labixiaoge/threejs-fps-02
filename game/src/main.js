// RUSTLINE DEPOT — boot and the one loop: a fixed 60 Hz simulation feeding
// a render at the display's rate. The match state machine lives here: buy
// phase, live round, plant/defuse, round end, match end. ?shot=start|play|
// buy|end with &seed=N sets up a deterministic frame for a capture, renders
// it twice, then freezes it and sets window.__shotReady.
import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { createWorld, SITES, SPAWNS } from './world.js';
import { createInput } from './input.js';
import { createPlayer } from './player.js';
import { createWeapon, WEAPONS, ARMOR_PRICE } from './weapon.js';
import { createBots } from './bots.js';
import { createCombat } from './combat.js';
import { createObjective, FUSE_SECONDS } from './objective.js';
import { createHud } from './hud.js';
import { createAudio } from './audio.js';

const FIXED_STEP = 1 / 60;
const BUY_SECONDS = 15;
const ROUND_SECONDS = 100;
const WINS_TO = 8;
const MAX_ROUNDS = 15;
const PLANT_SECONDS = 3.5;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seed = Number.parseInt(params.get('seed') ?? '1', 10) || 1;

function mulberry32(initial) {
  let a = initial;
  return function random() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const random = mulberry32(seed);

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.getElementById('game').appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(PALETTE.skyTop);
scene.fog = new THREE.Fog(new THREE.Color(PALETTE.fog), 30, 110);
const camera = new THREE.PerspectiveCamera(74, window.innerWidth / window.innerHeight, 0.05, 260);
scene.add(camera);

const audio = createAudio();
const world = createWorld(scene);
const combat = createCombat(scene);
const weapon = createWeapon(camera);
const hud = createHud();
const player = createPlayer(world.colliders);
const objective = createObjective(scene, world);
const input = createInput(renderer.domElement, onLockChange);
const raycaster = new THREE.Raycaster();
raycaster.far = 100;
const direction = new THREE.Vector3();
const tmpVec = new THREE.Vector3();

// The player's hitbox: what bot bullets test against. It renders nothing
// (colour writes off) but raycasts like any mesh.
const playerHitMesh = new THREE.Mesh(
  new THREE.BoxGeometry(0.68, 1.72, 0.68),
  new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false, colorWrite: false }),
);
playerHitMesh.position.set(0, 0.86, 0);
scene.add(playerHitMesh);

const match = {
  phase: 'menu',
  phaseT: 0,
  round: 1,
  scoreV: 0,
  scoreS: 0,
  money: 800,
  kills: 0,
  deaths: 0,
  lossStreak: 0,
  timer: ROUND_SECONDS,
  matchOver: false,
  lastReason: '',
};
let planted = null;
let plantProgress = 0;
let buyOpen = false;
let paused = false;
let frozen = false;
let started = false;
let accumulator = 0;
let lastTime = performance.now();
let elapsed = 0;
let minimapTimer = 0;
let fovTarget = 74;

function teamOf(name) {
  if (name === 'You') return 'vanguard';
  const bot = bots.bots.find((b) => b.name === name);
  return bot ? bot.team : 'vanguard';
}

const botEvents = {
  playerHitMesh,
  damagePlayer(amount, fromPos) {
    if (!player.state.alive || match.phase !== 'live') return;
    const taken = player.damage(amount);
    if (taken <= 0) return;
    plantProgress = 0;
    hud.hideProgress();
    hud.damageFlash();
    audio.hurt();
    if (!player.state.alive) {
      match.deaths += 1;
      const killer = bots.bots.find((b) => b.group.position.distanceTo(fromPos) < 0.01);
      hud.feed(killer ? killer.name : 'Sentinel', 'You', false, 'sentinel');
      if (document.pointerLockElement) document.exitPointerLock();
    }
  },
  killFeed(killer, victim, headshot) {
    hud.feed(killer, victim, headshot, teamOf(killer));
  },
  shotSound(pos) {
    audio.enemyShot(pos.distanceTo(player.state.position));
  },
  onPlanted(site) {
    if (planted) return;
    objective.plantAt(site);
    planted = { site };
    hud.banner('CHARGE PLANTED', `Site ${site} — ${FUSE_SECONDS}s fuse`, 3000);
    hud.toast(`Charge planted at Site ${site}. Defend it.`);
  },
  onDefused() {
    endRound('sentinel', 'Charge defused');
  },
};
const bots = createBots(scene, world, combat, botEvents);

// Debug/test hooks (harmless in play): automated tests read match state and
// advance the simulation without rendering, so whole rounds play out at
// full speed under software WebGL.
window.__match = match;
window.__bots = bots;
window.__player = player;
window.__advance = (seconds) => {
  const n = Math.round(seconds / FIXED_STEP);
  for (let i = 0; i < n; i += 1) step(FIXED_STEP);
  syncCamera();
};

function assignmentsForRound() {
  const site = random() < 0.5 ? 'A' : 'B';
  const other = site === 'A' ? 'B' : 'A';
  const siteNode = (s) => (s === 'A' ? 11 : 17);
  const holdNode = (s, i) => (s === 'A' ? [11, 10][i] : [17, 16][i]);
  const roles = {
    Rook: { role: 'carrier', site, node: siteNode(site) },
    Havoc: { role: 'push', site, node: siteNode(site) },
    Bramble: { role: 'push', site: other, node: siteNode(other) },
    Sable: { role: 'push', site: other, node: 3 },
    Onyx: { role: 'hold', site: 'A', holdNode: holdNode('A', 0) },
    Quill: { role: 'hold', site: 'A', holdNode: holdNode('A', 1) },
    Frost: { role: 'hold', site: 'B', holdNode: holdNode('B', 0) },
    Gale: { role: 'hold', site: 'B', holdNode: holdNode('B', 1) },
    Mire: { role: 'hold', site: 'B', holdNode: 3 },
  };
  return { roles, armor: match.round >= 2 };
}

function startMatch() {
  match.scoreV = 0;
  match.scoreS = 0;
  match.round = 1;
  match.money = 800;
  match.kills = 0;
  match.deaths = 0;
  match.lossStreak = 0;
  match.matchOver = false;
  weapon.owned.clear();
  weapon.owned.add('p9');
  weapon.switchTo('p9');
  startRound();
}

function startRound() {
  player.reset(SPAWNS.vanguard[0], -Math.PI / 2);
  player.state.armor = player.state.armor; // armour bought earlier persists
  bots.resetRound(assignmentsForRound());
  weapon.refillRound();
  objective.reset();
  planted = null;
  plantProgress = 0;
  buyOpen = false;
  hud.hideBuy();
  hud.hideProgress();
  match.phase = 'buy';
  match.phaseT = BUY_SECONDS;
  match.timer = ROUND_SECONDS;
  hud.setScore(match.scoreV, match.scoreS, match.round, MAX_ROUNDS);
  hud.setMoney(match.money);
  hud.setKd(match.kills, match.deaths);
  hud.toast(`Round ${match.round} — plant the charge at Site A or B, or eliminate the Sentinel squad.`);
}

function endRound(winner, reason) {
  if (match.phase !== 'live') return;
  match.phase = 'roundEnd';
  match.phaseT = 4;
  match.lastReason = reason;
  hud.hideProgress();
  hud.hideBuy();
  buyOpen = false;
  if (winner === 'vanguard') {
    match.scoreV += 1;
    match.money += 3250;
    match.lossStreak = 0;
    audio.roundWin();
    hud.banner('VANGUARD WINS THE ROUND', reason, 3600);
  } else {
    match.scoreS += 1;
    match.money += 1900 + Math.min(1000, match.lossStreak * 500);
    match.lossStreak += 1;
    audio.roundLoss();
    hud.banner('SENTINEL WINS THE ROUND', reason, 3600);
  }
  hud.setScore(match.scoreV, match.scoreS, match.round, MAX_ROUNDS);
  hud.setMoney(match.money);
  if (match.scoreV >= WINS_TO || match.scoreS >= WINS_TO || match.round >= MAX_ROUNDS) match.matchOver = true;
}

function endMatch() {
  match.phase = 'matchEnd';
  const won = match.scoreV > match.scoreS;
  hud.showOverlay('matchEnd', {
    title: won ? 'VANGUARD TAKES THE MATCH' : 'SENTINEL TAKES THE MATCH',
    copy: `Final score ${match.scoreV} — ${match.scoreS} over ${match.round} rounds. You: ${match.kills} kills, ${match.deaths} deaths, $${match.money} banked.`,
    action: 'Play again',
  });
  if (document.pointerLockElement) document.exitPointerLock();
}

function ownedSet() {
  const set = new Set(weapon.owned);
  if (player.state.armor > 0) set.add('armor');
  return set;
}

function tryBuy(id) {
  if (match.phase !== 'buy') return;
  const cost = id === 'armor' ? ARMOR_PRICE : WEAPONS[id].price;
  if (cost === undefined || match.money < cost) return;
  if (id === 'armor') {
    if (player.state.armor >= 100) return;
    match.money -= cost;
    player.state.armor = 100;
  } else {
    if (weapon.owned.has(id)) return;
    match.money -= cost;
    weapon.addOwned(id);
  }
  audio.buy();
  hud.setMoney(match.money);
  if (buyOpen) hud.showBuy(match.money, ownedSet());
}

function toggleBuy() {
  if (match.phase !== 'buy') return;
  buyOpen = !buyOpen;
  if (buyOpen) {
    hud.showBuy(match.money, ownedSet());
    if (document.pointerLockElement) document.exitPointerLock();
  } else {
    hud.hideBuy();
    input.requestLock();
  }
}

function playerShoot() {
  const def = weapon.def();
  if (!weapon.takeRound()) {
    audio.dryFire();
    return;
  }
  camera.getWorldDirection(direction);
  const spread = weapon.spread(player.groundSpeed(), input.state.aiming);
  direction.x += (random() * 2 - 1) * spread;
  direction.y += (random() * 2 - 1) * spread;
  direction.z += (random() * 2 - 1) * spread;
  direction.normalize();
  scene.updateMatrixWorld(true);
  raycaster.set(camera.position, direction);
  const meshes = world.shootables.concat(bots.hitMeshes);
  const hit = raycaster.intersectObjects(meshes, false)[0];
  const muzzle = weapon.muzzleWorldPosition(new THREE.Vector3());
  if (hit) {
    combat.spawnTracer(muzzle, hit.point);
    if (hit.object.userData.bot) {
      const bot = hit.object.userData.bot;
      const isHead = hit.object.userData.part === 'head';
      const falloff = hit.distance > 25 ? 0.8 : 1;
      const dmg = def.damage * falloff * (isHead ? def.headMult : 1);
      const killed = bots.damage(bot, dmg, 'You', isHead);
      combat.spawnBurst(hit.point, 6, 1.4);
      audio.hit();
      hud.hitMarker(killed, 130);
      if (killed) {
        audio.kill();
        match.kills += 1;
        match.money += 300;
        hud.setMoney(match.money);
        hud.setKd(match.kills, match.deaths);
      }
    } else {
      combat.spawnBurst(hit.point, 5, 1.2);
    }
  } else {
    combat.spawnTracer(muzzle, camera.position.clone().addScaledVector(direction, def.range));
  }
  weapon.pullTrigger();
  player.recoil(def.kick * 0.8, (random() * 2 - 1) * 0.002);
  audio.shot();
  const cur = weapon.def();
  hud.setAmmo(weapon.ammo[weapon.current].mag, weapon.ammo[weapon.current].reserve, cur.name);
}

function checkRoundEnd() {
  const vAlive = bots.aliveCount('vanguard') + (player.state.alive ? 1 : 0);
  const sAlive = bots.aliveCount('sentinel');
  if (planted) {
    if (sAlive === 0) endRound('vanguard', 'Site secured — detonation imminent');
    return;
  }
  if (sAlive === 0) endRound('vanguard', 'Elimination');
  else if (vAlive === 0) endRound('sentinel', 'Elimination');
  else if (match.timer <= 0) endRound('sentinel', 'Time expired — site held');
}

function syncCamera() {
  camera.position.set(player.state.position.x, player.state.position.y + player.state.eye, player.state.position.z);
  camera.rotation.set(player.state.pitch, player.state.yaw, 0, 'YXZ');
  playerHitMesh.position.set(player.state.position.x, player.state.position.y + 0.86, player.state.position.z);
}

function aimAt(point) {
  const dx = point.x - player.state.position.x;
  const dy = point.y - (player.state.position.y + player.state.eye);
  const dz = point.z - player.state.position.z;
  const length = Math.hypot(dx, dy, dz) || 1;
  player.state.yaw = Math.atan2(-dx, -dz);
  player.state.pitch = Math.asin(Math.max(-1, Math.min(1, dy / length)));
  syncCamera();
}

function step(dt) {
  elapsed += dt;
  if (match.phase === 'buy') {
    match.phaseT -= dt;
    if (match.phaseT <= 0) {
      match.phase = 'live';
      hud.hideBuy();
      buyOpen = false;
      hud.toast('Round live — go.');
    }
  } else if (match.phase === 'live') {
    match.timer -= dt;
    if (planted) {
      objective.step(dt, () => audio.fuseBeep(), () => endRound('vanguard', 'Detonation — Site ' + planted.site));
    }
    // Player plant: hold E inside a site while the charge is unplanted.
    if (!planted && player.state.alive && input.state.keys.has('KeyE')) {
      let siteKey = null;
      for (const key of Object.keys(SITES)) {
        const s = SITES[key];
        if (Math.hypot(player.state.position.x - s.center.x, player.state.position.z - s.center.z) < s.radius) siteKey = key;
      }
      if (siteKey) {
        plantProgress += dt;
        hud.showProgress(`Planting charge — Site ${siteKey}`, plantProgress / PLANT_SECONDS);
        if (plantProgress >= PLANT_SECONDS) {
          plantProgress = 0;
          hud.hideProgress();
          match.money += 300;
          hud.setMoney(match.money);
          botEvents.onPlanted(siteKey);
        }
      } else {
        plantProgress = 0;
        hud.hideProgress();
      }
    } else if (plantProgress > 0) {
      plantProgress = 0;
      hud.hideProgress();
    }
    player.step(dt, input.state.keys);
    bots.step(dt, player.state, planted, elapsed);
    checkRoundEnd();
  } else if (match.phase === 'roundEnd') {
    match.phaseT -= dt;
    bots.step(dt, player.state, planted, elapsed);
    if (match.phaseT <= 0) {
      if (match.matchOver) endMatch();
      else {
        match.round += 1;
        startRound();
      }
    }
  }
  weapon.step(dt);
  combat.step(dt);
  // Site letters bob; the planted lamp blinks in objective.step.
  for (const key of Object.keys(world.siteMarkers)) {
    const m = world.siteMarkers[key];
    m.letter.position.y = m.baseY + Math.sin(elapsed * 1.4) * 0.25;
    m.letter.lookAt(camera.position);
  }
}

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min((now - lastTime) / 1000, 0.1);
  lastTime = now;
  if (!frozen && !paused) {
    const look = input.takeLook();
    player.look(look.x, look.y);
    if (match.phase === 'live' && player.state.alive) {
      if (input.state.firing && weapon.ready()) playerShoot();
      if (input.pressed('KeyR') && weapon.reload()) audio.reload();
      if (input.pressed('Digit1')) weapon.switchTo('p9');
      if (input.pressed('Digit2')) weapon.switchTo(weapon.owned.has('ar77') ? 'ar77' : weapon.owned.has('vk9') ? 'vk9' : 'p9');
      if (input.pressed('Digit3')) weapon.switchTo('lw50');
    }
    if (input.pressed('KeyB')) toggleBuy();
    if (buyOpen) {
      if (input.pressed('Digit1')) tryBuy('vk9');
      if (input.pressed('Digit2')) tryBuy('ar77');
      if (input.pressed('Digit3')) tryBuy('lw50');
      if (input.pressed('Digit4')) tryBuy('armor');
    }
    if (input.pressed('KeyM')) audio.setMuted(!audio.isMuted());
    accumulator += dt;
    let steps = 0;
    while (accumulator >= FIXED_STEP && steps < 5) {
      step(FIXED_STEP);
      accumulator -= FIXED_STEP;
      steps += 1;
    }
    if (accumulator > FIXED_STEP * 5) accumulator = 0;
    input.endFrame();
    syncCamera();
    // Aim-down-sights tightens the view.
    fovTarget = input.state.aiming && match.phase === 'live' ? 56 : 74;
    if (Math.abs(camera.fov - fovTarget) > 0.1) {
      camera.fov += (fovTarget - camera.fov) * Math.min(1, dt * 10);
      camera.updateProjectionMatrix();
    }
    // HUD refresh.
    const cur = weapon.def();
    hud.setHealth(player.state.hp, player.state.armor);
    hud.setAmmo(weapon.ammo[weapon.current].mag, weapon.ammo[weapon.current].reserve, cur.name);
    hud.setMoney(match.money);
    hud.setScore(match.scoreV, match.scoreS, match.round, MAX_ROUNDS);
    hud.setAlive(bots.aliveCount('vanguard') + (player.state.alive ? 1 : 0), bots.aliveCount('sentinel'));
    hud.setKd(match.kills, match.deaths);
    if (match.phase === 'buy') hud.setTimer(match.phaseT, 'buy');
    else if (match.phase === 'live' && planted) hud.setTimer(objective.state.planted ? objective.state.planted.fuseLeft : 0, 'fuse');
    else if (match.phase === 'live') hud.setTimer(match.timer, 'live');
    hud.setCrosshairGap(Math.round(6 + weapon.spread(player.groundSpeed(), input.state.aiming) * 900));
    minimapTimer -= dt;
    if (minimapTimer <= 0) {
      minimapTimer = 0.15;
      const entities = [{ x: player.state.position.x, z: player.state.position.z, team: 'vanguard', me: true, dead: !player.state.alive }];
      for (const b of bots.bots) entities.push({ x: b.group.position.x, z: b.group.position.z, team: b.team, me: false, dead: !b.alive });
      hud.drawMinimap(world.minimapWalls, SITES, entities);
    }
  }
  renderer.render(scene, camera);
}

function settle(steps) {
  for (let index = 0; index < steps; index += 1) step(FIXED_STEP);
}

function refreshHud() {
  const cur = weapon.def();
  hud.setHealth(player.state.hp, player.state.armor);
  hud.setAmmo(weapon.ammo[weapon.current].mag, weapon.ammo[weapon.current].reserve, cur.name);
  hud.setMoney(match.money);
  hud.setScore(match.scoreV, match.scoreS, match.round, MAX_ROUNDS);
  hud.setAlive(bots.aliveCount('vanguard') + (player.state.alive ? 1 : 0), bots.aliveCount('sentinel'));
  hud.setKd(match.kills, match.deaths);
  if (match.phase === 'buy' || match.phase === 'menu') hud.setTimer(match.phase === 'menu' ? BUY_SECONDS : match.phaseT, 'buy');
  else if (match.phase === 'live' && planted) hud.setTimer(objective.state.planted ? objective.state.planted.fuseLeft : 0, 'fuse');
  else if (match.phase === 'live') hud.setTimer(match.timer, 'live');
  hud.setCrosshairGap(Math.round(6 + weapon.spread(player.groundSpeed(), input.state.aiming) * 900));
  const entities = [{ x: player.state.position.x, z: player.state.position.z, team: 'vanguard', me: true, dead: !player.state.alive }];
  for (const b of bots.bots) entities.push({ x: b.group.position.x, z: b.group.position.z, team: b.team, me: false, dead: !b.alive });
  hud.drawMinimap(world.minimapWalls, SITES, entities);
}

function runShot(name) {
  hud.hideOverlay();
  hud.clearToast();
  started = true;
  if (name === 'start') {
    player.reset(SPAWNS.vanguard[0], -Math.PI / 2);
    bots.resetRound(assignmentsForRound());
    weapon.refillRound();
    match.phase = 'menu';
    hud.showOverlay('start');
    syncCamera();
  } else if (name === 'buy') {
    startMatch();
    match.money = 3200;
    match.phase = 'buy';
    match.phaseT = 12;
    buyOpen = true;
    hud.showBuy(match.money, ownedSet());
    player.reset(SPAWNS.vanguard[2], -Math.PI / 2);
    syncCamera();
    settle(10);
  } else if (name === 'play') {
    startMatch();
    match.round = 3;
    match.scoreV = 2;
    match.scoreS = 1;
    match.money = 2150;
    match.phase = 'live';
    match.timer = 62;
    weapon.addOwned('ar77');
    player.reset(new THREE.Vector3(-6, 0, 2), -Math.PI / 2);
    player.damage(25);
    // Stage the firefight: one Sentinel holds open mid, the player drops him
    // with one AR-77 headshot (34 x 4 = 136).
    const target = bots.bots.find((b) => b.name === 'Onyx');
    target.group.position.set(2, 0, -2);
    target.yaw = Math.PI / 2;
    target.group.rotation.y = target.yaw;
    target.state = 'hold';
    settle(30);
    aimAt(new THREE.Vector3(2, 1.55, -2));
    playerShoot();
    settle(2);
    hud.setHealth(player.state.hp, player.state.armor);
    syncCamera();
  } else if (name === 'end') {
    startMatch();
    match.round = 8;
    match.scoreV = 5;
    match.scoreS = 3;
    match.money = 4100;
    match.phase = 'live';
    match.timer = 40;
    player.reset(new THREE.Vector3(10, 0, -10), -Math.PI / 2.4);
    botEvents.onPlanted('A');
    settle(30);
    endRound('vanguard', 'Detonation — Site A');
    hud.hideBanner();
    hud.clearToast();
    hud.showOverlay('roundEnd', {
      title: 'VANGUARD WINS THE ROUND',
      copy: `Detonation — Site A. Score ${match.scoreV} — ${match.scoreS} after ${match.round} rounds.`,
      action: 'Next round',
    });
    aimAt(new THREE.Vector3(18, 1, -16));
    syncCamera();
  }
  hud.setScore(match.scoreV, match.scoreS, match.round, MAX_ROUNDS);
  hud.setMoney(match.money);
  hud.setKd(match.kills, match.deaths);
  refreshHud();
  paintTwiceThenReady();
}

function paintTwiceThenReady() {
  let painted = 0;
  function paint() {
    syncCamera();
    renderer.render(scene, camera);
    painted += 1;
    if (painted === 2) {
      window.__shotReady = true;
      frozen = true;
      return; // stop the loop: a frozen frame screenshots cleanly.
    }
    requestAnimationFrame(paint);
  }
  requestAnimationFrame(paint);
}

function onLockChange(locked) {
  if (shot) return;
  if (locked) {
    paused = false;
    hud.hideOverlay();
  } else if (match.phase === 'live' && player.state.alive) {
    paused = true;
    hud.showOverlay('paused');
  }
}

hud.onPlay(() => {
  if (shot) return;
  audio.ensure();
  if (match.phase === 'menu' || match.phase === 'matchEnd') {
    startMatch();
    hud.hideOverlay();
  }
  input.requestLock();
});
hud.onBuy((id) => tryBuy(id));

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

syncCamera();
hud.setHealth(100, 0);
hud.setAmmo(weapon.ammo.p9.mag, weapon.ammo.p9.reserve, 'P9 Sidearm');
hud.setMoney(match.money);
hud.setScore(0, 0, 1, MAX_ROUNDS);
hud.setAlive(5, 5);
if (shot) runShot(shot);
else {
  hud.showOverlay('start');
  requestAnimationFrame(frame);
}
