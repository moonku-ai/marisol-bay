// Marisol Bay city builder — ground, road grid, downtown towers, beach, sea,
// marina, palms, lamps, traffic lights, props and the collision boxes.
// One job: turn a seed into a sun-soaked coastal city the other systems drive in.

/* global THREE */
import { PALETTE, WORLD } from './config.js';
import { makeRng, range, pick } from './rng.js';

const ROAD_LINES = [-168, -126, -84, -42, 0, 42, 84, 126, 168];

function facadeTexture(base, lit) {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = base; g.fillRect(0, 0, 128, 256);
  g.fillStyle = 'rgba(0,0,0,0.18)'; g.fillRect(0, 0, 128, 10);
  for (let row = 0; row < 9; row += 1) {
    for (let col = 0; col < 5; col += 1) {
      const on = ((row * 5 + col) % 3) !== 0;
      g.fillStyle = on ? lit : 'rgba(20,30,50,0.85)';
      g.fillRect(10 + col * 23, 22 + row * 25, 15, 17);
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function box(w, h, d, color, x, y, z, opts) {
  const mat = new THREE.MeshLambertMaterial({ color, ...(opts || {}) });
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  m.castShadow = true; m.receiveShadow = true;
  return m;
}

export function buildCity(scene, seed) {
  const rng = makeRng(seed);
  const colliders = [];
  const group = new THREE.Group();
  group.name = 'MarisolBayCity';
  scene.add(group);

  // --- sky, sun, fog -------------------------------------------------------
  scene.background = new THREE.Color(0x8fc7ec);
  scene.fog = new THREE.Fog(0xcfe8f7, 220, 520);
  const hemi = new THREE.HemisphereLight(0xbfdcff, 0x8a7a5a, 0.95);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff1cf, 1.9);
  sun.position.set(120, 180, 60);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -230; sun.shadow.camera.right = 230;
  sun.shadow.camera.top = 230; sun.shadow.camera.bottom = -230;
  sun.shadow.camera.far = 520; sun.shadow.bias = -0.0004;
  scene.add(sun);
  scene.add(sun.target);

  // --- ground, beach, sea --------------------------------------------------
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(WORLD.half * 2 + 60, WORLD.half * 2 + 60),
    new THREE.MeshLambertMaterial({ color: 0x8fae7e }));
  ground.rotation.x = -Math.PI / 2; ground.position.set(0, 0, 0);
  ground.receiveShadow = true;
  group.add(ground);

  const sand = new THREE.Mesh(new THREE.PlaneGeometry(WORLD.half * 2 + 60, 46),
    new THREE.MeshLambertMaterial({ color: PALETTE.sand }));
  sand.rotation.x = -Math.PI / 2; sand.position.set(0, 0.05, WORLD.beachZ + 20);
  sand.receiveShadow = true;
  group.add(sand);

  const sea = new THREE.Mesh(new THREE.PlaneGeometry(700, 260),
    new THREE.MeshLambertMaterial({ color: PALETTE.sea, transparent: true, opacity: 0.92 }));
  sea.rotation.x = -Math.PI / 2; sea.position.set(0, 0.02, WORLD.seaZ + 120);
  group.add(sea);

  // --- roads ----------------------------------------------------------------
  const roadMat = new THREE.MeshLambertMaterial({ color: PALETTE.asphalt });
  const walkMat = new THREE.MeshLambertMaterial({ color: PALETTE.sidewalk });
  const dashMat = new THREE.MeshLambertMaterial({ color: 0xf8fafc });
  const dashGeo = new THREE.BoxGeometry(0.7, 0.06, 4);
  for (const line of ROAD_LINES) {
    for (const horizontal of [true, false]) {
      const road = new THREE.Mesh(
        new THREE.PlaneGeometry(horizontal ? WORLD.roadWidth : WORLD.half * 2,
          horizontal ? WORLD.half * 2 : WORLD.roadWidth), roadMat);
      road.rotation.x = -Math.PI / 2;
      road.position.set(horizontal ? line : 0, 0.08, horizontal ? 0 : line);
      road.receiveShadow = true;
      group.add(road);
      for (const side of [8, -8]) {
        const walk = new THREE.Mesh(
          new THREE.PlaneGeometry(horizontal ? 4 : WORLD.half * 2,
            horizontal ? WORLD.half * 2 : 4), walkMat);
        walk.rotation.x = -Math.PI / 2;
        walk.position.set(horizontal ? line + side : 0, 0.09, horizontal ? 0 : line + side);
        group.add(walk);
      }
      // centre dashes
      for (let t = -196; t <= 196; t += 14) {
        const dash = new THREE.Mesh(dashGeo, dashMat);
        dash.position.set(horizontal ? line : t, 0.12, horizontal ? t : line);
        if (horizontal) dash.rotation.y = Math.PI / 2;
        group.add(dash);
      }
    }
  }

  // --- buildings ------------------------------------------------------------
  const facades = [
    facadeTexture('#f4a259', '#ffe9b0'), facadeTexture('#e07a5f', '#ffe9b0'),
    facadeTexture('#81b29a', '#eafbe7'), facadeTexture('#6d9dc5', '#dff3ff'),
    facadeTexture('#f2cc8f', '#fff6d8'), facadeTexture('#b5838d', '#ffe0e6'),
    facadeTexture('#90a8c3', '#e8f1ff'), facadeTexture('#e9c46a', '#fff3c4'),
  ];
  const towerTex = facadeTexture('#5b7fa6', '#cfe8ff');
  const buildings = [];
  for (let bx = 0; bx < ROAD_LINES.length - 1; bx += 1) {
    for (let bz = 0; bz < ROAD_LINES.length - 1; bz += 1) {
      const cx = (ROAD_LINES[bx] + ROAD_LINES[bx + 1]) / 2;
      const cz = (ROAD_LINES[bz] + ROAD_LINES[bz + 1]) / 2;
      if (cz > WORLD.beachZ - 30) continue; // beach blocks stay open
      const downtown = Math.abs(cx) < 90 && Math.abs(cz) < 90;
      const count = downtown ? pick(rng, [1, 1, 2]) : pick(rng, [1, 2, 2, 3]);
      for (let i = 0; i < count; i += 1) {
        const w = range(rng, 12, 20);
        const d = range(rng, 12, 20);
        const h = downtown ? range(rng, 34, 78) : range(rng, 9, 26);
        const ox = range(rng, -6, 6);
        const oz = range(rng, -6, 6);
        const x = cx + ox; const z = cz + oz;
        const mat = new THREE.MeshLambertMaterial({ map: h > 30 ? towerTex : pick(rng, facades) });
        const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
        m.position.set(x, h / 2, z);
        m.castShadow = true; m.receiveShadow = true;
        group.add(m);
        // rooftop box / antenna on tall towers
        if (h > 40 && rng() < 0.5) {
          const roof = box(3, range(rng, 4, 10), 3, 0x475569, x + range(rng, -4, 4), h + 3, z + range(rng, -4, 4));
          group.add(roof);
        }
        colliders.push({ minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2 });
        buildings.push(m);
      }
    }
  }

  // --- palms, lamps, traffic lights ----------------------------------------
  const trunkMat = new THREE.MeshLambertMaterial({ color: 0x8a6d4b });
  const leafMat = new THREE.MeshLambertMaterial({ color: 0x3f9d4e });
  const palms = [];
  function palm(x, z) {
    const g = new THREE.Group();
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.34, 6, 6), trunkMat);
    trunk.position.y = 3; trunk.castShadow = true; g.add(trunk);
    for (let i = 0; i < 6; i += 1) {
      const leaf = new THREE.Mesh(new THREE.ConeGeometry(0.9, 3.4, 4), leafMat);
      const a = (i / 6) * Math.PI * 2;
      leaf.position.set(Math.cos(a) * 1.2, 6.2, Math.sin(a) * 1.2);
      leaf.rotation.set(Math.sin(a) * 0.9, 0, -Math.cos(a) * 0.9);
      leaf.castShadow = true; g.add(leaf);
    }
    g.position.set(x, 0, z);
    group.add(g); palms.push(g);
    return g;
  }
  for (let i = 0; i < 46; i += 1) {
    const line = pick(rng, ROAD_LINES);
    const along = range(rng, -180, 180);
    const side = rng() < 0.5 ? 9.5 : -9.5;
    if (rng() < 0.5) palm(line + side, along); else palm(along, line + side);
  }
  // beach palm row
  for (let x = -180; x <= 180; x += 24) palm(x + range(rng, -4, 4), WORLD.beachZ + 6);

  const lampPoleMat = new THREE.MeshLambertMaterial({ color: 0x334155 });
  const lampBulbMat = new THREE.MeshLambertMaterial({ color: 0xfff7cc, emissive: 0xffe9a3, emissiveIntensity: 0.6 });
  for (const line of ROAD_LINES) {
    for (const t of [-150, -60, 30, 120]) {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 7, 6), lampPoleMat);
      pole.position.set(line + 7, 3.5, t); pole.castShadow = true; group.add(pole);
      const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.45, 8, 6), lampBulbMat);
      bulb.position.set(line + 7, 7.1, t); group.add(bulb);
    }
  }

  // traffic lights at four downtown intersections
  const trafficLights = [];
  for (const [lx, lz] of [[-42, -42], [42, -42], [-42, 42], [42, 42]]) {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 6, 6), lampPoleMat);
    pole.position.set(lx + 8, 3, lz + 8); group.add(pole);
    const head = box(0.7, 1.8, 0.7, 0x1e293b, lx + 8, 6.2, lz + 8);
    group.add(head);
    const red = new THREE.Mesh(new THREE.SphereGeometry(0.26, 8, 6),
      new THREE.MeshLambertMaterial({ color: 0xef4444, emissive: 0xef4444, emissiveIntensity: 0.9 }));
    red.position.set(lx + 8, 6.8, lz + 8.4); group.add(red);
    const green = new THREE.Mesh(new THREE.SphereGeometry(0.26, 8, 6),
      new THREE.MeshLambertMaterial({ color: 0x22c55e, emissive: 0x22c55e, emissiveIntensity: 0.15 }));
    green.position.set(lx + 8, 5.7, lz + 8.4); group.add(green);
    trafficLights.push({ x: lx, z: lz, red, green, timer: rng() * 6, nsGreen: rng() < 0.5,
      greenFor(horizontal) { return horizontal ? !this.nsGreen : this.nsGreen; } });
  }

  // --- marina, boats, pier, helipad ----------------------------------------
  const dockMat = new THREE.MeshLambertMaterial({ color: 0x8a6d4b });
  for (let i = 0; i < 4; i += 1) {
    const dock = box(4, 0.8, 26, 0x8a6d4b, 132 + i * 12, 0.4, 158);
    dock.material = dockMat; group.add(dock);
    const hull = box(3.4, 1.6, 9, pick(rng, [0xf8fafc, 0xef4444, 0x3b82f6]), 132 + i * 12, 0.9, 172 + (i % 2) * 8);
    group.add(hull);
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 7, 6), lampPoleMat);
    mast.position.set(132 + i * 12, 5, 172 + (i % 2) * 8); group.add(mast);
  }
  // pier + helipad (M5 finish)
  const pier = box(10, 1, 30, 0x8a6d4b, 168, 0.5, 168);
  group.add(pier);
  const pad = new THREE.Mesh(new THREE.CylinderGeometry(9, 9, 0.4, 24),
    new THREE.MeshLambertMaterial({ color: 0x334155 }));
  pad.position.set(168, 1.1, 182); pad.receiveShadow = true; group.add(pad);
  const padRing = new THREE.Mesh(new THREE.TorusGeometry(6.5, 0.35, 8, 32),
    new THREE.MeshLambertMaterial({ color: 0xf59e0b }));
  padRing.rotation.x = Math.PI / 2; padRing.position.set(168, 1.35, 182); group.add(padRing);

  // --- clouds ---------------------------------------------------------------
  const clouds = [];
  const cloudMat = new THREE.MeshLambertMaterial({ color: 0xffffff, transparent: true, opacity: 0.85 });
  for (let i = 0; i < 9; i += 1) {
    const c = new THREE.Group();
    for (let j = 0; j < 3; j += 1) {
      const s = new THREE.Mesh(new THREE.SphereGeometry(range(rng, 6, 12), 8, 6), cloudMat);
      s.position.set(j * 8 - 8, range(rng, -1, 1), range(rng, -3, 3));
      s.scale.y = 0.45; c.add(s);
    }
    c.position.set(range(rng, -220, 220), range(rng, 55, 85), range(rng, -220, 220));
    group.add(c); clouds.push(c);
  }

  // --- mission marker beacon -------------------------------------------------
  const beacon = new THREE.Group();
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.2, 60, 16, 1, true),
    new THREE.MeshBasicMaterial({ color: 0xf59e0b, transparent: true, opacity: 0.28, side: THREE.DoubleSide, depthWrite: false }));
  beam.position.y = 30; beacon.add(beam);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(4, 0.35, 8, 32),
    new THREE.MeshBasicMaterial({ color: 0xf59e0b }));
  ring.rotation.x = Math.PI / 2; ring.position.y = 0.4; beacon.add(ring);
  const disc = new THREE.Mesh(new THREE.CircleGeometry(3.4, 24),
    new THREE.MeshBasicMaterial({ color: 0xf59e0b, transparent: true, opacity: 0.3 }));
  disc.rotation.x = -Math.PI / 2; disc.position.y = 0.15; beacon.add(disc);
  beacon.visible = false;
  scene.add(beacon);

  // --- parked cars -----------------------------------------------------------
  const parkedSpots = [
    { x: 48, z: -42, angle: Math.PI / 2, id: 'target', color: 0xe85d75, name: 'Comet GT' },
    { x: -36, z: 48, angle: 0, color: 0x3b82f6, name: 'Palm Sedan' },
    { x: 90, z: 36, angle: Math.PI, color: 0xf8fafc, name: 'Marina Coupe' },
    { x: -90, z: -36, angle: Math.PI / 2, color: 0x22c55e, name: 'Bay Cruiser' },
    { x: 132, z: 120, angle: -Math.PI / 2, color: 0xf59e0b, name: 'Surf Van' },
    { x: -150, z: 30, angle: 0, color: 0x14b8a6, name: 'Dune Buggy' },
    { x: 30, z: -150, angle: Math.PI / 2, color: 0xa855f7, name: 'Palm Sedan' },
    { x: -30, z: 150, angle: 0, color: 0xef4444, name: 'Bay Cruiser' },
  ];

  return {
    group, colliders, buildings, trafficLights, clouds, sea, beacon, parkedSpots,
    roadLines: ROAD_LINES,
    playerStart: { x: 0, z: 96, angle: Math.PI },
    setBeacon(x, z, visible) { beacon.position.set(x, 0, z); beacon.visible = visible; },
  };
}

// Circle (player / car) vs building AABBs: push out and report the hit normal.
export function collideCircle(pos, radius, colliders) {
  let hit = false;
  for (const c of colliders) {
    const nx = Math.max(c.minX, Math.min(pos.x, c.maxX));
    const nz = Math.max(c.minZ, Math.min(pos.z, c.maxZ));
    const dx = pos.x - nx; const dz = pos.z - nz;
    const d2 = dx * dx + dz * dz;
    if (d2 < radius * radius) {
      hit = true;
      if (d2 > 0.0001) {
        const d = Math.sqrt(d2);
        pos.x = nx + (dx / d) * radius;
        pos.z = nz + (dz / d) * radius;
      } else {
        // centre inside the box: push out along the smallest penetration axis
        const pl = pos.x - c.minX; const pr = c.maxX - pos.x;
        const pt = pos.z - c.minZ; const pb = c.maxZ - pos.z;
        const m = Math.min(pl, pr, pt, pb);
        if (m === pl) pos.x = c.minX - radius;
        else if (m === pr) pos.x = c.maxX + radius;
        else if (m === pt) pos.z = c.minZ - radius;
        else pos.z = c.maxZ + radius;
      }
    }
  }
  // world bounds + sea wall
  const B = WORLD.half;
  if (pos.x < -B) pos.x = -B;
  if (pos.x > B) pos.x = B;
  if (pos.z < -B) pos.z = -B;
  if (pos.z > WORLD.seaZ - 6) pos.z = WORLD.seaZ - 6;
  return hit;
}
