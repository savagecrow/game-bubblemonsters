// usage: node dev/dbg.js <stage number>   prints the validated stage map + enemies
const fs = require('fs'), path = require('path');
const src = ['levels.js', 'sim.js', 'reach.js'].map(f => fs.readFileSync(path.join(__dirname, '..', 'js', f), 'utf8')).join('\n');
const lib = new Function(src + '\nreturn {Sim,getLevel,IN,TS,COLS,ROWS,PW,PH};')();
const n = +(process.argv[2] || 10) - 1; const L = lib.getLevel(n);
console.log(L.name, 'attempt', L.attempt, 'boss', L.boss);
console.log(L.map.map((r, i) => String(i).padStart(2) + ' ' + r).join('\n'));
console.log('portals', JSON.stringify(L.portals), 'enemies', JSON.stringify(L.enemies));
