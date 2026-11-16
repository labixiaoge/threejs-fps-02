// RUSTLINE DEPOT — the shared shooting kit: one hitscan helper, pooled
// tracers and impact particles, and line-of-sight tests. Pools are fixed at
// build time, so a firefight allocates nothing per frame.
import * as THREE from 'three';

const TRACER_COUNT = 48;
const PARTICLE_COUNT = 160;
const TRACER_LIFE = 0.09;

export function createCombat(scene) {
  const raycaster = new THREE.Raycaster();
  const tmpDir = new THREE.Vector3();

  // Tracers: one LineSegments pool, each tracer two vertices.
  const tracerGeo = new THREE.BufferGeometry();
  const tracerPos = new Float32Array(TRACER_COUNT * 6);
  tracerGeo.setAttribute('position', new THREE.BufferAttribute(tracerPos, 3));
  const tracerMat = new THREE.LineBasicMaterial({ color: 0xffd9a0, transparent: true, opacity: 0.85 });
  const tracers = new THREE.LineSegments(tracerGeo, tracerMat);
  tracers.frustumCulled = false;
  scene.add(tracers);
  const tracerLife = new Float32Array(TRACER_COUNT);
  let tracerNext = 0;

  // Impact particles: one Points pool with per-point velocity and life.
  const particleGeo = new THREE.BufferGeometry();
  const particlePos = new Float32Array(PARTICLE_COUNT * 3);
  particleGeo.setAttribute('position', new THREE.BufferAttribute(particlePos, 3));
  const particleMat = new THREE.PointsMaterial({ color: 0xffc46b, size: 0.14, transparent: true, opacity: 0.95, sizeAttenuation: true });
  const particles = new THREE.Points(particleGeo, particleMat);
  particles.frustumCulled = false;
  scene.add(particles);
  const particleVel = new Float32Array(PARTICLE_COUNT * 3);
  const particleLife = new Float32Array(PARTICLE_COUNT);
  let particleNext = 0;

  function spawnTracer(from, to) {
    const i = tracerNext;
    tracerNext = (tracerNext + 1) % TRACER_COUNT;
    tracerPos[i * 6] = from.x;
    tracerPos[i * 6 + 1] = from.y;
    tracerPos[i * 6 + 2] = from.z;
    tracerPos[i * 6 + 3] = to.x;
    tracerPos[i * 6 + 4] = to.y;
    tracerPos[i * 6 + 5] = to.z;
    tracerLife[i] = TRACER_LIFE;
    tracerGeo.attributes.position.needsUpdate = true;
  }

  function spawnBurst(point, count, spread = 1.6) {
    for (let n = 0; n < count; n += 1) {
      const i = particleNext;
      particleNext = (particleNext + 1) % PARTICLE_COUNT;
      particlePos[i * 3] = point.x;
      particlePos[i * 3 + 1] = point.y;
      particlePos[i * 3 + 2] = point.z;
      particleVel[i * 3] = (Math.random() - 0.5) * spread * 2;
      particleVel[i * 3 + 1] = Math.random() * spread;
      particleVel[i * 3 + 2] = (Math.random() - 0.5) * spread * 2;
      particleLife[i] = 0.35 + Math.random() * 0.3;
    }
    particleGeo.attributes.position.needsUpdate = true;
  }

  function step(dt) {
    let tracerAlive = false;
    for (let i = 0; i < TRACER_COUNT; i += 1) {
      if (tracerLife[i] > 0) {
        tracerLife[i] -= dt;
        if (tracerLife[i] <= 0) {
          tracerPos[i * 6 + 3] = tracerPos[i * 6];
          tracerPos[i * 6 + 4] = tracerPos[i * 6 + 1];
          tracerPos[i * 6 + 5] = tracerPos[i * 6 + 2];
        } else tracerAlive = true;
      }
    }
    tracerMat.opacity = tracerAlive ? 0.85 : 0;
    tracerGeo.attributes.position.needsUpdate = true;
    for (let i = 0; i < PARTICLE_COUNT; i += 1) {
      if (particleLife[i] > 0) {
        particleLife[i] -= dt;
        particlePos[i * 3] += particleVel[i * 3] * dt;
        particlePos[i * 3 + 1] += particleVel[i * 3 + 1] * dt;
        particlePos[i * 3 + 2] += particleVel[i * 3 + 2] * dt;
        particleVel[i * 3 + 1] -= 6 * dt;
        if (particleLife[i] <= 0) particlePos[i * 3 + 1] = -100;
      }
    }
    particleGeo.attributes.position.needsUpdate = true;
  }

  return {
    step,
    spawnTracer,
    spawnBurst,
    // Raycast from origin along dir (already spread-applied) against meshes.
    // Returns { point, object, distance } or null.
    hitscan(origin, dir, range, meshes) {
      raycaster.set(origin, dir);
      raycaster.far = range;
      const hit = raycaster.intersectObjects(meshes, false)[0];
      return hit ? { point: hit.point, object: hit.object, distance: hit.distance } : null;
    },
    // True when nothing solid stands between a and b.
    hasLineOfSight(a, b, meshes) {
      tmpDir.copy(b).sub(a);
      const dist = tmpDir.length();
      if (dist < 0.01) return true;
      tmpDir.normalize();
      raycaster.set(a, tmpDir);
      raycaster.far = dist;
      return raycaster.intersectObjects(meshes, false).length === 0;
    },
  };
}
