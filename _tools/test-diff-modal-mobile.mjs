// diff 弹窗移动端（iPhone 视口 390x844 DPR3）截图验证
import { spawn } from 'node:child_process';
import fs from 'node:fs';

const BASE = process.argv[2] || 'http://127.0.0.1:8765';
const PORT = 9261;
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';

const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${PORT}`, '--disable-gpu',
  '--no-first-run', '--window-size=390,844', '--user-data-dir=' + fs.mkdtempSync('C:/Windows/Temp/cdpdiffm-'), 'about:blank'], { stdio: 'ignore' });
const sleep = ms => new Promise(r => setTimeout(r, ms));
let wsUrl;
for (let i = 0; i < 40 && !wsUrl; i++) {
  try { const t = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json(); wsUrl = t.find(x => x.type === 'page')?.webSocketDebuggerUrl; } catch { }
  if (!wsUrl) await sleep(250);
}
if (!wsUrl) { console.error('FAIL: chrome not started'); process.exit(1); }
const ws = new WebSocket(wsUrl); let id = 0; const pend = new Map();
await new Promise((r, j) => { ws.addEventListener('open', r, { once: true }); ws.addEventListener('error', j, { once: true }); });
ws.addEventListener('message', ev => {
  const m = JSON.parse(ev.data);
  if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); return; }
});
const send = (method, params = {}) => new Promise(r => { id++; pend.set(id, r); ws.send(JSON.stringify({ id, method, params })); });
const evalJs = async (expr) => {
  const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
  return r.result?.result?.value;
};
const evalNoWait = (expr) => send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: false });
await send('Page.enable');
await send('Runtime.enable');
// iPhone 13 尺寸：390x844，DPR 3，移动模式
await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 3, mobile: true });
await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });

const fails = [];
const ok = (cond, msg) => { console.log((cond ? '✓ ' : '✗ ') + msg); if (!cond) fails.push(msg); };

// 1. push 场景（顶部视图）
await send('Page.navigate', { url: `${BASE}/_tools/test-diff-modal.html?auto=push` });
await sleep(1800);
ok(await evalJs(`!!document.querySelector('.vwdiff-root.is-show')`), '移动端弹窗已渲染');
const dims = await evalJs(`JSON.stringify({ vw: window.innerWidth, modalW: document.querySelector('.vwdiff-card').getBoundingClientRect().width, overflows: document.documentElement.scrollWidth > window.innerWidth })`);
console.log('尺寸:', dims);
ok(!dims.includes('"overflows":true'), '页面无横向溢出');
const shot1 = await send('Page.captureScreenshot', { format: 'png' });
fs.writeFileSync('_tools/diff-mobile-top.png', Buffer.from(shot1.result.data, 'base64'));

// 2. 展开详情 + 滚动到中部
await evalJs(`document.querySelector('.vwdiff-more').click()`);
await sleep(200);
await evalJs(`document.querySelector('.vwdiff-list').scrollTop = 300`);
await sleep(200);
const shot2 = await send('Page.captureScreenshot', { format: 'png' });
fs.writeFileSync('_tools/diff-mobile-mid.png', Buffer.from(shot2.result.data, 'base64'));

// 3. 滚到底部（看底部按钮）
await evalJs(`document.querySelector('.vwdiff-list').scrollTop = 99999`);
await sleep(200);
const shot3 = await send('Page.captureScreenshot', { format: 'png' });
fs.writeFileSync('_tools/diff-mobile-bottom.png', Buffer.from(shot3.result.data, 'base64'));

// 4. 触摸点击一条 modified（验证触摸交互 + 按钮刷新）
await evalJs(`document.querySelector('.vwdiff-list').scrollTop = 0`);
const btnBefore = await evalJs(`document.querySelector('.vwdiff-btn-ok').textContent`);
// 模拟真实触摸
const r = await evalJs(`(function(){ const el = document.querySelector('.vwdiff-item[data-type="modified"]'); const b = el.getBoundingClientRect(); return JSON.stringify({ x: b.x + b.width/2, y: b.y + b.height/2 }); })()`);
const pos = JSON.parse(r);
await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: pos.x, y: pos.y }] });
await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
await sleep(300);
const btnAfter = await evalJs(`document.querySelector('.vwdiff-btn-ok').textContent`);
ok(btnBefore !== btnAfter, `触摸点击生效（按钮 ${btnBefore} → ${btnAfter}）`);

// 5. 小屏 360x640（更小手机）再验证一次
await send('Emulation.setDeviceMetricsOverride', { width: 360, height: 640, deviceScaleFactor: 2, mobile: true });
await sleep(300);
const dims2 = await evalJs(`JSON.stringify({ vw: window.innerWidth, modalW: document.querySelector('.vwdiff-card').getBoundingClientRect().width, overflows: document.documentElement.scrollWidth > window.innerWidth })`);
console.log('小屏尺寸:', dims2);
ok(!dims2.includes('"overflows":true'), '360px 小屏无横向溢出');
const shot4 = await send('Page.captureScreenshot', { format: 'png' });
fs.writeFileSync('_tools/diff-mobile-small.png', Buffer.from(shot4.result.data, 'base64'));

console.log(fails.length ? `\nFAIL ${fails.length}` : '\n移动端验证全部通过');
chrome.kill();
process.exit(fails.length ? 1 : 0);
