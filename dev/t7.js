(async function () {
  const b = window.__bb, k = b.keys, s = b.sim, sleep = ms => new Promise(r => setTimeout(r, ms));
  const p = s.players[0]; await sleep(300);
  s.pending.length = 0; s.enemies.length = 0; s.lt = 0; p.inv = 9999;
  s.enemies.push({ id: 900, type: 'walk', x: -999, y: -999, vx: 0, vy: 0, w: 26, h: 26, dir: 1, ground: true, angry: false, spawnT: 0, jumpCd: 999, t: 0, portalCd: 0, apCd: 0, hp: 0, hpMax: 0, hit: 0, sumCd: 0 });
  // find a platform tile on row 16 with open air to the floor below it
  let col = -1; for (let c = 2; c < COLS - 2; c++) if (s.level.map[16][c] === '=' && s.level.map[17][c] === '.') { col = c; break; }
  p.x = col * TS + 4; p.y = 16 * TS - PH; p.vy = 0; p.vx = 0; await sleep(300);
  const R = { onPlatformY: Math.round(p.y + PH), ground: p.ground };
  k.KeyS = true; await sleep(30); k.Space = true; await sleep(60); k.Space = false; k.KeyS = false;
  await sleep(700);
  R.afterDropFeetY = Math.round(p.y + PH); R.floorY = 19 * TS; R.droppedToFloor = Math.abs(p.y + PH - 19 * TS) < 2;
  // plain jump without S must NOT drop
  p.x = col * TS + 4; p.y = 16 * TS - PH; p.vy = 0; await sleep(300);
  k.Space = true; await sleep(80); k.Space = false; await sleep(80);
  R.plainJumpGoesUp = p.y + PH < 16 * TS;
  return JSON.stringify(R);
})()
