// Reports stage validity. usage: node dev/reach.js [levels=60]
const fs = require('fs'), path = require('path');
const src = ['levels.js', 'sim.js', 'reach.js'].map(f => fs.readFileSync(path.join(__dirname, '..', 'js', f), 'utf8')).join('\n');
const lib = new Function(src + '\nreturn {Sim,getLevel,genLevel,levelCheck};')();
const N = +(process.argv[2] || 60);
let bad = 0, retried = 0, t0 = Date.now();
for (let n = 0; n < N; n++) {
  const L = lib.getLevel(n), r = lib.levelCheck(L);
  if (L.attempt > 0) retried++;
  if (!r.ok) { bad++; console.log(`L${n + 1} STILL BAD (attempt ${L.attempt}): unreachable ${r.unreachable.map(i => `r${r.S[i].r}[${r.S[i].a}-${r.S[i].b}]`).join(' ')} enemies ${r.enemyBad.length} p2ok ${r.p2ok}`); }
}
console.log(`${N} levels: ${bad} still invalid, ${retried} needed regeneration, ${(Date.now() - t0)}ms total`);
