// Art: Unity "2D Bubble Animations" sheets + procedurally drawn dragons, tiles and backgrounds.
const ART = (() => {
  const A = { img: {}, meta: null, ready: false };
  // WebP keeps the download small (~0.8 MB for everything). bubC is never drawn; popC is identical to popB, so it just aliases it.
  const names = ['bubA', 'bubB', 'bubD', 'popA', 'popB'];

  A.load = async () => {
    A.meta = await (await fetch('assets/sheets.json')).json();
    await Promise.all(names.map(n => new Promise((res, rej) => {
      const im = new Image(); im.onload = () => { A.img[n] = im; res(); }; im.onerror = () => rej(new Error('missing ' + n));
      im.src = 'assets/' + n + '.webp';
    })));
    A.img.popC = A.img.popB;
    // player monsters: animated frame atlases (tools/pack_monsters.py), frames pre-shrunk to ~110px tall
    try { A.mon = await (await fetch('assets/mon2.json')).json(); } catch (e) { A.mon = null; }
    if (A.mon) await Promise.all(['green', 'blue'].map(n => new Promise(res => {
      const im = new Image(); im.onload = () => { A.img['mon2_' + n] = im; res(); }; im.onerror = res; im.src = 'assets/mon2_' + n + '.webp';
    })));
    // per-frame body centroid (lower 60% of each cell, so an outstretched arm/horn doesn't drag it) so every frame
    // can be drawn with its body on the same vertical axis - stops the sprite sliding sideways between frames
    try {
      for (const n of ['green', 'blue']) {
        const M = A.mon && A.mon[n], im = A.img['mon2_' + n]; if (!M || !im) continue;
        const c = document.createElement('canvas'); c.width = im.width; c.height = im.height;
        const x = c.getContext('2d', { willReadFrequently: true }); x.drawImage(im, 0, 0);
        M.cx = {};
        for (const k in M.f) M.cx[k] = M.f[k].map(([fx, fy, fw, fh]) => {
          const y0 = Math.floor(fh * 0.4), d = x.getImageData(fx, fy + y0, fw, fh - y0).data; let sx = 0, sn = 0;
          for (let j = 0; j < d.length; j += 4) if (d[j + 3] > 100) { sx += ((j >> 2) % fw); sn++; }
          return sn ? sx / sn : fw / 2;
        });
      }
    } catch (e) { /* tainted canvas (file://): fall back to cell-centre alignment */ }
    A.ready = true;
  };

  // ---------- player pose state machine (render side only; advances on sim ticks, so refresh rate doesn't matter) ----------
  const PS = new Map();
  const pose = (key, p, simT) => {
    let s = PS.get(key);
    if (!s) PS.set(key, s = { lt: simT, ph: 0, mv: false, sh: 0, shMax: 14, mouth: 0, wasG: true, lan: 0, tk: 0, face: p.face || 1, air: false });
    const dt = Math.max(0, Math.min(6, simT - s.lt)); s.lt = simT;
    const spd = Math.abs(p.vx || 0);
    if (dt) {
      s.mv = s.mv ? spd > 0.35 : spd > 0.9;                       // hysteresis: no walk/idle flicker while accelerating
      if (s.mv) s.ph += spd * 0.09 * dt; else s.ph = 0;            // stride follows ground speed
      if (p.mouth > s.mouth) { s.sh = s.shMax; }                   // new shot: play the whole attack beat
      s.mouth = p.mouth; s.sh = Math.max(0, s.sh - dt);
      if (p.ground && !s.wasG) s.lan = 8; if (!p.ground && s.wasG && p.vy < 0) s.tk = 6;
      s.wasG = p.ground; s.lan = Math.max(0, s.lan - dt); s.tk = Math.max(0, s.tk - dt);
    }
    // facing: always the way you are actually moving; standing still (or firing) uses the aimed direction
    if (s.sh > 0 || spd <= 0.4) s.face = p.face || s.face; else s.face = p.vx > 0 ? 1 : -1;
    return s;
  };
  A.poseReset = () => PS.clear();
  // atlas frames that face LEFT as drawn (everything else faces right); blue is all right-facing
  const NATIVE_LEFT = { green: { idle: [0, 1, 2, 4], walk: [0, 7] } };

  // draw frame f of a sheet centred at (cx,cy), size px square
  A.sheet = (g, name, f, cx, cy, size, alpha = 1) => {
    const m = A.meta[name], im = A.img[name]; if (!im) return;
    f = ((f % m.n) + m.n) % m.n;
    const sx = (f % m.cols) * m.cell, sy = Math.floor(f / m.cols) * m.cell;
    if (alpha !== 1) g.globalAlpha = alpha;
    g.drawImage(im, sx, sy, m.cell, m.cell, cx - size / 2, cy - size / 2, size, size);
    if (alpha !== 1) g.globalAlpha = 1;
  };
  A.frames = n => A.meta[n].n;

  // ---------- themes ----------
  const THEMES = [
    { bg0: '#0b1b3d', bg1: '#1d3f86', blk: '#3b6fd6', blkHi: '#8fb7ff', blkLo: '#1c3a80', plat: '#6fe0ff', platLo: '#2a8fb0' },
    { bg0: '#2a0f3d', bg1: '#6a2a9a', blk: '#a455d6', blkHi: '#e0a8ff', blkLo: '#55227a', plat: '#ff8fd8', platLo: '#a03a88' },
    { bg0: '#0f2d22', bg1: '#1f7a55', blk: '#3dbb7a', blkHi: '#a6ffd0', blkLo: '#17613e', plat: '#d8ff7a', platLo: '#7a9a22' },
    { bg0: '#3d1a0b', bg1: '#8a4a1d', blk: '#d68a3b', blkHi: '#ffd8a0', blkLo: '#7a4412', plat: '#ffe26a', platLo: '#a8861c' },
  ];
  A.theme = i => THEMES[i % THEMES.length];

  const rr = (g, x, y, w, h, r) => { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); };
  A.rr = rr;

  // pre-rendered static layer for a level (tiles) - cached per level object
  A.levelLayer = L => {
    if (L._layer) return L._layer;
    const c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d');
    const T = A.theme(L.theme);
    for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
      const ch = L.map[y][x], px = x * TS, py = y * TS;
      if (ch === '#') {
        const gr = g.createLinearGradient(0, py, 0, py + TS); gr.addColorStop(0, T.blk); gr.addColorStop(1, T.blkLo);
        g.fillStyle = gr; rr(g, px + 1, py + 1, TS - 2, TS - 2, 6); g.fill();
        g.fillStyle = T.blkHi; g.globalAlpha = 0.55; rr(g, px + 4, py + 4, TS - 14, 5, 2.5); g.fill(); g.globalAlpha = 1;
        g.strokeStyle = 'rgba(0,0,0,.35)'; g.lineWidth = 1; rr(g, px + 1.5, py + 1.5, TS - 3, TS - 3, 6); g.stroke();
      } else if (ch === '=') {
        const gr = g.createLinearGradient(0, py, 0, py + 16); gr.addColorStop(0, T.plat); gr.addColorStop(1, T.platLo);
        g.fillStyle = gr; rr(g, px, py, TS, 16, 7); g.fill();
        g.fillStyle = 'rgba(255,255,255,.55)'; rr(g, px + 4, py + 2, TS - 8, 4, 2); g.fill();
        g.strokeStyle = 'rgba(0,0,0,.3)'; rr(g, px + .5, py + .5, TS - 1, 15, 7); g.stroke();
      }
    }
    return (L._layer = c);
  };

  // soft animated background with drifting motes
  A.background = (g, L, t) => {
    const T = A.theme(L.theme);
    const gr = g.createLinearGradient(0, 0, 0, H); gr.addColorStop(0, T.bg0); gr.addColorStop(1, T.bg1);
    g.fillStyle = gr; g.fillRect(0, 0, W, H);
    g.globalAlpha = 0.18;
    for (let i = 0; i < 26; i++) {
      const sp = 0.25 + (i % 5) * 0.12, r = 6 + (i * 7) % 22;
      const x = (i * 197) % W + Math.sin(t / 700 + i) * 14, y = H + 40 - ((t * sp / 16 + i * 131) % (H + 80));
      g.strokeStyle = '#bfe6ff'; g.lineWidth = 2; g.beginPath(); g.arc(x, y, r, 0, 7); g.stroke();
      g.fillStyle = '#fff'; g.beginPath(); g.arc(x - r * .35, y - r * .35, r * .18, 0, 7); g.fill();
    }
    g.globalAlpha = 1;
  };

  // ---------- dragon (procedural placeholder; swap for sprites later) ----------
  const COL = {
    green: { body: '#3ccf5a', dark: '#1f8c3a', belly: '#ffe9a8', spike: '#ff9a2a' },
    blue: { body: '#3a8cff', dark: '#1f56b8', belly: '#ffe9a8', spike: '#ffd23a' },
  };
  // (x,y) = bottom centre of the dragon. face = 1 right, -1 left. s = scale
  A.dragon = (g, x, y, face, color, o = {}) => {
    const c = COL[color] || COL.green, t = o.t || 0, s = o.scale || 1; let st = o.state || 'idle';
    const walk = st === 'walk' ? Math.sin(t * 0.55) : 0;
    const bob = st === 'walk' ? Math.abs(walk) * -2 : st === 'idle' ? Math.sin(t * 0.08) * 0.8 : 0;
    const atlas = A.img['mon2_' + color], M = A.mon && A.mon[color];
    if (atlas && M) {                                // animated sprite monster (pasilan set)
      const F = M.f, pick = (k, i) => F[k][((i % F[k].length) + F[k].length) % F[k].length];
      let fr, fk, fi = 0, rot = 0, sx = 1, sy = 1, ps = null;
      if (o.p) { ps = pose(o.key == null ? (color + (o.p.id || 0)) : o.key, o.p, o.simT); face = ps.face; if (st !== 'dead') st = !o.p.ground ? 'jump' : ps.mv ? 'walk' : 'idle'; }
      if (st === 'dead') { fk = F.hurt ? 'hurt' : 'jump'; fi = F.hurt ? (t < 18 ? 2 : 3) : 3; /* no spin on death */ }
      else if (ps && ps.sh > 0) {                                  // attack beat, held ~14 ticks and layered over movement
        fk = 'atk'; const pr = 1 - ps.sh / ps.shMax, seq = color === 'green' ? [1, 2, 2, 3] : [1, 2, 3, 3];
        fi = seq[Math.min(seq.length - 1, Math.floor(pr * seq.length))];
      }
      else if (st === 'jump') { const vy = o.vy || 0; fk = 'jump'; fi = vy < -2.2 ? 1 : vy > 1.5 ? 3 : 2; }
      else if (st === 'walk') { fk = 'walk'; fi = ps ? Math.floor(ps.ph) : Math.floor(t * 0.2); }
      else { fk = 'idle'; fi = 0; sy = 1 + Math.sin(t / 28) * 0.016; sx = 1 - Math.sin(t / 28) * 0.008; }   // one stable frame + breathing
      if (ps && st !== 'dead') {
        if (ps.lan > 0) { sy *= 1 - 0.13 * ps.lan / 8; sx *= 1 + 0.09 * ps.lan / 8; }        // landing squash
        else if (ps.tk > 0) { sy *= 1 + 0.10 * ps.tk / 6; sx *= 1 - 0.06 * ps.tk / 6; }     // take-off stretch
      }
      const L = F[fk]; fi = ((fi % L.length) + L.length) % L.length; fr = L[fi];
      const k = 50 * s / 1.3 / M.ref, w = fr[2] * k, h = fr[3] * k;
      const cxs = M.cx && M.cx[fk] ? M.cx[fk][fi] : fr[2] / 2;     // body axis of this frame
      // some green frames are drawn facing left in the atlas (found by locating the yellow back-shell rim); mirror those
      const fl = (NATIVE_LEFT[color] || {})[fk] && NATIVE_LEFT[color][fk].includes(fi), fs = fl ? -1 : 1;
      g.save(); g.translate(x, y); g.scale(face * fs * sx, sy);
      if (rot) { g.rotate(rot); g.translate(0, -h / 2); }
      g.imageSmoothingQuality = 'high'; g.drawImage(atlas, fr[0], fr[1], fr[2], fr[3], (fl ? -(fr[2] - cxs) : -cxs) * k, -h + 2, w, h); g.restore(); return;
    }
    g.save(); g.translate(x, y + bob); g.scale(face * s, s);
    if (st === 'dead') { g.scale(1, 0.8 + 0.2 * Math.max(0, 1 - t / 20)); }
    // tail
    g.fillStyle = c.body; g.beginPath(); g.moveTo(-9, -12); g.quadraticCurveTo(-22, -10 + Math.sin(t * 0.2) * 3, -20, -22); g.quadraticCurveTo(-13, -17, -7, -20); g.fill();
    // legs
    g.fillStyle = c.dark;
    const lf = st === 'jump' ? -3 : walk * 3;
    rr(g, -9 + lf, -6, 8, 6, 3); g.fill(); rr(g, 2 - lf, -6, 8, 6, 3); g.fill();
    // body
    g.fillStyle = c.body; g.beginPath(); g.ellipse(0, -15, 14, 13, 0, 0, 7); g.fill();
    g.fillStyle = c.belly; g.beginPath(); g.ellipse(3, -12, 8, 8, 0, 0, 7); g.fill();
    // back spikes
    g.fillStyle = c.spike;
    for (let i = 0; i < 3; i++) { g.beginPath(); g.moveTo(-12 + i * 2, -22 + i * 5); g.lineTo(-18 + i * 2, -26 + i * 5 - 2); g.lineTo(-11 + i * 3, -17 + i * 5); g.fill(); }
    // head bump / snout
    g.fillStyle = c.body; g.beginPath(); g.ellipse(9, -19, 9, 8, 0, 0, 7); g.fill();
    g.fillStyle = c.dark; g.beginPath(); g.ellipse(15, -17, 4.5, 3.6, 0, 0, 7); g.fill();
    if (st === 'shoot') { g.fillStyle = '#7a1020'; g.beginPath(); g.ellipse(17, -17, 3.5, 3.2, 0, 0, 7); g.fill(); }
    // eye
    g.fillStyle = '#fff'; g.beginPath(); g.ellipse(8, -23, 4.6, 5, 0, 0, 7); g.fill();
    g.fillStyle = '#10142a'; g.beginPath(); g.arc(9.4, -22.5, 2.4, 0, 7); g.fill();
    g.fillStyle = '#fff'; g.beginPath(); g.arc(10.2, -23.6, .9, 0, 7); g.fill();
    // brow / horn
    g.fillStyle = c.spike; g.beginPath(); g.moveTo(3, -27); g.lineTo(6, -33); g.lineTo(9, -27); g.fill();
    g.restore();
  };

  // ---------- enemies (procedural placeholders): (x,y) = bottom centre ----------
  A.enemy = (g, x, y, type, o = {}) => {
    const t = o.t || 0, angry = !!o.angry, face = o.dir || 1;
    g.save(); g.translate(x, y);
    if (type === 'ghost') {
      g.globalAlpha = 0.85; g.translate(0, -15 + Math.sin(t / 8) * 3);
      g.fillStyle = '#dcd6ff'; g.beginPath(); g.arc(0, -2, 15, Math.PI, 0); g.lineTo(15, 14);
      for (let i = 0; i < 5; i++) g.lineTo(15 - (i + 0.5) * 6, 14 - (i % 2 ? 0 : 6)); g.lineTo(-15, 14); g.closePath(); g.fill();
      g.fillStyle = '#c02040'; g.beginPath(); g.ellipse(-5, -4, 3.5, 5, 0, 0, 7); g.ellipse(5, -4, 3.5, 5, 0, 0, 7); g.fill();
      g.restore(); return;
    }
    const boss = type === 'boss';
    const col = boss ? (angry ? ['#ff4a8a', '#8a1040'] : ['#d86ae0', '#7a2a90']) : angry ? ['#ff5a3a', '#a02010'] : type === 'hop' ? ['#ffb23a', '#b86a10'] : type === 'fly' ? ['#b070ff', '#6030b0'] : ['#ff7ab8', '#b03a78'];
    const sq = type === 'hop' ? 1 + Math.sin(t / 5) * 0.08 : boss ? 1 + Math.sin(t / 9) * 0.03 : 1;
    g.scale(face * sq, 1 / sq);
    if (boss) {                                    // big horned brute
      g.scale(2.25, 2.25);
      g.fillStyle = '#e8e0c0'; g.beginPath(); g.moveTo(-11, -20); g.quadraticCurveTo(-20, -26, -17, -34); g.quadraticCurveTo(-12, -27, -6, -22); g.fill();
      g.beginPath(); g.moveTo(11, -20); g.quadraticCurveTo(20, -26, 17, -34); g.quadraticCurveTo(12, -27, 6, -22); g.fill();
    }
    if (type === 'fly') {
      g.translate(0, -14 + Math.sin(t / 7) * 2);
      g.fillStyle = 'rgba(255,255,255,.75)';
      const fl = Math.sin(t * 0.9) * 8;
      g.beginPath(); g.ellipse(-4, -12, 6, 10 + fl * 0.3, -0.5, 0, 7); g.ellipse(4, -12, 6, 10 - fl * 0.3, 0.5, 0, 7); g.fill();
      g.translate(0, 0);
    } else g.translate(0, -2);
    const gr = g.createRadialGradient(-3, -16, 2, 0, -10, 16); gr.addColorStop(0, '#fff'); gr.addColorStop(0.2, col[0]); gr.addColorStop(1, col[1]);
    g.fillStyle = gr; g.beginPath(); g.ellipse(0, type === 'fly' ? 0 : -11, 13, 12, 0, 0, 7); g.fill();
    if (type !== 'fly') { g.fillStyle = col[1]; const f = Math.sin(t * 0.5) * 3; g.fillRect(-9 + f, -3, 6, 4); g.fillRect(3 - f, -3, 6, 4); }
    const ey = type === 'fly' ? -3 : -13;
    g.fillStyle = '#fff'; g.beginPath(); g.ellipse(-4.5, ey, 3.6, 4.4, 0, 0, 7); g.ellipse(4.5, ey, 3.6, 4.4, 0, 0, 7); g.fill();
    g.fillStyle = '#10142a'; g.beginPath(); g.arc(-3.5, ey + .5, 1.9, 0, 7); g.arc(5.5, ey + .5, 1.9, 0, 7); g.fill();
    if (angry || boss) { g.strokeStyle = '#300'; g.lineWidth = 2; g.beginPath(); g.moveTo(-9, ey - 6); g.lineTo(-1, ey - 3); g.moveTo(9, ey - 6); g.lineTo(1, ey - 3); g.stroke(); }
    if (boss) { g.fillStyle = '#fff'; for (const k of [-5, -1.7, 1.7, 5]) { g.beginPath(); g.moveTo(k - 1.5, -3); g.lineTo(k + 1.5, -3); g.lineTo(k, 1); g.fill(); } }
    if (o.hit > 0) { g.globalCompositeOperation = 'lighter'; g.fillStyle = 'rgba(255,255,255,' + (0.15 + o.hit * 0.03) + ')'; g.beginPath(); g.ellipse(0, -11, 13, 12, 0, 0, 7); g.fill(); g.globalCompositeOperation = 'source-over'; }
    g.restore();
  };

  // ---------- power-up orb ----------
  A.power = (g, x, y, idx, t) => {
    const P = POWERS[idx], pulse = 1 + Math.sin(t / 8) * 0.08;
    g.save(); g.translate(x, y); g.scale(pulse, pulse);
    g.globalCompositeOperation = 'lighter'; const gl = g.createRadialGradient(0, 0, 3, 0, 0, 20); gl.addColorStop(0, P.col); gl.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gl; g.beginPath(); g.arc(0, 0, 20, 0, 7); g.fill(); g.globalCompositeOperation = 'source-over';
    const gr = g.createRadialGradient(-4, -5, 1, 0, 0, 12); gr.addColorStop(0, '#fff'); gr.addColorStop(0.35, P.col); gr.addColorStop(1, 'rgba(0,0,30,.7)');
    g.fillStyle = gr; g.beginPath(); g.arc(0, 0, 11, 0, 7); g.fill();
    g.fillStyle = '#10143a'; g.font = 'bold 13px Arial'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(P.ch, 0, 1); g.textBaseline = 'alphabetic';
    g.restore();
  };

  // ---------- fruit (procedural) ----------
  A.fruit = (g, x, y, kind, col, bouncy, t, sq = 0) => {
    g.save(); g.translate(x, y); g.scale(1 + sq * 0.15, 1 - sq * 0.15);
    const r = bouncy ? 12 : 9;
    const gr = g.createRadialGradient(-r * .35, -r * .4, 1, 0, 0, r * 1.1); gr.addColorStop(0, '#fff'); gr.addColorStop(0.25, col); gr.addColorStop(1, 'rgba(0,0,0,.55)');
    g.fillStyle = col; g.beginPath(); g.arc(0, 0, r, 0, 7); g.fill();
    g.fillStyle = gr; g.beginPath(); g.arc(0, 0, r, 0, 7); g.fill();
    if (kind === 5) { g.strokeStyle = 'rgba(20,80,20,.6)'; g.lineWidth = 2; for (const a of [-5, 0, 5]) { g.beginPath(); g.moveTo(a, -r + 1); g.quadraticCurveTo(a * 1.8, 0, a, r - 1); g.stroke(); } }
    g.fillStyle = '#2a9a2a'; g.beginPath(); g.ellipse(2, -r - 1, 5, 2.4, -0.5, 0, 7); g.fill();
    g.restore();
  };

  return A;
})();
