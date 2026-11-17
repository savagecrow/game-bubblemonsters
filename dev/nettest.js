// Two-tab online test in ONE headless Chrome: tab A hosts, tab B joins by code. Checks inputs + snapshots flow.
// usage: node dev/nettest.js
const { spawn } = require('child_process'), fs = require('fs'), os = require('os'), path = require('path');
const root = path.resolve(__dirname, '..');
const chrome = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const port = 9300 + Math.floor(Math.random() * 400);
const prof = fs.mkdtempSync(path.join(os.tmpdir(), 'bb-net-'));
const proc = spawn(chrome, ['--headless=new', '--remote-debugging-port=' + port, '--user-data-dir=' + prof, '--window-size=1152,768', '--hide-scrollbars', '--no-first-run', '--allow-file-access-from-files', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows', 'about:blank'], { stdio: 'ignore' });
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function open(url) {
  const t = await (await fetch(`http://127.0.0.1:${port}/json/new?${encodeURIComponent(url)}`, { method: 'PUT' })).json();
  const ws = new WebSocket(t.webSocketDebuggerUrl); await new Promise(r => ws.onopen = r);
  let id = 0; const pend = {}, errs = [];
  ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && pend[m.id]) { pend[m.id](m.result || m.error); delete pend[m.id]; }
    if (m.method === 'Runtime.exceptionThrown') errs.push(m.params.exceptionDetails.exception ? m.params.exceptionDetails.exception.description : m.params.exceptionDetails.text);
    if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') errs.push(m.params.args.map(a => a.value || a.description).join(' ')); };
  const send = (method, params) => new Promise(r => { const i = ++id; pend[i] = r; ws.send(JSON.stringify({ id: i, method, params })); });
  await send('Runtime.enable'); await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 1152, height: 768, deviceScaleFactor: 1, mobile: false });
  await send('Emulation.setFocusEmulationEnabled', { enabled: true });
  const ev = async ex => { const r = await send('Runtime.evaluate', { expression: ex, awaitPromise: true, returnByValue: true }); return r.result ? r.result.value : r; };
  const shot = async f => { const s = await send('Page.captureScreenshot', { format: 'png' }); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, Buffer.from(s.data, 'base64')); };
  return { ev, shot, errs, close: () => ws.close() };
}
(async () => {
  const url = 'file:///' + root.replace(/\\/g, '/') + '/index.html';
  for (let i = 0; i < 60; i++) { try { await (await fetch(`http://127.0.0.1:${port}/json/version`)).json(); break; } catch (e) { await sleep(250); } }
  const A = await open(url), B = await open(url);
  await sleep(1500);
  await A.ev(`document.querySelector('[data-m=online]').click(); document.getElementById('onhost').click()`);
  let code = ''; for (let i = 0; i < 40 && !code; i++) { await sleep(500); code = await A.ev(`document.getElementById('oncode').textContent`); }
  console.log('room code:', code || '(none - no matchmaking server reachable?)', await A.ev(`document.getElementById('onstatus').textContent`));
  if (!code) throw new Error('no code');
  await B.ev(`document.querySelector('[data-m=online]').click(); document.getElementById('onin').value='${code}'; document.getElementById('onjoin').click()`);
  let ok = false; for (let i = 0; i < 40 && !ok; i++) { await sleep(500); ok = await B.ev(`!!(window.__bb.sim && window.__bb.mode==='guest' && window.__bb.sim.players.length===2 && window.__bb.sim.state==='play')`); }
  console.log('guest in game:', ok, '| host mode:', await A.ev(`window.__bb.mode`));
  if (!ok) throw new Error('guest never entered the game');
  await sleep(1500);
  const pos = async () => ({ hostSees: JSON.parse(await A.ev(`JSON.stringify(window.__bb.sim.players.map(p=>[Math.round(p.x),Math.round(p.y)]))`)), guestSees: JSON.parse(await B.ev(`JSON.stringify(window.__bb.sim.players.map(p=>[Math.round(p.x),Math.round(p.y)]))`)) });
  console.log('start  ', JSON.stringify(await pos()));
  // guest holds LEFT for 1s: guest dragon (blue) should walk left on BOTH screens
  const gx0 = await B.ev(`window.__bb.sim.players[1].x`);
  await B.ev(`window.__bb.keys.KeyA=true`); await sleep(70);
  const gx1 = await B.ev(`window.__bb.sim.players[1].x`), hx1 = await A.ev(`window.__bb.sim.players[1].x`);
  console.log(`70ms after keypress: guest's own dragon moved ${(gx0 - gx1).toFixed(1)}px locally; host-side dragon moved ${(gx0 - hx1).toFixed(1)}px`);
  await sleep(930); await B.ev(`window.__bb.keys.KeyA=false`); await sleep(900);
  console.log('after guest walks left (settled):', JSON.stringify(await pos()));
  // jump + land: positions must agree afterwards
  await B.ev(`window.__bb.keys.Space=true`); await sleep(120); await B.ev(`window.__bb.keys.Space=false`); await sleep(1200);
  console.log('after guest jump (settled):   ', JSON.stringify(await pos()));
  // host holds RIGHT 1s
  await A.ev(`window.__bb.keys.KeyD=true`); await sleep(800); await A.ev(`window.__bb.keys.KeyD=false`); await sleep(300);
  console.log('after host walks right:', JSON.stringify(await pos()));
  // guest shoots + jumps: bubbles must appear on both
  await B.ev(`window.__bb.keys.KeyJ=true`); await sleep(150); await B.ev(`window.__bb.keys.KeyJ=false`); await sleep(400);
  console.log('bubbles host/guest:', await A.ev(`window.__bb.sim.bubbles.length`), await B.ev(`window.__bb.sim.bubbles.length`),
    '| enemies host/guest:', await A.ev(`window.__bb.sim.enemies.length`), await B.ev(`window.__bb.sim.enemies.length`));
  // ---- laggy link: 80ms each way (160ms RTT) ----
  // 80ms each way + 20ms random jitter + 25% loss on the fast channel (the reliable one is left alone, as TCP would hide loss as delay)
  const lag = `(function(){const s=NET.sendFast.bind(NET);window.__sf=s;NET.sendFast=function(m){if(window.__dead||Math.random()<0.25)return;setTimeout(function(){s(m)},80+Math.random()*20)};return 1})()`;
  await A.ev(lag); await B.ev(lag); await sleep(600);
  const lx0 = await B.ev(`window.__bb.sim.players[1].x`);
  await B.ev(`window.__bb.keys.KeyD=true`); await sleep(70);
  const lx1 = await B.ev(`window.__bb.sim.players[1].x`), lh1 = await A.ev(`window.__bb.sim.players[1].x`);
  console.log(`[160ms RTT] 70ms after keypress: guest's own dragon moved ${(lx1 - lx0).toFixed(1)}px (host has seen ${(lh1 - lx0).toFixed(1)}px)`);
  await sleep(700); await B.ev(`window.__bb.keys.KeyD=false`); await sleep(1500);
  console.log('[160ms RTT] settled:', JSON.stringify(await pos()));
  await B.ev(`window.__bb.keys.Space=true`); await sleep(150); await B.ev(`window.__bb.keys.Space=false`); await sleep(1500);
  console.log('[160ms RTT] after jump settled:', JSON.stringify(await pos()));
  console.log('[lossy] guest ping/jitter state:', await B.ev(`JSON.stringify({fast:NET.fastOpen})`));
  await B.shot(path.join(root, 'shots/net_lossy_guest.png'));
  // ---- blackout: both directions silently dead for 4s (the reported "she freezes on my screen" case) ----
  await A.ev(`window.__dead=true`); await B.ev(`window.__dead=true`); await B.ev(`window.__bb.keys.KeyD=true`); await sleep(3000);
  await B.shot(path.join(root, 'shots/net_dead_guest.png')); await A.shot(path.join(root, 'shots/net_dead_host.png'));
  await A.ev(`window.__dead=false`); await B.ev(`window.__dead=false`); await B.ev(`window.__bb.keys.KeyD=false`); await sleep(6000);
  const rx = await B.ev(`window.__bb.sim.players[1].x`); await B.ev(`window.__bb.keys.KeyA=true`); await sleep(600); await B.ev(`window.__bb.keys.KeyA=false`); await sleep(1200);
  console.log('[after blackout] guest x before/after walking left, host view:', rx, await B.ev(`window.__bb.sim.players[1].x`), await A.ev(`window.__bb.sim.players[1].x`));
  await A.shot(path.join(root, 'shots/net_host.png')); await B.shot(path.join(root, 'shots/net_guest.png'));
  console.log('errors host:', A.errs.slice(0, 4), 'guest:', B.errs.slice(0, 4));
  A.close(); B.close();
})().catch(e => console.log('FAIL', e.message)).finally(() => { setTimeout(() => { try { proc.kill(); } catch (e) { } process.exit(0); }, 800); });
