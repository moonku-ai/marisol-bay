// Pedestrians — simple sidewalk walkers who flee from gunfire.
// One job: make the streets feel alive, and react when the player starts trouble.

/* global THREE */
import { makeRng, pick, range } from './rng.js';
import { WORLD } from './config.js';

const SKINS = [0xf2c9a0, 0xc98d5f, 0x8a5a3b, 0xe8b88a, 0x6e4423];
const SHIRTS = [0xef4444, 0x3b82f6, 0x22c55e, 0xf59e0b, 0xa855f7, 0xf8fafc, 0x14b8a6, 0xec4899];
const PANTS = [0x1e293b, 0x334155, 0x475569, 0x78350f, 0x14532d];

export function makePedMesh(skin, shirt, pants) {
  const g = new THREE.Group();
  const skinMat = new THREE.MeshLambertMaterial({ color: skin });
  const shirtMat = new THREE.MeshLambertMaterial({ color: shirt });
  const pantsMat = new THREE.MeshLambertMaterial({ color: pants });
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.32, 10, 8), skinMat);
  head.position.y = 1.62; head.castShadow = true; g.add(head);
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.72, 0.34), shirtMat);
  torso.position.y = 1.05; torso.castShadow = true; g.add(torso);
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.68, 0.26), pantsMat);
  legL.position.set(-0.16, 0.34, 0); g.add(legL);
  const legR = legL.clone(); legR.position.x = 0.16; g.add(legR);
  const armL = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.6, 0.2), shirtMat);
  armL.position.set(-0.42, 1.05, 0); g.add(armL);
  const armR = armL.clone(); armR.position.x = 0.42; g.add(armR);
  g.userData = { legL, legR, armL, armR };
  return g;
}

export function createPeds(scene, seed, roadLines) {
  const rng = makeRng(seed + 31);
  const peds = [];
  const B = WORLD.half - 12;
  for (let i = 0; i < 26; i += 1) {
    const horizontal = rng() < 0.5;
    const line = pick(rng, roadLines);
    const along = (rng() * 2 - 1) * B;
    const side = rng() < 0.5 ? 8 : -8;
    const mesh = makePedMesh(pick(rng, SKINS), pick(rng, SHIRTS), pick(rng, PANTS));
    const ped = {
      id: `ped-${i}`, mesh,
      x: horizontal ? along : line + side,
      z: horizontal ? line + side : along,
      angle: rng() * Math.PI * 2,
      speed: range(rng, 1.2, 2.2),
      horizontal, line, side, dir: rng() < 0.5 ? 1 : -1,
      fleeing: false, fleeTimer: 0, walkPhase: rng() * 6,
    };
    mesh.position.set(ped.x, 0, ped.z);
    scene.add(mesh);
    peds.push(ped);
  }

  function fleeFrom(x, z) {
    for (const p of peds) {
      const dx = p.x - x; const dz = p.z - z;
      if (dx * dx + dz * dz < 30 * 30) { p.fleeing = true; p.fleeTimer = 3; }
    }
  }

  function update(dt) {
    for (const p of peds) {
      p.walkPhase += dt * (p.fleeing ? 14 : 7);
      const speed = p.fleeing ? 5.2 : p.speed;
      if (p.fleeing) {
        p.fleeTimer -= dt;
        if (p.fleeTimer <= 0) p.fleeing = false;
        // run away from the last scare point: keep current heading, it is fine
      }
      if (p.horizontal) p.x += p.dir * speed * dt; else p.z += p.dir * speed * dt;
      const along = p.horizontal ? p.x : p.z;
      if (Math.abs(along) > B) {
        p.dir *= -1;
        if (p.horizontal) p.x = Math.max(-B, Math.min(B, p.x)); else p.z = Math.max(-B, Math.min(B, p.z));
      }
      // occasionally turn at an intersection
      if (rng() < dt * 0.06) {
        p.horizontal = !p.horizontal;
        const line = p.horizontal ? p.z : p.x;
        p.line = Math.round(line / 42) * 42;
        if (p.horizontal) { p.z = p.line + p.side; } else { p.x = p.line + p.side; }
      }
      p.angle = p.horizontal ? (p.dir > 0 ? Math.PI / 2 : -Math.PI / 2) : (p.dir > 0 ? 0 : Math.PI);
      p.mesh.position.set(p.x, 0, p.z);
      p.mesh.rotation.y = p.angle;
      const swing = Math.sin(p.walkPhase) * 0.5;
      p.mesh.userData.legL.rotation.x = swing;
      p.mesh.userData.legR.rotation.x = -swing;
      p.mesh.userData.armL.rotation.x = -swing * 0.7;
      p.mesh.userData.armR.rotation.x = swing * 0.7;
    }
  }

  return { peds, update, fleeFrom };
}
