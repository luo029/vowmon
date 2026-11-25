// 对战页冒烟：加载 → 选双方 → 开战 → 3 回合 → 校验战报
import { spawn } from 'node:child_process';
import fs from 'node:fs';
const PORT = 9265, CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${PORT}`, '--disable-gpu', '--no-first-run', '--user-data-dir=' + fs.mkdtempSync('C:/Windows/Temp/cdpI-'), 'about:blank'], { stdio: 'ignore' });
const sleep = ms => new Promise(r => setTimeout(r, ms));
let wsUrl;
for (let i = 0; i < 40 && !wsUrl; i++) { try { const t = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json(); wsUrl = t.find(x => x.type === 'page')?.webSocketDebuggerUrl; } catch { } if (!wsUrl) await sleep(250); }
const ws = new WebSocket(wsUrl); let id = 0; const pend = new Map(); const errs = [];
ws.addEventListener('message', ev => { const m = JSON.parse(ev.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); return; }
  if (m.method === 'Runtime.exceptionThrown') errs.push('EXC ' + (m.params.exceptionDetails.exception?.description || '').split('\n')[0].slice(0, 300));
  if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') errs.push('CON ' + m.params.args.map(a => a.value ?? a.description ?? '').join(' | ').slice(0, 900)); });
await new Promise(r => ws.addEventListener('open', r));
const send = (m, p = {}) => new Promise(res => { const i = ++id; pend.set(i, res); ws.send(JSON.stringify({ id: i, method: m, params: p })); });
await send('Runtime.enable'); await send('Page.enable');
await send('Page.navigate', { url: 'http://localhost:8000/battle/' });

let mounted = false;
for (let t = 0; t < 15; t++) {
  await sleep(1000);
  const r = await send('Runtime.evaluate', { expression: 'document.querySelectorAll(".picker-input").length', returnByValue: true });
  if (Number(r.result?.result?.value) >= 2) { mounted = true; break; }
}
console.log('页面挂载:', mounted ? '✓' : '✗（数据加载超时）');
if (errs.length) console.log('加载异常:', errs.slice(0, 3).join(' | '));
if (!mounted) {
  const dbg = await evalJs("document.body.innerText.slice(0, 300)");
  console.log(errs.join('\n---\n'));
  console.log('页面文本:', dbg.result?.result?.value);
  ws.close(); chrome.kill(); process.exit(1);
}

const evalJs = (expr) => send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });

const pickFirst = async (slot, keyword) => {
  await evalJs("(function(){var i=document.querySelectorAll('.picker-input')[" + slot + "];i.value='" + keyword + "';i.dispatchEvent(new Event('input'));i.focus();})()");
  await sleep(400);
  await evalJs("(function(){var w=document.querySelectorAll('.picker-wrap')[" + slot + "];var it=w.querySelector('.picker-item');if(it){it.dispatchEvent(new MouseEvent('mousedown',{bubbles:true}));}})()");
  await sleep(300);
};

await pickFirst(0, '沐');
await pickFirst(1, '');

const st = await evalJs("JSON.stringify({picked: document.querySelectorAll('.picked-card').length, startReady: !document.querySelector('.btn-start').disabled})");
console.log('编队:', st.result?.result?.value);

await evalJs("document.querySelector('.btn-start').click()");
await sleep(400);
const ar = await evalJs("JSON.stringify({arena: document.querySelector('.arena').classList.contains('show'), movesA: document.querySelectorAll('.moves-box')[0].querySelectorAll('.move-btn').length, movesB: document.querySelectorAll('.moves-box')[1].querySelectorAll('.move-btn').length})");
console.log('开战:', ar.result?.result?.value);

for (let t = 0; t < 3; t++) {
  await evalJs("(function(){var b=document.querySelectorAll('.moves-box')[0].querySelector('.move-btn');if(b)b.click();var c=document.querySelectorAll('.moves-box')[1].querySelector('.move-btn');if(c)c.click();})()");
  await sleep(150);
  await evalJs("document.querySelector('.btn-exec').click()");
  await sleep(500);
}
const fin = await evalJs("JSON.stringify({logLines: document.querySelectorAll('.battle-log > div').length, over: (document.querySelector('.over-banner')||{}).innerText || '', hps: Array.prototype.map.call(document.querySelectorAll('.hp-num'), function(e){return e.innerText.trim();})})");
console.log('3 回合后:', fin.result?.result?.value);
console.log('运行异常:', errs.length ? errs.slice(0, 5).join(' | ') : '无');
ws.close(); chrome.kill();
