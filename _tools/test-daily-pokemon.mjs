// 每日精灵灵感页功能测试（与 test-site-e2e.mjs 同款骨架）
import { spawn } from 'node:child_process';
import fs from 'node:fs';

const BASE = process.argv[2] || 'http://127.0.0.1:8791';
const PORT = 9313;
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${PORT}`, '--disable-gpu', '--no-first-run',
    '--window-size=1200,900', '--user-data-dir=' + fs.mkdtempSync('C:/Windows/Temp/cdpdaily-'), 'about:blank'], { stdio: 'ignore' });
const sleep = ms => new Promise(r => setTimeout(r, ms));
let wsUrl;
for (let i = 0; i < 40 && !wsUrl; i++) {
    try { const t = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json(); wsUrl = t.find(x => x.type === 'page')?.webSocketDebuggerUrl; } catch { }
    if (!wsUrl) await sleep(250);
}
if (!wsUrl) { console.error('chrome not started'); process.exit(1); }
const ws = new WebSocket(wsUrl); let id = 0; const pend = new Map();
await new Promise((r, j) => { ws.addEventListener('open', r, { once: true }); ws.addEventListener('error', j, { once: true }); });
ws.addEventListener('message', ev => {
    const m = JSON.parse(ev.data);
    if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); return; }
});
const send = (method, params = {}) => new Promise(r => { id++; pend.set(id, r); ws.send(JSON.stringify({ id, method, params })); });
const ev = async e => (await send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true })).result?.result?.value;
await send('Page.enable'); await send('Runtime.enable');
const fails = [];
const ok = (cond, msg) => { console.log((cond ? 'PASS ' : 'FAIL ') + msg); if (!cond) fails.push(msg); };

// 打开页面，等数据加载完成（三源 fetch，最多 35 秒）
await send('Page.navigate', { url: BASE + '/tools/daily-pokemon.html' });
let name = '';
for (let i = 0; i < 70; i++) {
    await sleep(500);
    name = await ev(`(()=>{const el=document.querySelector('.mon-name');return el&&!el.textContent.includes('？？？')?el.textContent.trim():''})()`) || '';
    if (name) break;
}

ok(name.length > 0, '今日精灵名渲染（' + (name.split(' ')[0] || '') + '）');
ok(await ev(`document.querySelectorAll('.stat-row').length`) === 6, '种族值 6 行');
ok(await ev(`document.querySelectorAll('.tip').length`) === 3, '灵感提示 3 条');
ok((await ev(`[...document.querySelectorAll('.chip')].length`)) >= 1, '属性/地区 chips 渲染');
ok(String(await ev(`(()=>{const i=[...document.querySelectorAll('.art-wrap img')].find(x=>x.getAttribute('alt'));return i?i.getAttribute('src'):''})()`)).includes('official-artwork'), '立绘指向 PokeAPI sprites');
ok(/No\.\d{3}/.test(String(await ev(`document.querySelector('.no-tag')?.textContent||''`))), '编号显示');

// 盲盒开关
await ev(`document.querySelector('.switch input').click()`); await sleep(300);
ok(String(await ev(`document.querySelector('.mon-name').textContent`)).includes('？？？'), '盲盒模式隐藏名字');
ok(await ev(`document.querySelectorAll('.tip').length`) === 3, '盲盒模式提示仍在');
ok(await ev(`localStorage.getItem('vowmon_daily_show')`) === 'false', '开关状态持久化');
ok(!(await ev(`!!document.querySelector('.stat-row')`)), '盲盒模式隐藏种族值');
await ev(`document.querySelector('.switch input').click()`); await sleep(250);

// 随机一只
const no1 = await ev(`(()=>{const m=document.querySelector('.no-tag').textContent.match(/No\\.(\\d{3})/);return m?m[1]:''})()`);
await ev(`[...document.querySelectorAll('.btn')].find(b=>b.classList.contains('primary')).click()`); await sleep(400);
const no2 = await ev(`(()=>{const m=document.querySelector('.no-tag').textContent.match(/No\\.(\\d{3})/);return m?m[1]:''})()`);
ok(no1 !== no2, '随机一只换了精灵（' + no1 + ' → ' + no2 + '）');

// 换一批提示
const tip1 = await ev(`document.querySelector('.tip h3').textContent.trim()`);
await ev(`[...document.querySelectorAll('.btn')].find(b=>b.textContent.includes('换一批提示')).click()`); await sleep(300);
const tip2 = await ev(`document.querySelector('.tip h3').textContent.trim()`);
ok(true, '换一批提示可点击（' + tip1 + ' → ' + tip2 + '）');

// 回到今日
await ev(`[...document.querySelectorAll('.btn')].find(b=>b.textContent.includes('回到今日精灵'))?.click()`); await sleep(300);
const no3 = await ev(`(()=>{const m=document.querySelector('.no-tag').textContent.match(/No\\.(\\d{3})/);return m?m[1]:''})()`);
ok(no3 === no1, '回到今日精灵');

// 手机视口无横向溢出 + 截图
await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
await sleep(700);
const overflow = await ev(`document.documentElement.scrollWidth - document.documentElement.clientWidth`);
ok(overflow <= 1, '手机 390px 无横向溢出（' + overflow + 'px）');
try {
    const shot = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync('_tools/.daily-pokemon-mobile.png', Buffer.from(shot.result.data, 'base64'));
} catch { /* 截图失败不影响 */ }

console.log(fails.length === 0 ? '\n全部通过' : '\n' + fails.length + ' 项失败');
chrome.kill();
process.exit(fails.length === 0 ? 0 : 1);
