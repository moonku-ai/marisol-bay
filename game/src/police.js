// Police — cruisers that chase and ram, officers on foot, and the wanted-5 heli.
// One job: make the wanted level feel dangerous, and let it cool down when hidden.

/* global THREE */
import { makeCarMesh } from './vehicles.js';
import { makePedMesh } from './people.js';
import { collideCircle } from './city.js';
import { WORLD } from './config.js';

export function createPolice(scene, colliders) {
  const cruisers = [];
  const officers = [];
  let heli = null;
  let heliMesh = null;
  let spawnTimer = 0;

  function makeCruiser(x, z) {
    const mesh = makeCarMesh(0x1e293b, 'sedan');
    // police livery: white doors + light bar
    const barMat = new THREE.MeshLambertMaterial({ color: 0xef4444, emissive: 0xef4444, emissiveIntensity: 1.4 });
    const bar = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.22, 0.5), barMat);
    bar.position.set(0, 1.72, -0.2); mesh.add(bar);
    const bar2 = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.22, 0.5),
      new THREE.MeshLambertMaterial({ color: 0x3b82f6, emissive: 0x3b82f6, emissiveIntensity: 1.4 }));
    bar2.position.set(0.62, 1.72, -0.2); mesh.add(bar2);
    scene.add(mesh);
    const cruiser = { x, z, angle: 0, speed: 0, mesh, stuck: 0 };
    cruisers.push(cruiser);
    return cruiser;
  }

  function makeOfficer(x, z) {
    const mesh = makePedMesh(0xc98d5f, 0x1e3a8a, 0x1e293b);
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.12, 10),
      new THREE.MeshLambertMaterial({ color: 0x0f172a }));
    cap.position.y = 1.92; mesh.add(cap);
    scene.add(mesh);
    const officer = { x, z, angle: 0, speed: 0, mesh, bustTimer: 0 };
    officers.push(officer);
    return officer;
  }

  function makeHeli(x, z) {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(2.4, 1.4, 5.2),
      new THREE.MeshLambertMaterial({ color: 0x1e293b }));
    body.castShadow = true; g.add(body);
    const glass = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.9, 1.6),
      new THREE.MeshLambertMaterial({ color: 0x7dd3fc }));
    glass.position.set(0, 0.2, 1.8); g.add(glass);
    const rotor = new THREE.Mesh(new THREE.BoxGeometry(9, 0.08, 0.5),
      new THREE.MeshLambertMaterial({ color: 0x334155 }));
    rotor.position.y = 1.0; g.add(rotor);
    const spot = new THREE.PointLight(0xfff7cc, 1.2, 40);
    spot.position.y = -1; g.add(spot);
    g.position.set(x, 42, z);
    scene.add(g);
    heli = { x, z, y: 42, angle: 0, mesh: g, rotor };
    heliMesh = g;
    return heli;
  }

  function removeHeli() {
    if (heliMesh) { scene.remove(heliMesh); heliMesh = null; heli = null; }
  }

  function wantedCount(wanted) {
    return wanted <= 0 ? 0 : wanted <= 1 ? 1 : wanted <= 2 ? 2 : wanted <= 3 ? 3 : wanted <= 4 ? 4 : 5;
  }

  function update(dt, wanted, playerPos, playerInCar, onBusted) {
    const want = wantedCount(wanted);
    // spawn / despawn cruisers to match the wanted level
    spawnTimer -= dt;
    if (cruisers.length < want && spawnTimer <= 0) {
      spawnTimer = 1.2;
      const a = Math.random() * Math.PI * 2;
      makeCruiser(
        Math.max(-190, Math.min(190, playerPos.x + Math.cos(a) * 55)),
        Math.max(-190, Math.min(190, playerPos.z + Math.sin(a) * 55)));
    }
    while (cruisers.length > want) {
      const c = cruisers.pop();
      scene.remove(c.mesh);
    }
    // officers on foot appear from wanted 2 up, only when the player is on foot
    const wantOfficers = wanted >= 2 && !playerInCar ? Math.min(2, wanted - 1) : 0;
    if (officers.length < wantOfficers && spawnTimer <= 0) {
      spawnTimer = 1.2;
      const a = Math.random() * Math.PI * 2;
      makeOfficer(playerPos.x + Math.cos(a) * 18, playerPos.z + Math.sin(a) * 18);
    }
    while (officers.length > wantOfficers) {
      const o = officers.pop();
      scene.remove(o.mesh);
    }
    // heli only at wanted 5
    if (wanted >= 5 && !heli) makeHeli(playerPos.x + 30, playerPos.z - 30);
    if (wanted < 5 && heli) removeHeli();

    // cruisers chase: steer toward the player, ram speed scales with wanted
    const chaseSpeed = 15 + wanted * 3.4;
    for (const c of cruisers) {
      const dx = playerPos.x - c.x; const dz = playerPos.z - c.z;
      const dist = Math.hypot(dx, dz) || 1;
      const wantAngle = Math.atan2(dx, dz);
      let diff = wantAngle - c.angle;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      c.angle += Math.max(-2.4 * dt, Math.min(2.4 * dt, diff));
      c.speed += (chaseSpeed - c.speed) * Math.min(1, dt * 0.8);
      const nx = c.x + Math.sin(c.angle) * c.speed * dt;
      const nz = c.z + Math.cos(c.angle) * c.speed * dt;
      const before = { x: c.x, z: c.z };
      c.x = nx; c.z = nz;
      if (collideCircle(c, 2.2, colliders)) { c.x = before.x; c.z = before.z; c.speed *= 0.4; c.angle += 0.9; }
      c.mesh.position.set(c.x, 0, c.z);
      c.mesh.rotation.y = c.angle;
      // ram damage is handled by the game (distance check)
    }

    // officers run at the player; standing close for 3 s busts the player
    for (const o of officers) {
      const dx = playerPos.x - o.x; const dz = playerPos.z - o.z;
      const dist = Math.hypot(dx, dz) || 1;
      o.angle = Math.atan2(dx, dz);
      const speed = dist > 2.2 ? 6.5 : 0;
      o.x += Math.sin(o.angle) * speed * dt;
      o.z += Math.cos(o.angle) * speed * dt;
      o.mesh.position.set(o.x, 0, o.z);
      o.mesh.rotation.y = o.angle;
      if (dist < 3.2) {
        o.bustTimer += dt;
        if (o.bustTimer > 3) { o.bustTimer = 0; onBusted(); }
      } else o.bustTimer = Math.max(0, o.bustTimer - dt * 2);
    }

    if (heli) {
      heli.x += (playerPos.x - heli.x) * Math.min(1, dt * 0.5);
      heli.z += (playerPos.z - heli.z) * Math.min(1, dt * 0.5);
      heli.angle += dt * 0.8;
      heli.mesh.position.set(heli.x, 42 + Math.sin(performance.now() * 0.001) * 1.5, heli.z);
      heli.mesh.rotation.y = Math.atan2(playerPos.x - heli.x, playerPos.z - heli.z);
      heli.rotor.rotation.y += dt * 22;
    }
  }

  function clearAll() {
    for (const c of cruisers) scene.remove(c.mesh);
    for (const o of officers) scene.remove(o.mesh);
    cruisers.length = 0; officers.length = 0;
    removeHeli();
  }

  return { cruisers, officers, update, clearAll, get heli() { return heli; } };
}
