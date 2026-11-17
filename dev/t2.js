(async function () {
  const b = window.__bb, k = b.keys, s = b.sim, sleep = ms => new Promise(r => setTimeout(r, ms));
  await sleep(2500);                                    // let every enemy spawn
  const log = [];
  const p = s.players[0];
  const e = s.enemies.find(x => x.ground) || s.enemies[0];
  // stand 90px to the left of an enemy on its platform, facing it
  p.x = e.x - 90; p.y = e.y + e.h - PH; p.vy = 0; p.face = 1;
  await sleep(50);
  k.KeyJ = true; await sleep(100); k.KeyJ = false; await sleep(600);
  log.push('bubbles=' + s.bubbles.length + ' trapped=' + s.bubbles.filter(x => x.en).length + ' enemies=' + s.enemies.length);
  window.__log = log;
  return log.join(' | ');
})()
