// RUSTLINE DEPOT — movement and damage for a body on the map: acceleration,
// friction, gravity, crouch and jump, resolved as a box against the world's
// colliders one axis at a time, so a wall never swallows a body. The same
// resolver moves the bots (moveBody), so players and bots share the map's
// physics. Health and armour live here too: armour absorbs half of each hit.
import * as THREE from 'three';

export const RADIUS = 0.34;
const STAND_HEIGHT = 1.72;
const CROUCH_HEIGHT = 1.12;
const STAND_EYE = 1.6;
const CROUCH_EYE = 1.02;
const WALK_SPEED = 5.4;
const CROUCH_SPEED = 2.5;
const GROUND_ACCEL = 42;
const AIR_ACCEL = 9;
const FRICTION = 9;
const GRAVITY = 20;
const JUMP_SPEED = 6.4;

const probe = new THREE.Box3();

// Contact epsilon: boxes that merely touch faces count as clear, so a body
// pressed against a wall can still slide along it instead of wedging in
// the corner where both axis moves test as blocked.
const CONTACT_EPS = 0.002;

export function overlapsBox(colliders, x, y, z, height, lift) {
  probe.min.set(x - RADIUS + CONTACT_EPS, y + lift, z - RADIUS + CONTACT_EPS);
  probe.max.set(x + RADIUS - CONTACT_EPS, y + height - lift, z + RADIUS - CONTACT_EPS);
  for (const collider of colliders) {
    if (probe.intersectsBox(collider)) return collider;
  }
  return null;
}

// Move a body (position + velocity Vector3s) one step against the colliders.
// Returns whether it stands on the ground afterwards.
export function moveBody(colliders, position, velocity, height, dt) {
  // Depenetrate first: the bot separation pass can shove a body a few cm
  // into a wall, and from an overlapped position both axis moves test as
  // blocked, so the body wedges against the wall forever. Push it out
  // along the shallowest horizontal axis before moving.
  const stuck = overlapsBox(colliders, position.x, position.y, position.z, height, 0.04);
  if (stuck) {
    const ox = Math.min(position.x + RADIUS, stuck.max.x) - Math.max(position.x - RADIUS, stuck.min.x);
    const oz = Math.min(position.z + RADIUS, stuck.max.z) - Math.max(position.z - RADIUS, stuck.min.z);
    if (ox < oz) {
      const cx = (stuck.min.x + stuck.max.x) / 2;
      position.x = position.x < cx ? stuck.min.x - RADIUS - 0.01 : stuck.max.x + RADIUS + 0.01;
    } else {
      const cz = (stuck.min.z + stuck.max.z) / 2;
      position.z = position.z < cz ? stuck.min.z - RADIUS - 0.01 : stuck.max.z + RADIUS + 0.01;
    }
  }
  const nextX = position.x + velocity.x * dt;
  if (!overlapsBox(colliders, nextX, position.y, position.z, height, 0.04)) position.x = nextX;
  else velocity.x = 0;
  const nextZ = position.z + velocity.z * dt;
  if (!overlapsBox(colliders, position.x, position.y, nextZ, height, 0.04)) position.z = nextZ;
  else velocity.z = 0;
  position.y += velocity.y * dt;
  let onGround = false;
  const hit = overlapsBox(colliders, position.x, position.y, position.z, height, 0);
  if (hit && velocity.y <= 0) {
    position.y = hit.max.y;
    velocity.y = 0;
    onGround = true;
  } else if (hit) {
    position.y = hit.min.y - height;
    velocity.y = 0;
  }
  if (position.y < 0) {
    position.y = 0;
    velocity.y = 0;
    onGround = true;
  }
  velocity.y = Math.max(-30, velocity.y);
  return onGround;
}

export function createPlayer(colliders) {
  const player = {
    position: new THREE.Vector3(0, 0, 0),
    velocity: new THREE.Vector3(),
    yaw: 0,
    pitch: 0,
    eye: STAND_EYE,
    onGround: true,
    crouching: false,
    height: STAND_HEIGHT,
    hp: 100,
    armor: 0,
    alive: true,
  };
  const wish = new THREE.Vector3();

  function look(dx, dy, sensitivity = 0.0022) {
    player.yaw -= dx * sensitivity;
    player.pitch = Math.max(-1.45, Math.min(1.45, player.pitch - dy * sensitivity));
  }

  function recoil(pitchKick, yawKick) {
    player.pitch = Math.min(1.45, player.pitch + pitchKick);
    player.yaw += yawKick;
  }

  // Returns the damage actually taken (after armour) for the HUD flash.
  function damage(amount) {
    if (!player.alive) return 0;
    let rest = amount;
    if (player.armor > 0) {
      const absorbed = Math.min(player.armor, rest * 0.5);
      player.armor -= absorbed;
      rest -= absorbed;
    }
    player.hp = Math.max(0, player.hp - rest);
    if (player.hp <= 0) player.alive = false;
    return rest;
  }

  function reset(spawn, yaw) {
    player.position.copy(spawn);
    player.velocity.set(0, 0, 0);
    player.yaw = yaw;
    player.pitch = 0;
    player.eye = STAND_EYE;
    player.crouching = false;
    player.height = STAND_HEIGHT;
    player.hp = 100;
    player.alive = true;
  }

  function step(dt, keys) {
    if (!player.alive) return;
    const crouching = keys.has('ControlLeft') || keys.has('ControlRight') || keys.has('KeyC');
    if (crouching && !player.crouching) {
      player.crouching = true;
      player.height = CROUCH_HEIGHT;
    } else if (!crouching && player.crouching && !overlapsBox(colliders, player.position.x, player.position.y, player.position.z, STAND_HEIGHT, 0.02)) {
      player.crouching = false;
      player.height = STAND_HEIGHT;
    }
    const eyeTarget = player.crouching ? CROUCH_EYE : STAND_EYE;
    player.eye += (eyeTarget - player.eye) * Math.min(1, dt * 12);

    const forward = (keys.has('KeyW') ? 1 : 0) - (keys.has('KeyS') ? 1 : 0);
    const strafe = (keys.has('KeyD') ? 1 : 0) - (keys.has('KeyA') ? 1 : 0);
    wish.set(0, 0, 0);
    if (forward || strafe) {
      const sin = Math.sin(player.yaw);
      const cos = Math.cos(player.yaw);
      wish.set(-sin * forward + cos * strafe, 0, -cos * forward - sin * strafe).normalize();
    }

    const speed = player.crouching ? CROUCH_SPEED : WALK_SPEED;
    const walkSlow = keys.has('ShiftLeft') || keys.has('ShiftRight');
    const targetSpeed = walkSlow ? speed * 0.55 : speed;
    const blend = Math.min(1, (player.onGround ? GROUND_ACCEL : AIR_ACCEL) * dt / targetSpeed);
    player.velocity.x += (wish.x * targetSpeed - player.velocity.x) * blend;
    player.velocity.z += (wish.z * targetSpeed - player.velocity.z) * blend;
    if (player.onGround && !wish.lengthSq()) {
      const damp = Math.max(0, 1 - FRICTION * dt);
      player.velocity.x *= damp;
      player.velocity.z *= damp;
    }

    if (keys.has('Space') && player.onGround) {
      player.velocity.y = JUMP_SPEED;
      player.onGround = false;
    }
    player.velocity.y -= GRAVITY * dt;
    player.onGround = moveBody(colliders, player.position, player.velocity, player.height, dt);
  }

  return {
    state: player,
    step,
    look,
    recoil,
    damage,
    reset,
    groundSpeed() {
      return Math.hypot(player.velocity.x, player.velocity.z);
    },
  };
}
