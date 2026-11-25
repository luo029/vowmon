// 后台弹窗测试：点「添加/新增」后检查弹窗是否真实渲染（Vue return 缺失会静默失效）
import { spawn } from 'node:child_process';
import fs from 'node:fs';

const BASE = process.argv[2] || 'http://127.0.0.1:8765';
const PORT = 9247;
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PAGES = [
  ['admin/index.html', 'sprites'],
  ['admin/admin-skills.html', null],
  ['admin/admin-traits.html', null],
  ['admin/admin-items.html', null],
  ['admin/admin-individuals.html', null],
  ['admin/admin-characters.html', null],
];

const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${PORT}`, '--disable-gpu',
  '--no-first-run', '--user-data-dir=' + fs.mkdtempSync('C:/Windows/Temp/cdp9-'), 'about:blank'], { stdio: 'ignore' });
const sleep = ms => new Promise(r => setTimeout(r, ms));
let wsUrl;
for (let i = 0; i < 40 && !wsUrl; i++) {
  try { const t = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json(); wsUrl = t.find(x => x.type === 'page')?.webSocketDebuggerUrl; } catch { }
  if (!wsUrl) await sleep(250);
}
const ws = new WebSocket(wsUrl); let id = 0; const pend = new Map(); let errs = [];
ws.addEventListener('message', ev => {
  const m = JSON.parse(ev.data);
  if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); return; }
  if (m.method === 'Runtime.exceptionThrown') errs.push((m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text).split('\n')[0].slice(0, 150));
});
await new Promise(r => ws.addEventListener('open', r));
const send = (method, params = {}) => new Promise(res => { const i = ++id; pend.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
await send('Runtime.enable'); await send('Page.enable');

let fail = 0;
for (const [p] of PAGES) {
  errs = [];
  await send('Page.navigate', { url: `${BASE}/${p}` });
  // 等添加按钮出现（数据加载慢时最多 15s）
  for (let t = 0; t < 15; t++) {
    await sleep(1000);
    const probe = await send('Runtime.evaluate', {
      expression: `!![...document.querySelectorAll('button, .btn')].find(b => /添加|新增/.test(b.innerText||'') && b.offsetParent !== null)`,
      returnByValue: true
    });
    if (probe.result?.result?.value === true) break;
  }
  const r = await send('Runtime.evaluate', {
    expression: `(async () => {
      const texts = ['添加','新增','新建'];
      const btn = [...document.querySelectorAll('button, a.btn, .btn')].find(b => {
        const t = (b.innerText || '').trim();
        return texts.some(k => t.includes(k)) && b.offsetParent !== null;
      });
      if (!btn) return JSON.stringify({ step: 'no-button' });
      const label = btn.innerText.trim().slice(0, 12);
      btn.click();
      await new Promise(r => setTimeout(r, 400));
      const modal = document.querySelector('.modal-overlay, .modal, dialog[open], .dlg-mask');
      return JSON.stringify({ step: 'clicked', label, modal: !!modal,
        modalText: modal ? modal.innerText.replace(/\\s+/g,' ').slice(0, 60) : '' });
    })()`, awaitPromise: true, returnByValue: true
  });
  const v = r.result?.result?.value || '{}';
  const o = JSON.parse(v);
  const ok = o.modal === true && errs.length === 0;
  if (!ok) { fail++; console.log(`✗ ${p}  ${v}${errs.length ? ' 异常:' + errs[0] : ''}`); }
  else console.log(`✓ ${p}  弹窗「${o.modalText}」`);
  // 关闭弹窗，避免影响下一页
  await send('Runtime.evaluate', { expression: `document.querySelector('.modal-overlay .modal-close, .modal-overlay [class*=close], .dlg-mask [class*=close]')?.click()` });
}
ws.close(); chrome.kill();
console.log(`\n弹窗测试 ${PAGES.length - fail}/${PAGES.length} 通过`);
process.exit(fail ? 1 : 0);
