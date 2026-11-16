// RUSTLINE DEPOT — the bots. Nine soldiers (player + 4 Vanguard teammates
// against 5 Sentinels) with a real state machine: route along the waypoint
// graph, hold angles, engage with line-of-sight checks, burst fire and
// reaction times, fall back when hurt, plant the charge and defuse it. Bots
// share the player's collision resolver and the combat kit's raycasts, so
// their bullets obey the same map the player does.
import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { moveBody, RADIUS } from './player.js';
import { NODES, EDGES } from './world.js';

const BOT_SPEED = 3.4;
const BOT_HEIGHT = 1.72;
const PLANT_SECONDS = 3.5;
const DEFUSE_SECONDS = 5;
const VANGUARD_NAMES = ['Rook', 'Havoc', 'Bramble', 'Sable'];
const SENTINEL_NAMES = ['Onyx', 'Quill', 'Frost', 'Gale', 'Mire'];

// Breadth-first path on the waypoint graph.
const ADJ = NODES.map(() => []);
for (const [a, b] of EDGES) {
  ADJ[a].push(b);
  ADJ[b].push(a);
}
function findPath(from, to) {
  if (from === to) return [to];
  const prev = new Array(NODES.length).fill(-1);
  const queue = [from];
  prev[from] = from;
  while (queue.length) {
    const n = queue.shift();
    for (const m of ADJ[n]) {
      if (prev[m] === -1) {
        prev[m] = n;
        if (m === to) {
          const path = [to];
          let cur = to;
          while (cur !== from) {
            cur = prev[cur];
            path.unshift(cur);
          }
          return path;
        }
        queue.push(m);
      }
    }
  }
  return [to];
}
function nearestNode(x, z) {
  let best = 0;
  let bestD = Infinity;
  for (let i = 0; i < NODES.length; i += 1) {
    const d = (NODES[i][0] - x) ** 2 + (NODES[i][1] - z) ** 2;
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return best;
}

function makeSoldier(teamColor) {
  const group = new THREE.Group();
  const dark = new THREE.MeshStandardMaterial({ color: new THREE.Color('#22252a'), roughness: 0.8 });
  const vest = new THREE.MeshStandardMaterial({ color: new THREE.Color(teamColor), roughness: 0.6, metalness: 0.1 });
  const skin = new THREE.MeshStandardMaterial({ color: new THREE.Color('#c9a184'), roughness: 0.7 });
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.8, 0.24), dark);
  legL.position.set(-0.14, 0.4, 0);
  const legR = legL.clone();
  legR.position.x = 0.14;
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.54, 0.72, 0.3), vest);
  torso.position.y = 1.12;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.16, 14, 10), skin);
  head.position.y = 1.62;
  const helmet = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.16, 0.36), vest);
  helmet.position.y = 1.72;
  const visor = new THREE.Mesh(
    new THREE.BoxGeometry(0.3, 0.05, 0.05),
    new THREE.MeshStandardMaterial({ color: new THREE.Color(teamColor), emissive: new THREE.Color(teamColor), emissiveIntensity: 1.6 }),
  );
  visor.position.set(0, 1.62, 0.15);
  const gun = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.09, 0.62), dark);
  gun.position.set(0.2, 1.15, -0.3);
  group.add(legL, legR, torso, head, helmet, visor, gun);
  group.traverse((mesh) => {
    if (mesh.isMesh) {
      mesh.castShadow = true;
    }
  });
  return { group, torso, head };
}

export function createBots(scene, world, combat, events) {
  const bots = [];
  const shootables = world.shootables;
  const tmp = new THREE.Vector3();
  const tmp2 = new THREE.Vector3();
  const tmpDir = new THREE.Vector3();

  function addBot(name, team, spawn, index) {
    const color = team === 'vanguard' ? PALETTE.vanguard : PALETTE.sentinel;
    const parts = makeSoldier(color);
    parts.group.position.copy(spawn);
    scene.add(parts.group);
    const bot = {
      name,
      team,
      index,
      group: parts.group,
      torso: parts.torso,
      head: parts.head,
      hp: 100,
      armor: 0,
      alive: true,
      yaw: team === 'vanguard' ? -Math.PI / 2 : Math.PI / 2,
      velocity: new THREE.Vector3(),
      state: 'route',
      role: 'push',
      site: 'A',
      path: [],
      pathIndex: 0,
      holdNode: 0,
      target: null,
      losTimer: Math.random() * 0.15,
      reactLeft: 0,
      burstLeft: 0,
      fireTimer: 0,
      burstPause: 0,
      strafeDir: 1,
      strafeTimer: 0,
      accuracy: 0.02 + Math.random() * 0.012,
      reaction: 0.35 + Math.random() * 0.35,
      channel: 0,
      channelKind: null,
      fall: 0,
      carrier: false,
      node: 0,
    };
    parts.torso.userData.bot = bot;
    parts.torso.userData.part = 'torso';
    parts.head.userData.bot = bot;
    parts.head.userData.part = 'head';
    bots.push(bot);
    return bot;
  }

  for (let i = 0; i < 4; i += 1) addBot(VANGUARD_NAMES[i], 'vanguard', new THREE.Vector3(-26, 0, -4 + i * 2.2), i);
  for (let i = 0; i < 5; i += 1) addBot(SENTINEL_NAMES[i], 'sentinel', new THREE.Vector3(26, 0, -4 + i * 2), 4 + i);
  const hitMeshes = [];
  for (const bot of bots) hitMeshes.push(bot.torso, bot.head);

  function setRoute(bot, node) {
    const from = nearestNode(bot.group.position.x, bot.group.position.z);
    bot.path = findPath(from, node);
    bot.pathIndex = 0;
    // Skip leading nodes the bot already stands on: every bot spawns next
    // to the same graph node, and five bots converging on one point jostle
    // in the separation pass for seconds instead of pushing out.
    while (bot.pathIndex < bot.path.length) {
      const [nx, nz] = NODES[bot.path[bot.pathIndex]];
      if (Math.hypot(nx - bot.group.position.x, nz - bot.group.position.z) > 1.5) break;
      bot.pathIndex += 1;
    }
    bot.routeDest = node;
    bot.state = 'route';
  }

  function routeStep(bot, dt) {
    if (bot.pathIndex >= bot.path.length) {
      bot.state = 'hold';
      return;
    }
    const [tx, tz] = NODES[bot.path[bot.pathIndex]];
    tmp.set(tx - bot.group.position.x, 0, tz - bot.group.position.z);
    const dist = Math.hypot(tmp.x, tmp.z);
    if (dist < 1.5) {
      bot.pathIndex += 1;
      return;
    }
    tmp.normalize();
    const targetYaw = Math.atan2(-tmp.x, -tmp.z);
    bot.yaw += shortestAngle(bot.yaw, targetYaw) * Math.min(1, dt * 8);
    bot.velocity.x = tmp.x * BOT_SPEED;
    bot.velocity.z = tmp.z * BOT_SPEED;
    bot.group.position.y = 0;
    moveBody(world.colliders, bot.group.position, bot.velocity, BOT_HEIGHT, dt);
  }

  function shortestAngle(from, to) {
    let d = (to - from) % (Math.PI * 2);
    if (d > Math.PI) d -= Math.PI * 2;
    if (d < -Math.PI) d += Math.PI * 2;
    return d;
  }

  function eyeOf(bot) {
    return tmp2.set(bot.group.position.x, bot.group.position.y + 1.55, bot.group.position.z);
  }

  // Visible enemy from this bot's eye: the player or another bot, with a
  // clear ray. Checked on a stagger so nine bots never raycast at once.
  // The player is Vanguard, so only Sentinel bots may target them.
  function acquire(bot, player) {
    let best = null;
    let bestD = Infinity;
    if (player.alive && bot.team === 'sentinel') {
      const d = bot.group.position.distanceTo(player.position);
      if (d < bestD) {
        bestD = d;
        best = { kind: 'player', pos: player.position, dist: d };
      }
    }
    for (const other of bots) {
      if (other === bot || !other.alive || other.team === bot.team) continue;
      const d = bot.group.position.distanceTo(other.group.position);
      if (d < bestD) {
        bestD = d;
        best = { kind: 'bot', bot: other, pos: other.group.position, dist: d };
      }
    }
    if (!best || best.dist > 55) return null;
    const eye = eyeOf(bot);
    const chest = new THREE.Vector3(best.pos.x, best.pos.y + 1.15, best.pos.z);
    if (!combat.hasLineOfSight(eye, chest, shootables)) return null;
    return best;
  }

  function damage(bot, amount, killer, headshot) {
    if (!bot.alive) return false;
    let rest = amount;
    if (bot.armor > 0) {
      const absorbed = Math.min(bot.armor, rest * 0.5);
      bot.armor -= absorbed;
      rest -= absorbed;
    }
    bot.hp -= rest;
    if (bot.hp > 0) return false;
    bot.hp = 0;
    bot.alive = false;
    bot.state = 'dead';
    bot.fall = 0;
    bot.channel = 0;
    bot.channelKind = null;
    events.killFeed(killer, bot.name, headshot);
    return true;
  }

  function fireAt(bot, target, dt) {
    bot.fireTimer -= dt;
    if (bot.burstLeft <= 0) {
      bot.burstPause -= dt;
      if (bot.burstPause > 0) return;
      bot.burstLeft = 3 + Math.floor(Math.random() * 3);
      bot.burstPause = 0.45 + Math.random() * 0.4;
    }
    if (bot.fireTimer > 0) return;
    bot.fireTimer = 0.14;
    bot.burstLeft -= 1;
    const eye = eyeOf(bot).clone();
    const aim = new THREE.Vector3(target.pos.x, target.pos.y + 1.15 + (Math.random() - 0.5) * 0.5, target.pos.z);
    tmpDir.copy(aim).sub(eye).normalize();
    const spread = bot.accuracy + Math.min(0.02, target.dist / 1500);
    tmpDir.x += (Math.random() * 2 - 1) * spread;
    tmpDir.y += (Math.random() - 0.5) * spread;
    tmpDir.z += (Math.random() * 2 - 1) * spread;
    tmpDir.normalize();
    const meshes = target.kind === 'player' ? [events.playerHitMesh, ...shootables] : [target.bot.torso, target.bot.head, ...shootables];
    const hit = combat.hitscan(eye, tmpDir, 90, meshes);
    const muzzle = eye.clone();
    muzzle.y -= 0.3;
    if (hit) {
      combat.spawnTracer(muzzle, hit.point);
      combat.spawnBurst(hit.point, 4, 1.2);
      const isHead = hit.object.userData.part === 'head';
      if (hit.object === events.playerHitMesh) {
        const dmg = 30 * (target.dist > 25 ? 0.8 : 1) * (isHead ? 2 : 1);
        events.damagePlayer(dmg, bot.group.position);
      } else if (hit.object.userData.bot) {
        const dmg = 30 * (target.dist > 25 ? 0.8 : 1) * (isHead ? 2 : 1);
        damage(hit.object.userData.bot, dmg, bot.name, isHead);
      }
    } else {
      const end = eye.clone().addScaledVector(tmpDir, 60);
      combat.spawnTracer(muzzle, end);
    }
    events.shotSound(bot.group.position);
  }

  function stepBot(bot, dt, player, planted, time) {
    if (!bot.alive) {
      bot.fall = Math.min(1, bot.fall + dt / 0.4);
      bot.group.rotation.x = -bot.fall * 1.45;
      return;
    }
    bot.group.rotation.x = 0;
    bot.losTimer -= dt;
    if (bot.losTimer <= 0) {
      bot.losTimer = 0.15 + Math.random() * 0.05;
      const seen = acquire(bot, player);
      if (seen) {
        // acquire() builds a fresh object each check: compare by identity
        // (same kind, same bot), or reactLeft resets forever and the bot
        // never fires.
        const sameTarget = bot.target
          && bot.target.kind === seen.kind
          && (seen.kind === 'player' || bot.target.bot === seen.bot);
        if (!sameTarget) {
          bot.target = seen;
          bot.reactLeft = bot.reaction;
          bot.channel = 0;
          bot.channelKind = null;
        }
      } else {
        bot.target = null;
      }
    }
    if (bot.target) {
      if (bot.reactLeft > 0) {
        bot.reactLeft -= dt;
      } else {
        bot.state = 'engage';
        const t = bot.target;
        tmp.set(t.pos.x - bot.group.position.x, 0, t.pos.z - bot.group.position.z);
        const targetYaw = Math.atan2(-tmp.x, -tmp.z);
        bot.yaw += shortestAngle(bot.yaw, targetYaw) * Math.min(1, dt * 10);
        bot.strafeTimer -= dt;
        if (bot.strafeTimer <= 0) {
          bot.strafeTimer = 0.6 + Math.random() * 0.8;
          bot.strafeDir = Math.random() < 0.5 ? -1 : 1;
        }
        const strafe = new THREE.Vector3(Math.cos(bot.yaw), 0, -Math.sin(bot.yaw)).multiplyScalar(bot.strafeDir * 1.1);
        bot.velocity.copy(strafe);
        moveBody(world.colliders, bot.group.position, bot.velocity, BOT_HEIGHT, dt);
        fireAt(bot, t, dt);
      }
      bot.group.rotation.y = bot.yaw;
      return;
    }
    // No visible enemy: work the objective. A channel only advances while
    // the bot stands on its site; stepping off it (or spotting an enemy)
    // interrupts it, it never resets while the bot stays put.
    let channeling = false;
    if (bot.team === 'vanguard' && bot.carrier && !planted) {
      const site = world.sites[bot.site];
      const d = Math.hypot(bot.group.position.x - site.center.x, bot.group.position.z - site.center.z);
      if (d < site.radius * 0.8) {
        channeling = true;
        bot.state = 'plant';
        bot.channel += dt;
        bot.channelKind = 'plant';
        if (bot.channel >= PLANT_SECONDS) {
          bot.channel = 0;
          bot.channelKind = null;
          events.onPlanted(bot.site);
        }
        bot.group.rotation.y = bot.yaw;
        return;
      }
    }
    if (bot.team === 'sentinel' && planted && planted.site) {
      const site = world.sites[planted.site];
      const d = Math.hypot(bot.group.position.x - site.center.x, bot.group.position.z - site.center.z);
      if (d < site.radius * 0.8) {
        channeling = true;
        bot.state = 'defuse';
        bot.channel += dt;
        bot.channelKind = 'defuse';
        if (bot.channel >= DEFUSE_SECONDS) {
          bot.channel = 0;
          bot.channelKind = null;
          events.onDefused();
        }
        bot.group.rotation.y = bot.yaw;
        return;
      }
    }
    if (!channeling) {
      bot.channel = 0;
      bot.channelKind = null;
      // A bot that lost its enemy (or finished/interrupted a channel) must
      // get back on a route: an 'engage'/'plant'/'defuse' state matches
      // neither the route nor the hold branch below, so without this the
      // bot stands still for the rest of the round.
      if (bot.team === 'sentinel' && planted && planted.site) {
        const siteNode = world.sites[planted.site].node;
        if (bot.state !== 'route' || bot.routeDest !== siteNode) setRoute(bot, siteNode);
      } else if (bot.state === 'engage' || bot.state === 'plant' || bot.state === 'defuse') {
        setRoute(bot, bot.destNode);
      }
    }
    if (bot.state === 'route') routeStep(bot, dt);
    else if (bot.state === 'hold') {
      // Scan: slow yaw sweep while holding the angle.
      bot.yaw += Math.sin(time * 0.5 + bot.index) * dt * 0.35;
      bot.velocity.set(0, 0, 0);
    }
    bot.group.rotation.y = bot.yaw;
  }

  function step(dt, player, planted, time) {
    // Separation: bots never stack on each other.
    for (let i = 0; i < bots.length; i += 1) {
      for (let j = i + 1; j < bots.length; j += 1) {
        const a = bots[i];
        const b = bots[j];
        if (!a.alive || !b.alive) continue;
        const dx = b.group.position.x - a.group.position.x;
        const dz = b.group.position.z - a.group.position.z;
        const d2 = dx * dx + dz * dz;
        if (d2 < 0.64 && d2 > 0.0001) {
          const d = Math.sqrt(d2);
          const push = (0.8 - d) * 0.5 * dt * 8;
          const nx = dx / d;
          const nz = dz / d;
          a.group.position.x -= nx * push;
          a.group.position.z -= nz * push;
          b.group.position.x += nx * push;
          b.group.position.z += nz * push;
        }
      }
    }
    for (const bot of bots) stepBot(bot, dt, player, planted, time);
  }

  function resetRound(assignments) {
    for (const bot of bots) {
      const spawn = bot.team === 'vanguard'
        ? world.spawns.vanguard[bot.index]
        : world.spawns.sentinel[bot.index - 4];
      bot.group.position.copy(spawn);
      bot.group.rotation.set(0, bot.team === 'vanguard' ? -Math.PI / 2 : Math.PI / 2, 0);
      bot.yaw = bot.team === 'vanguard' ? -Math.PI / 2 : Math.PI / 2;
      bot.hp = 100;
      bot.armor = assignments.armor ? 50 : 0;
      bot.alive = true;
      bot.fall = 0;
      bot.state = 'route';
      bot.target = null;
      bot.channel = 0;
      bot.channelKind = null;
      bot.carrier = false;
      bot.path = [];
      bot.pathIndex = 0;
      const role = assignments.roles[bot.name];
      bot.role = role.role;
      bot.site = role.site;
      bot.holdNode = role.holdNode;
      bot.destNode = (role.role === 'push' || role.role === 'carrier') ? role.node : role.holdNode;
      bot.routeDest = bot.destNode;
      if (role.role === 'carrier') bot.carrier = true;
      if (role.role === 'push' || role.role === 'carrier') setRoute(bot, role.node);
      else {
        bot.state = 'hold';
        setRoute(bot, role.holdNode);
        bot.state = 'route';
      }
    }
  }

  return {
    bots,
    hitMeshes,
    step,
    damage,
    resetRound,
    aliveCount(team) {
      return bots.filter((b) => b.team === team && b.alive).length;
    },
    carrier() {
      return bots.find((b) => b.carrier && b.alive) ?? null;
    },
    plantProgress() {
      const planter = bots.find((b) => b.channelKind === 'plant');
      return planter ? planter.channel / PLANT_SECONDS : 0;
    },
    defuseProgress() {
      const defuser = bots.find((b) => b.channelKind === 'defuse');
      return defuser ? defuser.channel / DEFUSE_SECONDS : 0;
    },
  };
}
