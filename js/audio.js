// Procedural audio: WebAudio synth sfx + a looping chiptune track. No asset files.
const SND = (() => {
  const S = { on: true, music: true, ctx: null, master: null, mus: null };
  S.init = () => {
    if (S.ctx) { if (S.ctx.state === 'suspended') S.ctx.resume(); return; }
    const C = window.AudioContext || window.webkitAudioContext; if (!C) return;
    S.ctx = new C(); S.master = S.ctx.createGain(); S.master.gain.value = 0.5; S.master.connect(S.ctx.destination);
    S.sfxBus = S.ctx.createGain(); S.sfxBus.gain.value = 0.9; S.sfxBus.connect(S.master);
    S.musBus = S.ctx.createGain(); S.musBus.gain.value = 0.28; S.musBus.connect(S.master);
    const len = S.ctx.sampleRate * 0.5, buf = S.ctx.createBuffer(1, len, S.ctx.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    S.noise = buf;
  };
  // tone: freq slide f0->f1 over dur, waveform type, volume
  function tone(f0, f1, dur, type = 'square', vol = 0.25, delay = 0, bus) {
    if (!S.ctx || !S.on) return;
    const t = S.ctx.currentTime + delay, o = S.ctx.createOscillator(), g = S.ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.008); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(bus || S.sfxBus); o.start(t); o.stop(t + dur + 0.02);
  }
  function noise(dur, vol = 0.3, fc = 3000, delay = 0) {
    if (!S.ctx || !S.on) return;
    const t = S.ctx.currentTime + delay, s = S.ctx.createBufferSource(), f = S.ctx.createBiquadFilter(), g = S.ctx.createGain();
    s.buffer = S.noise; f.type = 'bandpass'; f.frequency.value = fc; f.Q.value = 0.8;
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(S.sfxBus); s.start(t); s.stop(t + dur + 0.02);
  }
  const fx = {
    jump: () => tone(300, 620, 0.12, 'square', 0.12),
    shoot: () => { tone(520, 900, 0.1, 'sine', 0.22); tone(780, 1200, 0.08, 'sine', 0.1, 0.03); },
    trap: () => { tone(400, 1100, 0.18, 'sine', 0.25); tone(600, 1500, 0.15, 'triangle', 0.12, 0.05); },
    pop: () => { noise(0.07, 0.28, 4500); tone(900, 300, 0.08, 'sine', 0.15); },
    kill: () => { [523, 659, 784, 1047].forEach((f, i) => tone(f, f, 0.1, 'square', 0.14, i * 0.05)); noise(0.1, 0.25, 3500); },
    fruit: () => { tone(988, 988, 0.06, 'square', 0.14); tone(1319, 1319, 0.12, 'square', 0.14, 0.06); },
    spring: () => tone(180, 520, 0.22, 'sine', 0.3),
    portal: () => { noise(0.25, 0.16, 1400); tone(300, 1200, 0.25, 'sine', 0.14); },
    hurt: () => { tone(500, 90, 0.5, 'sawtooth', 0.22); noise(0.2, 0.2, 800); },
    shield: () => { tone(300, 600, 0.2, 'triangle', 0.2); tone(450, 900, 0.2, 'sine', 0.1, 0.03); },
    shieldPop: () => { noise(0.2, 0.25, 2500); tone(700, 150, 0.2, 'triangle', 0.2); },
    bonk: () => tone(220, 110, 0.08, 'square', 0.12),
    spawn: () => tone(700, 1000, 0.08, 'sine', 0.06),
    break: () => { tone(300, 160, 0.2, 'sawtooth', 0.16); },
    respawn: () => { tone(400, 800, 0.2, 'sine', 0.2); tone(600, 1200, 0.2, 'sine', 0.12, 0.08); },
    hurry: () => { for (let i = 0; i < 4; i++) tone(880, 660, 0.12, 'square', 0.16, i * 0.16); },
    clear: () => { [523, 659, 784, 659, 784, 1047].forEach((f, i) => tone(f, f, 0.16, 'square', 0.16, i * 0.11)); },
    bosshit: () => { noise(0.08, 0.3, 900); tone(160, 70, 0.18, 'sawtooth', 0.25); },
    bossdie: () => { noise(0.6, 0.35, 700); [392, 330, 262, 523, 659, 784, 1047].forEach((f, i) => tone(f, f, 0.14, 'square', 0.16, i * 0.09)); },
    boss: () => { tone(110, 70, 0.7, 'sawtooth', 0.28); tone(165, 90, 0.7, 'square', 0.12, 0.05); },
    summon: () => { tone(200, 500, 0.3, 'triangle', 0.18); },
    power: () => { [523, 784, 1047, 1319].forEach((f, i) => tone(f, f, 0.09, 'triangle', 0.2, i * 0.06)); },
    drop: () => tone(500, 250, 0.08, 'sine', 0.1),
    over: () => { [392, 330, 262, 196].forEach((f, i) => tone(f, f * 0.98, 0.3, 'triangle', 0.22, i * 0.25)); },
  };
  S.play = k => { const f = fx[k]; if (f) f(); };

  // ---- music: 16-step loop, bass + lead + a little hat, bouncy and bright ----
  const BASS = [0, 0, 7, 0, 5, 5, 3, 5, 0, 0, 7, 0, 10, 8, 7, 5];
  const LEAD = [12, -1, 16, -1, 19, 16, 12, -1, 14, -1, 17, -1, 21, 19, 17, 14];
  const hz = (n, root = 110) => root * Math.pow(2, n / 12);
  let step = 0, nextT = 0, timer = 0;
  S.startMusic = (tempo = 132) => {
    if (!S.ctx || S.mus) return; S.mus = true; step = 0; nextT = S.ctx.currentTime + 0.1;
    const spb = 60 / tempo / 2;
    timer = setInterval(() => {
      if (!S.ctx || !S.on || !S.music) { nextT = S.ctx ? S.ctx.currentTime + 0.1 : 0; return; }
      while (nextT < S.ctx.currentTime + 0.25) {
        const bar = Math.floor(step / 16) % 4, sh = bar === 2 ? 5 : bar === 3 ? 3 : 0, i = step % 16, t = nextT - S.ctx.currentTime;
        if (BASS[i] >= 0) tone(hz(BASS[i] + sh, 55), hz(BASS[i] + sh, 55), spb * 0.9, 'triangle', 0.5, t, S.musBus);
        if (LEAD[i] >= 0) tone(hz(LEAD[i] + sh, 110), hz(LEAD[i] + sh, 110), spb * 0.8, 'square', 0.2, t, S.musBus);
        if (i % 2 === 0) { const s = S.ctx.createBufferSource(), g = S.ctx.createGain(), f = S.ctx.createBiquadFilter(); s.buffer = S.noise; f.type = 'highpass'; f.frequency.value = 7000;
          g.gain.setValueAtTime(0.12, nextT); g.gain.exponentialRampToValueAtTime(0.0001, nextT + 0.04); s.connect(f); f.connect(g); g.connect(S.musBus); s.start(nextT); s.stop(nextT + 0.05); }
        nextT += spb; step++;
      }
    }, 60);
  };
  return S;
})();
