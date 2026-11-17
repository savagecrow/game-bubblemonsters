// Game simulation, fixed 60 Hz. Host-authoritative in online play: the host runs Sim.step, the guest only
// sends inputs and renders snapshots. All state is plain JSON-able data so it can be snapshotted.
const IN = { L: 1, R: 2, JUMP: 4, SHOOT: 8, SHIELD: 16 };
const PW = 22, PH = 28;                      // player hitbox
const AIR_JUMPS = [Math.SQRT1_2, 0.5];   // 2nd/3rd jump launch speed: height gained = 50% / 25% of a full jump (height ~ speed^2)
const GRAV = 0.46, JUMP_V = 10.2, RUN = 2.3, MAXFALL = 9;
const SHIELD_MAX = 200;
const FRUITS = [                              // kind: points, colour, bouncy (can be used as a spring)
  { n: 'cherry', pts: 100, col: '#e0203a', b: 0 }, { n: 'orange', pts: 200, col: '#ff9a20', b: 0 },
  { n: 'lemon', pts: 300, col: '#ffe030', b: 0 }, { n: 'apple', pts: 400, col: '#3cd04a', b: 0 },
  { n: 'grape', pts: 500, col: '#9a40e0', b: 0 }, { n: 'melon', pts: 800, col: '#58c840', b: 1 },
  { n: 'pumpkin', pts: 1000, col: '#ff7a18', b: 1 }, { n: 'plum', pts: 1500, col: '#5a46d8', b: 1 },
];
const ENEMY = {
  walk: { w: 26, h: 26, spd: 0.9 },
  hop: { w: 26, h: 26, spd: 1.1 },
  fly: { w: 28, h: 26, spd: 0.8 },
  ghost: { w: 30, h: 30, spd: 1.15 },       // the "hurry up" chaser: invulnerable
  boss: { w: 60, h: 56, spd: 0.75 },        // can't be trapped: hit it with bubbles until it cracks
};
const POWERS = [                              // timed buffs dropped by some monsters: kind = 100 + index
  { n: 'boots', col: '#ff8a3a', ch: 'S', dur: 900 },   // faster running
  { n: 'wide', col: '#4ad8ff', ch: 'W', dur: 900 },    // bigger, longer-range bubbles
  { n: 'rapid', col: '#ffe14a', ch: 'R', dur: 900 },   // rapid fire
  { n: 'orb', col: '#c06aff', ch: 'O', dur: 0 },       // refill shield + brief invulnerability
];

class Sim {
  constructor(levelIndex = 0, seed = 1, nPlayers = 2) {
    this.seed = (seed >>> 0) || 1;
    this.t = 0; this.nid = 1; this.events = [];
    this.players = [];
    for (let i = 0; i < nPlayers; i++) this.players.push({ id: i, lives: 3, score: 0 });
    this.loadLevel(levelIndex, true);
  }
  rnd() { this.seed = (Math.imul(this.seed, 1664525) + 1013904223) >>> 0; return this.seed / 4294967296; }
  ev(k, x, y, o) { const e = { k, x, y }; if (o) Object.assign(e, o); this.events.push(e); }

  loadLevel(i, first) {
    this.levelIndex = i; this.level = getLevel(i);
    this.enemies = []; this.bubbles = []; this.items = [];
    this.lt = 0; this.state = 'play'; this.stateT = 0; this.chain = 0; this.chainT = 0; this.hurry = 0;
    this.pending = this.level.enemies.map((e, n) => ({ type: e.t, x: e.x * TS, y: e.y * TS, at: e.t === 'boss' ? 20 : 40 + n * 22 }));
    this.boss = null; this.announce = true;
    if (typeof setTimeout !== 'undefined' && typeof window !== 'undefined') setTimeout(() => getLevel(i + 1), 800);   // validate the next stage in the background
    for (const p of this.players) {
      const [x, y] = this.spawnPoint(p.id);
      Object.assign(p, { x, y, vx: 0, vy: 0, face: p.id ? -1 : 1, ground: false, prev: 0, portalCd: 0, anim: 0, shootCd: 0,
        shield: false, energy: SHIELD_MAX, shCd: 0, dead: 0, inv: 90, coyote: 0, jumpBuf: 0, onB: 0, mouth: 0, drop: 0, buf: [0, 0, 0] });
      if (p.lives <= 0) { p.dead = 1; p.out = true; } else p.out = false;
    }
  }

  // ---- compact network snapshot (host -> guest) and its inverse; `a`/`f` optionally interpolate from a previous snapshot ----
  toState() {
    return {
      t: this.t, li: this.levelIndex, st: this.state, sT: this.stateT, h: this.hurry,
      p: this.players.map(p => [p.x, p.y, p.vx, p.vy, p.face, p.ground ? 1 : 0, p.anim, p.shield ? 1 : 0, p.energy, p.shCd, p.dead, p.inv, p.mouth, p.lives, p.score, p.out ? 1 : 0, p.buf[0], p.buf[1], p.buf[2]]),
      e: this.enemies.map(e => [e.id, e.type, e.x, e.y, e.dir, e.angry ? 1 : 0, e.spawnT, e.t, e.hp | 0, e.hpMax | 0, e.hit | 0]),
      b: this.bubbles.map(b => [b.id, b.x, b.y, b.r, b.st, b.look, b.age, b.life, b.en ? b.en.type : '', b.en && b.en.angry ? 1 : 0, b.squish, b.ph, b.vy, b.vx]),
      i: this.items.map(i => [i.id, i.kind, i.x, i.y, i.vy, i.life]),
    };
  }
  fromState(s, a, f) {
    const lerp = (p, q, k) => (a && Math.abs(q - p) < 120) ? p + (q - p) * k : q;
    const amap = (arr) => { const m = new Map(); if (a) for (const r of arr) m.set(r[0], r); return m; };
    this.t = s.t; if (this.levelIndex !== s.li || !this.level) { this.levelIndex = s.li; this.level = getLevel(s.li); }
    this.state = s.st; this.stateT = s.sT; this.hurry = s.h;
    this.players = s.p.map((r, i) => {
      const o = a && a.p[i];
      return { id: i, x: o ? lerp(o[0], r[0], f) : r[0], y: o ? lerp(o[1], r[1], f) : r[1], vx: r[2], vy: r[3], face: r[4], ground: !!r[5], anim: r[6], shield: !!r[7], energy: r[8], shCd: r[9], dead: r[10], inv: r[11], mouth: r[12], lives: r[13], score: r[14], out: !!r[15], buf: [r[16], r[17], r[18]] };
    });
    const ae = amap(a ? a.e : []), ab = amap(a ? a.b : []), ai = amap(a ? a.i : []);
    this.enemies = s.e.map(r => { const o = ae.get(r[0]), d = ENEMY[r[1]]; return { id: r[0], type: r[1], x: o ? lerp(o[2], r[2], f) : r[2], y: o ? lerp(o[3], r[3], f) : r[3], dir: r[4], angry: !!r[5], spawnT: r[6], t: r[7], w: d.w, h: d.h, hp: r[8], hpMax: r[9], hit: r[10] }; });
    this.bubbles = s.b.map(r => { const o = ab.get(r[0]); return { id: r[0], x: o ? lerp(o[1], r[1], f) : r[1], y: o ? lerp(o[2], r[2], f) : r[2], r: r[3], st: r[4], look: r[5], age: r[6], life: r[7], en: r[8] ? { type: r[8], angry: !!r[9] } : null, squish: r[10], ph: r[11], vy: r[12], vx: r[13] }; });
    this.items = s.i.map(r => { const o = ai.get(r[0]); return { id: r[0], kind: r[1], x: o ? lerp(o[2], r[2], f) : r[2], y: o ? lerp(o[3], r[3], f) : r[3], vy: r[4], life: r[5], w: 22, h: 22 }; });
  }

  tileAt(tx, ty) {
    if (tx < 0 || tx >= COLS) return '#';
    if (ty < 0 || ty >= ROWS) return '.';
    return this.level.map[ty][tx];
  }
  solid(tx, ty) { return this.tileAt(tx, ty) === '#'; }
  spawnPoint(n) {
    const m = this.level.map;
    for (let y = 0; y < ROWS; y++) { const x = m[y].indexOf(String(n + 1)); if (x >= 0) return [x * TS + (TS - PW) / 2, (y + 1) * TS - PH]; }
    return [(n ? COLS - 5 : 4) * TS, (ROWS - 1) * TS - PH];
  }

  // ---------------------------------------------------------------- generic tile physics for any box
  moveX(e, w, h) {
    e.hitX = false; e.x += e.vx;
    const top = Math.floor((e.y + 2) / TS), bot = Math.floor((e.y + h - 3) / TS);
    if (e.vx > 0) {
      const tx = Math.floor((e.x + w) / TS);
      for (let ty = top; ty <= bot; ty++) if (this.solid(tx, ty)) { e.x = tx * TS - w; e.vx = 0; e.hitX = true; break; }
    } else if (e.vx < 0) {
      const tx = Math.floor(e.x / TS);
      for (let ty = top; ty <= bot; ty++) if (this.solid(tx, ty)) { e.x = (tx + 1) * TS; e.vx = 0; e.hitX = true; break; }
    }
  }
  moveY(e, w, h) {
    const prevBottom = e.y + h; e.y += e.vy; e.ground = false; e.hitY = false;
    const l = Math.floor((e.x + 1) / TS), r = Math.floor((e.x + w - 2) / TS);
    if (e.vy >= 0) {
      const ty = Math.floor((e.y + h) / TS);
      for (let tx = l; tx <= r; tx++) {
        const c = this.tileAt(tx, ty);
        if (c === '#' || (c === '=' && prevBottom <= ty * TS + 0.01 && !(e.drop > 0))) { e.y = ty * TS - h; if (e.vy > 0) e.hitY = true; e.vy = 0; e.ground = true; break; }
      }
    } else {
      const ty = Math.floor(e.y / TS);
      for (let tx = l; tx <= r; tx++) if (this.solid(tx, ty)) { e.y = (ty + 1) * TS; e.vy = 0; break; }
    }
  }
  // bubble teleporters in the floor / ceiling holes: fall into one, pop out of the opposite hole
  holePortal(e, w, h, cd) {
    if (e.portalCd > 0) { e.portalCd--; return false; }
    const cx = e.x + w / 2, cy = e.y + h / 2, tx = Math.floor(cx / TS);
    if (this.tileAt(tx, ROWS - 1) === 'o' && cy > (ROWS - 1) * TS + 6 && e.vy > 0) {
      this.ev('portal', cx, (ROWS - 1) * TS + 16); e.y = 2; e.portalCd = cd; this.ev('portal', cx, 18); return true;
    }
    if (this.tileAt(tx, 0) === 'o' && cy < TS - 6 && e.vy < 0) {
      this.ev('portal', cx, 16); e.y = (ROWS - 1) * TS - h + 28; e.portalCd = cd; this.ev('portal', cx, (ROWS - 1) * TS + 16); return true;
    }
    return false;
  }
  // free-floating bubble teleporter pairs inside the level
  airPortal(e, w, h) {
    const P = this.level.portals; if (!P.length || e.apCd > 0) { if (e.apCd > 0) e.apCd--; return; }
    const cx = e.x + w / 2, cy = e.y + h / 2;
    for (let i = 0; i < P.length; i++) {
      const a = P[i];
      if (Math.hypot(cx - a.x, cy - a.y) < a.r * 0.7) {
        const b = P[a.to];
        this.ev('portal', a.x, a.y); e.x = b.x - w / 2; e.y = b.y - h / 2; e.apCd = 40; this.ev('portal', b.x, b.y);
        return;
      }
    }
  }

  // ---------------------------------------------------------------- step
  step(inputs) {
    this.t++; this.events.length = 0;
    if (this.announce) { this.announce = false; this.ev('stage', W / 2, H / 2, { name: this.level.name, boss: this.level.boss ? 1 : 0 }); }
    if (this.state === 'play') {
      this.lt++;
      this.spawnPending();
      for (const p of this.players) this.stepPlayer(p, inputs[p.id] | 0);
      this.stepBubbles(); this.stepEnemies(); this.stepItems();
      this.playerVsStuff();
      if (this.chainT > 0 && --this.chainT === 0) this.chain = 0;
      this.hurryCheck();
      this.checkEnd();
    } else if (this.state === 'clear') {
      this.stateT++;
      for (const p of this.players) if (!p.out) this.stepPlayer(p, inputs[p.id] | 0, true);
      this.stepItems(); this.stepBubbles();
      if (this.stateT > 150) this.loadLevel(this.levelIndex + 1);
    } else if (this.state === 'over') {
      this.stateT++;
    }
  }

  spawnPending() {
    for (let i = this.pending.length - 1; i >= 0; i--) {
      const s = this.pending[i];
      if (this.lt >= s.at) {
        // don't materialise on top of a player: hold the spawn until they've moved off
        if (this.players.some(p => !p.out && !p.dead && Math.hypot(p.x + PW / 2 - (s.x + TS / 2), p.y + PH / 2 - (s.y + TS / 2)) < 90)) { s.at = this.lt + 20; continue; }
        this.pending.splice(i, 1);
        const d = ENEMY[s.type];
        const en = { id: this.nid++, type: s.type, x: s.x + (TS - d.w) / 2, y: s.y + TS - d.h, vx: 0, vy: 0, w: d.w, h: d.h, dir: this.rnd() < .5 ? -1 : 1,
          ground: false, angry: this.hurry > 0, spawnT: 40, jumpCd: 30, t: 0, portalCd: 0, apCd: 0, hp: 0, hpMax: 0, hit: 0, sumCd: 220 };
        if (s.type === 'boss') { en.hpMax = en.hp = 20 + Math.floor(this.levelIndex / 5) * 4; en.spawnT = 60; this.ev('boss', s.x + TS / 2, s.y); }
        this.enemies.push(en);
        this.ev('spawn', s.x + TS / 2, s.y + TS / 2);
      }
    }
  }

  nearestPlayer(x, y) {
    let best = null, bd = 1e9;
    for (const p of this.players) { if (p.dead || p.out) continue; const d = Math.abs(p.x - x) + Math.abs(p.y - y); if (d < bd) { bd = d; best = p; } }
    return best;
  }

  // ---------------------------------------------------------------- players
  stepPlayer(p, inp, calm) {
    if (p.dead) {
      p.dead++; p.anim++; p.vy += 0.4; p.y += p.vy;
      if (!p.out && p.dead > 100) { this.respawn(p); }
      return;
    }
    let pressed = inp & ~p.prev; p.prev = inp;
    if (p.inv > 0) p.inv--;
    if (p.shootCd > 0) p.shootCd--;
    if (p.mouth > 0) p.mouth--;
    // drop-through: Down/Shield + Jump while standing on a one-way platform lets you fall through it
    if (p.drop > 0) p.drop--;
    if ((pressed & IN.JUMP) && (inp & IN.SHIELD) && p.ground && !p.onB && this.standingOnPlatform(p)) {
      p.drop = 14; p.y += 2; p.vy = 1.5; p.ground = false; p.coyote = 0; p.jumpBuf = 0; pressed &= ~IN.JUMP; this.ev('drop', p.x + PW / 2, p.y + PH);
    }
    // shield: hold to raise a bubble around you; it drains, then needs to recharge
    const wantShield = (inp & IN.SHIELD) && p.shCd === 0 && p.energy > 0 && !(p.drop > 0) && p.ground;   // grounded only: dropping when airborne
    if (wantShield && !p.shield) this.ev('shield', p.x + PW / 2, p.y + PH / 2);
    p.shield = !!wantShield;
    if (p.shield) { p.energy -= 1; if (p.energy <= 0) { p.energy = 0; p.shCd = 150; p.shield = false; this.ev('shieldPop', p.x + PW / 2, p.y + PH / 2); } }
    else if (p.shCd > 0) { p.shCd--; if (p.shCd === 0) p.energy = Math.max(p.energy, 40); }
    else p.energy = Math.min(SHIELD_MAX, p.energy + 0.6);

    let ax = 0; if (inp & IN.L) ax -= 1; if (inp & IN.R) ax += 1;
    if (ax) p.face = ax;
    for (let i = 0; i < 3; i++) if (p.buf[i] > 0) p.buf[i]--;
    const target = ax * RUN * (p.shield ? 0.65 : 1) * (p.buf[0] > 0 ? 1.4 : 1);
    p.vx += (target - p.vx) * (p.ground ? 0.35 : 0.18);
    if (!ax && Math.abs(p.vx) < 0.05) p.vx = 0;

    p.coyote = p.ground ? 6 : Math.max(0, p.coyote - 1);
    if (pressed & IN.JUMP) p.jumpBuf = 6; else p.jumpBuf = Math.max(0, p.jumpBuf - 1);
    if (p.jumpBuf > 0 && p.coyote > 0) {
      p.vy = -JUMP_V * (p.onB ? 1.08 : 1); p.ground = false; p.coyote = 0; p.jumpBuf = 0;
      this.ev('jump', p.x + PW / 2, p.y + PH, { id: p.id });
      if (p.onB) { const b = this.bubbles.find(q => q.id === p.onB); if (b) b.squish = 10; }
      p.air = 0;
    } else if (p.ground || p.onB) p.air = 0;
    else if ((pressed & IN.JUMP) && !(p.drop > 0) && (p.air || 0) < AIR_JUMPS.length) {
      // mid-air jumps: set (not add) upward speed from the current point; double = 50%, triple = 25% of a full jump
      p.vy = Math.min(p.vy, -JUMP_V * AIR_JUMPS[p.air || 0]); p.air = (p.air || 0) + 1; p.jumpBuf = 0;
      this.ev('jump', p.x + PW / 2, p.y + PH, { id: p.id, air: p.air });
    }
    if (!(inp & IN.JUMP) && p.vy < -4 && !(p.air > 0)) p.vy = -4;          // variable jump height (ground jumps only)
    p.vy = Math.min(MAXFALL, p.vy + GRAV);

    if ((pressed & IN.SHOOT || (inp & IN.SHOOT && p.shootCd === 0)) && p.shootCd === 0 && !p.shield && !calm) this.shoot(p);

    p.onB = 0;
    this.moveX(p, PW, PH); this.moveY(p, PW, PH);
    this.landOnBubbles(p);
    this.holePortal(p, PW, PH, 24); this.airPortal(p, PW, PH);
    if (p.y > H + 60) p.y = -PH;
    p.anim++;
  }

  standingOnPlatform(p) {
    const ty = Math.floor((p.y + PH + 1) / TS), l = Math.floor((p.x + 1) / TS), r = Math.floor((p.x + PW - 2) / TS);
    let plat = false;
    for (let tx = l; tx <= r; tx++) { const c = this.tileAt(tx, ty); if (c === '#') return false; if (c === '=') plat = true; }
    return plat;
  }

  respawn(p) {
    let [x, y] = this.spawnPoint(p.id);
    // never respawn on/near an enemy (or one about to materialise): pick the standable spot farthest from danger
    const danger = (px, py) => {
      let d = 1e9;
      for (const e of this.enemies) { d =Math.min(d, Math.hypot(e.x + e.w / 2 - px - PW / 2, e.y + e.h / 2 - py - PH / 2)); }
      for (const s of this.pending) if (s.at - this.lt < 120) d = Math.min(d, Math.hypot(s.x + TS / 2 - px - PW / 2, s.y + TS / 2 - py - PH / 2));
      return d;
    };
    if (danger(x, y) < 110) {
      let best = -1;
      for (let ty = 2; ty < ROWS - 1; ty++) for (let tx = 1; tx < COLS - 1; tx++) {
        const c = this.tileAt(tx, ty + 1);
        if (this.tileAt(tx, ty) !== '.' && this.tileAt(tx, ty) !== '1' && this.tileAt(tx, ty) !== '2' || this.tileAt(tx, ty - 1) === '#' || (c !== '#' && c !== '=')) continue;
        const cx = tx * TS + (TS - PW) / 2, cy = (ty + 1) * TS - PH;
        const sc = Math.min(danger(cx, cy), 260) - Math.hypot(cx - x, cy - y) * 0.15;
        if (sc > best) { best = sc; x = cx; y = cy; }
      }
    }
    Object.assign(p, { x, y, vx: 0, vy: 0, dead: 0, inv: 150, energy: SHIELD_MAX, shCd: 0, shield: false });
    this.ev('respawn', x, y);
  }

  shoot(p) {
    const wide = p.buf[1] > 0;
    p.shootCd = p.buf[2] > 0 ? 7 : 16; p.mouth = 8;
    const x = p.x + PW / 2 + p.face * (PW / 2 + 10), y = p.y + PH / 2 - 3;
    this.bubbles.push({ id: this.nid++, own: p.id, x, y, vx: p.face * (wide ? 7.6 : 6.4), vy: 0, r: wide ? 22 : 17, st: 'shot', age: 0, life: 520, en: null, squish: 0, look: p.id ? 1 : 0, ph: this.rnd() * 6, wide: wide ? 1 : 0 });
    this.ev('shoot', x, y);
  }

  // empty/trapped bubbles are platforms from above; from the side or below they pop
  landOnBubbles(p) {
    const cx = p.x + PW / 2, bot = p.y + PH;
    for (const b of this.bubbles) {
      if (b.st !== 'float' || b.popAt) continue;
      const rr = b.r;
      const dx = Math.abs(cx - b.x), top = b.y - rr * 0.78;
      if (dx > rr + PW / 2 - 6) continue;
      if (p.vy >= -0.5 && bot >= top - 2 && bot <= b.y + 3 && dx < rr + 2) {
        // stand on it
        p.y = top - PH; p.vy = Math.min(0, b.vy); p.ground = true; p.onB = b.id; p.x += b.vx;
        if (b.squish < 6) b.squish = 6;
        continue;
      }
      // other contact: overlap test with the circle
      const nx = Math.max(p.x, Math.min(b.x, p.x + PW)), ny = Math.max(p.y, Math.min(b.y, p.y + PH));
      if (Math.hypot(nx - b.x, ny - b.y) < rr - 2 && !p.shield) this.popBubble(b, p);
      else if (p.shield && Math.hypot(nx - b.x, ny - b.y) < rr - 2) { b.vx += Math.sign(b.x - cx) * 0.8; }
    }
  }

  // ---------------------------------------------------------------- bubbles
  stepBubbles() {
    const list = this.bubbles;
    for (let i = list.length - 1; i >= 0; i--) {
      const b = list[i];
      b.age++; if (b.squish > 0) b.squish--;
      if (b.popAt && this.t >= b.popAt) { this.popBubble(b, this.players[b.popBy | 0], true); continue; }
      if (b.st === 'shot') {
        b.x += b.vx; if (b.age > (b.wide ? 16 : 10)) b.vx *= 0.93;
        if (this.solid(Math.floor(b.x / TS), Math.floor(b.y / TS)) || Math.abs(b.vx) < 1.2 || b.age > (b.wide ? 38 : 28)) { b.st = 'float'; b.vx *= 0.3; }
        if (!b.en && this.trapCheck(b) === 'hit') { list.splice(i, 1); continue; }
      } else {
        const rise = b.en ? -0.55 : -0.7;
        b.vy += (rise - b.vy) * 0.08;
        b.vx *= 0.97; b.vx += Math.sin((this.t + b.ph * 60) / 50) * 0.01;
        b.x += b.vx; b.y += b.vy;
        const lo = TS + b.r + 6; if (b.y < lo) { b.y = lo; b.vy = 0; }
        if (b.x < TS + b.r) { b.x = TS + b.r; b.vx = Math.abs(b.vx); }
        if (b.x > W - TS - b.r) { b.x = W - TS - b.r; b.vx = -Math.abs(b.vx); }
        if (b.y > H - TS - b.r) { b.y = H - TS - b.r; b.vy = 0; }
        if (!b.en && this.trapCheck(b) === 'hit') { list.splice(i, 1); continue; }
        b.life--;
        if (b.life <= 0) {
          if (b.en) this.release(b);
          this.ev('pop', b.x, b.y, { silent: 1 }); list.splice(i, 1); continue;
        }
      }
    }
    // gentle separation so the cloud near the ceiling spreads out
    for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
      const a = list[i], c = list[j]; if (a.st !== 'float' || c.st !== 'float') continue;
      let dx = c.x - a.x, dy = c.y - a.y, d = Math.hypot(dx, dy), m = (a.r + c.r) * 0.85;
      if (d < m && d > 0.01) { const f = (m - d) * 0.04; dx /= d; dy /= d; a.vx -= dx * f; c.vx += dx * f; a.vy -= dy * f * 0.5; c.vy += dy * f * 0.5; }
    }
  }
  trapCheck(b) {
    for (let i = 0; i < this.enemies.length; i++) {
      const e = this.enemies[i]; if (e.type === 'ghost' || e.spawnT > 0) continue;
      const nx = Math.max(e.x, Math.min(b.x, e.x + e.w)), ny = Math.max(e.y, Math.min(b.y, e.y + e.h));
      if (e.type === 'boss') {                                   // bosses can't be trapped: bubbles chip their health
        if (Math.hypot(nx - b.x, ny - b.y) < b.r + 3 && b.st === 'shot') {
          if (e.hit > 0) { this.ev('pop', b.x, b.y, { silent: 1 }); return 'hit'; }   // brief invulnerability between hits
          e.hp--; e.hit = 22; this.ev('bosshit', b.x, b.y, { hp: e.hp });
          const by = this.players[b.own | 0]; if (by) by.score += 100;
          if (e.hp <= 0) this.bossDie(e);
          return 'hit';
        }
        continue;
      }
      if (Math.hypot(nx - b.x, ny - b.y) < b.r + 3) {
        b.en = { type: e.type, angry: e.angry }; b.r = 25; b.st = 'float'; b.life = 640; b.vx *= 0.3; b.vy = -0.3;
        this.enemies.splice(i, 1); this.ev('trap', b.x, b.y); return 'trap';
      }
    }
    return null;
  }
  bossDie(e) {
    const i = this.enemies.indexOf(e); if (i >= 0) this.enemies.splice(i, 1);
    const cx = e.x + e.w / 2, cy = e.y + e.h / 2;
    this.ev('bossdie', cx, cy);
    for (const p of this.players) if (!p.out) p.score += 5000;
    for (let k = 0; k < 7; k++) this.dropFruit(cx + (k - 3) * 14, cy - 10);
    this.dropPower(cx, cy - 20, 3); this.dropPower(cx + 20, cy - 20, this.rnd() < .5 ? 0 : 2);
    for (let j = this.enemies.length - 1; j >= 0; j--) {          // the boss's minions burst into fruit with it
      const m = this.enemies[j]; if (m.type === 'ghost') continue;
      this.ev('kill', m.x + m.w / 2, m.y + m.h / 2, { pts: 0, chain: 1, type: m.type }); this.dropFruit(m.x + m.w / 2, m.y); this.enemies.splice(j, 1);
    }
  }
  release(b) {
    const d = ENEMY[b.en.type];
    this.enemies.push({ id: this.nid++, type: b.en.type, x: b.x - d.w / 2, y: b.y - d.h / 2, vx: 0, vy: 0, w: d.w, h: d.h, dir: this.rnd() < .5 ? -1 : 1,
      ground: false, angry: true, spawnT: 0, jumpCd: 30, t: 0, portalCd: 0, apCd: 0 });
    this.ev('break', b.x, b.y);
  }
  popBubble(b, by, chained) {
    const i = this.bubbles.indexOf(b); if (i < 0) return;
    this.bubbles.splice(i, 1);
    if (!b.en) { this.ev('pop', b.x, b.y); if (by && !chained) by.score += 10; return; }
    this.chain = Math.min(8, this.chain + 1); this.chainT = 50;
    const pts = 500 * (1 << (this.chain - 1));
    if (by) by.score += pts;
    this.ev('kill', b.x, b.y, { pts, chain: this.chain, type: b.en.type });
    this.dropFruit(b.x, b.y);
    for (const c of this.bubbles) if (c.en && !c.popAt && Math.hypot(c.x - b.x, c.y - b.y) < 62) { c.popAt = this.t + 7; c.popBy = by ? by.id : 0; }
  }
  dropPower(x, y, idx) {
    if (idx === undefined) idx = Math.floor(this.rnd() * POWERS.length);
    this.items.push({ id: this.nid++, kind: 100 + idx, x: x - 11, y: y - 11, w: 22, h: 22, vx: (this.rnd() - .5) * 2, vy: -4, life: 1000, uses: 1, ground: false, portalCd: 0, apCd: 0 });
  }
  dropFruit(x, y) {
    if (this.rnd() < 0.13) return this.dropPower(x, y);
    const k = this.rnd() < 0.4 ? 5 + Math.floor(this.rnd() * 3) : Math.floor(this.rnd() * 5);
    this.items.push({ id: this.nid++, kind: k, x: x - 11, y: y - 11, w: 22, h: 22, vx: (this.rnd() - .5) * 3, vy: -4, life: FRUITS[k].b ? 1100 : 700, uses: 3, ground: false, portalCd: 0, apCd: 0 });
  }

  // ---------------------------------------------------------------- items (bouncy fruit are springs)
  stepItems() {
    for (let i = this.items.length - 1; i >= 0; i--) {
      const it = this.items[i], F = it.kind >= 100 ? { b: 0 } : FRUITS[it.kind];
      it.life--; if (it.life <= 0) { this.items.splice(i, 1); continue; }
      it.vy = Math.min(MAXFALL, it.vy + 0.34);
      this.moveX(it, it.w, it.h); if (it.hitX) it.vx *= -0.6;
      const vy0 = it.vy; this.moveY(it, it.w, it.h);
      if (it.hitY) {
        if (F.b) it.vy = -Math.max(7.2, vy0 * 0.9);          // keep bouncing high
        else if (vy0 > 2.5) it.vy = -vy0 * 0.35;
        it.vx *= 0.8;
      }
      if (it.ground) it.vx *= 0.85;
      this.holePortal(it, it.w, it.h, 24); this.airPortal(it, it.w, it.h);
    }
  }

  // ---------------------------------------------------------------- enemies
  stepEnemies() {
    for (const e of this.enemies) {
      e.t++;
      if (e.spawnT > 0) { e.spawnT--; continue; }
      if (e.type === 'boss') {
        if (e.hit > 0) e.hit--;
        e.angry = e.hp <= e.hpMax * 0.4;
        if (--e.sumCd <= 0 && this.enemies.length < 8) {            // summons minions
          e.sumCd = e.angry ? 170 : 260;
          for (const k of [-1, 1]) { const d = ENEMY.walk; this.enemies.push({ id: this.nid++, type: 'walk', x: e.x + e.w / 2 + k * 34 - d.w / 2, y: e.y + e.h - d.h, vx: 0, vy: -3, w: d.w, h: d.h, dir: k, ground: false, angry: false, spawnT: 20, jumpCd: 40, t: 0, portalCd: 0, apCd: 0, hp: 0, hpMax: 0, hit: 0, sumCd: 0 }); }
          this.ev('summon', e.x + e.w / 2, e.y);
        }
      }
      const tp = this.nearestPlayer(e.x, e.y), sp = ENEMY[e.type].spd * (e.angry ? 1.75 : 1);
      if (e.type === 'ghost') {
        if (tp) { const dx = tp.x - e.x, dy = tp.y - e.y, d = Math.hypot(dx, dy) || 1; e.vx += (dx / d * sp - e.vx) * 0.04; e.vy += (dy / d * sp - e.vy) * 0.04; }
        e.x += e.vx; e.y += e.vy; continue;
      }
      if (e.type === 'fly') {
        if (tp) { const dx = tp.x - e.x, dy = tp.y - e.y + Math.sin(e.t / 25) * 40, d = Math.hypot(dx, dy) || 1; e.vx += (dx / d * sp - e.vx) * 0.03; e.vy += (dy / d * sp - e.vy) * 0.03; }
        e.x += e.vx; e.y += e.vy;
        if (e.x < TS) { e.x = TS; e.vx = Math.abs(e.vx); } if (e.x + e.w > W - TS) { e.x = W - TS - e.w; e.vx = -Math.abs(e.vx); }
        if (e.y < TS) { e.y = TS; e.vy = Math.abs(e.vy); } if (e.y + e.h > H - TS) { e.y = H - TS - e.h; e.vy = -Math.abs(e.vy); }
        if (e.vx > 0.5) e.dir = 1; else if (e.vx < -0.5) e.dir = -1; continue;
      }
      // ground walkers / hoppers
      e.vy = Math.min(MAXFALL, e.vy + GRAV);
      if (e.ground) {
        e.vx = e.dir * sp;
        const ahead = Math.floor((e.x + (e.dir > 0 ? e.w + 3 : -3)) / TS), below = Math.floor((e.y + e.h + 3) / TS);
        const ac = this.tileAt(ahead, below);
        if (e.turnCd > 0) e.turnCd--;
        if ((ac === '.' || ac === 'o') && !(e.turnCd > 0)) { e.dir *= -1; e.turnCd = 90; }   // committed turn at a ledge, no flip-flopping
        if (e.jumpCd > 0) e.jumpCd--;
        else if (tp) {
          const above = tp.y < e.y - 24, hop = e.type === 'hop';
          if ((above && this.rnd() < 0.03) || (hop && this.rnd() < 0.025)) {
            e.vy = -(hop ? 10.2 : 9.8); e.ground = false; e.jumpCd = 55; if (above || hop) e.dir = tp.x > e.x ? 1 : -1;
          }
        }
      } else e.vx = e.dir * sp;
      this.moveX(e, e.w, e.h); if (e.hitX) { e.dir *= -1; e.turnCd = 90; }
      this.moveY(e, e.w, e.h);
      this.holePortal(e, e.w, e.h, 30); this.airPortal(e, e.w, e.h);
      if (e.y > H + 60) e.y = -e.h;
    }
  }

  // ---------------------------------------------------------------- players vs enemies / items
  playerVsStuff() {
    for (const p of this.players) {
      if (p.dead || p.out) continue;
      for (const e of this.enemies) {
        if (e.spawnT > 0) continue;
        if (p.x + PW - 3 > e.x && p.x + 3 < e.x + e.w && p.y + PH - 3 > e.y && p.y + 3 < e.y + e.h) {
          if (p.shield && e.type === 'boss') {                     // a boss is too heavy to bounce: it shoves you instead
            const s = Math.sign(p.x + PW / 2 - (e.x + e.w / 2)) || 1; p.x += s * 5; p.vx = s * 3;
            this.ev('bonk', p.x + PW / 2, p.y + PH / 2); p.energy = Math.max(0, p.energy - 5);
          } else if (p.shield) {                                   // shield bounces enemies away and stuns them
            const s = Math.sign(e.x + e.w / 2 - (p.x + PW / 2)) || 1; e.dir = s; e.x += s * 4; e.vy = Math.min(e.vy, -3); e.ground = false;
            this.ev('bonk', p.x + PW / 2, p.y + PH / 2); p.energy = Math.max(0, p.energy - 2.5);
          } else if (p.inv <= 0) this.hurtPlayer(p);
        }
      }
      for (let i = this.items.length - 1; i >= 0; i--) {
        const it = this.items[i];
        if (it.kind >= 100) {
          if (p.x + PW > it.x - 3 && p.x < it.x + it.w + 3 && p.y + PH > it.y - 3 && p.y < it.y + it.h + 3) { this.applyPower(p, it.kind - 100); this.items.splice(i, 1); }
          continue;
        }
        const F = FRUITS[it.kind];
        if (p.x + PW > it.x && p.x < it.x + it.w && p.y + PH > it.y && p.y < it.y + it.h) {
          if (F.b && p.vy >= 0 && p.y + PH <= it.y + it.h * 0.65 + p.vy) {   // spring!
            p.vy = -12.4; p.ground = false; it.vy = 3; it.uses--; p.score += 50;
            this.ev('spring', it.x + it.w / 2, it.y);
            if (it.uses <= 0) { p.score += F.pts; this.ev('fruit', it.x + it.w / 2, it.y, { pts: F.pts }); this.items.splice(i, 1); }
          } else if (!F.b || p.vy < 0 || p.y + PH > it.y + it.h * 0.65) {
            p.score += F.pts; this.ev('fruit', it.x + it.w / 2, it.y, { pts: F.pts }); this.items.splice(i, 1);
          }
        }
      }
    }
  }
  applyPower(p, idx) {
    const P = POWERS[idx]; p.score += 300;
    if (idx < 3) p.buf[idx] = P.dur; else { p.energy = SHIELD_MAX; p.shCd = 0; p.inv = Math.max(p.inv, 360); }
    this.ev('power', p.x + PW / 2, p.y, { idx, id: p.id });
  }
  hurtPlayer(p) {
    p.dead = 1; p.vy = -7; p.shield = false; p.lives--; p.anim = 0;
    this.ev('hurt', p.x + PW / 2, p.y + PH / 2);
    if (p.lives <= 0) p.out = true;
  }

  hurryCheck() {
    const lim = this.level.boss ? 5400 : 1800;
    if (this.hurry === 0 && this.lt > lim && this.enemies.length + this.pending.length > 0) {
      this.hurry = 1; this.ev('hurry', W / 2, H / 2);
      for (const e of this.enemies) e.angry = true;
    }
    if (this.hurry === 1 && this.lt > lim + 900) {
      this.hurry = 2;
      const d = ENEMY.ghost; this.enemies.push({ id: this.nid++, type: 'ghost', x: -40, y: H / 2, vx: 0, vy: 0, w: d.w, h: d.h, dir: 1, ground: false, angry: true, spawnT: 0, jumpCd: 0, t: 0, portalCd: 0, apCd: 0 });
    }
  }

  checkEnd() {
    if (this.players.every(p => p.out)) { this.state = 'over'; this.stateT = 0; this.ev('over', W / 2, H / 2); return; }
    const foes = this.enemies.filter(e => e.type !== 'ghost').length + this.pending.length + this.bubbles.filter(b => b.en).length;
    if (foes === 0 && this.lt > 60) {
      this.state = 'clear'; this.stateT = 0; this.ev('clear', W / 2, H / 2);
      this.enemies.length = 0;
      for (const b of this.bubbles) { if (!b.en) { b.life = Math.min(b.life, 30); } }
    }
  }
}
