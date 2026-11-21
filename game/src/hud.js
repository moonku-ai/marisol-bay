// HUD — DOM stats, wanted stars, objective line, kill feed, messages and the 2D
// minimap. The minimap canvas uses { desynchronized: true }: a fast 2D redraw
// must never punch a hole through the WebGL layer (lesson from v1).

import { WORLD } from './config.js';

export function createHud() {
  const el = (id) => document.getElementById(id);
  const hud = el('hud');
  const healthFill = el('healthFill');
  const armorFill = el('armorFill');
  const cashVal = el('cashVal');
  const stars = [...el('stars').children];
  const clockTime = el('clockTime');
  const clockDay = el('clockDay');
  const missionName = el('missionName');
  const objectiveText = el('objectiveText');
  const objectiveDist = el('objectiveDist');
  const weaponName = el('weaponName');
  const ammoVal = el('ammoVal');
  const speedo = el('speedo');
  const speedVal = el('speedVal');
  const carName = el('carName');
  const crosshair = el('crosshair');
  const message = el('message');
  const killfeed = el('killfeed');
  const toast = el('toast');
  const vignette = el('vignette');
  const hint = el('hint');
  const fpsEl = el('fps');
  const minimap = el('minimap');
  // desynchronized: the 2D redraw must not tear the WebGL canvas beneath it.
  const mm = minimap.getContext('2d', { desynchronized: true });
  let messageTimer = 0;
  let toastTimer = 0;

  const S = 200 / (WORLD.half * 2 + 40); // world -> minimap scale
  function toMap(x, z) { return [100 + x * S, 100 + z * S]; }

  function drawMinimap(world) {
    const { player, playerAngle, cars, police, objective, buildings } = world;
    mm.clearRect(0, 0, 200, 200);
    mm.fillStyle = '#16213a'; mm.fillRect(0, 0, 200, 200);
    // sea + sand (south edge)
    mm.fillStyle = '#2e86ab';
    mm.fillRect(0, toMap(0, WORLD.seaZ - 6)[1], 200, 200);
    mm.fillStyle = '#e8d29a';
    mm.fillRect(0, toMap(0, WORLD.beachZ)[1], 200, toMap(0, WORLD.seaZ - 6)[1] - toMap(0, WORLD.beachZ)[1]);
    // blocks
    mm.fillStyle = 'rgba(148,163,184,0.5)';
    for (const b of buildings) {
      const [x, z] = toMap((b.minX + b.maxX) / 2, (b.minZ + b.maxZ) / 2);
      mm.fillRect(x - 1.5, z - 1.5, 3, 3);
    }
    // roads
    mm.strokeStyle = 'rgba(226,232,240,0.55)'; mm.lineWidth = 2;
    for (const line of world.roadLines) {
      const [x] = toMap(line, 0);
      mm.beginPath(); mm.moveTo(x, 0); mm.lineTo(x, 200); mm.stroke();
      const [, z] = toMap(0, line);
      mm.beginPath(); mm.moveTo(0, z); mm.lineTo(200, z); mm.stroke();
    }
    // objective marker (pulsing)
    if (objective) {
      const [ox, oz] = toMap(objective.pos[0], objective.pos[1]);
      const pulse = 5 + Math.sin(performance.now() * 0.006) * 2;
      mm.fillStyle = '#f59e0b';
      mm.beginPath(); mm.arc(ox, oz, pulse, 0, Math.PI * 2); mm.fill();
      mm.strokeStyle = '#fde68a'; mm.lineWidth = 2;
      mm.beginPath(); mm.arc(ox, oz, pulse + 3, 0, Math.PI * 2); mm.stroke();
    }
    // traffic (white) and police (red)
    mm.fillStyle = '#e2e8f0';
    for (const c of cars) { const [x, z] = toMap(c.x, c.z); mm.fillRect(x - 1.5, z - 1.5, 3, 3); }
    mm.fillStyle = '#ef4444';
    for (const c of police) { const [x, z] = toMap(c.x, c.z); mm.fillRect(x - 2, z - 2, 4, 4); }
    // player arrow
    const [px, pz] = toMap(player.x, player.z);
    mm.save();
    mm.translate(px, pz);
    mm.rotate(Math.atan2(Math.sin(playerAngle), Math.cos(playerAngle)) + Math.PI);
    mm.fillStyle = '#22c55e';
    mm.beginPath(); mm.moveTo(0, -7); mm.lineTo(5, 6); mm.lineTo(-5, 6); mm.closePath(); mm.fill();
    mm.restore();
    // north tick
    mm.fillStyle = '#94a3b8'; mm.font = 'bold 10px sans-serif'; mm.textAlign = 'center';
    mm.fillText('N', 100, 11);
  }

  function showMessage(main, sub, seconds) {
    message.innerHTML = main + (sub ? `<span class="sub">${sub}</span>` : '');
    messageTimer = seconds || 3;
  }

  function showToast(text, seconds) {
    toast.textContent = text;
    toast.classList.add('on');
    toastTimer = seconds || 2.5;
  }

  function addKill(text) {
    const div = document.createElement('div');
    div.textContent = text;
    killfeed.prepend(div);
    while (killfeed.children.length > 3) killfeed.removeChild(killfeed.lastChild);
    setTimeout(() => { div.remove(); }, 5000);
  }

  let lastCash = -1;
  function update(dt, s, world) {
    if (messageTimer > 0) {
      messageTimer -= dt;
      if (messageTimer <= 0) message.textContent = '';
    }
    if (toastTimer > 0) {
      toastTimer -= dt;
      if (toastTimer <= 0) toast.classList.remove('on');
    }
    healthFill.style.width = `${Math.max(0, s.health)}%`;
    armorFill.style.width = `${Math.max(0, s.armor)}%`;
    if (s.cash !== lastCash) { cashVal.textContent = s.cash.toLocaleString('en-US'); lastCash = s.cash; }
    stars.forEach((star, i) => star.classList.toggle('lit', i < s.wanted));
    clockTime.textContent = s.clock;
    clockDay.textContent = `DAY ${s.day} · MARISOL BAY`;
    weaponName.textContent = s.weapon;
    ammoVal.textContent = s.ammoText || '';
    if (s.objective) {
      missionName.textContent = s.objective.missionName;
      objectiveText.textContent = s.objective.text;
      objectiveDist.textContent = `${Math.round(s.objective.dist)}m${s.objective.timeLeft ? ` · ${Math.ceil(s.objective.timeLeft)}s` : ''}`;
    } else {
      missionName.textContent = '';
      objectiveText.textContent = s.freeRoamText || 'Free roam — press M1 to start the next job, or explore the Bay.';
      objectiveDist.textContent = '';
    }
    if (s.driving) {
      speedo.classList.add('on');
      speedVal.innerHTML = `${Math.round(s.speed * 2.2)} <small>MPH</small>`;
      carName.textContent = s.carName;
    } else speedo.classList.remove('on');
    crosshair.classList.toggle('on', s.armed && !s.driving);
    vignette.style.opacity = s.health < 35 ? String((35 - s.health) / 35 * 0.85) : '0';
    hint.style.display = s.showHint ? 'block' : 'none';
    drawMinimap(world);
  }

  return {
    show() { hud.classList.add('on'); },
    hide() { hud.classList.remove('on'); },
    update, showMessage, showToast, addKill,
    setFps(text, show) { fpsEl.style.display = show ? 'block' : 'none'; fpsEl.textContent = text; },
  };
}
