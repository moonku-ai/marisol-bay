// Marisol Bay — the game itself: loop, controls, camera, driving, shooting,
// wanted heat, damage, screens and saves. Systems live in their own files;
// this one wires them together and owns the player.

/* global THREE */
import { CAR, MISSIONS, PALETTE, PLAYER, SHOPS, WEAPONS, WORLD } from './config.js';
import { buildCity, collideCircle } from './city.js';
import { createTraffic, createCarState, drivePlayerCar } from './vehicles.js';
import { createPeds, makePedMesh } from './people.js';
import { createPolice } from './police.js';
import { createParticles, createTracers, createEnemies, shootRay } from './combat.js';
import { createMissions } from './missions.js';
import { createHud } from './hud.js';
import { createAudio } from './audio.js';
import { createInput } from './input.js';
import { loadSave, writeSave, clearSave } from './save.js';
import { makeRng, pick } from './rng.js';

const STEP = 1 / 60;
const MAX_FRAME = 0.25;

export function createGame(canvas, params) {
  const seed = params.seed || 1;
  const god = params.god === true;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 900);
  camera.position.set(0, 8, 110);

  const city = buildCity(scene, seed);
  const traffic = createTraffic(scene, seed, city.colliders, city.roadLines);
  const peds = createPeds(scene, seed, city.roadLines);
  const police = createPolice(scene, city.colliders);
  const particles = createParticles(scene, 400);
  const tracers = createTracers(scene, 12);
  const enemies = createEnemies(scene, city.colliders);
  const hud = createHud();
  const audio = createAudio();
  const input = createInput(canvas);
  const raycaster = new THREE.Raycaster();

  // parked cars (stealable) — from the city's spots
  const parkedCars = [];
  for (const spot of city.parkedSpots) {
    const car = createCarState(spot.id || `parked-${parkedCars.length}`,
      spot.x, spot.z, spot.angle, spot.color, spot.name, spot.name === 'Surf Van' ? 'van' : 'sedan');
    car.parked = true;
    car.mesh.position.set(spot.x, 0, spot.z);
    car.mesh.rotation.y = spot.angle;
    scene.add(car.mesh);
    parkedCars.push(car);
  }

  // player mesh — Rae in an amber jacket
  const playerMesh = makePedMesh(0xe8b88a, 0xf59e0b, 0x1e293b);
  scene.add(playerMesh);

  // --- state ---------------------------------------------------------------
  const player = {
    x: city.playerStart.x, z: city.playerStart.z, angle: city.playerStart.angle,
    vx: 0, vz: 0, health: PLAYER.maxHealth, armor: 0, cash: 0,
    wanted: 0, weapon: 'pistol', hasRifle: false, mag: 12, kills: 0,
    missionsDone: 0, inCar: null, lastCrime: -999, hurtCooldown: 0,
    shootCooldown: 0, crimeCooldown: 0, dead: false,
  };
  let camYaw = Math.PI;
  let camPitch = 0.32;
  let camPos = new THREE.Vector3(0, 8, 110);
  let screen = 'title'; // title | playing | paused | over
  let overKind = 'WASTED';
  let gameMinutes = 9 * 60; // 09:00
  let day = 1;
  let hitStop = 0;
  let shake = 0;
  let elapsed = 0;
  let pendingNext = 0;
  let debugPanel = null;
  let debugOn = false;
  let fpsEma = 60;
  let exhaustTimer = 0;
  let saveData = loadSave();

  const missions = createMissions({
    onBrief(m) {
      hud.showMessage(m.name, m.brief, 5);
      audio.pickup();
      const s = missions.stepDef();
      if (s) city.setBeacon(s.pos[0], s.pos[1], true);
    },
    onObjective(s) {
      hud.showToast(`Objective: ${s.text}`);
      city.setBeacon(s.pos[0], s.pos[1], true);
    },
    onMissionComplete(m) {
      player.cash += m.reward;
      player.missionsDone += 1;
      audio.missionDone();
      hud.showMessage(`${m.name} — COMPLETE`, `+$${m.reward} · Cash $${player.cash.toLocaleString('en-US')}`, 4);
      hud.addKill(`${m.name} +$${m.reward}`);
      city.setBeacon(0, 0, false);
      saveProgress();
      pendingNext = 2.5;
    },
    onMissionFailed(reason) {
      audio.missionFail();
      hud.showMessage('MISSION FAILED', `${reason} — press T to retry`, 5);
      city.setBeacon(0, 0, false);
    },
    onStoryDone() {
      audio.missionDone();
      hud.showMessage('MARISOL BAY — STORY COMPLETE', 'Rae owns the waterfront. Free roam the Bay, legend.', 8);
    },
    onWanted(n) { player.wanted = Math.max(player.wanted, n); player.lastCrime = elapsed; },
    onSpawnEnemies(n) { spawnEnemiesNear(n, 24, 34); },
    onSteal() {
      hud.showToast('Car stolen — the heat is on!');
      addWanted(1);
    },
    onHold(p) { /* progress shown in the objective line */ },
  });

  function saveProgress() {
    writeSave({
      missionIndex: missions.state.index, cash: player.cash, health: player.health,
      armor: player.armor, x: player.x, z: player.z, weapon: player.weapon,
      hasRifle: player.hasRifle, kills: player.kills, missionsDone: player.missionsDone,
    });
  }

  function applySave(data) {
    player.cash = data.cash || 0;
    player.health = data.health || PLAYER.maxHealth;
    player.armor = data.armor || 0;
    player.x = data.x ?? city.playerStart.x;
    player.z = data.z ?? city.playerStart.z;
    player.weapon = data.weapon || 'pistol';
    player.hasRifle = !!data.hasRifle;
    player.kills = data.kills || 0;
    player.missionsDone = data.missionsDone || 0;
    player.mag = WEAPONS[player.weapon].mag || 0;
  }

  function addWanted(n) {
    if (player.crimeCooldown > 0 && n === 1) return;
    player.wanted = Math.min(5, player.wanted + n);
    player.lastCrime = elapsed;
    if (n >= 1) player.crimeCooldown = 4;
  }

  function spawnEnemiesNear(n, minD, maxD) {
    const rng = makeRng((seed * 1000 + Math.floor(elapsed * 10) + n * 13) >>> 0);
    for (let i = 0; i < n; i += 1) {
      const a = rng() * Math.PI * 2;
      const d = minD + rng() * (maxD - minD);
      const pos = { x: player.x + Math.cos(a) * d, z: player.z + Math.sin(a) * d };
      collideCircle(pos, 1, city.colliders);
      enemies.spawn(pos.x, pos.z, 100);
    }
  }

  function damagePlayer(amount, source) {
    if (god || player.dead || screen !== 'playing') return;
    if (player.hurtCooldown > 0 && source === 'ram') return;
    let left = amount;
    if (player.armor > 0) {
      const absorbed = Math.min(player.armor, left * 0.6);
      player.armor -= absorbed;
      left -= absorbed;
    }
    player.health -= left;
    player.hurtCooldown = source === 'ram' ? 0.8 : 0.25;
    shake = Math.max(shake, 0.35);
    if (player.health <= 0) {
      player.health = 0;
      wasted();
    }
  }

  function wasted() {
    player.dead = true;
    overKind = 'WASTED';
    showOver('WASTED', 'The Bay chewed you up. Bay General patched you up — the job is still waiting.');
    audio.missionFail();
  }

  function busted() {
    if (player.dead) return;
    player.dead = true;
    overKind = 'BUSTED';
    player.cash = Math.max(0, player.cash - 100);
    showOver('BUSTED', 'Chief Kett’s officers cuffed you. $100 bail — the job is still waiting.');
    audio.busted();
  }

  function showOver(title, text) {
    screen = 'over';
    input.releaseLock();
    document.getElementById('overTitle').textContent = title;
    document.getElementById('overText').textContent = text;
    document.getElementById('overScreen').classList.remove('hidden');
    hud.hide();
    audio.engine(false);
    audio.siren(false);
  }

  function retryMission() {
    player.dead = false;
    player.health = PLAYER.maxHealth;
    player.armor = Math.max(player.armor, 25);
    player.wanted = 0;
    player.x = SHOPS.hospital.pos[0];
    player.z = SHOPS.hospital.pos[1];
    exitCar(true);
    police.clearAll();
    enemies.clearAll();
    document.getElementById('overScreen').classList.add('hidden');
    screen = 'playing';
    hud.show();
    missions.retry();
    hud.showMessage(missions.mission().name, 'Back on your feet — retry the job.', 4);
  }

  function startGame(fromSave) {
    audio.unlock();
    audio.startMusic();
    if (fromSave && saveData) applySave(saveData);
    else { player.cash = 0; }
    document.getElementById('startScreen').classList.add('hidden');
    document.getElementById('pauseScreen').classList.add('hidden');
    document.getElementById('overScreen').classList.add('hidden');
    screen = 'playing';
    hud.show();
    input.requestLock();
    const saveIndex = fromSave && saveData ? Math.max(0, Math.min(MISSIONS.length - 1, saveData.missionIndex)) : 0;
    missions.startMission(saveIndex);
    hud.showToast(fromSave ? 'Save loaded — welcome back to the Bay' : 'Welcome to Marisol Bay');
  }

  function pauseGame() {
    if (screen !== 'playing') return;
    screen = 'paused';
    input.releaseLock();
    const el = document.getElementById('pauseStats');
    el.textContent = `Cash $${player.cash.toLocaleString('en-US')} · Missions done ${player.missionsDone} · Kills ${player.kills} · Wanted ${player.wanted}★`;
    document.getElementById('pauseScreen').classList.remove('hidden');
    audio.engine(false);
    audio.siren(false);
  }

  function resumeGame() {
    document.getElementById('pauseScreen').classList.add('hidden');
    screen = 'playing';
    input.requestLock();
  }

  function nearestCar(maxDist) {
    let best = null; let bestD = maxDist;
    for (const car of [...parkedCars, ...traffic.cars]) {
      const d = Math.hypot(car.x - player.x, car.z - player.z);
      if (d < bestD) { bestD = d; best = car; }
    }
    return best;
  }

  function enterCar(car) {
    const wasParked = car.parked;
    const wasTraffic = traffic.cars.includes(car);
    player.inCar = car;
    car.parked = false;
    car.driver = true;
    playerMesh.visible = false;
    if (wasParked || wasTraffic) addWanted(1);
    audio.engine(true, 0);
    hud.showToast(`Driving the ${car.name} — W/S to drive, Space to brake`);
  }

  function exitCar(force) {
    const car = player.inCar;
    if (!car) return;
    car.speed = 0;
    car.driver = false;
    player.inCar = null;
    playerMesh.visible = true;
    player.x = car.x + Math.cos(car.angle + Math.PI / 2) * 3;
    player.z = car.z + Math.sin(car.angle + Math.PI / 2) * 3;
    collideCircle(player, PLAYER.radius, city.colliders);
    audio.engine(false);
    if (!force) hud.showToast('On foot — E near a car to drive it');
  }

  function tryShoot() {
    const w = WEAPONS[player.weapon];
    if (player.shootCooldown > 0 || player.inCar) return;
    if (player.weapon !== 'fists' && player.mag <= 0) {
      hud.showToast('Out of ammo — press R to reload');
      return;
    }
    player.shootCooldown = w.rate;
    if (player.weapon !== 'fists') player.mag -= 1;
    audio.shoot();
    peds.fleeFrom(player.x, player.z);
    if (player.wanted === 0) addWanted(1);
    // muzzle point: just ahead of the player, at chest height
    const from = new THREE.Vector3(
      player.x + Math.sin(player.angle) * 1.2, 1.45, player.z + Math.cos(player.angle) * 1.2);
    const result = shootRay(camera, raycaster, enemies.list, w.range);
    tracers.fire(from, result.point);
    particles.burst(from.x, from.y, from.z, 4, 1, 0.9, 0.4, 3, 0.25, 0.9);
    if (result.enemy) {
      const died = enemies.damage(result.enemy, w.damage, particles);
      audio.hit();
      hitStop = 0.045;
      if (died) {
        player.kills += 1;
        player.cash += 25;
        hud.addKill(`Shooter down +$25`);
      }
    } else {
      particles.burst(result.point.x, result.point.y, result.point.z, 5, 0.8, 0.8, 0.8, 3, 0.4, 0.8);
    }
  }

  function updatePlayer(dt) {
    // look
    const m = input.consumeMouse();
    camYaw -= m.dx * 0.0026;
    camPitch = Math.max(-0.12, Math.min(0.75, camPitch + m.dy * 0.0022));

    if (player.inCar) {
      const car = player.inCar;
      const res = drivePlayerCar(car, input, dt, city.colliders);
      player.x = car.x;
      player.z = car.z;
      if (res.crashed) {
        audio.crash();
        shake = Math.max(shake, res.hard ? 0.5 : 0.25);
        particles.burst(car.x, 0.8, car.z, res.hard ? 18 : 6, 1, 0.8, 0.3, 5, 0.5, 1);
        if (res.hard) damagePlayer(6, 'crash');
      }
      // bump traffic cars
      for (const other of traffic.cars) {
        if (other === car) continue;
        const dx = other.x - car.x; const dz = other.z - car.z;
        const d = Math.hypot(dx, dz);
        if (d < 4.4 && d > 0.01) {
          const push = (4.4 - d) / 2;
          const nx = dx / d; const nz = dz / d;
          other.x += nx * push; other.z += nz * push;
          car.x -= nx * push * 0.5; car.z -= nz * push * 0.5;
          const rel = Math.abs(car.speed - other.speed);
          if (rel > 6) { audio.crash(); particles.burst(car.x, 0.8, car.z, 10, 1, 0.8, 0.3, 4, 0.4, 1); }
          car.speed *= 0.96;
        }
      }
      // run over a pedestrian: crime, ped goes down and respawns later
      for (const p of peds.peds) {
        if (p.down) continue;
        const d = Math.hypot(p.x - car.x, p.z - car.z);
        if (d < 2 && Math.abs(car.speed) > 4) {
          p.down = true; p.downTimer = 6;
          p.mesh.visible = false;
          particles.burst(p.x, 1, p.z, 12, 1, 0.9, 0.5, 4, 0.5, 1);
          addWanted(1);
          hud.showToast('You hit a pedestrian — the cops noticed!');
          audio.crash();
        }
      }
      audio.engine(true, Math.abs(car.speed) / CAR.maxSpeed);
      exhaustTimer -= dt;
      if (exhaustTimer <= 0 && Math.abs(car.speed) > 3) {
        exhaustTimer = 0.12;
        particles.burst(car.x - Math.sin(car.angle) * 2.4, 0.5, car.z - Math.cos(car.angle) * 2.4,
          2, 0.5, 0.5, 0.55, 1.2, 0.7, 0.9);
      }
      if (input.pressed('KeyE')) exitCar(false);
      return;
    }

    // on foot
    const fwd = (input.has('KeyW') || input.has('ArrowUp') ? 1 : 0) - (input.has('KeyS') || input.has('ArrowDown') ? 1 : 0);
    const strafe = (input.has('KeyD') || input.has('ArrowRight') ? 1 : 0) - (input.has('KeyA') || input.has('ArrowLeft') ? 1 : 0);
    const run = input.has('ShiftLeft') || input.has('ShiftRight');
    const speed = run ? PLAYER.runSpeed : PLAYER.walkSpeed;
    const fx = Math.sin(camYaw); const fz = Math.cos(camYaw);
    const rx = Math.cos(camYaw); const rz = -Math.sin(camYaw);
    let mx = fx * fwd + rx * strafe;
    let mz = fz * fwd + rz * strafe;
    const len = Math.hypot(mx, mz);
    if (len > 0.01) {
      mx /= len; mz /= len;
      player.vx += (mx * speed - player.vx) * Math.min(1, dt * 10);
      player.vz += (mz * speed - player.vz) * Math.min(1, dt * 10);
      const targetAngle = Math.atan2(mx, mz);
      let diff = targetAngle - player.angle;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      player.angle += diff * Math.min(1, dt * 12);
    } else {
      player.vx *= Math.max(0, 1 - dt * 10);
      player.vz *= Math.max(0, 1 - dt * 10);
    }
    player.x += player.vx * dt;
    player.z += player.vz * dt;
    collideCircle(player, PLAYER.radius, city.colliders);
    playerMesh.position.set(player.x, 0, player.z);
    playerMesh.rotation.y = player.angle;
    const moving = Math.hypot(player.vx, player.vz);
    const swing = Math.sin(elapsed * (run ? 13 : 9)) * Math.min(1, moving / 6) * 0.55;
    playerMesh.userData.legL.rotation.x = swing;
    playerMesh.userData.legR.rotation.x = -swing;
    playerMesh.userData.armL.rotation.x = -swing * 0.7;
    playerMesh.userData.armR.rotation.x = swing * 0.7;

    if (input.pressed('KeyE')) {
      const car = nearestCar(5);
      if (car) enterCar(car);
      else hud.showToast('No car close by — walk to a parked car');
    }
    if (input.pressed('Digit1')) { player.weapon = 'fists'; player.mag = 0; }
    if (input.pressed('Digit2')) {
      player.weapon = player.hasRifle ? 'rifle' : 'pistol';
      player.mag = WEAPONS[player.weapon].mag;
    }
    if (input.pressed('KeyR') && player.weapon !== 'fists') {
      player.mag = WEAPONS[player.weapon].mag;
      hud.showToast('Reloaded');
    }
    if (input.pressed('KeyG')) {
      const d = Math.hypot(player.x - SHOPS.gun.pos[0], player.z - SHOPS.gun.pos[1]);
      if (d < SHOPS.gun.radius) {
        if (player.hasRifle) hud.showToast('You already own the rifle');
        else if (player.cash >= WEAPONS.rifle.price) {
          player.cash -= WEAPONS.rifle.price;
          player.hasRifle = true;
          player.weapon = 'rifle';
          player.mag = WEAPONS.rifle.mag;
          audio.pickup();
          hud.showToast('Rifle bought — press 2 to equip it');
        } else hud.showToast(`Rifle costs $${WEAPONS.rifle.price} — you have $${player.cash}`);
      } else hud.showToast('Go to Bay Arms (gun shop) to buy the rifle');
    }
    if (input.pressed('KeyT') && missions.state.status === 'failed') {
      missions.retry();
      hud.showMessage(missions.mission().name, 'Retrying the job.', 3);
    }
    // shooting: click or F (auto for the rifle while held)
    const w = WEAPONS[player.weapon];
    const wantFire = input.consumeClick() || input.has('KeyF') || (w.auto && input.mouse.down);
    if (wantFire && player.weapon !== 'fists') tryShoot();
    else if (wantFire && player.weapon === 'fists' && player.shootCooldown <= 0) {
      player.shootCooldown = w.rate;
      // punch: nearest enemy within range takes damage
      for (const e of enemies.list) {
        if (Math.hypot(e.x - player.x, e.z - player.z) < w.range) {
          if (enemies.damage(e, w.damage, particles)) { player.kills += 1; player.cash += 25; }
          break;
        }
      }
    }
  }

  function updateCamera(dt) {
    let target;
    if (player.inCar) {
      const car = player.inCar;
      const fx = Math.sin(car.angle); const fz = Math.cos(car.angle);
      target = new THREE.Vector3(
        car.x - fx * 11, 4.2, car.z - fz * 11);
      camera.position.lerp(target, Math.min(1, dt * 4));
      camera.lookAt(car.x + fx * 7, 1.6, car.z + fz * 7);
    } else {
      const dist = 9;
      const ox = -Math.sin(camYaw) * Math.cos(camPitch) * dist;
      const oz = -Math.cos(camYaw) * Math.cos(camPitch) * dist;
      const oy = 2.8 + Math.sin(camPitch) * dist;
      target = new THREE.Vector3(player.x + ox, oy, player.z + oz);
      camera.position.lerp(target, Math.min(1, dt * 10));
      camera.lookAt(player.x, 1.6, player.z);
    }
    if (shake > 0) {
      camera.position.x += (Math.random() - 0.5) * shake;
      camera.position.y += (Math.random() - 0.5) * shake * 0.6;
      shake = Math.max(0, shake - dt * 1.4);
    }
    camPos.copy(camera.position);
  }

  function update(dt) {
    elapsed += dt;
    player.hurtCooldown = Math.max(0, player.hurtCooldown - dt);
    player.crimeCooldown = Math.max(0, player.crimeCooldown - dt);
    player.shootCooldown = Math.max(0, player.shootCooldown - dt);
    gameMinutes += dt * 0.5; // 1 game minute per 2 real seconds
    if (gameMinutes >= 24 * 60) { gameMinutes -= 24 * 60; day += 1; }

    // traffic lights cycle
    for (const l of city.trafficLights) {
      l.timer += dt;
      if (l.timer > 6) { l.timer = 0; l.nsGreen = !l.nsGreen; }
      l.red.material.emissiveIntensity = l.nsGreen ? 0.15 : 0.9;
      l.green.material.emissiveIntensity = l.nsGreen ? 0.9 : 0.15;
    }
    // clouds drift, sea breathes
    for (const c of city.clouds) {
      c.position.x += dt * 1.6;
      if (c.position.x > 240) c.position.x = -240;
    }
    city.sea.position.y = 0.02 + Math.sin(elapsed * 0.5) * 0.06;
    city.beacon.rotation.y += dt * 0.8;

    updatePlayer(dt);
    traffic.update(dt, city.trafficLights.map((l) => l));
    peds.update(dt);
    // respawn downed peds
    for (const p of peds.peds) {
      if (!p.down) continue;
      p.downTimer -= dt;
      if (p.downTimer <= 0) {
        p.down = false;
        p.mesh.visible = true;
        p.x = (Math.random() * 2 - 1) * 180;
        p.z = (Math.random() * 2 - 1) * 180;
      }
    }
    // wanted decay: hide long enough and the heat cools
    if (player.wanted > 0 && elapsed - player.lastCrime > 25) {
      player.wanted = Math.max(0, player.wanted - dt / 8);
      player.wanted = Math.floor(player.wanted * 10) / 10;
    }
    const wantedInt = Math.ceil(player.wanted);
    police.update(dt, wantedInt, { x: player.x, z: player.z }, !!player.inCar, busted);
    // police rams hurt the player (in a car or on foot)
    for (const c of police.cruisers) {
      const d = Math.hypot(c.x - player.x, c.z - player.z);
      if (d < 2.8 && Math.abs(c.speed) > 6) damagePlayer(9, 'ram');
    }
    enemies.update(dt, { x: player.x, z: player.z }, tracers, particles, (dmg) => damagePlayer(dmg, 'bullet'));
    particles.update(dt);
    tracers.update(dt);

    // missions
    const obj = missions.currentObjective();
    if (obj && missions.state.status === 'active') {
      missions.update(dt, { x: player.x, z: player.z }, !!player.inCar, player.inCar ? player.inCar.id : null);
    }
    if (pendingNext > 0) {
      pendingNext -= dt;
      if (pendingNext <= 0) missions.nextMission();
    }

    // audio state
    audio.siren(wantedInt >= 2);
    if (!player.inCar) audio.engine(false);

    // HUD
    const objNow = missions.currentObjective();
    const hudWorld = {
      player, playerAngle: player.inCar ? player.inCar.angle : player.angle,
      cars: traffic.cars, police: police.cruisers,
      objective: objNow, buildings: city.colliders, roadLines: city.roadLines,
    };
    const hh = Math.floor(gameMinutes / 60);
    const mm2 = Math.floor(gameMinutes % 60);
    hud.update(dt, {
      health: player.health, armor: player.armor, cash: player.cash,
      wanted: wantedInt, weapon: WEAPONS[player.weapon].name,
      ammoText: player.weapon === 'fists' ? '' : `· ${player.mag}/${WEAPONS[player.weapon].mag}`,
      clock: `${String(hh).padStart(2, '0')}:${String(mm2).padStart(2, '0')}`,
      day,
      objective: objNow ? {
        missionName: objNow.missionName, text: objNow.text,
        dist: Math.hypot(player.x - objNow.pos[0], player.z - objNow.pos[1]),
        timeLeft: objNow.timeLeft || 0,
      } : null,
      freeRoamText: null,
      driving: !!player.inCar, speed: player.inCar ? Math.abs(player.inCar.speed) : 0,
      carName: player.inCar ? player.inCar.name : '',
      armed: player.weapon !== 'fists',
      showHint: elapsed < 20,
    }, hudWorld);

    if (debugOn && debugPanel) {
      debugPanel.textContent = `fps ${fpsEma.toFixed(0)} · pos ${player.x.toFixed(0)},${player.z.toFixed(0)} · ` +
        `hp ${player.health.toFixed(0)} · wanted ${wantedInt} · mission ${missions.state.index + 1} step ${missions.state.step} ` +
        `${missions.state.status} · cash $${player.cash} · enemies ${enemies.count()} · traffic ${traffic.cars.length}`;
    }
  }

  function frame(now) {
    const dtRaw = Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    fpsEma += ((1 / Math.max(dtRaw, 0.001)) - fpsEma) * 0.05;
    if (input.pressed('Escape') && screen === 'playing') pauseGame();
    else if (input.pressed('Escape') && screen === 'paused') resumeGame();
    if (input.pressed('KeyM')) {
      audio.setMuted(!audio.isMuted());
      hud.showToast(audio.isMuted() ? 'Sound muted' : 'Sound on');
    }
    if (input.pressed('F3')) {
      debugOn = !debugOn;
      if (debugOn && !debugPanel) {
        debugPanel = document.createElement('div');
        debugPanel.style.cssText = 'position:fixed;left:8px;top:8px;z-index:20;background:rgba(0,0,0,0.7);color:#0f0;font:12px monospace;padding:6px;border-radius:6px';
        document.body.appendChild(debugPanel);
      }
      if (debugPanel) debugPanel.style.display = debugOn ? 'block' : 'none';
      hud.setFps('', debugOn);
    }

    if (screen === 'playing') {
      if (hitStop > 0) {
        hitStop -= dtRaw;
      } else {
        let acc = dtRaw;
        while (acc >= STEP) { update(STEP); acc -= STEP; }
      }
      updateCamera(dtRaw);
    } else if (screen === 'title') {
      // slow orbit over the Bay behind the start screen
      const a = performance.now() * 0.00004;
      camera.position.set(Math.sin(a) * 150, 70, Math.cos(a) * 150);
      camera.lookAt(0, 0, 40);
    }
    renderer.render(scene, camera);
  }

  let last = performance.now();

  function resize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  }
  window.addEventListener('resize', resize);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screen === 'playing') pauseGame();
  });

  // buttons
  document.getElementById('startBtn').addEventListener('click', () => startGame(false));
  const contBtn = document.getElementById('continueBtn');
  if (saveData) {
    contBtn.style.display = 'inline-block';
    contBtn.addEventListener('click', () => startGame(true));
  }
  document.getElementById('resumeBtn').addEventListener('click', resumeGame);
  document.getElementById('restartBtn').addEventListener('click', () => {
    clearSave();
    saveData = null;
    document.getElementById('pauseScreen').classList.add('hidden');
    player.health = PLAYER.maxHealth; player.cash = 0; player.wanted = 0; player.dead = false;
    player.x = city.playerStart.x; player.z = city.playerStart.z;
    exitCar(true);
    police.clearAll(); enemies.clearAll();
    screen = 'playing';
    missions.startMission(0);
  });
  document.getElementById('retryBtn').addEventListener('click', retryMission);

  // debug hooks (guizang process): step the sim, inspect state, spawn things
  const G = {
    game: null,
    get state() {
      return {
        screen, health: player.health, cash: player.cash, wanted: Math.ceil(player.wanted),
        mission: missions.state.index + 1, step: missions.state.step,
        status: missions.state.status, x: player.x, z: player.z,
        inCar: !!player.inCar, enemies: enemies.count(), kills: player.kills,
      };
    },
    step(n, dt) {
      const steps = n || 60;
      for (let i = 0; i < steps; i += 1) update(dt || STEP);
      renderer.render(scene, camera);
    },
    upd(n, dt) {
      const steps = n || 30;
      for (let i = 0; i < steps; i += 1) update(dt || STEP);
    },
    press(...codes) { codes.forEach((c) => input.keys.add(c)); },
    release(...codes) { codes.forEach((c) => input.keys.delete(c)); },
    teleport(x, z) { player.x = x; player.z = z; if (player.inCar) { player.inCar.x = x; player.inCar.z = z; } },
    hurt(n) { damagePlayer(n, 'test'); },
    heal() { player.health = PLAYER.maxHealth; player.armor = 100; },
    setWanted(n) { player.wanted = n; player.lastCrime = elapsed; },
    startMission(i) { missions.startMission(i); },
    spawnEnemies(n) { spawnEnemiesNear(n, 10, 20); },
    giveCash(n) { player.cash += n; },
    god() { /* god mode is a URL param; this reports it */ return god; },
  };
  G.game = G;

  return {
    G, player, missions, city, traffic, peds, police, enemies, hud, audio, input,
    get screen() { return screen; },
    start() {
      if (params.auto) startGame(false);
      renderer.setAnimationLoop((t) => frame(t));
    },
    // deterministic shot staging (used by ?shot=): run the sim forward, then
    // render one frame and flag readiness for the screenshot tool.
    stageShot(name) {
      startGame(false);
      const runners = {
        chase() {
          player.x = 0; player.z = 40;
          const car = parkedCars[0];
          enterCar(car);
          car.speed = 26;
          player.wanted = 5; player.lastCrime = elapsed;
          input.keys.add('KeyW'); // hold the gas so the chase is moving
          for (let i = 0; i < 90; i += 1) update(STEP);
          input.keys.delete('KeyW');
          camYaw = car.angle;
          camPitch = 0.3;
        },
        street() {
          // Rae walks the downtown sidewalk while traffic rolls past.
          player.x = 48; player.z = -34;
          camYaw = Math.PI / 2; // look along the road
          camPitch = 0.22;
          input.keys.add('KeyW');
          for (let i = 0; i < 240; i += 1) update(STEP);
          input.keys.delete('KeyW');
        },
        mission() {
          missions.startMission(2); // M3 Gold Rush — hold step, enemies present
          player.x = -56; player.z = 28;
          player.weapon = 'rifle'; player.hasRifle = true; player.mag = 30;
          camYaw = Math.PI * 0.25; // look toward the Goldline marker at (-42, 42)
          for (let i = 0; i < 150; i += 1) update(STEP);
        },
        coast() {
          player.x = 60; player.z = 150;
          const car = parkedCars[4];
          enterCar(car);
          car.speed = 24;
          player.wanted = 0;
          input.keys.add('KeyW');
          for (let i = 0; i < 90; i += 1) update(STEP);
          input.keys.delete('KeyW');
          camYaw = car.angle;
        },
      };
      (runners[name] || runners.street)();
      for (let i = 0; i < 6; i += 1) updateCamera(1);
      renderer.render(scene, camera);
      window.__shotReady = true;
    },
  };
}
