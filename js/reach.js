// Level validation with the REAL player physics: from every standing spot on every surface, try walking off,
// jumping (several hold lengths, left/right/straight) and dropping through platforms, then BFS from the spawn.
// Used by levels.js to reject stages with unreachable platforms / enemy spawns, and by dev/reach.js.
function levelSurfaces(L) {
  const S = [], ok = ch => ch === '.' || ch === '1' || ch === '2';
  for (let r = 1; r < ROWS; r++) {
    let a = -1;
    for (let c = 0; c <= COLS; c++) {
      const ch = c < COLS ? L.map[r][c] : '.';
      const stand = (ch === '#' || ch === '=') && ok(L.map[r - 1][Math.min(c, COLS - 1)]);
      if (stand && a < 0) a = c;
      if (!stand && a >= 0) { S.push({ r, a, b: c - 1 }); a = -1; }
    }
  }
  return S;
}

function levelCheck(L) {
  const sim = Object.create(Sim.prototype);
  Object.assign(sim, { level: L, bubbles: [], enemies: [], items: [], events: [], players: [], t: 0, nid: 1, chain: 0, chainT: 0, seed: 1 });
  const S = levelSurfaces(L);
  const surfAt = (x, y) => { const r = Math.round((y + PH) / TS), c = Math.floor((x + PW / 2) / TS); return S.findIndex(s => s.r === r && c >= s.a && c <= s.b); };
  const p = { id: 0, x: 0, y: 0, vx: 0, vy: 0, face: 1, lives: 3, score: 0 };
  const reset = (x, y) => Object.assign(p, { x, y, vx: 0, vy: 0, ground: true, prev: 0, coyote: 0, jumpBuf: 0, onB: 0, portalCd: 0, apCd: 0, dead: 0, inv: 0, shield: false, energy: 200, shCd: 0, shootCd: 0, drop: 0, mouth: 0, anim: 0, out: false, buf: [0, 0, 0] });
  const edges = S.map(() => new Set());
  S.forEach((s, i) => {
    for (let sx = s.a * TS - PW / 2; sx <= (s.b + 1) * TS - PW / 2; sx += 8) {
      for (const dir of [-1, 0, 1]) for (const mode of [0, 6, 14, 60, -1]) {   // mode: jump hold frames, -1 = drop through
        if (mode === 0 && dir === 0) continue;
        reset(sx, s.r * TS - PH);
        let landed = -1;
        for (let f = 0; f < 150; f++) {
          let m = dir < 0 ? IN.L : dir > 0 ? IN.R : 0;
          if (mode > 0 && f < mode) m |= IN.JUMP;
          if (mode < 0 && f === 0) m |= IN.JUMP | IN.SHIELD;
          sim.stepPlayer(p, m);
          if (f > 3 && p.ground) { const k = surfAt(p.x, p.y); if (k >= 0 && k !== i) { landed = k; break; } if (k === i && f > 24) break; }
        }
        if (landed >= 0) edges[i].add(landed);
      }
    }
  });
  const spawn = n => { const [x, y] = Sim.prototype.spawnPoint.call(sim, n); return surfAt(x, y); };
  const start = spawn(0), seen = new Set([start]), q = [start];
  while (q.length) { const i = q.shift(); for (const k of edges[i]) if (!seen.has(k)) { seen.add(k); q.push(k); } }
  const unreachable = S.map((s, i) => i).filter(i => !seen.has(i));
  const enemyBad = L.enemies.filter(e => { const k = S.findIndex(s => s.r === e.y + 1 && e.x >= s.a && e.x <= s.b); return k >= 0 && !seen.has(k); });
  // player 2 must be able to rejoin: its spawn surface must be reachable from player 1 as well
  const p2ok = seen.has(spawn(1));
  return { S, unreachable, enemyBad, p2ok, ok: unreachable.length === 0 && enemyBad.length === 0 && p2ok };
}
