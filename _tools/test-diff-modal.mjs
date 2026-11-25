// diff 弹窗 E2E：打开演示页 → 点击行取消勾选 → 截图 → 验证确认按钮文案
import { spawn } from 'node:child_process';
import fs from 'node:fs';

const BASE = process.argv[2] || 'http://127.0.0.1:8765';
const PORT = 9251;
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';

const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${PORT}`, '--disable-gpu',
  '--no-first-run', '--window-size=900,800', '--user-data-dir=' + fs.mkdtempSync('C:/Windows/Temp/cdpdiff-'), 'about:blank'], { stdio: 'ignore' });
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
// 触发打开弹窗但「不等待」其 Promise（否则没人点确认会死锁）
const evalNoWait = (expr) => send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: false });
await send('Page.enable');
await send('Runtime.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 900, height: 800, deviceScaleFactor: 1, mobile: false });

const fails = [];
const ok = (cond, msg) => { console.log((cond ? '✓ ' : '✗ ') + msg); if (!cond) fails.push(msg); };

// 1. push 场景
await send('Page.navigate', { url: `${BASE}/_tools/test-diff-modal.html?auto=push` });
await sleep(1600);
ok(await evalJs(`!!document.querySelector('.vwdiff-root.is-show')`), '弹窗已渲染（is-show）');
ok(await evalJs(`document.querySelectorAll('.vwdiff-item').length`) === 7, '共 7 条差异（精灵 4 + 技能包 3）');
const okText = await evalJs(`document.querySelector('.vwdiff-btn-ok').textContent`);
ok(okText.includes('5'), '确认按钮显示「上传 5 处修改」（删除默认不勾）: ' + okText);
ok(await evalJs(`document.querySelector('.vwdiff-selcount').textContent`) === '已选 5 / 7', '统计条计数正确');
ok(await evalJs(`document.querySelectorAll('.vwdiff-item[data-type="added"]').length`) === 2, '新增 2 条');
ok(await evalJs(`document.querySelectorAll('.vwdiff-item[data-type="removed"]').length`) === 2, '删除 2 条');
// 展开「+N 处改动」
await evalJs(`document.querySelector('.vwdiff-more').click()`);
ok(await evalJs(`!!document.querySelector('.vwdiff-item.is-expanded .vwdiff-detail')`), '点击展开显示全部字段改动');
// 取消勾选一条 modified → 按钮数变 4
await evalJs(`document.querySelector('.vwdiff-item[data-type="modified"]').click()`);
const okText2 = await evalJs(`document.querySelector('.vwdiff-btn-ok').textContent`);
ok(okText2.includes('4'), '取消勾选后按钮实时更新为 4 处: ' + okText2);
// 截图
const shot1 = await send('Page.captureScreenshot', { format: 'png' });
fs.writeFileSync('_tools/diff-modal-push.png', Buffer.from(shot1.result.data, 'base64'));
// 确认 → 验证返回值
await evalJs(`document.querySelector('.vwdiff-btn-ok').click()`);
await sleep(300);
const res = await evalJs(`JSON.stringify({ ok: window.__reviewResult.ok, count: window.__reviewResult.count, all: window.__reviewResult.all, sec1: window.__reviewResult.sections[0].merged.length, mapKeys: Object.keys(window.__reviewResult.sections[1].merged).join(',') })`);
ok(res.includes('"ok":true') && res.includes('"count":4'), 'review 返回 ok/count 正确: ' + res);
ok(res.includes('"sec1":4'), 'push 合并后精灵仍 4 条（未勾选删除保留）: ' + res);
ok(res.includes('"mapKeys":"火族,水族,风族"'), 'map 段合并正确（未勾选的删除保留、新增并入）: ' + res);
ok(await evalJs(`!document.querySelector('.vwdiff-root')`), '确认后弹窗关闭');

// 2. 空态
await evalNoWait(`openEmpty()`);
await sleep(500);
ok(await evalJs(`!!document.querySelector('.vwdiff-empty')`), '两边一致时显示空态');
const shot2 = await send('Page.captureScreenshot', { format: 'png' });
fs.writeFileSync('_tools/diff-modal-empty.png', Buffer.from(shot2.result.data, 'base64'));
await evalJs(`document.querySelector('.vwdiff-btn-ok').click()`);
await sleep(200);
const resEmpty = await evalJs(`window.__reviewResult && JSON.stringify({ ok: window.__reviewResult.ok, empty: window.__reviewResult.empty })`);
ok(resEmpty.includes('"empty":true'), '空态返回 empty:true: ' + resEmpty);

// 3. Esc 取消
await evalNoWait(`openPush()`);
await sleep(400);
await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
await sleep(300);
ok(await evalJs(`!document.querySelector('.vwdiff-root') && window.__reviewResult && window.__reviewResult.ok === false`), 'Esc 取消返回 ok:false');

console.log(fails.length ? `\nFAIL ${fails.length}` : '\nDIFF E2E 全部通过');
chrome.kill();
process.exit(fails.length ? 1 : 0);
