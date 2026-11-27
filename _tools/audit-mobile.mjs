// 全站移动端审计：遍历所有前台/后台页面，390px / 360px 视口检查横向溢出与渲染
import { spawn } from 'node:child_process';
import fs from 'node:fs';

const BASE = process.argv[2] || 'http://127.0.0.1:8797';
const PORT = 9310;
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PAGES = [
    'index.html', '404.html',
    'dex/vowdex.html', 'dex/list.html', 'dex/vow-detail.html?id=068', 'dex/realm-dex.html', 'dex/compare.html', 'dex/region-forms.html',
    'records/individuals.html', 'records/characters.html', 'records/timeline.html',
    'reference/skills.html', 'reference/skill-detail.html', 'reference/traits.html', 'reference/natures.html',
    'reference/items.html', 'reference/bloodlines.html', 'reference/bloodline-sim.html',
    'reference/calculator.html', 'reference/coverage.html',
    'world/ranks.html', 'world/ranks-path.html', 'world/authority.html', 'world/trainers.html', 'world/factions.html', 'world/lore.html',
    'battle/index.html', 'battle/rules.html', 'tools/consistency.html', 'tools/diagnostics.html',
    'admin/index.html', 'admin/admin-skills.html', 'admin/admin-traits.html', 'admin/admin-items.html',
    'admin/admin-images.html', 'admin/admin-lore.html', 'admin/admin-individuals.html', 'admin/admin-characters.html',
    'admin/admin-stages.html', 'admin/admin-bloodline-skills.html', 'admin/admin-audit.html'
];
const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${PORT}`, '--disable-gpu', '--no-first-run',
    '--window-size=390,844', '--user-data-dir=' + fs.mkdtempSync('C:/Windows/Temp/cdpmob-'), 'about:blank'], { stdio: 'ignore' });
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
const problems = [];

for (const width of [390, 360]) {
    await send('Emulation.setDeviceMetricsOverride', { width, height: 844, deviceScaleFactor: 2, mobile: true });
    console.log(`\n=== ${width}px ===`);
    for (const page of PAGES) {
        await send('Page.navigate', { url: BASE + '/' + page });
        await sleep(1800);
        const r = await ev(`(function(){
            var d=document.documentElement, b=document.body;
            var over = d.scrollWidth - window.innerWidth;
            var worst = [];
            if (over > 2) {
                var els = document.querySelectorAll('body *');
                for (var i=0;i<els.length;i++){
                    var e=els[i], rc=e.getBoundingClientRect();
                    if (rc.right > window.innerWidth + 3 && rc.width>0 && getComputedStyle(e).position!=='fixed') {
                        worst.push((e.tagName+'.'+(typeof e.className==='string'?e.className.split(' ').slice(0,2).join('.'):'')).slice(0,50)+' r='+Math.round(rc.right));
                    }
                    if (worst.length>=4) break;
                }
            }
            return JSON.stringify({over:over, unrendered:(b.innerText||'').includes('{{'), worst:worst});
        })()`);
        const o = JSON.parse(r || '{}');
        if (o.over > 2 || o.unrendered) {
            const msg = `${page}: 溢出 ${o.over}px ${o.worst.join(' | ')}${o.unrendered ? ' / 有未编译模板' : ''}`;
            console.log('  ✗ ' + msg);
            problems.push({ width, page, over: o.over, worst: o.worst, unrendered: o.unrendered });
        } else {
            console.log('  ✓ ' + page);
        }
    }
}
console.log('\n横向溢出/渲染问题: ' + problems.length);
if (errs.length) console.log('JS 异常: ' + JSON.stringify(errs.slice(0, 8)));
fs.writeFileSync('_tools/mobile-audit.json', JSON.stringify({ problems, errs }, null, 2));
chrome.kill(); process.exit(0);
