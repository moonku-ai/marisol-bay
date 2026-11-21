// Vehicles — car meshes, traffic AI that follows the road grid and stops at red
// lights, and the player's arcade driving physics. One job: everything with wheels.

/* global THREE */
import { CAR, CAR_COLORS, CAR_NAMES, WORLD } from './config.js';
import { makeRng, pick } from './rng.js';
import { collideCircle } from './city.js';

export function makeCarMesh(color, kind) {
  const g = new THREE.Group();
  const bodyMat = new THREE.MeshLambertMaterial({ color });
  const glassMat = new THREE.MeshLambertMaterial({ color: 0x1e293b });
  const isVan = kind === 'van';
  const body = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.75, isVan ? 5.4 : 4.6), bodyMat);
  body.position.y = 0.65; body.castShadow = true; g.add(body);
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.65, isVan ? 3.4 : 2.2),
    isVan ? glassMat : glassMat);
  cabin.position.set(0, 1.3, isVan ? 0.2 : -0.2); cabin.castShadow = true; g.add(cabin);
  if (isVan) {
    const roof = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.14, 3.2), bodyMat);
    roof.position.set(0, 1.68, 0.2); roof.castShadow = true; g.add(roof);
  }
  const wheelMat = new THREE.MeshLambertMaterial({ color: 0x111827 });
  const wheelGeo = new THREE.CylinderGeometry(0.42, 0.42, 0.3, 10);
  const wheels = [];
  for (const [wx, wz] of [[-1.0, 1.5], [1.0, 1.5], [-1.0, -1.5], [1.0, -1.5]]) {
    const w = new THREE.Mesh(wheelGeo, wheelMat);
    w.rotation.z = Math.PI / 2;
    w.position.set(wx, 0.42, wz);
    g.add(w); wheels.push(w);
  }
  const lightMat = new THREE.MeshLambertMaterial({ color: 0xfff7cc, emissive: 0xffe9a3, emissiveIntensity: 0.5 });
  for (const hx of [-0.7, 0.7]) {
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.22, 0.12), lightMat);
    head.position.set(hx, 0.72, 2.36); g.add(head);
  }
  const tailMat = new THREE.MeshLambertMaterial({ color: 0xef4444, emissive: 0xef4444, emissiveIntensity: 0.7 });
  for (const tx of [-0.7, 0.7]) {
    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.2, 0.1), tailMat);
    tail.position.set(tx, 0.72, -2.36); g.add(tail);
  }
  g.userData.wheels = wheels;
  g.userData.tailMat = tailMat;
  return g;
}

export function createCarState(id, x, z, angle, color, name, kind) {
  return {
    id, name: name || 'Car', kind: kind || 'sedan', color,
    x, z, angle, speed: 0, steer: 0,
    mesh: makeCarMesh(color, kind || 'sedan'),
    brakeLight: false, parked: false, driver: false,
  };
}

function syncCarMesh(car) {
  car.mesh.position.set(car.x, 0, car.z);
  car.mesh.rotation.y = car.angle;
  const spin = car.speed * 0.016;
  for (const w of car.mesh.userData.wheels) w.rotation.x += spin;
  car.mesh.userData.tailMat.emissiveIntensity = car.brakeLight ? 2.2 : 0.7;
}

// Traffic: cars cruise one road line at a time, turn at intersections, and stop
// for a red light in their direction. Routes are deterministic from the seed.
export function createTraffic(scene, seed, colliders, roadLines) {
  const rng = makeRng(seed + 77);
  const cars = [];
  const B = WORLD.half - 14;
  for (let i = 0; i < 14; i += 1) {
    const horizontal = rng() < 0.5;
    const line = pick(rng, roadLines);
    const along = (rng() * 2 - 1) * B;
    const dir = rng() < 0.5 ? 1 : -1;
    const car = createCarState(`traffic-${i}`,
      horizontal ? along : line + (dir > 0 ? 3 : -3),
      horizontal ? line + (dir > 0 ? 3 : -3) : along,
      horizontal ? (dir > 0 ? Math.PI / 2 : -Math.PI / 2) : (dir > 0 ? 0 : Math.PI),
      pick(rng, CAR_COLORS), pick(rng, CAR_NAMES), rng() < 0.18 ? 'van' : 'sedan');
    car.horizontal = horizontal;
    car.line = line;
    car.dir = dir;
    car.cruise = 7 + rng() * 4;
    car.wait = 0;
    scene.add(car.mesh);
    cars.push(car);
  }

  function nearIntersection(car) {
    const along = car.horizontal ? car.x : car.z;
    for (const l of roadLines) {
      if (Math.abs(along - l) < 2.5) return l;
    }
    return null;
  }

  function update(dt, lights) {
    for (const car of cars) {
      if (car.driver) { syncCarMesh(car); continue; } // a player-driven car is not traffic
      if (car.wait > 0) { car.wait -= dt; car.speed = 0; syncCarMesh(car); continue; }
      // red light check: stop before the intersection when the light is red for us
      const inter = nearIntersection(car);
      let stopped = false;
      if (inter !== null) {
        const light = lights.find((l) => Math.abs(l.x - inter) < 22 && Math.abs(l.z - car.line) < 22)
          || lights.find((l) => Math.abs(l.z - inter) < 22 && Math.abs(l.x - car.line) < 22);
        if (light && !light.greenFor(car.horizontal)) {
          const dist = Math.abs((car.horizontal ? car.x : car.z) - inter);
          if (dist < 9 && dist > 0.5) { stopped = true; car.speed = Math.max(0, car.speed - 20 * dt); }
        }
      }
      if (!stopped) car.speed += (car.cruise - car.speed) * Math.min(1, dt * 1.2);
      const step = car.speed * dt;
      if (car.horizontal) car.x += car.dir * step; else car.z += car.dir * step;
      const along = car.horizontal ? car.x : car.z;
      if (Math.abs(along) > B) {
        // wrap to the other end of the same road
        if (car.horizontal) car.x = -car.dir * B; else car.z = -car.dir * B;
      }
      // random turn at an intersection
      if (inter !== null && rng() < dt * 0.25) {
        const turn = rng() < 0.5;
        if (turn) {
          const newHorizontal = !car.horizontal;
          const newLine = inter;
          const newDir = rng() < 0.5 ? 1 : -1;
          car.horizontal = newHorizontal;
          car.line = newLine;
          car.dir = newDir;
          if (newHorizontal) { car.z = newLine + (newDir > 0 ? 3 : -3); car.angle = newDir > 0 ? Math.PI / 2 : -Math.PI / 2; }
          else { car.x = newLine + (newDir > 0 ? 3 : -3); car.angle = newDir > 0 ? 0 : Math.PI; }
          car.wait = 0.4;
        }
      }
      syncCarMesh(car);
    }
  }

  return { cars, update };
}

// Player driving: simple arcade model — accelerate, steer by speed, collide with
// buildings, scrape sparks on hard hits. Returns { crashed } for sound/effects.
export function drivePlayerCar(car, input, dt, colliders) {
  const forward = input.has('KeyW') || input.has('ArrowUp');
  const back = input.has('KeyS') || input.has('ArrowDown');
  const left = input.has('KeyA') || input.has('ArrowLeft');
  const right = input.has('KeyD') || input.has('ArrowRight');
  const handbrake = input.has('Space');

  if (forward) car.speed += CAR.accel * dt;
  if (back) car.speed -= (car.speed > 0.5 ? CAR.brake : CAR.accel * 0.6) * dt;
  if (!forward && !back) car.speed -= Math.sign(car.speed) * 6 * dt;
  if (handbrake) car.speed -= Math.sign(car.speed) * 26 * dt;
  car.speed = Math.max(-CAR.reverseMax, Math.min(CAR.maxSpeed, car.speed));
  if (Math.abs(car.speed) < 0.05) car.speed = 0;

  const steerTarget = (left ? 1 : 0) - (right ? 1 : 0);
  car.steer += (steerTarget - car.steer) * Math.min(1, dt * 8);
  const dirSign = car.speed >= 0 ? 1 : -1;
  car.angle += car.steer * CAR.steer * dirSign * Math.min(1, Math.abs(car.speed) / 8) * dt;
  car.brakeLight = back || handbrake;

  const nx = car.x + Math.sin(car.angle) * car.speed * dt;
  const nz = car.z + Math.cos(car.angle) * car.speed * dt;
  const before = { x: car.x, z: car.z };
  car.x = nx; car.z = nz;
  const crashed = collideCircle(car, 2.2, colliders);
  if (crashed) {
    const hitSpeed = Math.abs(car.speed);
    car.speed *= -0.25;
    car.x = before.x; car.z = before.z;
    return { crashed: true, hard: hitSpeed > 12, speed: hitSpeed };
  }
  syncCarMesh(car);
  return { crashed: false, hard: false, speed: Math.abs(car.speed) };
}
