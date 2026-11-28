/**
 * 生成赛尔号数据 -> D:/novels/vowmon_data/seer-data.json
 *
 * 数据源：wiki.biligame.com/seer（赛尔号 BWIKI，MediaWiki + Semantic MediaWiki）
 *   - 精灵数据全部在 SMW 页面属性里（序号/属性/性别/身高/体重/六维种族值/总能力值/简介/外号/进化链）
 *     → 用 api.php 的 {{#ask:[[分类:精灵]]}} 批量查询，offset 分页（SMW 单次上限 1000）
 *   - 图片用 action=query&prop=pageimages 批量取（一次 50 只）
 *
 * WAF 注意：biligame 有 EdgeOne 防护，请求间隔必须 ≥4s，被拦截要长退避重试。
 *
 * 用法：node _tools/gen-seer-data.mjs
 * 断点续传：ask 分页结果缓存到 _tools/.seer-cache/ask-{offset}.html
 */
import fs from 'node:fs';
import path from 'node:path';

const OUT = 'D:/novels/vowmon_data/seer-data.json';
const CACHE = path.resolve('_tools/.seer-cache');
const API = 'https://wiki.biligame.com/seer/api.php';
const PAGE = 1000;          // SMW 单次上限
const GAP = 4500;           // 普通请求间隔
const IMG_GAP = 5000;       // 图片批量间隔
const IMG_BATCH = 50;       // pageimages 单次上限

fs.mkdirSync(CACHE, { recursive: true });

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function getJson(url) {
    for (let i = 0; i < 4; i++) {
        const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' } });
        const text = await res.text();
        if (text.startsWith('<')) {   // EdgeOne 拦截页
            const wait = 180000 * (i + 1);
            console.warn('  被 WAF 拦截，' + Math.round(wait / 1000) + 's 后重试…');
            await sleep(wait);
            continue;
        }
        return JSON.parse(text);
    }
    throw new Error('WAF 连续拦截');
}

function clean(raw) {
    return String(raw || '')
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<[^>]+>/g, '')
        .replace(/&nbsp;/g, ' ')
        .replace(/&middot;/g, '·')
        .replace(/&hellip;/g, '…')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&[\w]+;/g, '')
        .replace(/\s+/g, ' ')
        .trim();
}

/* ---------------- 第一步：SMW ask 分页拉全量精灵属性 ---------------- */

const PROPS = ['序号', '属性', '性别', '身高', '体重', '体力', '攻击', '防御', '特攻', '特防', '速度', '总能力值', '简介', '外号', '进化链'];

console.log('SMW ask 分页拉取精灵属性…');
let offset = 0;
const allRows = [];
while (true) {
    const cacheFile = path.join(CACHE, 'ask-' + offset + '.html');
    let html;
    try {
        html = fs.readFileSync(cacheFile, 'utf8');
        console.log('  offset=' + offset + '（缓存）');
    } catch (e) {
        const q = encodeURIComponent('{{#ask:[[分类:精灵]]|limit=' + PAGE + '|offset=' + offset + '|mainlabel=页面|' + PROPS.map(p => '?' + p).join('|') + '}}');
        const j = await getJson(API + '?format=json&action=parse&text=' + q);
        html = j.parse.text['*'];
        fs.writeFileSync(cacheFile, html);
        await sleep(GAP);
        console.log('  offset=' + offset + ' -> ' + html.length + ' 字节');
    }
    const rows = [...html.matchAll(/<tr data-row-number="\d+"[^>]*>([\s\S]*?)<\/tr>/g)];
    if (!rows.length) break;
    allRows.push(...rows.map(m => m[1]));
    if (rows.length < PAGE) break;
    offset += PAGE;
}
console.log('共 ' + allRows.length + ' 个精灵页面');

/* 按列 class 名解析（避免依赖列顺序） */
function parseRow(trHtml) {
    const cells = {};
    for (const m of trHtml.matchAll(/<td class="([^"]*)"[^>]*>([\s\S]*?)<\/td>/g)) {
        for (const cls of m[1].split(/\s+/)) {
            if (PROPS.includes(cls) || cls === '页面' || cls === 'smwtype_wpg') cells[cls] = cells[cls] || m[2];
        }
    }
    return cells;
}

const pets = [];
for (const tr of allRows) {
    const c = parseRow(tr);
    // 页面名（链接文本）
    const name = clean((c['页面'] || c['smwtype_wpg'] || ''));
    if (!name) continue;
    const noM = clean(c['序号'] || '').match(/\d+/);
    const no = noM ? noM[0] : '';
    if (!no) continue;    // 没有合法序号的（测试页/杂页）跳过
    const type = clean(c['属性'] || '');
    const num = k => { const v = clean(c[k] || ''); const m = v.match(/\d+/); return m ? parseInt(m[0], 10) : null; };
    const stats = { hp: num('体力'), atk: num('攻击'), def: num('防御'), sa: num('特攻'), sd: num('特防'), spe: num('速度') };
    // 进化链：顿号/逗号分隔的阶段名
    const evoRaw = clean(c['进化链'] || '');
    const evo = evoRaw ? evoRaw.split(/[，,、]+/).map(s => s.trim()).filter(Boolean) : [];
    pets.push({
        id: name,
        name: name,
        no: no,
        type: type,
        gender: clean(c['性别'] || ''),
        h: clean(c['身高'] || ''),
        w: clean(c['体重'] || ''),
        stats: stats,
        total: num('总能力值') || Object.values(stats).reduce((a, b) => a + (b || 0), 0),
        dex: clean(c['简介'] || ''),
        alias: clean(c['外号'] || ''),
        evo: evo,
        img: '',
        link: 'https://wiki.biligame.com/seer/' + encodeURIComponent('精灵:' + no)
    });
}
console.log('有效精灵（有合法序号）: ' + pets.length + ' 只');

/* ---------------- 第二步：立绘 URL（可构造，不请求任何接口） ----------------
 * MediaWiki 内置 Special:FilePath/<文件名> 会 301/302 到真实文件 URL。
 * 立绘文件名固定格式「立绘-{序号}.png」，头像「头像-{序号}.png」作兜底。
 * 浏览器加载 <img> 时自动跟随重定向，生成端零请求、零 WAF 风险。
 */
console.log('构造立绘 URL（不请求接口）…');
for (const p of pets) {
    p.img = 'https://wiki.biligame.com/seer/Special:FilePath/' + encodeURIComponent('立绘-' + p.no + '.png');
    p.imgFallback = 'https://wiki.biligame.com/seer/Special:FilePath/' + encodeURIComponent('头像-' + p.no + '.png');
}
console.log('全部 ' + pets.length + ' 只完成（img / imgFallback）');

/* ---------------- 输出 ---------------- */

const out = {
    updated: new Date().toISOString().slice(0, 10),
    source: 'wiki.biligame.com/seer（SMW 批量查询）',
    count: pets.length,
    pets: pets
};
fs.writeFileSync(OUT, JSON.stringify(out));
console.log('完成 -> ' + OUT + '（' + Math.round(fs.statSync(OUT).size / 1024) + ' KB）');
console.log('属性: ' + pets.filter(p => p.type).length + ' / 简介: ' + pets.filter(p => p.dex).length +
    ' / 种族值六维: ' + pets.filter(p => p.stats.hp != null).length + ' / 进化链: ' + pets.filter(p => p.evo.length).length);
