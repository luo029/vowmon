// 后台侧边栏高亮检查：每页 active 项应与当前页对应
import { spawn } from 'node:child_process';
import fs from 'node:fs';
const BASE = process.argv[2] || 'http://127.0.0.1:8765';
const PORT = 9251, CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PAGES = ['admin/index.html', 'admin/admin-skills.html', 'admin/admin-traits.html', 'admin/admin-items.html',
  'admin/admin-images.html', 'admin/admin-lore.html', 'admin/admin-individuals.html', 'admin/admin-characters.html',
  'admin/admin-bloodline-skills.html'];
const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${PORT}`, '--disable-gpu',
  '--no-first-run', '--user-data-dir=' + fs.mkdtempSync('C:/Windows/Temp/cdpB-'), 'about:blank'], { stdio: 'ignore' });
const sleep = ms => new Promise(r => setTimeout(r, ms));
let wsUrl;
for (let i = 0; i < 40 && !wsUrl; i++) {
  try { const t = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json(); wsUrl = t.find(x => x.type === 'page')?.webSocketDebuggerUrl; } catch { }
  if (!wsUrl) await sleep(250);
}
const ws = new WebSocket(wsUrl); let id = 0; const pend = new Map();
ws.addEventListener('message', ev => { const m = JSON.parse(ev.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } });
await new Promise(r => ws.addEventListener('open', r));
const send = (m, p = {}) => new Promise(res => { const i = ++id; pend.set(i, res); ws.send(JSON.stringify({ id: i, method: m, params: p })); });
await send('Runtime.enable'); await send('Page.enable');
for (const p of PAGES) {
  await send('Page.navigate', { url: `${BASE}/${p}` });
  await sleep(2500);
  const r = await send('Runtime.evaluate', {
    expression: `JSON.stringify({ items: document.querySelectorAll('.side-nav a').length,
      active: [...document.querySelectorAll('.side-nav a.active')].map(a => a.innerText.trim()).join('|') })`,
    returnByValue: true
  });
  const v = JSON.parse(r.result?.result?.value || '{}');
  console.log((v.active ? '✓ ' : '✗ ') + p + '  ' + JSON.stringify(v));
}
ws.close(); chrome.kill();
