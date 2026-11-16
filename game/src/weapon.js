// RUSTLINE DEPOT — the armoury. Four hitscan weapons with distinct damage,
// fire rate, magazine, spread and recoil; a view model that kicks, flashes
// and dips on reload; right-mouse aim that tightens the field of view. The
// buy menu reads this same table, so the shop and the gun always agree.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

export const WEAPONS = {
  p9: {
    id: 'p9', name: 'P9 Sidearm', slot: 1, price: 0, damage: 26, headMult: 2.5,
    mag: 12, reserve: 36, gap: 0.17, reload: 1.4, spreadStill: 0.004, spreadMove: 0.03,
    auto: false, range: 45, kick: 0.006,
  },
  vk9: {
    id: 'vk9', name: 'VK-9 Repeater', slot: 2, price: 1500, damage: 24, headMult: 2.2,
    mag: 30, reserve: 90, gap: 0.088, reload: 1.9, spreadStill: 0.006, spreadMove: 0.032,
    auto: true, range: 55, kick: 0.008,
  },
  ar77: {
    id: 'ar77', name: 'AR-77 Longshot', slot: 2, price: 2700, damage: 34, headMult: 4,
    mag: 30, reserve: 90, gap: 0.108, reload: 2.1, spreadStill: 0.0022, spreadMove: 0.028,
    auto: true, range: 80, kick: 0.011,
  },
  lw50: {
    id: 'lw50', name: 'LW-50 Lance', slot: 2, price: 4750, damage: 88, headMult: 2,
    mag: 5, reserve: 15, gap: 1.15, reload: 2.8, spreadStill: 0.0006, spreadMove: 0.05,
    auto: false, range: 100, kick: 0.03,
  },
};

export const ARMOR_PRICE = 650;

const MUZZLE_TIME = 0.06;

export function createWeapon(camera) {
  const grip = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.steel), roughness: 0.7, metalness: 0.25 });
  const body = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.dark), roughness: 0.45, metalness: 0.4 });
  const accent = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.accent), roughness: 0.5, metalness: 0.3 });

  // One view model, re-skinned per weapon: a receiver, a barrel whose length
  // follows the gun, a stock and a sight block.
  const model = new THREE.Group();
  const receiver = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.1, 0.42), body);
  const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.045, 0.4), grip);
  barrel.position.set(0, 0.025, -0.38);
  const stock = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.08, 0.22), grip);
  stock.position.set(0, -0.02, 0.3);
  // Low dark iron sights (a rear notch and a front post), not a bright
  // block: the sight must read as part of the gun, never as a floating card.
  const rearSight = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.035, 0.03), body);
  rearSight.position.set(0, 0.065, 0.08);
  const frontPost = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.05, 0.02), body);
  frontPost.position.set(0, 0.07, -0.28);
  model.add(receiver, barrel, stock, rearSight, frontPost);
  model.position.set(0.24, -0.2, -0.42);
  camera.add(model);

  // A small star flash at the muzzle tip: bright for one frame, gone the
  // next. It stays small on purpose — a big plane reads as a floating card.
  const flash = new THREE.Mesh(
    new THREE.PlaneGeometry(0.15, 0.15),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.accent), transparent: true, opacity: 0.75, depthWrite: false, side: THREE.DoubleSide }),
  );
  flash.position.set(0.24, -0.18, -0.95);
  flash.visible = false;
  camera.add(flash);

  const flashLight = new THREE.PointLight(new THREE.Color(PALETTE.accent), 0, 6);
  flashLight.position.set(0.24, -0.16, -0.6);
  camera.add(flashLight);

  // Per-weapon ammunition, so switching back keeps the half-empty magazine.
  const ammo = {};
  for (const def of Object.values(WEAPONS)) ammo[def.id] = { mag: def.mag, reserve: def.reserve };
  const owned = new Set(['p9']);
  let current = 'p9';

  const state = { cooldown: 0, reloadLeft: 0, flash: 0, kick: 0, bloom: 0 };

  function def() {
    return WEAPONS[current];
  }

  function step(dt) {
    state.cooldown = Math.max(0, state.cooldown - dt);
    state.flash = Math.max(0, state.flash - dt);
    state.bloom = Math.max(0, state.bloom - dt * 0.09);
    state.kick += (0 - state.kick) * Math.min(1, dt * 14);
    model.position.z = -0.42 + state.kick;
    model.position.x = 0.24 - state.kick * 0.4;
    model.rotation.x = state.kick * 2.2;
    flash.visible = state.flash > 0;
    flash.rotation.z = state.flash * 8;
    flashLight.intensity = state.flash > 0 ? 18 : 0;
    const d = def();
    if (state.reloadLeft > 0) {
      state.reloadLeft = Math.max(0, state.reloadLeft - dt);
      const t = 1 - state.reloadLeft / d.reload;
      model.rotation.x = -0.55 * Math.sin(t * Math.PI);
      model.position.y = -0.2 - 0.06 * Math.sin(t * Math.PI);
      if (state.reloadLeft === 0) {
        const need = d.mag - ammo[current].mag;
        const take = Math.min(need, ammo[current].reserve);
        ammo[current].mag += take;
        ammo[current].reserve -= take;
      }
    } else {
      model.position.y = -0.2;
    }
  }

  return {
    state,
    ammo,
    owned,
    get current() {
      return current;
    },
    def,
    step,
    ready() {
      return ammo[current].mag > 0 && state.cooldown === 0 && state.reloadLeft === 0;
    },
    pullTrigger() {
      state.cooldown = def().gap;
      state.flash = MUZZLE_TIME;
      state.kick = def().kick * 4.5;
      state.bloom = Math.min(0.05, state.bloom + 0.008);
    },
    takeRound() {
      if (ammo[current].mag <= 0) return false;
      ammo[current].mag -= 1;
      return true;
    },
    reload() {
      const d = def();
      if (state.reloadLeft > 0 || ammo[current].mag === d.mag || ammo[current].reserve === 0) return false;
      state.reloadLeft = d.reload;
      return true;
    },
    spread(speed, aiming) {
      const d = def();
      const move = Math.min(1, speed / 5.4) * d.spreadMove;
      const base = aiming ? d.spreadStill * 0.45 : d.spreadStill;
      return base + move + state.bloom;
    },
    switchTo(id) {
      if (!owned.has(id) || id === current) return false;
      current = id;
      state.cooldown = Math.max(state.cooldown, 0.25);
      state.reloadLeft = 0;
      const d = def();
      barrel.scale.z = d.id === 'lw50' ? 1.5 : d.id === 'p9' ? 0.55 : 1;
      barrel.position.z = -0.38 * barrel.scale.z;
      return true;
    },
    buy(id) {
      return owned.has(id);
    },
    addOwned(id) {
      owned.add(id);
      this.switchTo(id);
    },
    refillRound() {
      for (const d of Object.values(WEAPONS)) {
        if (owned.has(d.id)) {
          ammo[d.id].mag = d.mag;
          ammo[d.id].reserve = d.reserve;
        }
      }
      state.cooldown = 0;
      state.reloadLeft = 0;
      state.flash = 0;
      state.kick = 0;
      state.bloom = 0;
    },
    muzzleWorldPosition(out) {
      return out.set(0.24, -0.16, -0.95).applyMatrix4(camera.matrixWorld);
    },
  };
}
