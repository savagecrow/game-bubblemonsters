// App shell: screens, input, fixed-step loop, online glue, rendering + local effects.
const APP = (() => {
  const $ = id => document.getElementById(id);
  const cv = $('cv'), g = cv.getContext('2d'), stage = $('stage');
  const Q = new URLSearchParams(location.search);
  function fit() { const s = Math.min(innerWidth / 960, innerHeight / 640); stage.style.transform = `translate(-50%,-50%) scale(${s})`; }
  addEventListener('resize', fit); fit();

  // ---------------------------------------------------------------- input
  const keys = {};
  addEventListener('keydown', e => {
    keys[e.code] = true; if (/Arrow|Space/.test(e.code) && mode) e.preventDefault();
    if (e.code === 'Escape' && mode) app.quit();
    if (e.code === 'KeyM' && mode) { SND.music = !SND.music; }
    if ((e.code === 'KeyP' || e.code === 'Pause') && (mode === 'solo' || mode === 'local2')) app.paused = !app.paused;
  });
  addEventListener('keyup', e => { keys[e.code] = false; });
  addEventListener('blur', () => { for (const k in keys) keys[k] = false; });
  function mask(l, r, j, s, sh) { let m = 0; if (l) m |= IN.L; if (r) m |= IN.R; if (j) m |= IN.JUMP; if (s) m |= IN.SHOOT; if (sh) m |= IN.SHIELD; return m; }
  function readInputs() {
    if (mode === 'local2') return [
      mask(keys.KeyA, keys.KeyD, keys.KeyW || keys.Space, keys.KeyF, keys.KeyG),
      mask(keys.ArrowLeft, keys.ArrowRight, keys.ArrowUp, keys.Period, keys.Slash)];
    return [mask(keys.ArrowLeft || keys.KeyA, keys.ArrowRight || keys.KeyD, keys.ArrowUp || keys.KeyW || keys.Space,
      keys.KeyJ || keys.KeyZ || keys.KeyF, keys.KeyK || keys.KeyX || keys.ArrowDown || keys.KeyS), 0];
  }

  // ---------------------------------------------------------------- state
  let sim = null, mode = null;                   // mode: null | 'solo' | 'local2' | 'host' | 'guest'
  let acc = 0, last = performance.now(), overShown = false;
  let snapCur = null, evQueue = [], sendTick = 0;
  // ---- online state. sess tags every fast packet so stragglers from a previous round are ignored.
  const STEP = 1000 / 60;
  let sess = 0;
  // host side: guest inputs arrive numbered; the host consumes them in order (one per step) and acks the last one used
  let inQ = [], inRecv = 0, ackSeq = 0, gLast = 0, lastInAt = 0, lastPt = 0, evLog = [], evId = 0, snapSeq = 0;
  // guest side: jitter buffer of snapshots + clock estimate, own-dragon prediction history
  let snaps = [], lastQ = -1, lastEvId = 0, clkBase = Infinity, jit = 0, delayCur = 100, rtt = 0, lastSnapAt = 0, pendingRecon = null, pseq = 0, lastPktAt = 0;
  const INHIST = new Array(256).fill(0), MH = new Array(256).fill(null);
  let ox = 0, oy = 0;                       // visual error offset that eases out after a correction
  function resetNet() {
    snapCur = null; snaps = []; evQueue = []; sendTick = 0;
    inQ = []; inRecv = 0; ackSeq = 0; gLast = 0; lastInAt = performance.now(); lastPt = 0; evLog = []; evId = 0; snapSeq = 0;
    lastQ = -1; lastEvId = 0; clkBase = Infinity; jit = 0; delayCur = 100; rtt = 0; lastSnapAt = performance.now(); pendingRecon = null; pseq = 0; lastPktAt = 0;
    INHIST.fill(0); MH.fill(null); ox = oy = 0;
  }
  const fx = [], texts = [];
  const app = { get sim() { return sim; }, get mode() { return mode; }, keys, fx };
  window.__bb = app;
  const hiKey = 'bubdrag.hi';
  const getHi = () => +(localStorage.getItem(hiKey) || 0);
  const showHi = () => { $('hi').textContent = getHi() ? 'Best score: ' + getHi() : ''; };

  function show(id) { for (const el of document.querySelectorAll('.screen')) el.classList.toggle('on', el.id === id); }
  app.paused = false;
  app.menu = () => { mode = null; sim = null; overShown = false; app.paused = false; show('title'); showHi(); setTouch(false); };
  app.dialog = (title, lines, buttons) => {
    $('dtitle').textContent = title; $('dbody').innerHTML = lines.map(l => `<p>${l}</p>`).join('');
    const b = $('dbtns'); b.innerHTML = '';
    for (const x of buttons) { const e = document.createElement('button'); e.textContent = x.label; e.onclick = () => { $('dialog').classList.remove('on'); x.fn(); }; b.appendChild(e); }
    $('dialog').classList.add('on');
  };

  app.start = (m, li = 0) => {
    SND.init(); SND.startMusic();
    mode = m; overShown = false; fx.length = 0; texts.length = 0; resetNet(); me = null;
    sim = new Sim(li, (Math.random() * 2 ** 31) | 0, m === 'solo' ? 1 : 2);
    if (m === 'guest') { sim.state = 'wait'; }
    for (const el of document.querySelectorAll('.screen')) el.classList.remove('on');
    setTouch(isTouch());
  };
  app.quit = () => {
    if (mode === 'host' || mode === 'guest') { NET.send({ t: 'bye' }); setTimeout(() => NET.close(), 200); }
    app.menu();
  };

  // ---------------------------------------------------------------- touch controls (shown on touch devices)
  const touchEl = document.createElement('div');
  touchEl.style.cssText = 'position:absolute;inset:0;pointer-events:none;display:none;z-index:5';
  const TB = [['◀', 'KeyA', 20, 470, 84], ['▶', 'KeyD', 120, 470, 84], ['SHIELD', 'KeyK', 690, 548, 76], ['JUMP', 'KeyW', 780, 470, 84], ['BLOW', 'KeyJ', 862, 540, 84]];
  for (const [label, code, x, y, s] of TB) {
    const b = document.createElement('div');
    b.textContent = label;
    b.style.cssText = `position:absolute;left:${x}px;top:${y}px;width:${s}px;height:${s}px;border-radius:50%;background:rgba(120,180,255,.28);border:2px solid rgba(200,230,255,.6);color:#fff;font:bold ${label.length > 2 ? 15 : 30}px Arial;display:flex;align-items:center;justify-content:center;pointer-events:auto;touch-action:none`;
    const on = e => { keys[code] = true; e.preventDefault(); }, off = e => { keys[code] = false; e.preventDefault(); };
    b.addEventListener('pointerdown', on); b.addEventListener('pointerup', off); b.addEventListener('pointercancel', off); b.addEventListener('pointerleave', off);
    touchEl.appendChild(b);
  }
  stage.appendChild(touchEl);
  function setTouch(on) { touchEl.style.display = on ? 'block' : 'none'; }
  const isTouch = () => !!Q.get('touch') || (window.matchMedia && matchMedia('(pointer:coarse)').matches);

  // ---------------------------------------------------------------- menus
  document.querySelectorAll('[data-m]').forEach(b => b.onclick = () => {
    SND.init(); const m = b.dataset.m;
    if (m === 'solo' || m === 'local2') app.start(m, +(Q.get('lv') || 0));
    else if (m === 'title') { NET.close(); app.menu(); }
    else show(m);
  });
  const setOn = t => { $('onstatus').textContent = t || ''; };
  $('onhost').onclick = () => { $('oncode').textContent = ''; setOn('Contacting matchmaking server...'); NET.hostRoom(); };
  $('onjoin').onclick = () => { setOn(''); NET.joinRoom($('onin').value); };
  $('onin').addEventListener('keydown', e => { if (e.key === 'Enter') $('onjoin').click(); e.stopPropagation(); });

  // ---------------------------------------------------------------- online
  NET.onMsg = m => {
    if (m.t === 'start') { app.start('guest', m.li); sess = m.g; return; }
    if (m.t === 'bye') { peerLeft(); return; }
    if (mode === 'host') {
      if (m.t === 'in') {
        if (m.g !== sess) return;
        lastInAt = performance.now(); lastPt = m.pt;
        const h = m.h; for (let i = h.length - 1; i >= 0; i--) { const s = m.q - i; if (s > inRecv) { inQ.push({ q: s, m: h[i] | 0 }); inRecv = s; } }   // redundancy: lost packets are recovered from the next one
      } else if (m.t === 'again') hostStart();
    } else if (mode === 'guest' && m.t === 's') {
      if (m.g !== sess || m.q <= lastQ) return;                               // stale / duplicate / out of order: the newest is all we want
      lastQ = m.q;
      const at = performance.now(), off = at - m.ts;
      if (at - lastSnapAt > 1500) { clkBase = Infinity; jit = 0; delayCur = 150; snaps = []; }   // back after an outage: re-learn the clock and jitter from scratch
      if (off < clkBase) clkBase = off; else clkBase += 0.05;                 // best-case delivery time; creeps up so a permanent route change is followed
      const ex = off - clkBase; jit = ex > jit ? ex : jit * 0.97 + ex * 0.03; // peak-hold jitter estimate
      if (m.pe) { const r = at - m.pe; rtt = rtt ? rtt * 0.85 + r * 0.15 : r; }
      const sn = { q: m.q, ts: m.ts, at, s: m.s, a: m.a | 0 };
      snaps.push(sn); if (snaps.length > 40) snaps.shift();
      snapCur = sn; pendingRecon = sn; lastSnapAt = at;
      for (const x of m.ev) if (x.i > lastEvId) { lastEvId = x.i; evQueue.push(x.e); }   // each event rides in several snapshots; take it once
    }
  };
  function hostStart() { sess = (Math.random() * 2 ** 30) | 0; NET.send({ t: 'start', li: 0, g: sess }); app.start('host', 0); }
  // host: next guest input, one numbered input per sim step so the ack the guest predicts against is exact
  function nextGuestInput() {
    if (performance.now() - lastInAt > 400) { inQ.length = 0; gLast = 0; return 0; }   // guest went quiet (tab hidden / stalled): let go of every key
    if (!inQ.length) return gLast;                                                      // packet late: keep doing what they were doing
    let skipped = 0; while (inQ.length > 3) skipped |= inQ.shift().m;                   // burst arrived: catch up, never lose a tap
    const it = inQ.shift(); ackSeq = it.q; const m = it.m | (skipped & ~gLast); gLast = it.m; return m;
  }
  function sendSnap() {
    const q = ++snapSeq; evLog = evLog.filter(x => q - x.q <= 8);
    NET.sendFast({ t: 's', g: sess, q, ts: performance.now(), a: ackSeq, pe: lastPt, s: sim.toState(), ev: evLog });
  }
  function peerLeft() {
    if (!mode || mode === 'solo' || mode === 'local2') { setOn('Connection closed.'); return; }
    const was = mode; mode = null; sim = null; NET.close();
    app.dialog('Friend disconnected', ['The connection was lost.'], [{ label: 'Menu', fn: () => app.menu() }]);
  }
  NET.onStatus = (s, info) => {
    if (s === 'waiting') { $('oncode').textContent = info; setOn('Waiting for your friend. Send them this code (or the link to the game).'); }
    else if (s === 'connecting') setOn('Connecting...');
    else if (s === 'connected') {
      if (NET.host && !mode) hostStart();
      else if (!NET.host) setOn('Connected! Waiting for the host to start...');
    } else if (s === 'closed') { if (mode === 'host' || mode === 'guest') return; peerLeft(); }       // mid-game drops are handled by linkWatch (auto re-join); only an explicit 'bye' ends the game
    else if (s === 'error') { if (mode === 'host' || mode === 'guest') return; setOn(info || 'Connection error.'); }
  };
  NET.canReplace = () => mode === 'host' && performance.now() - lastInAt > 1200;
  // Link watchdog: a silently dead WebRTC link never fires 'close', so judge it by traffic. The guest re-dials; the host accepts the new connection.
  let lastRejoin = 0, lostSince = 0;
  function linkWatch(now) {
    const age = mode === 'guest' ? now - lastSnapAt : now - lastInAt;
    if (age < 1500) { lostSince = 0; return false; }
    if (!lostSince) lostSince = now;
    if (mode === 'guest' && now - lastRejoin > 4000) { lastRejoin = now; NET.rejoin(); }
    if (now - lostSince > 25000) peerLeft();
    return true;
  }

  // ---------------------------------------------------------------- effects from sim events
  function addFx(sheet, x, y, size, speed = 1) { fx.push({ sheet, x, y, size, t: 0, speed }); }
  function addText(x, y, s, col = '#fff', big = 0) { texts.push({ x, y, s, col, t: 0, big }); }
  function handleEvents(list) {
    for (const e of list) {
      if (!demoOn && !(e.k === 'pop' && e.silent)) SND.play(e.k);
      switch (e.k) {
        case 'pop': addFx('popA', e.x, e.y, e.silent ? 50 : 70); break;
        case 'kill': addFx('popC', e.x, e.y, 150); addText(e.x, e.y - 10, '' + e.pts + (e.chain > 1 ? ' x' + e.chain : ''), '#ffe45a', 1); break;
        case 'trap': addFx('popB', e.x, e.y, 60, 1.4); break;
        case 'portal': addFx('popB', e.x, e.y, 130, 1.2); break;
        case 'spawn': addFx('popB', e.x, e.y, 80, 1.3); break;
        case 'jump': addFx('popA', e.x, e.y - 2, 26, 1.8); break;
        case 'spring': addFx('popB', e.x, e.y, 70, 1.5); break;
        case 'fruit': addText(e.x, e.y - 6, '' + e.pts, '#9dffb0'); break;
        case 'break': addFx('popC', e.x, e.y, 90); addText(e.x, e.y - 10, 'ANGRY!', '#ff6a5a'); break;
        case 'hurt': addFx('popC', e.x, e.y, 120); break;
        case 'shield': addFx('popB', e.x, e.y, 80, 1.6); break;
        case 'shieldPop': addFx('popC', e.x, e.y, 90); break;
        case 'bonk': addFx('popA', e.x, e.y, 40, 1.8); break;
        case 'hurry': addText(W / 2, H / 2, 'HURRY UP!', '#ff5a5a', 2); break;
        case 'clear': addText(W / 2, H / 2 - 40, 'STAGE CLEAR!', '#9dffd0', 2); break;
        case 'over': addText(W / 2, H / 2 - 40, 'GAME OVER', '#ff7a7a', 2); break;
        case 'respawn': addFx('popB', e.x, e.y, 100); break;
        case 'bosshit': addFx('popA', e.x, e.y, 80, 1.6); addText(e.x, e.y - 14, 'HIT!', '#ffb0ff'); break;
        case 'bossdie': addFx('popC', e.x, e.y, 260, 0.8); addFx('popB', e.x, e.y, 200, 0.7); addText(W / 2, H / 2 - 110, 'BOSS DOWN!', '#ffe45a', 2); break;
        case 'boss': addText(W / 2, H / 2 + 30, 'BOSS!', '#ff7ab8', 2); break;
        case 'stage': addText(W / 2, H / 2 - 50, e.name, e.boss ? '#ff9ad0' : '#9fe8ff', 2); break;
        case 'summon': addFx('popB', e.x, e.y, 120, 1.3); break;
        case 'power': addFx('popB', e.x, e.y, 110, 1.4); addText(e.x, e.y - 20, POWERS[e.idx].n.toUpperCase() + '!', POWERS[e.idx].col); break;
        case 'drop': addFx('popA', e.x, e.y, 30, 1.8); break;
      }
    }
  }

  // ---------------------------------------------------------------- rendering
  const BUBBLE_SHEET = ['bubA', 'bubA'];
  function drawBubbles() {
    for (const b of sim.bubbles) {
      const sq = b.squish > 0 ? Math.sin(b.squish / 10 * Math.PI) * 0.12 : 0;
      const wob = 1 + Math.sin((sim.t + b.ph * 60) / 9) * 0.03;
      const size = b.r * 2.25 * wob;
      g.save(); g.translate(b.x, b.y); g.scale(1 + sq, 1 - sq);
      if (b.en) {
        const shake = b.life < 140 ? Math.sin(sim.t * 1.3) * 2 : 0;
        ART.enemy(g, shake, 10, b.en.type, { t: sim.t, angry: b.life < 140 || b.en.angry, dir: Math.sin(sim.t / 30) > 0 ? 1 : -1 });
      }
      const tint = g.createRadialGradient(-b.r * .25, -b.r * .3, 2, 0, 0, b.r);
      tint.addColorStop(0, b.look ? 'rgba(150,190,255,.30)' : 'rgba(170,255,200,.30)'); tint.addColorStop(1, b.look ? 'rgba(60,110,255,.16)' : 'rgba(60,220,140,.14)');
      g.fillStyle = tint; g.beginPath(); g.arc(0, 0, b.r * wob, 0, 7); g.fill();
      ART.sheet(g, BUBBLE_SHEET[b.look | 0] || 'bubA', Math.floor(sim.t / 2) + (b.id * 7), 0, 0, size, b.en ? 0.95 : 0.9);
      if (b.en && b.life < 140 && (sim.t >> 2) & 1) { g.globalCompositeOperation = 'lighter'; g.fillStyle = 'rgba(255,80,60,.35)'; g.beginPath(); g.arc(0, 0, b.r, 0, 7); g.fill(); g.globalCompositeOperation = 'source-over'; }
      g.restore();
    }
  }

  function drawPortal(cx, cy, size, t, air) {
    g.globalCompositeOperation = 'lighter';
    const gl = g.createRadialGradient(cx, cy, 4, cx, cy, size * .62); gl.addColorStop(0, 'rgba(170,235,255,.55)'); gl.addColorStop(1, 'rgba(80,120,255,0)');
    g.fillStyle = gl; g.fillRect(cx - size, cy - size, size * 2, size * 2);
    g.globalCompositeOperation = 'source-over';
    ART.sheet(g, 'bubD', Math.floor(t / 40), cx, cy, size + Math.sin(t / 300) * 4);
    if (air) {
      g.save(); g.translate(cx, cy); g.rotate(t / 500); g.strokeStyle = 'rgba(200,245,255,.8)'; g.lineWidth = 2; g.setLineDash([6, 8]);
      g.beginPath(); g.arc(0, 0, size * 0.36, 0, 7); g.stroke(); g.restore();
    }
  }

  function draw(noHud) {
    const L = sim.level, t = performance.now();
    ART.background(g, L, t);
    g.drawImage(ART.levelLayer(L), 0, 0);
    for (const row of [0, ROWS - 1]) {
      let x = 0;
      while (x < COLS) {
        if (L.map[row][x] !== 'o') { x++; continue; }
        let x2 = x; while (x2 + 1 < COLS && L.map[row][x2 + 1] === 'o') x2++;
        drawPortal((x + x2 + 1) * TS / 2, row * TS + TS / 2, (x2 - x + 1) * TS * 1.05, t);
        x = x2 + 1;
      }
    }
    for (const p of L.portals) drawPortal(p.x, p.y, p.r * 2.1, t, true);
    for (const it of sim.items) {
      if (it.life < 120 && (sim.t >> 2) & 1) continue;
      if (it.kind >= 100) { ART.power(g, it.x + it.w / 2, it.y + it.h / 2, it.kind - 100, sim.t); continue; }
      const F = FRUITS[it.kind];
      ART.fruit(g, it.x + it.w / 2, it.y + it.h / 2, it.kind, F.col, F.b, sim.t, Math.max(0, -it.vy) * 0.03);
      if (F.b) { g.strokeStyle = 'rgba(255,255,255,.35)'; g.lineWidth = 2; g.beginPath(); g.arc(it.x + it.w / 2, it.y + it.h / 2, 15 + Math.sin(sim.t / 6) * 1.5, 0, 7); g.stroke(); }
    }
    for (const e of sim.enemies) {
      if (e.spawnT > 0) g.globalAlpha = 0.35 + 0.65 * (1 - e.spawnT / 40);
      ART.enemy(g, e.x + e.w / 2, e.y + e.h, e.type, { t: e.t, angry: e.angry, dir: e.dir, hit: e.hit });
      g.globalAlpha = 1;
    }
    for (const p of sim.players) {
      if (p.out && p.dead > 100) continue;
      if (p.inv > 0 && !p.dead && (sim.t >> 2) & 1) continue;
      const st = p.dead ? 'dead' : p.mouth > 0 ? 'shoot' : !p.ground ? 'jump' : Math.abs(p.vx) > 0.4 ? 'walk' : 'idle';
      ART.dragon(g, p.x + PW / 2, p.y + PH, p.face, p.id ? 'blue' : 'green', { t: p.anim, state: st, scale: 1.3, vy: p.vy, p, key: 'p' + p.id, simT: sim.t });
      if (p.shield) {
        const low = p.energy < 50 && (sim.t >> 2) & 1;
        ART.sheet(g, 'bubB', Math.floor(sim.t / 2), p.x + PW / 2, p.y + PH / 2 - 4, 66 + Math.sin(sim.t / 5) * 2, low ? 0.4 : 0.95);
      }
    }
    drawBubbles();
    for (let i = fx.length - 1; i >= 0; i--) {
      const f = fx[i]; f.t += f.speed * 0.5;
      const fr = Math.floor(f.t);
      if (fr >= ART.frames(f.sheet)) { fx.splice(i, 1); continue; }
      ART.sheet(g, f.sheet, fr, f.x, f.y, f.size);
    }
    g.textAlign = 'center';
    for (let i = texts.length - 1; i >= 0; i--) {
      const tx = texts[i]; tx.t++;
      const life = tx.big ? 110 : 50; if (tx.t > life) { texts.splice(i, 1); continue; }
      g.globalAlpha = Math.min(1, (life - tx.t) / 15);
      g.font = (tx.big ? 'italic bold ' + (tx.big > 1 ? 64 : 28) : 'bold 16') + 'px Georgia,serif';
      g.lineWidth = 5; g.strokeStyle = 'rgba(0,0,40,.85)'; const y = tx.y - (tx.big > 1 ? 0 : tx.t * 0.7);
      g.strokeText(tx.s, tx.x, y); g.fillStyle = tx.col; g.fillText(tx.s, tx.x, y); g.globalAlpha = 1;
    }
    if (!noHud) hud();
  }

  function hud() {
    g.lineWidth = 4;
    sim.players.forEach((p, i) => {
      const x = i ? W - 190 : 44, col = i ? '#7ab4ff' : '#7dff8a';
      g.textAlign = 'left'; g.font = 'bold 18px Georgia,serif'; g.strokeStyle = 'rgba(0,0,40,.9)'; g.fillStyle = col;
      const s = (i ? 'P2  ' : 'P1  ') + String(p.score).padStart(7, '0');
      g.strokeText(s, x, 56); g.fillText(s, x, 56);
      for (let l = 0; l < p.lives; l++) ART.dragon(g, x + 8 + l * 22, 82, 1, i ? 'blue' : 'green', { scale: 0.55 });
      g.fillStyle = 'rgba(0,0,40,.6)'; ART.rr(g, x, 90, 120, 7, 3.5); g.fill();
      g.fillStyle = p.shCd ? '#ff7a7a' : '#a8e8ff'; ART.rr(g, x, 90, Math.max(2, 120 * p.energy / SHIELD_MAX), 7, 3.5); g.fill();
    });
    // active buffs under each player's shield bar
    sim.players.forEach((p, i) => {
      const x = i ? W - 190 : 44; let k = 0;
      for (let b = 0; b < 3; b++) if (p.buf && p.buf[b] > 0) {
        const P = POWERS[b], bx = x + k * 42; k++;
        g.fillStyle = 'rgba(0,0,40,.6)'; ART.rr(g, bx, 102, 38, 14, 5); g.fill();
        g.fillStyle = P.col; ART.rr(g, bx + 1, 103, Math.max(2, 36 * p.buf[b] / P.dur), 12, 4); g.fill();
        g.fillStyle = '#10143a'; g.font = 'bold 10px Arial'; g.textAlign = 'center'; g.fillText(P.ch, bx + 19, 113);
      }
    });
    // boss health bar
    const bs = sim.enemies.find(e => e.type === 'boss');
    if (bs && bs.hpMax) {
      const bw = 360, bx = W / 2 - bw / 2;
      g.fillStyle = 'rgba(0,0,40,.7)'; ART.rr(g, bx, 92, bw, 14, 7); g.fill();
      g.fillStyle = bs.angry ? '#ff4a6a' : '#e06aff'; ART.rr(g, bx + 2, 94, Math.max(0, (bw - 4) * bs.hp / bs.hpMax), 10, 5); g.fill();
    }
    g.textAlign = 'center'; g.fillStyle = '#cfe'; g.strokeStyle = 'rgba(0,0,40,.9)'; g.font = 'italic bold 20px Georgia,serif';
    g.strokeText(sim.level.name, W / 2, 56); g.fillText(sim.level.name, W / 2, 56);
    if (mode === 'host' || mode === 'guest') { g.font = 'bold 12px Arial'; g.fillStyle = '#9fd'; g.fillText((mode === 'host' ? 'HOST' : 'GUEST') + '  ESC = leave' + (mode === 'guest' && rtt ? '   ping ' + Math.round(rtt) + 'ms' + (NET.fastOpen ? '' : ' (relay)') : ''), W / 2, 74); }
  }

  // ---------------------------------------------------------------- guest-side prediction of my own dragon
  // The host stays authoritative. I step my dragon locally (same physics code) against the host's world, numbering every
  // step. Each snapshot says "I have applied your inputs up to #ack": I rewind to my own state at #ack, overwrite it with
  // the host's truth, and replay inputs #ack+1..now. If the replay lands where I already am (the normal case) nothing moves;
  // otherwise the difference is eased out visually instead of rubber-banding.
  let me = null;
  const MY = 1, KEEP = ['lives', 'score', 'energy', 'shCd', 'shield', 'inv', 'dead', 'out', 'buf', 'mouth'];
  const snapMe = () => Object.assign({}, me);
  function stepMe(mask) {
    pseq++; INHIST[pseq & 255] = mask;
    if (me) {
      const wasGround = me.ground;
      sim.stepPlayer(me, mask, true);                                                           // calm=true: the host owns shooting
      MH[pseq & 255] = snapMe();
      ox *= 0.82; oy *= 0.82;
      if (wasGround && !me.ground && me.vy < -9) { SND.play('jump'); addFx('popA', me.x + PW / 2, me.y + PH - 2, 26, 1.8); }
    }
  }
  function predictMe() {
    const raw = snapCur.s.p[MY]; if (!raw) return;
    const base = sim.players[MY];
    if (!me || raw[10] || me.dead || raw[15] || sim.state === 'over') {            // dead / out / first frame: just follow the host
      me = Object.assign({ prev: 0, portalCd: 0, apCd: 0, shootCd: 0, coyote: 0, jumpBuf: 0, onB: 0, drop: 0 }, base); pendingRecon = null; ox = oy = 0;
      MH.fill(null); MH[pseq & 255] = snapMe(); return;
    }
    for (const k of KEEP) me[k] = base[k];
    if (pendingRecon) {
      const sn = pendingRecon; pendingRecon = null;
      const r = sn.s.p[MY], from = MH[sn.a & 255], behind = pseq - sn.a;
      if (!from || behind < 0 || behind > 200) { me.x = r[0]; me.y = r[1]; me.vx = r[2]; me.vy = r[3]; ox = oy = 0; }
      else {
        const t = Object.assign({}, from, { x: r[0], y: r[1], vx: r[2], vy: r[3], ground: !!r[5], face: r[4] });
        for (const k of KEEP) t[k] = base[k];
        for (let s = sn.a + 1; s <= pseq; s++) sim.stepPlayer(t, INHIST[s & 255], true);
        sim.events.length = 0;
        const dx = t.x - me.x, dy = t.y - me.y, err = Math.hypot(dx, dy);
        if (err > 100) { ox = oy = 0; }                                             // teleport / respawn / big divergence: snap
        else if (err > 0.25) { ox -= dx; oy -= dy; }                                // keep what's on screen, ease into the corrected spot
        Object.assign(me, t);
      }
    }
    sim.events.length = 0;
    me.anim = base.anim + 0;                                                                    // animation clock from the host keeps both screens in step
    sim.players[MY] = Object.assign({}, me, { x: me.x + ox, y: me.y + oy });
  }

  // ---------------------------------------------------------------- loop
  function totalScore() { return sim.players.reduce((a, p) => a + p.score, 0); }
  function checkOver() {
    if (!sim || sim.state !== 'over' || sim.stateT < 100 || overShown) return;
    overShown = true;
    const sc = totalScore(), best = getHi(); if (sc > best) localStorage.setItem(hiKey, sc);
    const lines = ['Stage ' + (sim.levelIndex + 1) + ' reached', 'Score ' + sc + (sc > best ? '  -  NEW BEST!' : '')];
    if (mode === 'guest') app.dialog('Game Over', lines.concat(['Waiting for the host...']), [{ label: 'Ask for rematch', fn: () => { NET.send({ t: 'again' }); overShown = false; app.dialog('Rematch', ['Waiting for the host to start...'], [{ label: 'Menu', fn: () => app.quit() }]); } }, { label: 'Menu', fn: () => app.quit() }]);
    else if (mode === 'host') app.dialog('Game Over', lines, [{ label: 'Play again', fn: () => hostStart() }, { label: 'Menu', fn: () => app.quit() }]);
    else { const m = mode; app.dialog('Game Over', lines, [{ label: 'Play again', fn: () => app.start(m, 0) }, { label: 'Menu', fn: () => app.menu() }]); }
  }

  function frame(now) {
    const dt = Math.min(100, now - last); last = now;
    if (sim && mode && mode !== 'guest') {
      acc += dt;
      if (app.paused) acc = 0;
      while (acc >= 1000 / 60) {
        acc -= 1000 / 60;
        const inp = readInputs();
        if (mode === 'host') inp[1] = nextGuestInput();
        sim.step(inp);
        handleEvents(sim.events);
        if (mode === 'host') {
          for (const e of sim.events) evLog.push({ i: ++evId, q: snapSeq + 1, e });
          if ((++sendTick & 1) === 0) sendSnap();
        }
      }
    } else if (sim && mode === 'guest') {
      acc = Math.min(acc + dt, 100);
      let stepped = false, guard = 0;
      while (acc >= STEP && guard++ < 6) { acc -= STEP; stepMe(readInputs()[0]); stepped = true; }
      if (stepped || now - lastPktAt > 100) {                    // numbered inputs, newest first, 8 deep: any lost packet is recovered by the next one
        const h = []; for (let i = 0; i < 8; i++) h.push(INHIST[(pseq - i) & 255]);
        NET.sendFast({ t: 'in', g: sess, q: pseq, h, pt: now }); lastPktAt = now;
      }
      if (snaps.length) {
        // jitter buffer: draw the world a little in the past, on the host's own clock, so late/bunched packets never show
        const target = Math.min(320, Math.max(75, 70 + jit * 1.3));
        delayCur += (target - delayCur) * 0.02;
        const rt = now - clkBase - delayCur, n = snaps.length;
        let A = null, B = snaps[n - 1], f = 1;
        if (rt < B.ts) {
          if (rt <= snaps[0].ts) B = snaps[0];
          else for (let i = n - 1; i > 0; i--) if (snaps[i - 1].ts <= rt) { A = snaps[i - 1]; B = snaps[i]; f = Math.min(1, (rt - A.ts) / Math.max(1, B.ts - A.ts)); break; }
        } else if (n > 1) A = snaps[n - 2];
        sim.fromState(B.s, A ? A.s : null, f);
        predictMe();
        if (evQueue.length) {                                  // my own jump sound already played locally
          handleEvents(evQueue.filter(e => !(e.k === 'jump' && e.id === 1))); evQueue = [];
        }
      }
    }
    if (sim && sim.state !== 'wait' && (mode !== 'guest' || snapCur)) {
      draw(); checkOver();
      if ((mode === 'host' || mode === 'guest') && linkWatch(now)) {
        g.fillStyle = 'rgba(0,0,30,.62)'; g.fillRect(0, 0, W, H); g.fillStyle = '#ffd36a'; g.textAlign = 'center'; g.font = 'italic bold 40px Georgia,serif';
        g.fillText(mode === 'guest' ? 'Connection lost' : 'Your friend dropped', W / 2, H / 2 - 8);
        g.fillStyle = '#fff'; g.font = '20px Georgia'; g.fillText(mode === 'guest' ? 'Reconnecting' + '...'.slice(0, 1 + ((now / 400) | 0) % 3) : 'Waiting for them to reconnect' + '...'.slice(0, 1 + ((now / 400) | 0) % 3), W / 2, H / 2 + 30);
      }
      if (app.paused) { g.fillStyle = 'rgba(0,0,30,.55)'; g.fillRect(0, 0, W, H); g.fillStyle = '#fff'; g.textAlign = 'center'; g.font = 'italic bold 64px Georgia,serif'; g.fillText('PAUSED', W / 2, H / 2); g.font = '20px Georgia'; g.fillText('press P to resume', W / 2, H / 2 + 40); }
    }
    else if (sim && mode === 'guest') { g.fillStyle = '#050a28'; g.fillRect(0, 0, W, H); g.fillStyle = '#9cd'; g.font = '24px Georgia'; g.textAlign = 'center'; g.fillText('Waiting for host...', W / 2, H / 2); }
    else if (!mode) runDemo(dt);
    requestAnimationFrame(frame);
  }

  // ---------------------------------------------------------------- attract mode: a bot plays behind the title screen
  let demo = null, demoAcc = 0, demoLv = 0, demoOn = false;
  function botInput(s, p) {
    if (p.dead || p.out) return 0;
    const cx = p.x + PW / 2, cy = p.y + PH / 2;
    let m = 0;
    // ---- survival first: react to the nearest live threat
    let thr = null, td = 1e9;
    for (const e of s.enemies) {
      if (e.spawnT > 0) continue;
      const d = Math.hypot(e.x + e.w / 2 - cx, (e.y + e.h / 2 - cy) * 1.3);
      if (d < td) { td = d; thr = e; }
    }
    if (thr) {
      const dx = thr.x + thr.w / 2 - cx, dy = thr.y + thr.h / 2 - cy, away = dx > 0 ? IN.L : IN.R;
      // about to touch: raise the shield (bounces enemies away) while energy lasts, and back off
      if (td < 60 && p.energy > 12 && p.shCd === 0) { m |= IN.SHIELD | away; return m; }
      if (td < 120 && Math.abs(dy) < 45 && thr.type !== 'ghost') {
        const bx = Math.floor((cx + (dx > 0 ? -28 : 28)) / TS), by = Math.floor((p.y + PH + 3) / TS);
        const cornered = s.tileAt(bx, by) === '.' || s.solid(bx, Math.floor(cy / TS));
        if (cornered) { if (p.ground) m |= IN.JUMP | (dx > 0 ? IN.R : IN.L); else m |= dx > 0 ? IN.R : IN.L; }   // hop over it
        else {
          // stand and fire (retreating would turn the dragon away from the target); the shield takes over when it closes in
          p.face = dx > 0 ? 1 : -1;
          if (Math.abs(dy) < 40) m |= IN.SHOOT; else m |= away;
        }
        return m;
      }
      if (thr.type === 'ghost' && td < 160) { m |= away; if (p.ground && s.t % 30 < 2) m |= IN.JUMP; return m; }
    }
    // ---- hunting
    let tgt = null, bd = 1e9, kind = '';
    for (const e of s.enemies) { if (e.type === 'ghost' || e.spawnT > 0) continue; const d = Math.abs(e.x - p.x) + Math.abs(e.y - p.y) * 1.5; if (d < bd) { bd = d; tgt = e; kind = 'en'; } }
    for (const b of s.bubbles) if (b.en) { const d = Math.abs(b.x - cx) + Math.abs(b.y - cy) * 1.2 - 80; if (d < bd) { bd = d; tgt = b; kind = 'bub'; } }
    for (const it of s.items) { const d = Math.abs(it.x - cx) + Math.abs(it.y - cy) - 40; if (d < bd * 0.6 && !(it.kind >= 5)) { bd = d; tgt = it; kind = 'item'; } }
    if (!tgt) return 0;
    const tx = kind === 'en' ? tgt.x + tgt.w / 2 : kind === 'item' ? tgt.x + 11 : tgt.x, ty = kind === 'en' ? tgt.y + tgt.h / 2 : kind === 'item' ? tgt.y + 11 : tgt.y;
    const dx = tx - cx, dy = ty - cy;
    if (kind === 'en' && Math.abs(dy) < 36 && Math.abs(dx) < 260) {
      p.face = dx > 0 ? 1 : -1; m |= IN.SHOOT; if (Math.abs(dx) > 150) m |= dx > 0 ? IN.R : IN.L; return m;
    }
    if (Math.abs(dx) > 14) m |= dx > 0 ? IN.R : IN.L;
    if (dy < -30 && p.ground && s.t % 7 < 2) m |= IN.JUMP;
    if (dy < -30 && !p.ground) m |= IN.JUMP;
    if (kind === 'bub' && Math.abs(dx) < 40 && dy < 0 && p.ground) m |= IN.JUMP;
    if (kind === 'en' && dy > 30 && Math.abs(dx) < 30) m |= dx >= 0 ? IN.R : IN.L;
    return m;
  }
  function runDemo(dt) {
    if (!demo || demo.state === 'over' || (demo.state === 'clear' && demo.stateT > 90)) {
      demoLv = demo ? (demoLv + 1) % 8 : 0; demo = new Sim(demoLv, (Math.random() * 2 ** 31) | 0, 2); fx.length = 0; texts.length = 0;
    }
    demoAcc += dt;
    demoOn = true;
    for (let n = 0; demoAcc >= 1000 / 60 && n < 4; n++) {
      demoAcc -= 1000 / 60;
      for (const p of demo.players) p.lives = 9;
      demo.step(demo.players.map(p => botInput(demo, p)));
      handleEvents(demo.events);
      for (const e of demo.events) if (e.k === 'hurt') window.__demoDeaths = (window.__demoDeaths | 0) + 1;
    }
    demoAcc %= 1000 / 60;
    sim = demo; draw(true); sim = null; demoOn = false;
  }
  let lastSentAt = 0;

  ART.load().then(() => {
    showHi(); window.__ready = true;
    if (Q.get('autostart')) app.start(Q.get('autostart'), +(Q.get('lv') || 0));
    requestAnimationFrame(frame);
  }).catch(e => { g.fillStyle = '#fff'; g.fillText('Load error: ' + e.message, 20, 40); console.error(e); });
  return app;
})();
