(async function () {
  const b = window.__bb, k = b.keys, s = b.sim, sleep = ms => new Promise(r => setTimeout(r, ms));
  const R = {}; const p = s.players[0];
  await sleep(300);
  s.pending.length = 0; s.enemies.length = 0; s.lt = 0;          // quiet stage for the tests; stop level clear firing
  s.enemies.push({ id: 900, type: 'walk', x: 5, y: 5, vx: 0, vy: 0, w: 26, h: 26, dir: 1, ground: true, angry: false, spawnT: 0, jumpCd: 999, t: 0, portalCd: 0, apCd: 0 });
  s.enemies[0].x = -999; s.enemies[0].y = -999;                  // parked far away so the stage never counts as clear
  // 1. stand on a floating empty bubble
  s.bubbles.push({ id: 901, own: 0, x: 480, y: 300, vx: 0, vy: -0.7, r: 17, st: 'float', age: 100, life: 9999, en: null, squish: 0, look: 0, ph: 0 });
  p.x = 470; p.y = 200; p.vy = 0; p.vx = 0; p.inv = 9999;
  await sleep(700);
  R.standOnBubble = { onB: p.onB, ground: p.ground, bubbleStillThere: s.bubbles.some(x => x.id === 901) };
  // jump off it: higher than normal
  k.Space = true; await sleep(40); k.Space = false; await sleep(30);
  R.jumpFromBubble = { vy: +p.vy.toFixed(2) };
  s.bubbles.length = 0; await sleep(600);
  // 2. pop a trapped bubble from the side: enemy dies, fruit drops, score rises
  const sc0 = p.score;
  p.x = 300; p.y = 560 - PH + 32 - 32; p.vy = 0; await sleep(300);
  s.bubbles.push({ id: 902, own: 0, x: p.x + 40, y: p.y + 10, vx: 0, vy: 0, r: 25, st: 'float', age: 100, life: 9999, en: { type: 'walk', angry: false }, squish: 0, look: 0, ph: 0 });
  k.KeyD = true; await sleep(400); k.KeyD = false; await sleep(100);
  R.popTrapped = { scoreGain: p.score - sc0, items: s.items.length, bubblesLeft: s.bubbles.length };
  // 3. bouncy fruit spring
  s.items.length = 0;
  p.x = 700; p.y = 560 - 40; p.vy = 0; p.vx = 0; await sleep(400);
  s.items.push({ id: 903, kind: 5, x: p.x, y: p.y + PH + 30, w: 22, h: 22, vx: 0, vy: 0, life: 9999, uses: 3, ground: false, portalCd: 0, apCd: 0 });
  let peak = p.y; for (let i = 0; i < 90; i++) { await sleep(16); peak = Math.min(peak, p.y); }
  R.springFruit = { risePx: Math.round((560 - 40) - peak), usesLeft: (s.items[0] || {}).uses };
  s.items.length = 0;
  // 4. shield: enemy touching does not hurt
  p.x = 200; p.y = 560 - 20; p.vy = 0; p.inv = 0; p.dead = 0; await sleep(300);
  s.enemies.push({ id: 904, type: 'walk', x: p.x + 10, y: p.y, vx: 0, vy: 0, w: 26, h: 26, dir: 1, ground: true, angry: false, spawnT: 0, jumpCd: 999, t: 0, portalCd: 0, apCd: 0 });
  k.KeyK = true; await sleep(500);
  R.shield = { alive: !p.dead, shieldOn: p.shield, energy: Math.round(p.energy) };
  k.KeyK = false; s.enemies = s.enemies.filter(x => x.id !== 904);
  // 5. portal hole in floor: fall in, come out of the ceiling
  const hole = s.level.map[19].indexOf('o');
  p.x = hole * TS + 40; p.y = 540; p.vy = 3; p.inv = 9999; p.dead = 0;
  let minY = 1e9, wrapped = false; const y0 = p.y;
  for (let i = 0; i < 80; i++) { await sleep(16); if (p.y < 80) wrapped = true; }
  R.holePortal = { wrapped, y: Math.round(p.y) };
  // 6. no shield + enemy = hurt
  p.x = 200; p.y = 560 - 20; p.vy = 0; p.inv = 0; p.dead = 0; await sleep(300);
  const lives0 = p.lives;
  s.enemies.push({ id: 905, type: 'walk', x: p.x + 4, y: p.y, vx: 0, vy: 0, w: 26, h: 26, dir: 1, ground: true, angry: false, spawnT: 0, jumpCd: 999, t: 0, portalCd: 0, apCd: 0 });
  await sleep(200);
  R.hurt = { livesLost: lives0 - p.lives, dead: p.dead };
  return JSON.stringify(R);
})()
