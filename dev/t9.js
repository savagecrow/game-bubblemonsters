(async function () {
  const b = window.__bb, s = b.sim, sleep = ms => new Promise(r => setTimeout(r, ms));
  await sleep(300); s.pending.length = 0; s.enemies.length = 0;
  s.players[0].inv = 0; s.players[0].mouth = 9999;   // green: shoot frame
  s.players[1].mouth = 9999;                          // blue: shoot frame
  return 'ok';
})()
