// RUSTLINE DEPOT — the charge. The objective that ends rounds without a
// wipe: Vanguard plants at a site (3.5 s channel), the 40 s fuse runs, and
// Sentinel defuses (5 s channel) or loses the round when it blows. The
// bomb itself is a small blinking box; the fuse beeps faster as it runs out.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

export const FUSE_SECONDS = 40;

export function createObjective(scene, world) {
  const group = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(0.5, 0.28, 0.36),
    new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.dark), roughness: 0.5, metalness: 0.4 }),
  );
  body.position.y = 0.14;
  const lamp = new THREE.Mesh(
    new THREE.SphereGeometry(0.06, 10, 8),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.accent) }),
  );
  lamp.position.set(0, 0.32, 0);
  group.add(body, lamp);
  group.visible = false;
  scene.add(group);

  const state = {
    planted: null, // { site, fuseLeft, beepTimer }
    planting: null, // { by: 'player', progress }
    defusing: null,
  };

  function plantAt(siteKey) {
    const site = world.sites[siteKey];
    group.position.set(site.center.x, 0, site.center.z);
    group.visible = true;
    state.planted = { site: siteKey, fuseLeft: FUSE_SECONDS, beepTimer: 0 };
    state.planting = null;
    state.defusing = null;
  }

  function step(dt, onBeep, onDetonate) {
    if (!state.planted) return;
    state.planted.fuseLeft -= dt;
    const left = state.planted.fuseLeft;
    lamp.material.color.setHex(Math.floor(left * 4) % 2 === 0 ? 0xf0a830 : 0xff3b30);
    const interval = left > 20 ? 1.0 : left > 10 ? 0.5 : 0.25;
    state.planted.beepTimer -= dt;
    if (state.planted.beepTimer <= 0) {
      state.planted.beepTimer = interval;
      onBeep();
    }
    if (left <= 0) {
      state.planted = null;
      group.visible = false;
      onDetonate();
    }
  }

  function reset() {
    state.planted = null;
    state.planting = null;
    state.defusing = null;
    group.visible = false;
  }

  return {
    state,
    step,
    plantAt,
    reset,
    isPlanted() {
      return state.planted !== null;
    },
  };
}
