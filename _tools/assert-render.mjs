// 逐页断言（带等待）：数据加载完成后再检查关键元素
import { spawn } from 'node:child_process';
import fs from 'node:fs';

const BASE = process.argv[2] || 'http://127.0.0.1:8765';
const TAG = process.argv[3] || 'local';
const PORT = 9239;
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';

const CASES = [
  ['index.html', `document.querySelectorAll('.menu-card').length`, 3],
  ['dex/vowdex.html', `document.querySelectorAll('.vow-card').length`, 5],
  ['dex/list.html', `document.querySelectorAll('tbody tr').length`, 5],
  ['dex/realm-dex.html', `document.querySelectorAll('[class*=realm], section, .group-block').length`, 3],
  ['dex/vow-detail.html?id=068', `document.body.innerText.length`, 350],
  ['reference/items.html', `document.body.innerText.length`, 60],
  ['reference/skills.html', `document.querySelectorAll('tbody tr').length`, 1],
  ['reference/traits.html', `document.querySelectorAll('tbody tr, .trait-card').length`, 1],
  ['reference/natures.html', `document.querySelectorAll('tbody tr, .nature-card').length`, 10],
  ['reference/bloodlines.html', `document.body.innerText.length`, 800],
  ['reference/calculator.html', `document.querySelectorAll('.type-btn, .type-chip, select').length`, 5],
  ['reference/coverage.html', `document.body.innerText.length`, 150],
  ['reference/skill-detail.html?id=s008', `document.body.innerText.length`, 300],
  ['world/ranks.html', `document.body.innerText.length`, 1000],
  ['world/trainers.html', `document.body.innerText.length`, 800],
  ['world/factions.html', `document.body.innerText.length`, 600],
  ['world/lore.html', `document.body.innerText.length`, 800],
  ['records/individuals.html', `document.querySelectorAll('tbody tr, .ind-card').length`, 1],
  ['records/characters.html', `document.querySelectorAll('tbody tr, .cha-card').length`, 1],
  ['admin/index.html', `document.querySelectorAll('tbody tr').length`, 1],
  ['admin/admin-skills.html', `document.querySelectorAll('tbody tr').length`, 1],
  ['admin/admin-traits.html', `document.querySelectorAll('tbody tr').length`, 1],
  ['admin/admin-items.html', `document.body.innerText.length`, 100],
  ['admin/admin-individuals.html', `document.body.innerText.length`, 100],
  ['admin/admin-characters.html', `document.body.innerText.length`, 100],
  ['admin/admin-stages.html', `document.querySelectorAll('.stage-row').length`, 8],
  ['admin/admin-images.html', `document.body.innerText.length`, 100],
  ['admin/admin-lore.html', `document.body.innerText.length`, 150],
  ['admin/admin-bloodline-skills.html', `document.body.innerText.length`, 150],
];

const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${PORT}`, '--disable-gpu',
  '--no-first-run', '--user-data-dir=' + fs.mkdtempSync('C:/Windows/Temp/cdp5-'), 'about:blank'], { stdio: 'ignore' });
const sleep = ms => new Promise(r => setTimeout(r, ms));
let wsUrl;
for (let i = 0; i < 40 && !wsUrl; i++) {
  try { const t = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json(); wsUrl = t.find(x => x.type === 'page')?.webSocketDebuggerUrl; } catch { }
  if (!wsUrl) await sleep(250);
}
const ws = new WebSocket(wsUrl);
let id = 0; const pend = new Map(); let errs = [];
ws.addEventListener('message', ev => {
  const m = JSON.parse(ev.data);
  if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); return; }
  if (m.method === 'Runtime.exceptionThrown') errs.push((m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text).split('\n')[0].slice(0, 150));
});
await new Promise(r => ws.addEventListener('open', r));
const send = (method, params = {}) => new Promise(res => { const i = ++id; pend.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
await send('Runtime.enable'); await send('Page.enable');

let fail = 0;
for (const [p, expr, min] of CASES) {
  errs = [];
  await send('Page.navigate', { url: `${BASE}/${p}` });
  let val = NaN, raw = '-';
  for (let t = 0; t < 14; t++) {
    await sleep(1000);
    const r = await send('Runtime.evaluate', {
      expression: `(() => { const loading = (document.body.innerText||'').includes('正在加载数据'); return JSON.stringify({ n: (()=>{try{return String(${expr});}catch(e){return 'ERR';}})(), loading }); })()`,
      returnByValue: true
    });
    try { const o = JSON.parse(r.result.result.value); raw = o.n; val = Number(o.n); if (!o.loading && !isNaN(val) && val >= min) break; } catch { }
  }
  const ok = !isNaN(val) && val >= min && errs.length === 0;
  if (!ok) { fail++; console.log(`✗ ${p}  值=${raw} 期望>=${min}${errs.length ? '  异常: ' + errs[0] : ''}`); }
  else console.log(`✓ ${p}  ${raw}`);
}
ws.close(); chrome.kill();
console.log(`\n[${TAG}] ${CASES.length - fail}/${CASES.length} 通过`);
process.exit(fail ? 1 : 0);
