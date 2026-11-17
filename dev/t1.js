(async function () {
  const b = window.__bb, k = b.keys, sleep = ms => new Promise(r => setTimeout(r, ms));
  // walk right, shoot a few bubbles, jump
  k.KeyD = true; await sleep(700); k.KeyD = false;
  k.KeyJ = true; await sleep(120); k.KeyJ = false; await sleep(250);
  k.KeyJ = true; await sleep(120); k.KeyJ = false; await sleep(400);
  k.Space = true; await sleep(300); k.Space = false;
  return JSON.stringify({ p: b.sim.players[0].x | 0, bubbles: b.sim.bubbles.length, enemies: b.sim.enemies.length });
})()
