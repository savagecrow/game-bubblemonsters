// Single-instance screenshot tool: node dev/shot.js "<query>" out.png [waitMs] [evalJS]
// Launches its own isolated headless Chrome, captures one frame + console errors, then closes only that Chrome.
const { spawn } = require('child_process'), fs = require('fs'), os = require('os'), path = require('path');
const query = process.argv[2] || '', out = process.argv[3] || 'shots/out.png', wait = +(process.argv[4] || 1500); let evalJS = process.argv[5];
const root = path.resolve(__dirname, '..');
const chrome = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const port = 9300 + Math.floor(Math.random() * 400);
const prof = fs.mkdtempSync(path.join(os.tmpdir(), 'hs-chrome-'));
const proc = spawn(chrome, ['--headless=new', '--remote-debugging-port=' + port, '--user-data-dir=' + prof, '--window-size=1152,768', '--hide-scrollbars', '--no-first-run', '--allow-file-access-from-files', 'about:blank'], { stdio: 'ignore' });
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  let targets;
  for (let i = 0; i < 60; i++) { try { targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json(); if (targets.find(t => t.type === 'page')) break; } catch (e) { } await sleep(250); }
  const page = targets.find(t => t.type === 'page');
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise(r => ws.onopen = r);
  let id = 0; const pend = {}; const errs = [];
  ws.onmessage = e => {
    const m = JSON.parse(e.data);
    if (m.id && pend[m.id]) { pend[m.id](m.result || m.error); delete pend[m.id]; }
    if (m.method === 'Runtime.exceptionThrown') errs.push(m.params.exceptionDetails.exception ? m.params.exceptionDetails.exception.description : m.params.exceptionDetails.text);
    if (m.method === 'Runtime.consoleAPICalled' && (m.params.type === 'error' || m.params.type === 'warning')) errs.push(m.params.type + ': ' + m.params.args.map(a => a.value || a.description).join(' '));
  };
  const send = (method, params) => new Promise(r => { const i = ++id; pend[i] = r; ws.send(JSON.stringify({ id: i, method, params })); });
  await send('Runtime.enable'); await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 1152, height: 768, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: 'file:///' + root.replace(/\\/g, '/') + '/index.html' + (query ? '?' + query : '') });
  for (let i = 0; i < 80; i++) { const r = await send('Runtime.evaluate', { expression: 'window.__ready===true' }); if (r.result && r.result.value) break; await sleep(250); }
  await sleep(wait);
  if (evalJS) {
    if (evalJS[0] === '@') evalJS = fs.readFileSync(evalJS.slice(1), 'utf8'); const r = await send('Runtime.evaluate', { expression: evalJS, awaitPromise: true, returnByValue: true }); console.log('eval:', JSON.stringify(r.result ? r.result.value : r)); await sleep(+(process.argv[6] || 500)); }
  const shot = await send('Page.captureScreenshot', { format: 'png' });
  fs.mkdirSync(path.dirname(path.resolve(root, out)), { recursive: true });
  fs.writeFileSync(path.resolve(root, out), Buffer.from(shot.data, 'base64'));
  console.log('saved', out, errs.length ? 'ERRORS:\n' + errs.slice(0, 8).join('\n') : 'no console errors');
  try { await send('Browser.close'); } catch (e) { }
  ws.close();
})().catch(e => console.log('FAIL', e)).finally(() => { setTimeout(() => { try { proc.kill(); } catch (e) { } process.exit(0); }, 800); });
