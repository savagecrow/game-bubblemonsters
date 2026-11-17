(async function () {
  const b = window.__bb, k = b.keys, s = b.sim, sleep = ms => new Promise(r => setTimeout(r, ms));
  const p = s.players[0]; await sleep(300);
  s.pending.length = 0; s.enemies.length = 0; s.lt = 0;
  s.enemies.push({ id: 900, type: 'walk', x: -999, y: -999, vx: 0, vy: 0, w: 26, h: 26, dir: 1, ground: true, angry: false, spawnT: 0, jumpCd: 999, t: 0, portalCd: 0, apCd: 0 });
  // a column with a solid floor and nothing above it
  let col = -1;
  for (let c = 2; c < COLS - 2 && col < 0; c++) { let ok = s.level.map[19][c] === '#'; for (let r = 1; r < 19; r++) if (s.level.map[r][c] !== '.' && s.level.map[r][c] !== '1' && s.level.map[r][c] !== '2') ok = false; if (ok) col = c; }
  p.inv = 9999; p.x = col * TS + 4; p.y = 300; p.vy = 0; p.vx = 0;
  s.items.push({ id: 903, kind: 5, x: col * TS + 4, y: 585, w: 22, h: 22, vx: 0, vy: 0, life: 9999, uses: 3, ground: true, portalCd: 0, apCd: 0 });
  let peak = 1e9, bounces = 0, prevVy = 0;
  for (let i = 0; i < 200; i++) { await sleep(16); if (prevVy > 0 && p.vy < -10) bounces++; prevVy = p.vy; if (i > 20) peak = Math.min(peak, p.y); }
  const res = { col, springPeakY: Math.round(peak), springBounces: bounces, itemUses: (s.items[0] || {}).uses, score: p.score };
  // normal jump height for comparison
  p.x = col * TS + 4; p.y = 580; p.vy = 0; await sleep(300);
  const y0 = p.y; let jp = y0; k.Space = true; for (let i = 0; i < 70; i++) { await sleep(16); jp = Math.min(jp, p.y); } k.Space = false;
  res.normalJumpRise = Math.round(y0 - jp);
  return JSON.stringify(res);
})()
