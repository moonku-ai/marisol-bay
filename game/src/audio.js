// Procedural WebAudio — every sound is synthesized, no audio files.
// Engine hum, two-tone police siren, gunshots, pickup chime and a simple bass loop.

export function createAudio() {
  let ctx = null;
  let master = null;
  let musicTimer = null;
  let sirenNodes = null;
  let engineNodes = null;
  let muted = false;
  let musicStep = 0;

  function ensure() {
    if (ctx) return true;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = muted ? 0 : 0.5;
      master.connect(ctx.destination);
    } catch { return false; }
    return true;
  }

  function unlock() { if (ensure() && ctx.state === 'suspended') ctx.resume().catch(() => {}); }

  function noiseBuffer(seconds) {
    const buf = ctx.createBuffer(1, ctx.sampleRate * seconds, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;
    return buf;
  }

  function blip(freq, dur, type, vol, slideTo) {
    if (!ensure() || muted) return;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type || 'square';
    osc.frequency.setValueAtTime(freq, t);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(g); g.connect(master);
    osc.start(t); osc.stop(t + dur + 0.02);
  }

  function burst(dur, vol, filterFreq) {
    if (!ensure() || muted) return;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer(dur);
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass'; filter.frequency.value = filterFreq || 1200;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(filter); filter.connect(g); g.connect(master);
    src.start(t); src.stop(t + dur);
  }

  return {
    unlock,
    setMuted(m) { muted = m; if (master) master.gain.value = m ? 0 : 0.5; },
    isMuted() { return muted; },
    shoot() { burst(0.12, 0.5, 2600); blip(190, 0.08, 'square', 0.25, 60); },
    enemyShoot() { burst(0.1, 0.22, 1800); },
    hit() { blip(520, 0.07, 'triangle', 0.3, 320); },
    pickup() { blip(660, 0.09, 'sine', 0.3); setTimeout(() => blip(990, 0.14, 'sine', 0.3), 90); },
    missionDone() { [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => blip(f, 0.22, 'triangle', 0.32), i * 120)); },
    missionFail() { [392, 330, 262].forEach((f, i) => setTimeout(() => blip(f, 0.25, 'sawtooth', 0.2), i * 140)); },
    crash() { burst(0.25, 0.55, 700); },
    busted() { blip(220, 0.5, 'sawtooth', 0.3, 110); },
    siren(on) {
      if (!ensure()) return;
      if (on && !sirenNodes) {
        const osc = ctx.createOscillator(); osc.type = 'triangle'; osc.frequency.value = 700;
        const lfo = ctx.createOscillator(); lfo.type = 'square'; lfo.frequency.value = 0.9;
        const lfoGain = ctx.createGain(); lfoGain.gain.value = 260;
        const g = ctx.createGain(); g.gain.value = 0.05;
        lfo.connect(lfoGain); lfoGain.connect(osc.frequency);
        osc.connect(g); g.connect(master);
        osc.start(); lfo.start();
        sirenNodes = { osc, lfo, g };
      } else if (!on && sirenNodes) {
        try { sirenNodes.osc.stop(); sirenNodes.lfo.stop(); } catch { /* already stopped */ }
        sirenNodes = null;
      }
    },
    engine(on, speed01) {
      if (!ensure()) return;
      if (on && !engineNodes) {
        const osc = ctx.createOscillator(); osc.type = 'sawtooth'; osc.frequency.value = 60;
        const filter = ctx.createBiquadFilter(); filter.type = 'lowpass'; filter.frequency.value = 420;
        const g = ctx.createGain(); g.gain.value = 0.04;
        osc.connect(filter); filter.connect(g); g.connect(master);
        osc.start();
        engineNodes = { osc, filter, g };
      } else if (!on && engineNodes) {
        try { engineNodes.osc.stop(); } catch { /* already stopped */ }
        engineNodes = null;
      }
      if (engineNodes) {
        engineNodes.osc.frequency.value = 55 + speed01 * 130;
        engineNodes.filter.frequency.value = 380 + speed01 * 900;
        engineNodes.g.gain.value = 0.03 + speed01 * 0.05;
      }
    },
    startMusic() {
      if (!ensure() || musicTimer) return;
      // Simple sun-soaked bass loop: A minor walk, one note per 0.22 s.
      const notes = [110, 0, 130.8, 0, 98, 0, 146.8, 0, 110, 0, 130.8, 0, 164.8, 146.8, 130.8, 0];
      musicTimer = setInterval(() => {
        if (muted) return;
        const f = notes[musicStep % notes.length];
        musicStep += 1;
        if (f) blip(f, 0.2, 'triangle', 0.12);
      }, 220);
    },
    stopMusic() { if (musicTimer) { clearInterval(musicTimer); musicTimer = null; } },
  };
}
