// Headless playtest: loads the real levels.js + sim.js in Node and drives player 0 with a crude bot.
// usage: node dev/bot.js [levels=24] [maxFrames=7200] [players=1]
const fs = require('fs'), path = require('path');
const src = ['levels.js', 'sim.js', 'reach.js'].map(f => fs.readFileSync(path.join(__dirname, '..', 'js', f), 'utf8')).join('\n');
const lib = new Function(src + '\nreturn {Sim,getLevel,IN,TS,COLS,ROWS,PW,PH,W,H,PLAT_ROWS};')();
const { Sim, getLevel, IN, TS, COLS, ROWS, PW, PH, W, H } = lib;
const N = +(process.argv[2] || 24), MAXF = +(process.argv[3] || 7200), NP = +(process.argv[4] || 1);

function botInput(sim, p) {
  if (p.dead) return 0;
  const cx = p.x + PW / 2, cy = p.y + PH / 2;
  let tgt = null, bd = 1e9, kind = '';
  for (const e of sim.enemies) { if (e.type === 'ghost' || e.spawnT > 0) continue; const d = Math.abs(e.x - p.x) + Math.abs(e.y - p.y) * 1.5; if (d < bd) { bd = d; tgt = e; kind = 'en'; } }
  for (const b of sim.bubbles) if (b.en) { const d = Math.abs(b.x - cx) + Math.abs(b.y - cy) * 1.2 - 80; if (d < bd) { bd = d; tgt = b; kind = 'bub'; } }
  for (const it of sim.items) { const d = Math.abs(it.x - cx) + Math.abs(it.y - cy) - 40; if (d < bd * 0.6 && !(it.kind >= 5)) { bd = d; tgt = it; kind = 'item'; } }
  if (!tgt) return 0;
  let m = 0;
  const tx = kind === 'en' ? tgt.x + tgt.w / 2 : kind === 'item' ? tgt.x + 11 : tgt.x, ty = kind === 'en' ? tgt.y + tgt.h / 2 : kind === 'item' ? tgt.y + 11 : tgt.y;
  const dx = tx - cx, dy = ty - cy;
  if (kind === 'en') {
    if (Math.abs(dy) < 26 && Math.abs(dx) < 190) { m |= dx > 0 ? IN.R : IN.L; if (Math.abs(dx) > 40) { } m = (dx > 0 ? IN.R : IN.L) & 0; p.face = dx > 0 ? 1 : -1; m |= (sim.t % 20 < 3) ? IN.SHOOT : 0; if (Math.abs(dx) > 150) m |= dx > 0 ? IN.R : IN.L; return m; }
  }
  if (Math.abs(dx) > 14) m |= dx > 0 ? IN.R : IN.L;
  if (dy < -30 && p.ground && sim.t % 7 < 2) m |= IN.JUMP;
  if (dy < -30 && !p.ground) m |= IN.JUMP;
  if (kind === 'bub' && Math.abs(dx) < 40 && dy < 0 && p.ground) m |= IN.JUMP;
  if (kind === 'en' && dy > 30 && Math.abs(dx) < 30) { /* walk off */ m |= dx >= 0 ? IN.R : IN.L; }
  if (sim.enemies.some(e => e.type !== 'ghost' && e.spawnT <= 0 && Math.abs(e.x - p.x) < 40 && Math.abs(e.y - p.y) < 30)) m |= IN.SHIELD;
  return m;
}

let cleared = 0, totalFrames = 0, deaths = 0; const rows = [];
for (let n = 0; n < N; n++) {
  const sim = new Sim(n, 777 + n, NP);
  for (const p of sim.players) p.lives = 99;
  let f = 0, clearF = -1, hurryF = -1, lives0 = sim.players.reduce((a, p) => a + p.lives, 0);
  while (f < MAXF) {
    const inp = sim.players.map(p => botInput(sim, p));
    sim.step(inp); f++;
    if (sim.hurry && hurryF < 0) hurryF = f;
    if (sim.state === 'clear') { clearF = f; break; }
  }
  const lost = lives0 - sim.players.reduce((a, p) => a + p.lives, 0);
  if (clearF > 0) cleared++; totalFrames += (clearF > 0 ? clearF : MAXF); deaths += lost;
  rows.push(`L${String(n + 1).padStart(2)} ${clearF > 0 ? 'clear ' + (clearF / 60).toFixed(0).padStart(3) + 's' : 'FAIL        '} foes=${getLevel(n).enemies.length} lost=${lost}${hurryF > 0 ? ' hurry@' + (hurryF / 60 | 0) + 's' : ''}${getLevel(n).portals.length ? ' portals' : ''}`);
}
console.log(rows.join('\n'));
console.log(`cleared ${cleared}/${N}, avg ${(totalFrames / N / 60).toFixed(0)}s per level, lives lost ${deaths}`);
