// Levels: 30 x 20 tiles of 32px = 960 x 640. Generated per level number so stages are endless and identical
// for both online players.
//  #  solid block   =  one-way platform (jump up through, land on top)   o  floor/ceiling bubble-teleporter hole
//  1 / 2  player spawns
const TS = 32, COLS = 30, ROWS = 20, W = COLS * TS, H = ROWS * TS;
const PLAT_ROWS = [16, 13, 10, 7, 4];            // 3 tiles apart: every platform is one jump above the next

function mulberry(a) { return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

function genLevel(n, attempt = 0) {
  const R = mulberry(0x9E3779B1 * (n + 1) + attempt * 7919);
  const ri = (a, b) => a + Math.floor(R() * (b - a + 1));
  const grid = [];
  for (let y = 0; y < ROWS; y++) { const row = []; for (let x = 0; x < COLS; x++) row.push(x === 0 || x === COLS - 1 || y === 0 || y === ROWS - 1 ? '#' : '.'); grid.push(row); }
  // portal holes in floor + ceiling (same columns, so falling out of one comes back in from the other)
  const hw = n === 0 ? 4 : ri(2, 5), hc = n === 0 ? 14 : (R() < 0.5 ? 14 : ri(6, 10));
  const holes = [[hc - Math.floor(hw / 2), hc - Math.floor(hw / 2) + hw - 1]];
  if (n >= 3 && R() < 0.6) { const a = holes[0][0], b = holes[0][1]; const m0 = COLS - 1 - b, m1 = COLS - 1 - a; if (m0 > b + 2) holes.push([m0, m1]); }
  for (const [a, b] of holes) for (let x = a; x <= b; x++) { grid[0][x] = 'o'; grid[ROWS - 1][x] = 'o'; }
  const mirror = (r, a, b) => { for (let x = a; x <= b; x++) { grid[r][x] = '='; grid[r][COLS - 1 - x] = '='; } };
  const segs = {};
  let prev = -1;
  for (const r of PLAT_ROWS) {
    let pat; do { pat = n === 0 ? [1, 0, 1, 0, 1][PLAT_ROWS.indexOf(r)] : ri(0, 4); } while (pat === prev && R() < 0.8);
    prev = pat;
    const s = [];
    if (pat === 0) { const w = ri(5, 8); mirror(r, 1, w); s.push([1, w]); }                                   // wide side shelves
    else if (pat === 1) { const o = ri(2, 4), w = ri(4, 7); mirror(r, o, o + w - 1); s.push([o, o + w - 1]); } // floating side segments
    else if (pat === 2) { const c0 = 14 - ri(3, 6); for (let x = c0; x <= COLS - 1 - c0; x++) grid[r][x] = '='; s.push([c0, COLS - 1 - c0]); } // centre bar
    else if (pat === 3) { const w = ri(3, 5); mirror(r, 1, w); const c0 = 14 - ri(1, 3); for (let x = c0; x <= COLS - 1 - c0; x++) grid[r][x] = '='; s.push([1, w]); s.push([c0, COLS - 1 - c0]); }
    else { mirror(r, 1, ri(9, 12)); s.push([1, 10]); }                                                         // near-full with centre gap
    segs[r] = s;
  }
  // keep hole columns clear of anything solid that would block the teleporter exit
  for (const [a, b] of holes) for (let r = 1; r <= 3; r++) for (let x = a; x <= b; x++) grid[r][x] = '.';
  grid[ROWS - 2][3] = '1'; grid[ROWS - 2][COLS - 4] = '2';

  // free-floating bubble teleporter pair (from level 3): rest on two different platforms
  const portals = [];
  if (n >= 3 && n % 3 !== 1) {
    const rows = PLAT_ROWS.filter(r => r < 16);
    const ra = rows[ri(0, rows.length - 1)]; let rb; do { rb = rows[ri(0, rows.length - 1)]; } while (rb === ra);
    const tileOn = r => { const xs = []; for (let x = 2; x < COLS - 2; x++) if (grid[r][x] === '=') xs.push(x); return xs; };
    const xa = tileOn(ra), xb = tileOn(rb);
    if (xa.length && xb.length) {
      const ax = xa[Math.floor(xa.length * 0.25)], bx = xb[Math.floor(xb.length * 0.75)];
      portals.push({ x: ax * TS + TS / 2, y: ra * TS - 24, r: 28, to: 1 }, { x: bx * TS + TS / 2, y: rb * TS - 24, r: 28, to: 0 });
    }
  }

  // enemies stand on platforms or the floor
  const spots = [];
  for (const r of [...PLAT_ROWS, ROWS - 1]) for (let x = 1; x < COLS - 1; x++) if ((grid[r][x] === '=' || (r === ROWS - 1 && grid[r][x] === '#')) && grid[r - 1][x] === '.' && !portals.some(p => Math.abs(p.x - (x * TS + TS / 2)) < 50 && Math.abs(p.y - r * TS) < 60)) spots.push([x, r - 1]);
  const count = n === 0 ? 3 : Math.min(13, 4 + Math.floor(n * 0.7));
  const enemies = [];
  for (let i = 0; i < count && spots.length; i++) {
    const s = spots.splice(Math.floor(R() * spots.length), 1)[0];
    const roll = R(); let t = 'walk';
    if (n >= 2 && roll < 0.3) t = 'hop';
    if (n >= 4 && roll > 0.82) t = 'fly';
    enemies.push({ t, x: s[0], y: s[1] });
  }
  const boss = (n + 1) % 5 === 0;
  if (boss) {                                                  // boss stage: one big monster on the widest platform + a few minions
    let best = null;
    for (const r of PLAT_ROWS) for (const [a, b] of segs[r]) { const real = (() => { let x0 = a, x1 = b; while (x0 > 1 && grid[r][x0 - 1] === '=') x0--; while (x1 < COLS - 2 && grid[r][x1 + 1] === '=') x1++; return [x0, x1]; })(); if (!best || real[1] - real[0] > best.w) best = { r, w: real[1] - real[0], x: Math.floor((real[0] + real[1]) / 2) }; }
    enemies.length = Math.min(enemies.length, 2);
    enemies.unshift({ t: 'boss', x: best.x, y: best.r - 1 });
  }
  return { n, name: boss ? 'Boss Stage ' + (n + 1) : 'Stage ' + (n + 1), theme: Math.floor(n / 3) % 4, map: grid.map(r => r.join('')), enemies, portals, boss };
}

// Every stage is validated with the real physics (js/reach.js) and regenerated until all platforms and enemy
// spawns are reachable. Deterministic, so host and guest always build the identical stage.
const _lv = {};
function getLevel(i) {
  if (_lv[i]) return _lv[i];
  let best = null, bestBad = 1e9;
  for (let a = 0; a < 14; a++) {
    const L = genLevel(i, a);
    if (typeof levelCheck === 'undefined') { best = L; break; }
    const r = levelCheck(L), bad = r.unreachable.length + r.enemyBad.length * 3 + (r.p2ok ? 0 : 5);
    L.attempt = a;
    if (bad < bestBad) { best = L; bestBad = bad; }
    if (r.ok) break;
  }
  best.bad = bestBad;
  return (_lv[i] = best);
}
