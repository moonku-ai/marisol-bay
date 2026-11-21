// Combat — shooting, enemy gunmen who shoot back, tracers and particles.
// One job: every bang, spark and hit in the game. No gore: hits are sparks.

/* global THREE */
import { makePedMesh } from './people.js';

// --- particles: one reusable pool, no allocation during play -----------------
export function createParticles(scene, count) {
  const geo = new THREE.BoxGeometry(0.16, 0.16, 0.16);
  const mat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const mesh = new THREE.InstancedMesh(geo, mat, count);
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.count = count;
  mesh.frustumCulled = false;
  scene.add(mesh);
  const items = [];
  for (let i = 0; i < count; i += 1) {
    items.push({ active: false, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, life: 0, max: 1, r: 1, g: 1, b: 1, size: 1 });
  }
  const dummy = new THREE.Object3D();
  const color = new THREE.Color();
  let cursor = 0;

  function burst(x, y, z, n, cr, cg, cb, speed, life, size) {
    for (let k = 0; k < n; k += 1) {
      const p = items[cursor];
      cursor = (cursor + 1) % items.length;
      p.active = true;
      p.x = x; p.y = y; p.z = z;
      const a = Math.random() * Math.PI * 2;
      const e = (Math.random() - 0.3) * Math.PI;
      p.vx = Math.cos(a) * Math.cos(e) * speed;
      p.vz = Math.sin(a) * Math.cos(e) * speed;
      p.vy = Math.sin(e) * speed + speed * 0.4;
      p.life = life * (0.6 + Math.random() * 0.6);
      p.max = p.life;
      p.r = cr; p.g = cg; p.b = cb;
      p.size = size * (0.7 + Math.random() * 0.6);
    }
  }

  function update(dt) {
    for (let i = 0; i < items.length; i += 1) {
      const p = items[i];
      if (!p.active) { dummy.scale.setScalar(0.0001); dummy.position.set(0, -100, 0); dummy.updateMatrix(); mesh.setMatrixAt(i, dummy.matrix); continue; }
      p.life -= dt;
      if (p.life <= 0) { p.active = false; continue; }
      p.vy -= 14 * dt;
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      if (p.y < 0.05) { p.y = 0.05; p.vy *= -0.4; }
      const s = p.size * (p.life / p.max);
      dummy.position.set(p.x, p.y, p.z);
      dummy.scale.setScalar(Math.max(0.001, s));
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
      color.setRGB(p.r, p.g, p.b);
      mesh.setColorAt(i, color);
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }

  return { burst, update };
}

// --- tracers: short-lived stretched boxes -----------------------------------
export function createTracers(scene, count) {
  const pool = [];
  const geo = new THREE.BoxGeometry(0.07, 0.07, 1);
  for (let i = 0; i < count; i += 1) {
    const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0xffe08a, transparent: true, opacity: 0 }));
    m.visible = false;
    scene.add(m);
    pool.push({ mesh: m, life: 0 });
  }
  let cursor = 0;
  function fire(from, to) {
    const t = pool[cursor];
    cursor = (cursor + 1) % pool.length;
    const dx = to.x - from.x; const dy = to.y - from.y; const dz = to.z - from.z;
    const len = Math.hypot(dx, dy, dz) || 1;
    t.mesh.position.set((from.x + to.x) / 2, (from.y + to.y) / 2, (from.z + to.z) / 2);
    t.mesh.lookAt(to.x, to.y, to.z);
    t.mesh.scale.set(1, 1, len);
    t.mesh.material.opacity = 0.9;
    t.mesh.visible = true;
    t.life = 0.09;
  }
  function update(dt) {
    for (const t of pool) {
      if (!t.mesh.visible) continue;
      t.life -= dt;
      if (t.life <= 0) t.mesh.visible = false;
      else t.mesh.material.opacity = t.life / 0.09 * 0.9;
    }
  }
  return { fire, update };
}

// --- enemy gunmen ------------------------------------------------------------
export function createEnemies(scene, colliders) {
  const list = [];

  function spawn(x, z, hp) {
    const mesh = makePedMesh(0xc98d5f, 0x7f1d1d, 0x1e293b);
    const gun = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 0.7),
      new THREE.MeshLambertMaterial({ color: 0x111827 }));
    gun.position.set(0.42, 1.15, 0.3); mesh.add(gun);
    mesh.position.set(x, 0, z);
    scene.add(mesh);
    const enemy = { x, z, angle: 0, hp: hp || 100, maxHp: hp || 100, mesh, shootTimer: 1 + Math.random(), flash: 0, dead: false };
    list.push(enemy);
    return enemy;
  }

  function damage(enemy, amount, particles) {
    enemy.hp -= amount;
    enemy.flash = 0.12;
    if (particles) particles.burst(enemy.x, 1.4, enemy.z, 10, 1, 0.85, 0.3, 5, 0.5, 1);
    if (enemy.hp <= 0 && !enemy.dead) {
      enemy.dead = true;
      if (particles) particles.burst(enemy.x, 1.2, enemy.z, 26, 1, 0.6, 0.2, 7, 0.8, 1.2);
      scene.remove(enemy.mesh);
    }
    return enemy.dead;
  }

  function update(dt, playerPos, tracers, particles, onPlayerHit) {
    for (const e of list) {
      if (e.dead) continue;
      const dx = playerPos.x - e.x; const dz = playerPos.z - e.z;
      const dist = Math.hypot(dx, dz) || 1;
      e.angle = Math.atan2(dx, dz);
      e.mesh.rotation.y = e.angle;
      // close in to a firing range, then stand and shoot
      if (dist > 26) {
        e.x += Math.sin(e.angle) * 5 * dt;
        e.z += Math.cos(e.angle) * 5 * dt;
        e.mesh.position.set(e.x, 0, e.z);
      }
      if (e.flash > 0) {
        e.flash -= dt;
        e.mesh.children.forEach((c) => { if (c.material && c.material.emissive) c.material.emissive.setHex(0x881111); });
        if (e.flash <= 0) e.mesh.children.forEach((c) => { if (c.material && c.material.emissive) c.material.emissive.setHex(0x000000); });
      }
      e.shootTimer -= dt;
      if (e.shootTimer <= 0 && dist < 55) {
        e.shootTimer = 0.9 + Math.random() * 0.9;
        const from = { x: e.x, y: 1.4, z: e.z };
        const spread = 3.2;
        const to = {
          x: playerPos.x + (Math.random() - 0.5) * spread,
          y: 1.2,
          z: playerPos.z + (Math.random() - 0.5) * spread,
        };
        tracers.fire(from, to);
        if (particles) particles.burst(from.x, from.y, from.z, 3, 1, 0.9, 0.4, 3, 0.25, 0.8);
        // hit chance falls with distance
        if (Math.random() < Math.max(0.12, 0.5 - dist * 0.008)) onPlayerHit(7 + Math.random() * 6);
      }
    }
    // drop the dead from the list
    for (let i = list.length - 1; i >= 0; i -= 1) if (list[i].dead) list.splice(i, 1);
  }

  function clearAll() {
    for (const e of list) scene.remove(e.mesh);
    list.length = 0;
  }

  function count() { return list.length; }

  return { list, spawn, damage, update, clearAll, count };
}

// Raycast shot from the camera through the screen centre: returns the first
// enemy hit (within the weapon range) or the wall point.
export function shootRay(camera, raycaster, enemies, range) {
  raycaster.setFromCamera({ x: 0, y: 0 }, camera);
  const meshes = enemies.filter((e) => !e.dead).map((e) => e.mesh);
  const hits = raycaster.intersectObjects(meshes, true);
  if (hits.length === 0) {
    const end = raycaster.ray.at(range, new THREE.Vector3());
    return { enemy: null, point: end };
  }
  const hit = hits[0];
  if (hit.distance > range) {
    const end = raycaster.ray.at(range, new THREE.Vector3());
    return { enemy: null, point: end };
  }
  let obj = hit.object;
  while (obj.parent && !enemies.some((e) => e.mesh === obj)) obj = obj.parent;
  const enemy = enemies.find((e) => e.mesh === obj) || null;
  return { enemy, point: hit.point };
}
