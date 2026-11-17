(async function () {
  const b = window.__bb, k = b.keys, s = b.sim, sleep = ms => new Promise(r => setTimeout(r, ms));
  const p = s.players[0]; await sleep(300);
  s.pending.length = 0; s.enemies.length = 0; p.inv = 9999;
  // walk right, then jump, snapshot happens after this script returns (mid-jump)
  k.KeyD = true; await sleep(450); k.Space = true; await sleep(250);
  return JSON.stringify({ x: p.x, y: p.y, vy: p.vy, ground: p.ground });
})()
