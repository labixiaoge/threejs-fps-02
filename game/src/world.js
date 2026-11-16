// RUSTLINE DEPOT — the map. A rail depot at dawn, 60 x 46 m: Vanguard spawn
// in the west, Sentinel spawn in the east, three lanes (North, Mid, South)
// and two plant sites — Site A, the warehouse in the north-east, and Site B,
// the fuel yard in the south-east. Every solid is a collider and a surface a
// bullet stops on. Waypoints below are the graph the bots route on.
import * as THREE from 'three';
import { PALETTE, asphaltTexture, concreteTexture, containerTexture, hazardTexture, skyTexture } from './palette.js';

export const SITES = {
  A: { name: 'Warehouse', center: new THREE.Vector3(18, 0, -16), radius: 4.2, letter: 'A', node: 11 },
  B: { name: 'Fuel Yard', center: new THREE.Vector3(18, 0, 14), radius: 4.2, letter: 'B', node: 17 },
};

export const SPAWNS = {
  vanguard: [
    new THREE.Vector3(-26, 0, -4), new THREE.Vector3(-26, 0, -1.5),
    new THREE.Vector3(-26, 0, 1.5), new THREE.Vector3(-26, 0, 4),
    new THREE.Vector3(-24, 0, 0),
  ],
  sentinel: [
    new THREE.Vector3(26, 0, -4), new THREE.Vector3(26, 0, -1.5),
    new THREE.Vector3(26, 0, 1.5), new THREE.Vector3(26, 0, 4),
    new THREE.Vector3(24, 0, 0),
  ],
};

// Waypoint graph: [x, z] nodes, edges by index. Every edge is a straight
// walk that clears every solid: lanes run around the train cars, the
// warehouse is entered through its open west face, and the fuel yard through
// the gap in its bund wall.
export const NODES = [
  [-26, 0], [-18, 0], [-10, 0], [0, 0], [10, 0], [18, 0], [26, 0],
  [-14, -10], [-4, -10], [6, -10], [14, -12], [18, -16], [22, -18],
  [-14, 10], [-4, 10], [6, 13], [14, 12], [18, 14], [22, 10],
  [0, -18], [0, 18], [-18, -16], [-18, 16], [24, -8], [24, 8],
  [11, -16], [2, -16], [18, 10], [10, 14],
];
export const EDGES = [
  [0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 6],
  [1, 7], [7, 21], [21, 19], [19, 26], [26, 25], [25, 11], [11, 12],
  [19, 8], [19, 10], [8, 3], [8, 9], [9, 3], [9, 10], [9, 20], [4, 9],
  [1, 13], [13, 14], [14, 15], [14, 3], [15, 3], [15, 28], [28, 17],
  [28, 27], [27, 16], [16, 17], [17, 18], [28, 16],
  [13, 22], [22, 20], [20, 15], [20, 28], [2, 7], [2, 13],
  [5, 27], [23, 5], [24, 5],
];

export function createWorld(scene) {
  const group = new THREE.Group();
  scene.add(group);
  const colliders = [];
  const shootables = [];
  const minimapWalls = [];

  const asphalt = new THREE.MeshStandardMaterial({ map: asphaltTexture(), roughness: 0.95, metalness: 0.02 });
  const concrete = new THREE.MeshStandardMaterial({ map: concreteTexture(), roughness: 0.9, metalness: 0.02 });
  const concreteDark = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.concreteDark), roughness: 0.92 });
  const steel = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.steel), roughness: 0.55, metalness: 0.55 });
  const rust = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.rust), roughness: 0.8, metalness: 0.25 });
  const rustDark = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.rustDark), roughness: 0.85, metalness: 0.2 });
  const hazard = new THREE.MeshStandardMaterial({ map: hazardTexture(), roughness: 0.85 });
  const containerMats = {
    A: new THREE.MeshStandardMaterial({ map: containerTexture(PALETTE.containerA, 'RUST-90'), roughness: 0.75, metalness: 0.3 }),
    B: new THREE.MeshStandardMaterial({ map: containerTexture(PALETTE.containerB, 'RUST-41'), roughness: 0.75, metalness: 0.3 }),
    C: new THREE.MeshStandardMaterial({ map: containerTexture(PALETTE.containerC, 'RUST-17'), roughness: 0.75, metalness: 0.3 }),
  };

  // A solid box: mesh, collider and bullet stopper. Rotation is applied
  // before the collider is measured, so a turned container collides where
  // it stands. { solid: false } marks flat ground paint, not a wall.
  function box(w, h, d, x, y, z, material, { minimap = true, solid = true, ry = 0 } = {}) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
    mesh.position.set(x, y, z);
    mesh.rotation.y = ry;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    if (solid) {
      colliders.push(new THREE.Box3().setFromObject(mesh));
      shootables.push(mesh);
    }
    if (minimap) minimapWalls.push({ x, z, w, d });
    return mesh;
  }

  function cylinder(rTop, rBottom, h, x, y, z, material, segments = 18) {
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(rTop, rBottom, h, segments), material);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    const half = Math.max(rTop, rBottom);
    colliders.push(new THREE.Box3(new THREE.Vector3(x - half, y - h / 2, z - half), new THREE.Vector3(x + half, y + h / 2, z + half)));
    shootables.push(mesh);
    minimapWalls.push({ x, z, w: half * 2, d: half * 2 });
    return mesh;
  }

  // Ground and perimeter.
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(62, 48), asphalt);
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  group.add(ground);
  box(62, 5, 0.8, 0, 2.5, -23.4, concrete);
  box(62, 5, 0.8, 0, 2.5, 23.4, concrete);
  box(0.8, 5, 47.6, -30.4, 2.5, 0, concrete);
  box(0.8, 5, 47.6, 30.4, 2.5, 0, concrete);

  // Sky dome: gradient canvas on a back-facing sphere, plus a low sun disc.
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(130, 24, 16),
    new THREE.MeshBasicMaterial({ map: skyTexture(), side: THREE.BackSide, fog: false }),
  );
  scene.add(sky);
  const sun = new THREE.Mesh(
    new THREE.CircleGeometry(4.5, 24),
    new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffd9a0'), fog: false }),
  );
  sun.position.set(110, 34, -70);
  sun.lookAt(0, 0, 0);
  scene.add(sun);

  // Mid: two short train cars, staggered so the middle lane stays open
  // between them and the north/south lanes pass around their ends.
  box(2.8, 3.1, 8, -8, 1.55, -7, rust, { minimap: true });
  box(2.8, 3.1, 8, 8, 1.55, 7, rustDark, { minimap: true });
  box(3.0, 0.3, 8.4, -8, 3.25, -7, concreteDark, { minimap: false });
  box(3.0, 0.3, 8.4, 8, 3.25, 7, concreteDark, { minimap: false });

  // Container stacks around mid and the lanes.
  const cont = (x, z, mat, ry = 0, stack = false) => {
    const m = box(6, 2.6, 2.6, x, 1.3, z, containerMats[mat], { ry });
    if (stack) box(6, 2.6, 2.6, x, 3.9, z, containerMats[mat === 'A' ? 'B' : 'A'], { ry });
    return m;
  };
  cont(-6, -2, 'A', 0, true);
  cont(6, 2, 'B', 0.02);
  cont(14, 8, 'A', Math.PI / 2);
  cont(-20, 8, 'B', 0);

  // Crates and barrels for close cover.
  const crate = (x, z, s = 1.2) => box(s, s, s, x, s / 2, z, concreteDark);
  crate(-12, -4);
  crate(-12, -2.7, 0.9);
  crate(12, 4);
  crate(12, 5.3, 0.9);
  crate(-4, 14);
  crate(4, -14);
  crate(-14, -19, 1.5);
  crate(-16, 18, 1.5);
  crate(16, -4, 1.5);
  crate(22, 3, 1.2);
  cylinder(0.55, 0.55, 1.15, -6, 0.58, 12, steel);
  cylinder(0.55, 0.55, 1.15, -4.8, 0.58, 12.6, rust);
  cylinder(0.55, 0.55, 1.15, 6, 0.58, -12, steel);
  cylinder(0.55, 0.55, 1.15, 7.2, 0.58, -12.6, rust);

  // Site A — the warehouse: three walls, open west face, crates inside.
  box(13, 4.6, 0.7, 18, 2.3, -21.4, concrete);
  box(0.7, 4.6, 10.4, 24.6, 2.3, -16.2, concrete);
  box(13, 4.6, 0.7, 18, 2.3, -11.0, concrete);
  box(13, 0.5, 10.8, 18, 4.85, -16.2, concreteDark, { minimap: false });
  crate(21, -19, 1.4);
  crate(15.5, -13, 1.2);
  box(6, 0.12, 1.1, 12.4, 0.06, -16, hazard, { minimap: false, solid: false });

  // Site B — the fuel yard: two tanks, a low bund wall with a gap at x 16–20,
  // hazard approach.
  cylinder(2.1, 2.1, 4.2, 21, 2.1, 17.5, steel, 22);
  cylinder(2.1, 2.1, 3.4, 15.5, 1.7, 18.5, rust, 22);
  box(3, 1.0, 0.7, 14.5, 0.5, 9.6, concreteDark);
  box(3, 1.0, 0.7, 21.5, 0.5, 9.6, concreteDark);
  box(6, 0.12, 1.1, 12.4, 0.06, 14, hazard, { minimap: false, solid: false });

  // Plant-zone rings and floating site letters.
  const siteMarkers = {};
  for (const key of Object.keys(SITES)) {
    const site = SITES[key];
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(site.radius - 0.25, site.radius, 40),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(key === 'A' ? PALETTE.vanguard : PALETTE.sentinel), transparent: true, opacity: 0.55, side: THREE.DoubleSide }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(site.center.x, 0.05, site.center.z);
    group.add(ring);
    const letterCanvas = document.createElement('canvas');
    letterCanvas.width = 128;
    letterCanvas.height = 128;
    const lctx = letterCanvas.getContext('2d');
    lctx.fillStyle = key === 'A' ? PALETTE.vanguard : PALETTE.sentinel;
    lctx.font = 'bold 92px monospace';
    lctx.textAlign = 'center';
    lctx.textBaseline = 'middle';
    lctx.fillText(site.letter, 64, 68);
    const letterTex = new THREE.CanvasTexture(letterCanvas);
    const letter = new THREE.Mesh(
      new THREE.PlaneGeometry(2.2, 2.2),
      new THREE.MeshBasicMaterial({ map: letterTex, transparent: true, side: THREE.DoubleSide, depthWrite: false }),
    );
    letter.position.set(site.center.x, 4.6, site.center.z);
    group.add(letter);
    const glow = new THREE.PointLight(new THREE.Color(key === 'A' ? PALETTE.vanguard : PALETTE.sentinel), 6, 12);
    glow.position.set(site.center.x, 3.4, site.center.z);
    scene.add(glow);
    siteMarkers[key] = { ring, letter, glow, baseY: 4.6 };
  }

  // Light: warm dawn key from the east, cool hemisphere fill.
  const hemi = new THREE.HemisphereLight(new THREE.Color('#b9c8dd'), new THREE.Color('#3a3f45'), 0.85);
  scene.add(hemi);
  const key = new THREE.DirectionalLight(new THREE.Color('#ffd9a0'), 2.4);
  key.position.set(40, 26, -18);
  key.target.position.set(-6, 0, 4);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.left = -38;
  key.shadow.camera.right = 38;
  key.shadow.camera.top = 30;
  key.shadow.camera.bottom = -30;
  key.shadow.camera.far = 120;
  key.shadow.bias = -0.0006;
  scene.add(key, key.target);
  const fill = new THREE.DirectionalLight(new THREE.Color('#7d8aa0'), 0.5);
  fill.position.set(-30, 18, 24);
  scene.add(fill);

  return { colliders, shootables, group, siteMarkers, minimapWalls, sites: SITES, spawns: SPAWNS };
}
