// Missions — the five-story arc of Rae Marisol, one mission at a time.
// One job: briefing, objectives, timers, rewards, fail and complete. No rendering.

import { MISSIONS } from './config.js';

export function createMissions(callbacks) {
  const state = {
    index: 0,            // 0-based mission
    step: 0,
    status: 'briefing',  // briefing | active | done | failed | story-done
    timer: 0,
    hold: 0,
    cashEarned: 0,
  };

  function mission() { return MISSIONS[state.index] || null; }
  function stepDef() {
    const m = mission();
    return m ? m.steps[state.step] : null;
  }

  function currentObjective() {
    const m = mission();
    const s = stepDef();
    if (!m || !s || state.status !== 'active') return null;
    return { missionName: m.name, text: s.text, pos: s.pos, radius: s.radius, timeLeft: state.timer };
  }

  function startMission(i) {
    state.index = i;
    state.step = 0;
    state.status = 'active';
    state.hold = 0;
    const m = mission();
    if (!m) { state.status = 'story-done'; callbacks.onStoryDone(); return; }
    state.timer = m.timeLimit || 0;
    callbacks.onBrief(m);
    const s = stepDef();
    if (s && s.wanted) callbacks.onWanted(s.wanted);
    if (m.id === 4) callbacks.onSpawnEnemies(3);
    if (m.id === 3) callbacks.onSpawnEnemies(2);
  }

  function completeStep() {
    const m = mission();
    state.step += 1;
    state.hold = 0;
    if (state.step >= m.steps.length) {
      state.status = 'done';
      state.cashEarned += m.reward;
      callbacks.onMissionComplete(m);
      return;
    }
    const s = stepDef();
    callbacks.onObjective(s);
    if (s && s.wanted) callbacks.onWanted(s.wanted);
    if (m.id === 4 && state.step === 1) callbacks.onSpawnEnemies(2);
  }

  function fail(reason) {
    if (state.status !== 'active') return;
    state.status = 'failed';
    callbacks.onMissionFailed(reason);
  }

  function retry() {
    startMission(state.index);
  }

  function nextMission() {
    if (state.index + 1 >= MISSIONS.length) {
      state.status = 'story-done';
      callbacks.onStoryDone();
      return;
    }
    startMission(state.index + 1);
  }

  // Returns true while the mission is running. Player position is {x, z}.
  function update(dt, playerPos, inCar, carId) {
    if (state.status !== 'active') return;
    const m = mission();
    const s = stepDef();
    if (!m || !s) return;

    if (state.timer > 0) {
      state.timer -= dt;
      if (state.timer <= 0) { fail('Out of time — the package went cold.'); return; }
    }

    const dx = playerPos.x - s.pos[0];
    const dz = playerPos.z - s.pos[1];
    const dist = Math.hypot(dx, dz);

    if (s.type === 'goto') {
      if (s.needCar && !inCar) {
        // wait at the marker on foot: no progress, no fail
      } else if (dist <= s.radius) {
        completeStep();
      }
    } else if (s.type === 'steal') {
      if (inCar && carId === s.carId) {
        callbacks.onSteal();
        completeStep();
      }
    } else if (s.type === 'hold') {
      if (dist <= s.radius) {
        if (state.hold === 0) callbacks.onWanted(2);
        state.hold += dt;
        callbacks.onHold(state.hold / s.holdTime);
        if (state.hold >= s.holdTime) completeStep();
      } else {
        state.hold = Math.max(0, state.hold - dt * 2);
      }
    }
  }

  return {
    state, mission, stepDef, currentObjective, startMission, completeStep,
    fail, retry, nextMission, update,
  };
}
