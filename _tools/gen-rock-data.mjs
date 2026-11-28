/**
 * 生成洛克王国数据 -> D:/novels/vowmon_data/rock-data.json
 *
 * 数据源：rocokingdomworld.org（洛克王国世界图鉴，静态 SSR HTML，对爬虫友好）
 *   - 列表页 /zh/pokedex/：每只精灵的编号/中英文名/属性(带官方色)/图片/种族值总和/家族/阶位
 *   - 详情页 /zh/pokedex/{slug}：图鉴描述 + 六维种族值(HP/ATK/M.ATK/DEF/M.DEF/SPD) + 身高体重
 * 进化链用列表页的 data-family + data-family-rank 拼出来（同 family 按阶位排序）。
 *
 * 用法：node _tools/gen-rock-data.mjs
 * 断点续传：详情页缓存到 _tools/.rock-cache/
 */
import fs from 'node:fs';
import path from 'node:path';

const OUT = 'D:/novels/vowmon_data/rock-data.json';
const LIST_URL = 'https://rocokingdomworld.org/zh/pokedex/';
const CACHE = path.resolve('_tools/.rock-cache');
const CONCURRENCY = 10;

fs.mkdirSync(CACHE, { recursive: true });

async function fetchText(url) {
    for (let i = 0; i < 4; i++) {
        try {
            const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' } });
            if (res.status === 429 || res.status >= 500) { await new Promise(r => setTimeout(r, 1500 * (i + 1))); continue; }
            if (!res.ok) throw new Error('HTTP ' + res.status);
            return await res.text();
        } catch (e) {
            if (i === 3) throw e;
            await new Promise(r => setTimeout(r, 1200 * (i + 1)));
        }
    }
    return null;
}

async function pool(items, worker) {
    const results = new Array(items.length);
    let cursor = 0, done = 0;
    async function run() {
        while (cursor < items.length) {
            const idx = cursor++;
            results[idx] = await worker(items[idx], idx);
            done++;
            if (done % 80 === 0) console.log('  进度 ' + done + '/' + items.length);
        }
    }
    await Promise.all(Array.from({ length: CONCURRENCY }, run));
    return results;
}

function attr(block, name) {
    const m = block.match(new RegExp('data-' + name + '="([^"]*)"'));
    return m ? m[1] : '';
}

/* ------------------------- 解析列表页 ------------------------- */

function parseList(html) {
    const cells = html.split('<div class="spirit-cell"').slice(1);
    const pets = [];
    for (const cell of cells) {
        const block = cell.slice(0, cell.indexOf('<div class="spirit-cell"') === -1 ? undefined : cell.indexOf('<div class="spirit-cell"'));
        const href = block.match(/href="\/zh\/pokedex\/([a-z0-9-]+)"/);
        if (!href) continue;
        const slug = href[1];
        const no = attr(block, 'no');                 // NO001
        const name = attr(block, 'title');            // 迪莫
        const total = parseInt(attr(block, 'total'), 10) || 0;
        const family = attr(block, 'family');
        const rank = parseInt(attr(block, 'family-rank'), 10) || 1;
        const form = attr(block, 'form-type') || '原始形态';
        // 立绘：锚定 data-spirit-art 属性（否则可能误取系别小图标）
        let img = (block.match(/<img src="([^"]+)"[^>]*data-spirit-art/) || [])[1] || '';
        const alt = (block.match(/alt="([^"]+)"/) || [])[1] || '';
        const en = (alt.match(/\(([^)]+)\)/) || [])[1] || '';
        // 属性 pill（可能多个）：背景色 + 中文
        const types = [];
        const pillRe = /<span class="type-pill" style="background:(#[0-9A-Fa-f]{6})">[\s\S]*?<span>([^<]+)<\/span>\s*<\/span>/g;
        let pm;
        while ((pm = pillRe.exec(block)) !== null) {
            types.push({ zh: pm[2].trim(), color: pm[1] });
        }
        if (!name || !types.length) continue;
        pets.push({ slug, no, name, en, types, total, family, rank, form, img: 'https://rocokingdomworld.org' + img });
    }
    return pets;
}

/* ------------------------- 解析详情页 ------------------------- */

function parseDetail(html) {
    const out = { dex: '', stats: {}, h: '', w: '', evo: [] };
    // 图鉴描述：异色 badge 后的第一段
    const dexM = html.match(/<p class="mt-4 text-sm text-ink-muted leading-relaxed font-semibold">([^<]+)<\/p>/);
    if (dexM) out.dex = dexM[1].trim();
    // 种族值：六维 HP/ATK/M.ATK/DEF/M.DEF/SPD
    // 键名与宝可梦数据对齐：物攻=atk、魔攻=mag、物防=def、魔防=res、速度=spe
    const statRe = /<div class="w-16 text-xs font-extrabold text-ink-muted">(HP|ATK|M\.ATK|DEF|M\.DEF|SPD)<\/div>[\s\S]*?text-ink">(\d+)<\/div>/g;
    const KEY_MAP = { 'HP': 'hp', 'ATK': 'atk', 'M.ATK': 'mag', 'DEF': 'def', 'M.DEF': 'res', 'SPD': 'spe' };
    let sm;
    while ((sm = statRe.exec(html)) !== null) {
        out.stats[KEY_MAP[sm[1]]] = parseInt(sm[2], 10);
    }
    // 身高体重
    const hM = html.match(/<dt class="text-ink-dim">身高<\/dt><dd class="text-ink">([^<]+)<\/dd>/);
    if (hM) out.h = hM[1].trim();
    const wM = html.match(/<dt class="text-ink-dim">体重<\/dt><dd class="text-ink">([^<]+)<\/dd>/);
    if (wM) out.w = wM[1].trim();
    // 进化链：「进化链」section 内按顺序出现的成员（链接 + 名字 + 图）
    const secM = html.match(/<h2 class="text-xl font-display font-bold text-ink mb-3">进化链<\/h2>[\s\S]*?<\/section>/);
    if (secM) {
        const sec = secM[0];
        const itemRe = /<a href="\/zh\/pokedex\/([a-z0-9-]+)"[^>]*title="([^"]+)"[^>]*>[\s\S]*?<img src="([^"]+)"[^>]*alt="([^"]*)"/g;
        let im;
        while ((im = itemRe.exec(sec)) !== null) {
            out.evo.push({ slug: im[1], name: im[2], img: 'https://rocokingdomworld.org' + im[3] });
        }
    }
    return out;
}

/* ------------------------- 主流程 ------------------------- */

console.log('抓取列表页…');
const listHtml = await fetchText(LIST_URL);
const pets = parseList(listHtml);
console.log('解析出 ' + pets.length + ' 只精灵');

console.log('抓取详情页（种族值/图鉴描述）…');
const slugs = pets.map(p => p.slug);
const details = await pool(slugs, async (slug) => {
    const cacheFile = path.join(CACHE, slug + '.html');
    let html;
    try {
        html = fs.readFileSync(cacheFile, 'utf8');
    } catch (e) {
        try {
            html = await fetchText('https://rocokingdomworld.org/zh/pokedex/' + slug);
            fs.writeFileSync(cacheFile, html);
        } catch (e2) {
            console.warn('detail ' + slug + ' 失败: ' + e2.message);
            return { __empty: true };
        }
    }
    return parseDetail(html);
});

// 进化链直接取详情页「进化链」区块（同族每只的链一致）
const outPets = pets.map((p, i) => {
    const d = details[i] && !details[i].__empty ? details[i] : { dex: '', stats: {}, h: '', w: '', evo: [] };
    const statVals = Object.values(d.stats);
    const evo = (d.evo || []).map(e => ({ name: e.name, img: e.img }));
    return {
        id: p.slug,
        no: p.no,
        name: p.name,
        en: p.en,
        types: p.types.map(t => t.zh),
        typeColors: Object.fromEntries(p.types.map(t => [t.zh, t.color])),
        total: p.total || statVals.reduce((a, b) => a + b, 0),
        stats: d.stats,
        h: d.h,
        w: d.w,
        dex: d.dex,
        img: p.img,
        form: p.form,
        evo: evo
    };
});

const out = {
    updated: new Date().toISOString().slice(0, 10),
    source: 'rocokingdomworld.org',
    count: outPets.length,
    pets: outPets
};
fs.writeFileSync(OUT, JSON.stringify(out));
console.log('完成：' + outPets.length + ' 条 -> ' + OUT + '（' + Math.round(fs.statSync(OUT).size / 1024) + ' KB）');
const withDex = outPets.filter(p => p.dex).length;
const withStats = outPets.filter(p => Object.keys(p.stats).length === 6).length;
console.log('含图鉴描述: ' + withDex + ' / 含完整种族值: ' + withStats);
