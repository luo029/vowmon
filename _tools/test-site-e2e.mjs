// 全站功能 E2E：关键页面实际交互（筛选/搜索/切换/弹窗/导出等）
import { spawn } from 'node:child_process';
import fs from 'node:fs';

const BASE = process.argv[2] || 'http://127.0.0.1:8797';
const PORT = 9312;
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${PORT}`, '--disable-gpu', '--no-first-run',
    '--window-size=1200,900', '--user-data-dir=' + fs.mkdtempSync('C:/Windows/Temp/cdpe2e-'), 'about:blank'], { stdio: 'ignore' });
const sleep = ms => new Promise(r => setTimeout(r, ms));
let wsUrl;
for (let i = 0; i < 40 && !wsUrl; i++) {
    try { const t = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json(); wsUrl = t.find(x => x.type === 'page')?.webSocketDebuggerUrl; } catch { }
    if (!wsUrl) await sleep(250);
}
if (!wsUrl) { console.error('chrome not started'); process.exit(1); }
const ws = new WebSocket(wsUrl); let id = 0; const pend = new Map(); const errs = [];
await new Promise((r, j) => { ws.addEventListener('open', r, { once: true }); ws.addEventListener('error', j, { once: true }); });
ws.addEventListener('message', ev => {
    const m = JSON.parse(ev.data);
    if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); return; }
    if (m.method === 'Runtime.exceptionThrown') errs.push((m.params.exceptionDetails?.exception?.description || m.params.exceptionDetails?.text || '').split('\n')[0]);
});
const send = (method, params = {}) => new Promise(r => { id++; pend.set(id, r); ws.send(JSON.stringify({ id, method, params })); });
const ev = async e => (await send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true })).result?.result?.value;
await send('Page.enable'); await send('Runtime.enable');
const fails = [];
const ok = (cond, msg) => { console.log((cond ? '✓ ' : '✗ ') + msg); if (!cond) fails.push(msg); };
async function open(page, wait = 3000) {
    await send('Page.navigate', { url: BASE + '/' + page });
    await sleep(wait);
}

// 1. 图鉴：系别折叠筛选
await open('dex/vowdex.html', 7000);
ok(await ev(`!!document.querySelector('.type-filter')`), '图鉴系别筛选已折叠');
await ev(`document.querySelector('.tf-trigger').click()`); await sleep(200);
ok(await ev(`document.querySelectorAll('.tf-item').length`) === 18, '展开后 18 个系别可选');
await ev(`document.querySelector('.tf-item').click()`); await sleep(400);
ok(await ev(`document.querySelector('.tf-summary').textContent !== '全部系别'`), '点击系别后摘要更新');
await ev(`document.querySelector('.tf-clear').click()`); await sleep(300);
ok(await ev(`document.querySelector('.tf-summary').textContent === '全部系别'`), '清除筛选生效');

// 2. 精灵列表：排序/显示列
await open('dex/list.html', 7000);
const before = await ev(`document.querySelectorAll('tbody tr').length`);
ok(before > 0, `列表渲染 ${before} 行`);
await ev(`document.querySelectorAll('th.sortable')[0] && document.querySelectorAll('th.sortable')[0].click()`); await sleep(300);
ok(await ev(`document.querySelectorAll('tbody tr').length`) === before, '排序后行数不变');

// 3. 详情页：异色切换（本地图不可用时只验证按钮存在+状态）
await open('dex/vow-detail.html?id=068', 7000);
ok(await ev(`!!document.querySelector('.vow-figure img')`), '详情页展示台渲染');
const shinyBtn = await ev(`!![...document.querySelectorAll('.stage-btn')].find(b=>b.textContent.includes('异色'))`);
ok(shinyBtn, '异色切换按钮存在');
if (shinyBtn) {
    await ev(`[...document.querySelectorAll('.stage-btn')].find(b=>b.textContent.includes('异色')).click()`); await sleep(500);
    ok(await ev(`!!document.querySelector('.stage-btn.active')`), '异色切换后选中态更新');
}

// 4. 全局搜索 Ctrl+K
await open('index.html', 2500);
await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'k', code: 'KeyK', windowsVirtualKeyCode: 75, modifiers: 2 });
await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'k', code: 'KeyK', windowsVirtualKeyCode: 75, modifiers: 2 });
await sleep(400);
ok(await ev(`!!document.querySelector('.gs-root.is-open')`), 'Ctrl+K 打开全局搜索');
await ev(`document.querySelector('.gs-input').value='沐沐';document.querySelector('.gs-input').dispatchEvent(new Event('input'))`);
await sleep(7000);
ok(await ev(`document.querySelectorAll('.gs-item').length > 0`), '全局搜索能搜到书内个体');

// 5. 权柄看板：选择个体
await open('world/authority.html', 8000);
const opts1 = await ev(`[...document.querySelectorAll('select option')].map(o=>o.textContent).join('|')`);
ok(opts1.includes('沐沐') && !opts1.includes('叶芽鹿'), `权柄看板选择源是个体（${opts1.slice(0,60)}）`);
ok(await ev(`document.body.innerText.includes('种族 ·')`), '显示种族关联信息');
await ev(`document.querySelector('.switch input').click()`); await sleep(300);
ok(await ev(`!!document.querySelector('.badge.hot')`), '掌权开关切换生效');

// 6. 血脉模拟器：选个体 + 默认血脉
await open('reference/bloodline-sim.html', 8000);
ok(await ev(`document.querySelector('.banner h3')?.textContent.includes('属性血脉')`), '血脉模拟器默认读取个体档案的血脉');
await ev(`document.querySelectorAll('.stone')[1].click()`); await sleep(300);
ok(await ev(`document.querySelector('.banner h3')?.textContent.includes('黑暗血脉')`), '切换血脉之石生效');

// 7. 设定检查器
await open('tools/consistency.html', 8000);
ok(await ev(`document.querySelectorAll('.issue').length > 0`), '一致性检查器产出报告');
await ev(`document.querySelectorAll('.f')[1].click()`); await sleep(300);
ok(await ev(`document.body.innerText.includes('没有问题') || document.querySelectorAll('.issue.error').length > 0`), '严重问题筛选生效');

// 8. 后台：保存 → 审计记录
await open('admin/admin-skills.html', 4000);
ok(await ev(`typeof AuditLog === 'object'`), '后台审计模块已加载');
await ev(`VowmonStore.save('skills',{skills:allSkillsData})`); await sleep(300);
ok(await ev(`AuditLog.list().length > 0 && AuditLog.list()[0].action === '保存'`), '保存操作写入审计日志');
await open('admin/admin-audit.html', 3000);
ok(await ev(`document.querySelectorAll('table tr').length > 1`), '审计页显示记录');

// 9. 控制台无异常
ok(errs.length === 0, '全程无 JS 异常' + (errs.length ? ': ' + errs.slice(0,3).join(' | ') : ''));
console.log(fails.length ? `\nFAIL ${fails.length}` : '\n全站功能 E2E 全部通过');
chrome.kill(); process.exit(fails.length ? 1 : 0);
