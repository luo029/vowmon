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
    // 属性列偶尔混入精灵名（如「机械地面系 北冥·玄武」），只保留到第一个「系」
    let type = clean(c['属性'] || '');
    if (type.includes('系')) type = type.slice(0, type.indexOf('系') + 1);
    const num = k => { const v = clean(c[k] || ''); const m = v.match(/\d+/); return m ? parseInt(m[0], 10) : null; };
    const stats = { hp: num('体力'), atk: num('攻击'), def: num('防御'), sa: num('特攻'), sd: num('特防'), spe: num('速度') };
    // 进化链：wiki 的「进化链」属性是空格分隔的序号串（如 0010 0011 0012），
    // 也可能有顿号/逗号写法，统一按空白+标点切分；只剩自己一条时视为无进化链
    const evoRaw = clean(c['进化链'] || '');
    let evo = evoRaw ? evoRaw.split(/[\s，,、]+/).map(s => s.trim()).filter(Boolean) : [];
    // 过滤 wiki 模板残缺占位符（如 {{{一阶段形态}}}、[[文件:…]]），只留纯序号/纯名字
    evo = evo.filter(s => !/\{\{|\[\[|\}\}/.test(s));
    // 去前导零，与序号字段（108）格式一致，前端按序号反查才能命中
    evo = [...new Set(evo.map(s => s.replace(/^0+(?=\d)/, '')))];
    if (evo.length < 2) evo = [];
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

/* ---------------- 第 1.5 步：魂印 & 刻印（SMW 批量对象查询，不逐页抓） ----------------
 * 每个精灵页的「专属魂印&专属刻印」区块由模板 {{精灵-new}} 用 SMW ask 渲染：
 *   魂印 = 分类:魂印 的页面，分类里带精灵序号补零 4 位（分类:0753），属性：
 *          魂印ID（=精灵序号补零）/ 魂印图标（图文件名 base）/ 魂印效果 / kind（标签号）
 *   刻印 = 分类:刻印 且有「专属精灵」属性（值 = 精灵数字序号），属性：ID / 名称 / 描述
 * 图标文件名固定「魂印-{图标}.png」「刻印-{ID}.png」，可用 Special:FilePath 构造。
 */
async function askRows(cond, printouts, cacheName) {
    let offset = 0;
    const rows = [];
    while (true) {
        const cacheFile = path.join(CACHE, cacheName + '-' + offset + '.html');
        let html;
        try {
            html = fs.readFileSync(cacheFile, 'utf8');
            console.log('  ' + cacheName + ' offset=' + offset + '（缓存）');
        } catch (e) {
            // 参数必须写在 {{#ask:…}} 花括号内部，放在外面 limit 会失效（默认只有 50）
            const q = encodeURIComponent('{{#ask:' + cond + '|limit=' + PAGE + '|offset=' + offset + '|mainlabel=页面' + printouts + '}}');
            const j = await getJson(API + '?format=json&action=parse&text=' + q);
            html = j.parse.text['*'];
            fs.writeFileSync(cacheFile, html);
            await sleep(GAP);
            console.log('  ' + cacheName + ' offset=' + offset + ' -> ' + html.length + ' 字节');
        }
        const found = [...html.matchAll(/<tr data-row-number="\d+"[^>]*>([\s\S]*?)<\/tr>/g)];
        if (!found.length) break;
        rows.push(...found.map(m => m[1]));
        if (found.length < PAGE) break;
        offset += PAGE;
    }
    return rows;
}

function askCells(trHtml, props) {
    const cells = {};
    for (const m of trHtml.matchAll(/<td class="([^"]*)"[^>]*>([\s\S]*?)<\/td>/g)) {
        for (const cls of m[1].split(/\s+/)) {
            if (props.includes(cls)) cells[cls] = cells[cls] || m[2];
        }
    }
    return cells;
}

console.log('SMW ask 批量拉取魂印…');
const SEAL_ICON = 'https://wiki.biligame.com/seer/Special:FilePath/';
const sealMap = new Map();
// 相关精灵 = 所属精灵的数字序号（魂印ID 是魂印自己的编号，别拿它当精灵序号）
const sealRows = await askRows('[[分类:魂印]]', '|?相关精灵|?魂印图标|?魂印效果', 'seal');
for (const tr of sealRows) {
    const c = askCells(tr, ['相关精灵', '魂印ID', '魂印图标', '魂印效果']);
    const ownM = clean(c['相关精灵'] || '').match(/\d+/) || clean(c['魂印ID'] || '').match(/\d+/);
    const effect = clean(c['魂印效果'] || '');
    if (!ownM || !effect) continue;
    const no = parseInt(ownM[0], 10);
    if (!sealMap.has(no)) sealMap.set(no, []);
    sealMap.get(no).push({ icon: clean(c['魂印图标'] || ''), effect: effect });
}
console.log('魂印: ' + [...sealMap.values()].flat().length + ' 条，覆盖精灵 ' + sealMap.size + ' 只');

console.log('SMW ask 批量拉取刻印…');
const enMap = new Map();
const enRows = await askRows('[[分类:刻印]][[专属精灵::+]]', '|?ID|?名称|?描述|?专属精灵', 'engrave');
for (const tr of enRows) {
    const c = askCells(tr, ['ID', '名称', '描述', '专属精灵']);
    const ownerM = clean(c['专属精灵'] || '').match(/\d+/);
    const desc = clean(c['描述'] || '');
    if (!ownerM || !desc) continue;
    const no = parseInt(ownerM[0], 10);
    if (!enMap.has(no)) enMap.set(no, []);
    enMap.get(no).push({ id: clean(c['ID'] || ''), name: clean(c['名称'] || ''), desc: desc });
}
console.log('刻印: ' + [...enMap.values()].flat().length + ' 条，覆盖精灵 ' + enMap.size + ' 只');

for (const p of pets) {
    const no = parseInt(p.no, 10);
    p.soulSeal = (sealMap.get(no) || []).map(s => ({
        icon: s.icon ? SEAL_ICON + encodeURIComponent('魂印-' + s.icon + '.png') : '',
        effect: s.effect
    }));
    p.engrave = (enMap.get(no) || []).map(g => ({
        icon: g.id ? SEAL_ICON + encodeURIComponent('刻印-' + g.id + '.png') : '',
        name: g.name, desc: g.desc
    }));
}
console.log('已挂载: 魂印 ' + pets.filter(p => p.soulSeal.length).length +
    ' 只 / 刻印 ' + pets.filter(p => p.engrave.length).length + ' 只');

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
