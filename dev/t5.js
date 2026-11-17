(async function () {
  const b = window.__bb, k = b.keys, s = b.sim, sleep = ms => new Promise(r => setTimeout(r, ms));
  await sleep(1800);
  const boss = s.enemies.find(e => e.type === 'boss'), p = s.players[0];
  const R = { stage: s.level.name, bossHp0: boss.hp, hpMax: boss.hpMax, bossSize: [boss.w, boss.h] };
  p.inv = 9999;
  p.x = boss.x - 110; p.y = boss.y + boss.h - PH; p.vy = 0; p.face = 1; p.buf[2] = 900;   // rapid fire
  s.dropPower(p.x + 40, p.y - 10, 1); s.dropPower(p.x + 70, p.y - 30, 3);
  k.KeyJ = true; await sleep(1700); k.KeyJ = false;
  const b2 = s.enemies.find(e => e.type === 'boss');
  R.bossHp1 = b2 ? b2.hp : 'dead'; R.items = s.items.length; R.enemies = s.enemies.length; R.score = p.score;
  return JSON.stringify(R);
})()
