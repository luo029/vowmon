// 详情页异色图「空闲预载」回归测试
// 图片基址指向本地 1×1 PNG fixture（_tools/fakeimgs），排除外网波动，只验证预载逻辑
import { spawn } from 'node:child_process';
import fs from 'node:fs';

const BASE = process.argv[2] || 'http://127.0.0.1:8791';
const PORT = 9275;
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${PORT}`, '--disable-gpu', '--no-first-run',
  '--window-size=1200,900', '--user-data-dir=' + fs.mkdtempSync('C:/Windows/Temp/cdpshiny-'), 'about:blank'], { stdio: 'ignore' });
const sleep = ms => new Promise(r => setTimeout(r, ms));
let wsUrl;
for (let i = 0; i < 40 && !wsUrl; i++) {
  try { const t = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json(); wsUrl = t.find(x => x.type === 'page')?.webSocketDebuggerUrl; } catch { }
  if (!wsUrl) await sleep(250);
}
if (!wsUrl) { console.error('chrome not started'); process.exit(1); }
const ws = new WebSocket(wsUrl); let id = 0; const pend = new Map(); const net = []; const errs = [];
await new Promise((r, j) => { ws.addEventListener('open', r, { once: true }); ws.addEventListener('error', j, { once: true }); });
ws.addEventListener('message', ev => {
  const m = JSON.parse(ev.data);
  if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); return; }
  const p = m.params || {};
  if (m.method === 'Network.requestWillBeSent') net.push({ url: p.request?.url || '', id: p.requestId, start: p.timestamp, state: 'sent' });
  if (m.method === 'Network.responseReceived') { const r = net.find(x => x.id === p.requestId); if (r) { r.status = p.response?.status; r.cache = !!(p.response?.fromDiskCache || p.response?.fromPrefetchCache); } }
  if (m.method === 'Network.loadingFinished') { const r = net.find(x => x.id === p.requestId); if (r) { r.end = p.timestamp; r.state = 'done'; } }
  if (m.method === 'Network.loadingFailed') { const r = net.find(x => x.id === p.requestId); if (r) r.state = 'failed'; }
  if (m.method === 'Runtime.exceptionThrown') errs.push((p.exceptionDetails?.exception?.description || p.exceptionDetails?.text || '').split('\n')[0]);
});
const send = (method, params = {}) => new Promise(r => { id++; pend.set(id, r); ws.send(JSON.stringify({ id, method, params })); });
const evalJs = async (expr) => (await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true })).result?.result?.value;
await send('Page.enable'); await send('Runtime.enable'); await send('Network.enable');
const shinyReqs = () => net.filter(r => /_s\.png/i.test(r.url));
const fails = [];
const ok = (cond, msg) => { console.log((cond ? '✓ ' : '✗ ') + msg); if (!cond) fails.push(msg); };

async function waitShinyDone(maxMs = 15000, since = 0) {
  const t0 = Date.now();
  while (Date.now() - t0 < maxMs) {
    const r = shinyReqs().slice(since).find(x => x.state === 'done');
    if (r) return { r, ms: Date.now() - t0 };
    await sleep(100);
  }
  return { r: null, ms: Date.now() - t0 };
}

async function clickShiny() {
  const before = shinyReqs().length;
  const t0 = Date.now();
  const clicked = await evalJs(`(function(){ const b=[...document.querySelectorAll('.stage-btn')].find(x=>x.textContent.includes('异色')); if(!b) return false; b.click(); return true; })()`);
  if (!clicked) return { ms: -1, newReqs: 0 };
  let ready = false;
  for (let i = 0; i < 200; i++) {
    ready = await evalJs(`(function(){ const im=document.querySelector('.vow-figure img'); return !!(im && im.complete && im.naturalWidth>0 && /_s\\.png/.test(im.currentSrc||im.src)); })()`);
    if (ready) break;
    await sleep(25);
  }
  return { ms: ready ? Date.now() - t0 : -1, newReqs: shinyReqs().length - before };
}

// 先把图片基址指到本地 fixture（页面脚本从 localStorage['vowmon_sync_config'].imgCdnBase 读取）
await send('Page.navigate', { url: `${BASE}/` });
for (let i = 0; i < 100; i++) { if (await evalJs(`document.readyState === 'complete'`)) break; await sleep(100); }
await evalJs(`localStorage.setItem('vowmon_sync_config', JSON.stringify({ imgCdnBase: '${BASE}/_tools/fakeimgs' }))`);
console.log('=== 打开详情页 id=068（图片走本地 fixture） ===');
await send('Page.navigate', { url: `${BASE}/dex/vow-detail.html?id=068` });
for (let i = 0; i < 300; i++) { if (await evalJs(`!!document.querySelector('.stage-btn')`)) break; await sleep(100); }
ok(await evalJs(`!!document.querySelector('.stage-btn')`), '详情页挂载成功');
const pre = await waitShinyDone();
ok(!!pre.r, `异色图在点击前已自动预载（${pre.ms}ms 完成）`);
if (pre.r) console.log(`   预载请求: ${pre.r.url.split('/').pop()} 状态=${pre.r.status}`);
ok(shinyReqs().length === 1, `只预载当前 1 张异色图（实际 ${shinyReqs().length} 张）`);

const t = await clickShiny();
ok(t.ms >= 0 && t.ms < 600, `点击「异色」秒切：${t.ms}ms（阈值 600ms）`);
ok(t.newReqs === 0, '点击时没有再发起异色图下载（命中预载缓存）');

// 切到下一只：整页跳转后应重新预载新精灵的异色图
const href0 = await evalJs(`location.href`);
const clickedNext = await evalJs(`(function(){ const a=document.querySelector('button[title="下一只"]'); if(a){a.click(); return true;} return false; })()`);
ok(clickedNext, '找到并点击「下一只」');
for (let i = 0; i < 400; i++) { if (await evalJs(`!!document.querySelector('.stage-btn') && location.href !== ${JSON.stringify(href0)}`)) break; await sleep(100); }
console.log('   跳转后:', await evalJs(`location.href`));
const nextId = (await evalJs(`location.href`)).split('id=')[1] || '';
const tPre2 = Date.now();
let pre2 = null;
while (Date.now() - tPre2 < 15000) {
  pre2 = shinyReqs().find(x => x.url.includes(nextId + '_s.png') && x.state === 'done');
  if (pre2) break;
  await sleep(100);
}
ok(!!pre2, `切换精灵(${nextId})后自动预载新异色图（${Date.now() - tPre2}ms）`);
const t2 = await clickShiny();
ok(t2.ms >= 0 && t2.ms < 600, `切换后点「异色」同样秒切：${t2.ms}ms`);
ok(t2.newReqs === 0, '切换后点击无新下载');
ok(errs.length === 0, '无 JS 运行时异常' + (errs.length ? ': ' + errs.join(' | ') : ''));
console.log(fails.length ? `\nFAIL ${fails.length}` : '\nSHINY PRELOAD 全部通过');
chrome.kill();
process.exit(fails.length ? 1 : 0);
