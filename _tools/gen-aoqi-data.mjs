/**
 * 生成奥奇传说数据 -> D:/novels/vowmon_data/aoqi-data.json
 *
 * 数据源：aoqi.100bt.com（百田官网）
 *   - 列表页 /jingling/daquan_list.html：单页全量静态 HTML（真实立绘在 img 的 dsrc 属性，src 是懒加载占位图）
 *   - 详情页 /jingling/{id}.html：静态「图鉴技能表特长」大表（table.aoqi__table01），
 *     每列一个进化阶段，行有 名称/特长/属性/身高/体重/爱好/普通技能/特效/超杀技/特效/获得方式/成长故事
 *     （行数因精灵而异，按行标签自适应；取最后一列 = 最终形态）
 *
 * 用法：node _tools/gen-aoqi-data.mjs
 * 断点续传：详情页缓存到 _tools/.aoqi-cache/
 */
import fs from 'node:fs';
import path from 'node:path';

const OUT = 'D:/novels/vowmon_data/aoqi-data.json';
const LIST_URL = 'http://aoqi.100bt.com/jingling/daquan_list.html';
const CACHE = path.resolve('_tools/.aoqi-cache');
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
            if (done % 100 === 0) console.log('  进度 ' + done + '/' + items.length);
        }
    }
    await Promise.all(Array.from({ length: CONCURRENCY }, run));
    return results;
}

/* 本体名：去掉 [版本] 前缀；有 · 称号的取最后一个 · 后面 */
function baseName(title) {
    let t = String(title || '').replace(/^\[[^\]]*\]/, '').trim();
    const parts = t.split('·');
    return parts[parts.length - 1].trim() || t;
}

/* 剥标签 + 解 HTML 实体 + 压空白 */
function clean(raw) {
    let s = String(raw || '')
        .replace(/<br\s*\/?>/gi, ' ')
        .replace(/<[^>]+>/g, '')
        .replace(/&hellip;|&mldr;/g, '…')
        .replace(/&mdash;/g, '—')
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#(\d+);/g, (m, d) => String.fromCharCode(parseInt(d, 10)));
    return s.replace(/\s+/g, ' ').trim();
}

/* ---------------- 解析详情页（三种版式自适应） ---------------- */

/* 通用：把一张表的行拆成 [每格文本] */
function tableRows(tbl) {
    return [...tbl.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)]
        .map(m => [...m[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map(t => clean(t[1])))
        .filter(r => r.length);
}

/* 版式一：aoqi__table01 大表，每列一个进化阶段 */
function parseOldTable(html) {
    const i = html.indexOf('aoqi__table01');
    const rows = tableRows(html.slice(i, html.indexOf('</table>', i)));
    const rowsL = rows.map(r => ({ label: r[0], values: r.slice(1) }));
    const findRow = (kw) => rowsL.find(r => r.label.includes(kw));
    const nameRow = findRow('名称') || findRow('精灵名');
    const evo = nameRow ? nameRow.values.filter(v => v) : [];
    const lastOf = (r) => { if (!r) return ''; const vs = r.values.filter(v => v); return vs.length ? vs[vs.length - 1] : ''; };
    const fxRows = rowsL.filter(r => r.label === '特效');
    const skillRow = findRow('普通技能');
    const ultRow = findRow('超杀技');
    const fxAfter = (anchor) => {
        if (!anchor) return '';
        const ai = rowsL.indexOf(anchor);
        const fx = fxRows.find(r => rowsL.indexOf(r) > ai);
        return fx ? lastOf(fx) : '';
    };
    return {
        talent: lastOf(findRow('特长')),
        type: lastOf(findRow('属性')),
        skill: lastOf(skillRow), skillFx: fxAfter(skillRow),
        ult: lastOf(ultRow), ultFx: fxAfter(ultRow),
        h: lastOf(findRow('身高')), w: lastOf(findRow('体重')),
        hobby: lastOf(findRow('爱好')),
        dex: lastOf(findRow('成长故事')),
        evo: evo
    };
}

/* 版式二：tujianTable，th=行标签（新版，属性由 JS 填充拿不到，成长故事静态） */
function parseNewTable(html) {
    const i = html.indexOf('tujianTable');
    const tbl = html.slice(i, html.indexOf('</table>', i));
    // 该表行标签在 <th>，值在 <td>，分开抓
    const rows = [...tbl.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)].map(m => {
        const th = m[1].match(/<th[^>]*>([\s\S]*?)<\/th>/);
        const tds = [...m[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map(t => clean(t[1]));
        return { label: th ? clean(th[1]) : '', tds };
    });
    const out = { talent: '', type: '', skill: '', skillFx: '', ult: '', ultFx: '', h: '', w: '', hobby: '', dex: '', evo: [] };
    for (const r of rows) {
        if (r.label === '成长故事' && r.tds.length) out.dex = r.tds[0];
    }
    // 技能表：列 分类|技能名|特效（多数「敬请期待」，取有真实内容的行）
    const skIdx = rows.findIndex(r => r.label === '分类');
    if (skIdx >= 0) {
        const sk = rows.slice(skIdx + 1).filter(r => r.tds.length >= 2 && r.tds[1] && !r.tds[1].includes('敬请期待'));
        const normal = sk.filter(r => !String(r.tds[0]).includes('超杀'));
        const ultra = sk.filter(r => String(r.tds[0]).includes('超杀'));
        if (normal.length) { out.skill = normal[normal.length - 1].tds[1]; out.skillFx = normal[normal.length - 1].tds[2] || ''; }
        if (ultra.length) { out.ult = ultra[ultra.length - 1].tds[1]; out.ultFx = ultra[ultra.length - 1].tds[2] || ''; }
    }
    return out;
}

/* 版式三：无 class 的手写表（表头 精灵名|技能|特效|超杀技|特效），成长故事是行内文本 */
function parsePlainTable(html) {
    const out = { talent: '', type: '', skill: '', skillFx: '', ult: '', ultFx: '', h: '', w: '', hobby: '', dex: '', evo: [] };
    // 遍历 <table>，找表头含「精灵名」的那张（「精灵名」也会出现在 meta description 里，不能直接 indexOf）
    for (const tm of html.matchAll(/<table[^>]*>/g)) {
        const tstart = tm.index;
        const tbl = html.slice(tstart, html.indexOf('</table>', tstart));
        if (!tbl.slice(0, 4000).includes('精灵名')) continue;
        const rows = tableRows(tbl);
        const data = rows.filter(r => r.length >= 4 && r[0] && r[0] !== '精灵名' && !r[0].includes('图鉴') && !r[0].includes('推荐') && !r[0].includes('巨人技'));
        if (data.length) {
            const last = data[data.length - 1];
            out.skill = last[1] || '';
            out.skillFx = last[2] || '';
            out.ult = last[3] || '';
            out.ultFx = last[4] || '';
            out.evo = data.map(r => r[0]);
        }
        break;
    }
    // 成长故事：行内文本「成长故事：xxx」，截至下一个栏目标签
    const gi = html.indexOf('成长故事');
    if (gi >= 0) {
        let seg = html.slice(gi, gi + 500);
        const stop = seg.search(/极限战斗力|神属觉醒|获得方式|更多精灵/);
        if (stop > 0) seg = seg.slice(0, stop);
        out.dex = clean(seg).replace(/^成长故事[：:]?\s*/, '').trim() || '';
    }
    return out;
}

function parseDetail(html) {
    if (html.includes('aoqi__table01')) return parseOldTable(html);
    if (html.includes('tujianTable')) return parseNewTable(html);
    return parsePlainTable(html);
}

/* ---------------- 主流程 ---------------- */

console.log('抓取奥奇精灵大全列表…');
const html = await fetchText(LIST_URL);
const items = [...html.matchAll(/<li class="daquanItem[^>]*>[\s\S]*?<\/li>/g)].map(m => m[0]);
console.log('解析出 ' + items.length + ' 个条目（含皮肤变体）');

const pets = [];
const seenBase = new Set();
for (const li of items) {
    const idM = li.match(/href="http:\/\/aoqi\.100bt\.com\/jingling\/(\d+)\.html"/);
    const titleM = li.match(/title="([^"]+)"/);
    // 真实立绘在 dsrc 属性（src 是懒加载占位图 loading28.gif）
    const imgM = li.match(/<img[^>]*dsrc="([^"]+)"/) || li.match(/<img[^>]*src="([^"]+)"/);
    if (!idM || !titleM) continue;
    const id = idM[1];
    const title = titleM[1].trim();
    const base = baseName(title);
    if (!base || seenBase.has(base)) continue;   // 列表按上线时间倒序，首个 = 最新形态
    seenBase.add(base);
    pets.push({
        id: id,
        name: base,
        full: title,
        img: imgM ? imgM[1] : '',
        link: 'http://aoqi.100bt.com/jingling/' + id + '.html'
    });
}

console.log('抓取详情页（图鉴技能表）…');
const details = await pool(pets, async (p) => {
    const cacheFile = path.join(CACHE, p.id + '.html');
    let html;
    try {
        html = fs.readFileSync(cacheFile, 'utf8');
    } catch (e) {
        try {
            html = await fetchText(p.link);
            fs.writeFileSync(cacheFile, html);
        } catch (e2) {
            console.warn('detail ' + p.name + ' 失败: ' + e2.message);
            return null;
        }
    }
    return parseDetail(html);
});

const outPets = pets.map((p, i) => {
    const d = details[i] || {};
    return {
        id: p.id, name: p.name, full: p.full, img: p.img, link: p.link,
        type: d.type || '', talent: d.talent || '',
        skill: d.skill || '', skillFx: d.skillFx || '',
        ult: d.ult || '', ultFx: d.ultFx || '',
        h: d.h || '', w: d.w || '', hobby: d.hobby || '',
        dex: d.dex || '',
        evo: d.evo || []
    };
});

const out = {
    updated: new Date().toISOString().slice(0, 10),
    source: 'aoqi.100bt.com',
    count: outPets.length,
    pets: outPets
};
fs.writeFileSync(OUT, JSON.stringify(out));
console.log('完成：' + outPets.length + ' 只 -> ' + OUT + '（' + Math.round(fs.statSync(OUT).size / 1024) + ' KB）');
const stat = (k) => outPets.filter(p => p[k]).length;
console.log('属性: ' + stat('type') + ' / 特长: ' + stat('talent') + ' / 技能: ' + stat('skill') +
    ' / 超杀技: ' + stat('ult') + ' / 成长故事: ' + stat('dex') + ' / 进化链: ' + outPets.filter(p => p.evo.length > 1).length);
