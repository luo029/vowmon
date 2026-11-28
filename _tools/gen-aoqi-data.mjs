/**
 * 生成奥奇传说数据 -> D:/novels/vowmon_data/aoqi-data.json
 *
 * 数据源：aoqi.100bt.com/jingling/daquan_list.html（百田官网精灵大全，单页全量静态 HTML）
 * 列表项只有：名字（含 [版本] 前缀与 · 称号）、详情页 id、缩略图。
 * 属性/种族值在官网是 JS 动态渲染，静态抓不到 —— 本数据不含系别，卡片展示名字+立绘。
 * 同一精灵的皮肤/版本变体很多，按「本体名」去重（保留最新一条）。
 *
 * 用法：node _tools/gen-aoqi-data.mjs
 */
import fs from 'node:fs';

const OUT = 'D:/novels/vowmon_data/aoqi-data.json';
const LIST_URL = 'http://aoqi.100bt.com/jingling/daquan_list.html';

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

/* 本体名：去掉 [版本] 前缀；有 · 称号的取最后一个 · 后面 */
function baseName(title) {
    let t = String(title || '').replace(/^\[[^\]]*\]/, '').trim();
    const parts = t.split('·');
    return parts[parts.length - 1].trim() || t;
}

/* 从动态缩略图 URL 里还原原图地址 */
function realImg(src) {
    const m = String(src || '').match(/[?&]src=([^&]+)/);
    if (m) { try { return decodeURIComponent(m[1]); } catch (e) { return src; } }
    return src;
}

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
        img: realImg(imgM ? imgM[1] : ''),
        link: 'http://aoqi.100bt.com/jingling/' + id + '.html'
    });
}

const out = {
    updated: new Date().toISOString().slice(0, 10),
    source: 'aoqi.100bt.com',
    count: pets.length,
    pets: pets
};
fs.writeFileSync(OUT, JSON.stringify(out));
console.log('完成：' + pets.length + ' 只（本体去重后） -> ' + OUT + '（' + Math.round(fs.statSync(OUT).size / 1024) + ' KB）');
