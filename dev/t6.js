(async function () {
  const b = window.__bb, s = b.sim, sleep = ms => new Promise(r => setTimeout(r, ms));
  const R = {}; await sleep(2500);
  R.stage0 = s.level.name; R.foes = s.enemies.length;
  // clear the stage the way a player would: all monsters gone
  s.enemies.length = 0; s.pending.length = 0; s.bubbles.length = 0;
  await sleep(500); R.stateAfterClear = s.state;
  await sleep(3000); R.nextStage = s.level.name; R.stateNext = s.state; R.enemiesNext = s.enemies.length + s.pending.length;
  // lose every life
  const p = s.players[0]; p.inv = 0; p.lives = 1; p.dead = 0;
  s.enemies.push({ id: 990, type: 'walk', x: p.x, y: p.y, vx: 0, vy: 0, w: 26, h: 26, dir: 1, ground: true, angry: false, spawnT: 0, jumpCd: 99, t: 0, portalCd: 0, apCd: 0, hp: 0, hpMax: 0, hit: 0, sumCd: 0 });
  await sleep(3500);
  R.stateAfterDeath = s.state; R.dialogShown = document.getElementById('dialog').classList.contains('on'); R.dialogTitle = document.getElementById('dtitle').textContent;
  R.hi = localStorage.getItem('bubdrag.hi');
  return JSON.stringify(R);
})()
