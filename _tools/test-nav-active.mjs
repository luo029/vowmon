// 导航高亮检查：每个前台页顶部导航应有 active 项
import { spawn } from 'node:child_process';
import fs from 'node:fs';
const BASE = process.argv[2] || 'http://127.0.0.1:8765';
const PORT = 9257, CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PAGES = ['index.html', 'dex/vowdex.html', 'dex/realm-dex.html', 'dex/vow-detail.html?id=068', 'dex/list.html',
  'reference/skills.html', 'reference/skill-detail.html?id=s008', 'reference/traits.html', 'reference/items.html',
  'reference/natures.html', 'reference/calculator.html', 'reference/coverage.html',
  'world/ranks.html', 'world/trainers.html', 'world/factions.html', 'reference/bloodlines.html', 'world/lore.html',
  'records/individuals.html', 'records/characters.html'];
const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${PORT}`, '--disable-gpu',
  '--no-first-run', '--user-data-dir=' + fs.mkdtempSync('C:/Windows/Temp/cdpE-'), 'about:blank'], { stdio: 'ignore' });
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
let fail = 0;
for (const p of PAGES) {
  await send('Page.navigate', { url: `${BASE}/${p}` });
  await sleep(8000);
  const r = await send('Runtime.evaluate', {
    expression: `JSON.stringify({ active: [...document.querySelectorAll('.nav-links > a.active, .nav-links .nav-item > a.active')].map(a => a.innerText.replace(/[▾\\s]/g,'')).join('|'), nav: document.querySelectorAll('.nav-links a').length })`,
    returnByValue: true
  });
  const v = JSON.parse(r.result?.result?.value || '{}');
  const ok = !!v.active && v.nav > 5;
  if (!ok) fail++;
  console.log((ok ? '✓ ' : '✗ ') + p + '  active=' + (v.active || '无') + ' nav=' + v.nav);
}
ws.close(); chrome.kill();
console.log(`\n高亮 ${PAGES.length - fail}/${PAGES.length}`);
