/**
 * 生成宝可梦参考数据 -> D:/novels/vowmon_data/pokemon-data.json
 *
 * 数据源：PokeAPI（https://pokeapi.co），免费无需密钥。
 * 每个 species 抓两个接口：
 *   - /api/v2/pokemon-species/{id}   中文名 / 属名 / 图鉴介绍 / 世代(地区)
 *   - /api/v2/pokemon/{id}           属性 / 种族值 / 身高体重
 * 图鉴介绍按「最新世代优先」挑选 zh-Hans 文本（朱紫 > 传说阿尔宙斯 > 剑盾 > …），
 * 没有中文的用英文兜底。
 *
 * 用法：node _tools/gen-pokemon-data.mjs
 * 断点续传：结果缓存到 _tools/.pokemon-cache/，中断后重跑只补缺的部分。
 */
import fs from 'node:fs';
import path from 'node:path';

const OUT = 'D:/novels/vowmon_data/pokemon-data.json';
const CACHE = path.resolve('_tools/.pokemon-cache');
const API = 'https://pokeapi.co/api/v2';
const CONCURRENCY = 12;
const RETRY = 4;

fs.mkdirSync(CACHE, { recursive: true });

/* ------------------------- 常量映射 ------------------------- */

// 世代 -> 地区（按世代从新到旧排序，用于挑最新图鉴文本）
const GENERATIONS = [
    { key: 'generation-ix',    region: '帕底亚', rank: 9 },
    { key: 'generation-viii',  region: '伽勒尔', rank: 8 },
    { key: 'generation-vii',   region: '阿罗拉', rank: 7 },
    { key: 'generation-vi',    region: '卡洛斯', rank: 6 },
    { key: 'generation-v',     region: '合众',   rank: 5 },
    { key: 'generation-iv',    region: '神奥',   rank: 4 },
    { key: 'generation-iii',   region: '丰缘',   rank: 3 },
    { key: 'generation-ii',    region: '城都',   rank: 2 },
    { key: 'generation-i',     region: '关都',   rank: 1 }
];

// 版本 -> 中文名（rank 越大越新）。注意 flavor_text_entries 里的 version 是
// 单版本名（scarlet / violet / sword…），不是版本组名，所以要逐个列。
const VERSIONS = [
    { key: 'scarlet',      label: '朱／紫',           rank: 100 },
    { key: 'violet',       label: '朱／紫',           rank: 100 },
    { key: 'legends-arceus', label: '传说 阿尔宙斯',   rank: 95 },
    { key: 'sword',        label: '剑／盾',           rank: 90 },
    { key: 'shield',       label: '剑／盾',           rank: 90 },
    { key: 'lets-go-pikachu', label: 'Let\u2019s Go', rank: 85 },
    { key: 'lets-go-eevee',   label: 'Let\u2019s Go', rank: 85 },
    { key: 'ultra-sun',    label: '究极之日／月',      rank: 80 },
    { key: 'ultra-moon',   label: '究极之日／月',      rank: 80 },
    { key: 'sun',          label: '太阳／月亮',        rank: 75 },
    { key: 'moon',         label: '太阳／月亮',        rank: 75 },
    { key: 'omega-ruby',   label: '欧米伽红宝石／阿尔法蓝宝石', rank: 70 },
    { key: 'alpha-sapphire', label: '欧米伽红宝石／阿尔法蓝宝石', rank: 70 },
    { key: 'x',            label: 'X／Y',            rank: 65 },
    { key: 'y',            label: 'X／Y',            rank: 65 },
    { key: 'black-2',      label: '黑2／白2',         rank: 60 },
    { key: 'white-2',      label: '黑2／白2',         rank: 60 },
    { key: 'black',        label: '黑／白',           rank: 55 },
    { key: 'white',        label: '黑／白',           rank: 55 },
    { key: 'heartgold',    label: '心金／魂银',        rank: 50 },
    { key: 'soulsilver',   label: '心金／魂银',        rank: 50 },
    { key: 'platinum',     label: '白金',             rank: 45 },
    { key: 'diamond',      label: '钻石／珍珠',        rank: 40 },
    { key: 'pearl',        label: '钻石／珍珠',        rank: 40 },
    { key: 'emerald',      label: '绿宝石',           rank: 35 },
    { key: 'firered',      label: '火红／叶绿',        rank: 30 },
    { key: 'leafgreen',    label: '火红／叶绿',        rank: 30 },
    { key: 'ruby',         label: '红宝石／蓝宝石',    rank: 25 },
    { key: 'sapphire',     label: '红宝石／蓝宝石',    rank: 25 },
    { key: 'crystal',      label: '水晶',             rank: 20 },
    { key: 'gold',         label: '金／银',           rank: 15 },
    { key: 'silver',       label: '金／银',           rank: 15 },
    { key: 'red',          label: '红／绿',           rank: 10 },
    { key: 'blue',         label: '红／绿',           rank: 10 },
    { key: 'yellow',       label: '皮卡丘',           rank: 8 }
];

const TYPE_ZH = {
    normal: '一般', fire: '火', water: '水', electric: '电', grass: '草',
    ice: '冰', fighting: '格斗', poison: '毒', ground: '地面', flying: '飞行',
    psychic: '超能力', bug: '虫', rock: '岩石', ghost: '幽灵', dragon: '龙',
    dark: '恶', steel: '钢', fairy: '妖精'
};

const STAT_KEYS = {
    'hp': 'hp', 'attack': 'atk', 'defense': 'def',
    'special-attack': 'spa', 'special-defense': 'spd', 'speed': 'spe'
};

// 历代御三家基础形态的 species id（「最初的伙伴」标签）
const STARTERS = [
    1, 4, 7, 152, 155, 158, 252, 255, 258, 387, 390, 393,
    495, 498, 501, 650, 653, 656, 722, 725, 728, 810, 813, 816, 906, 909, 912
];

// 「大器晚成」= 准神 600 族（52poke 分类），10 条三段进化线全部成员；
// 注意：不能按 growth_rate==='slow' 判定，传说宝可梦同样是 slow 成长，会误标。
const LATE_BLOOMERS = [
    // 迷你龙线 / 幼基拉斯线 / 宝贝龙线 / 铁哑铃线 / 圆陆鲨线
    147, 148, 149, 246, 247, 248, 371, 372, 373, 374, 375, 376, 443, 444, 445,
    // 单首龙线 / 黏美儿线（含洗翠） / 心鳞宝线 / 多龙线 / 凉脊龙线
    633, 634, 635, 702, 703, 704, 705, 706, 782, 783, 784, 885, 886, 887, 996, 997, 998
];

/* ------------------------- 请求小工具 ------------------------- */

async function fetchJson(url) {
    let lastErr = null;
    for (let i = 0; i < RETRY; i++) {
        try {
            const res = await fetch(url, { headers: { 'User-Agent': 'vowmon-wiki-data-gen' } });
            if (res.status === 429 || res.status >= 500) {
                await new Promise(r => setTimeout(r, 1500 * (i + 1)));
                lastErr = new Error('HTTP ' + res.status);
                continue;
            }
            if (!res.ok) throw new Error('HTTP ' + res.status);
            return await res.json();
        } catch (e) {
            lastErr = e;
            await new Promise(r => setTimeout(r, 1200 * (i + 1)));
        }
    }
    throw lastErr || new Error('fetch failed');
}

// 磁盘缓存：一个 id 一个文件，中断重跑只抓缺的
function cachePath(kind, id) { return path.join(CACHE, kind + '-' + id + '.json'); }
function readCache(kind, id) {
    try {
        const raw = fs.readFileSync(cachePath(kind, id), 'utf8');
        const obj = JSON.parse(raw);
        return obj && obj.__empty ? { __empty: true } : obj;
    } catch (e) { return null; }
}
function writeCache(kind, id, obj) {
    fs.writeFileSync(cachePath(kind, id), JSON.stringify(obj));
}

async function pool(ids, worker) {
    const results = new Array(ids.length);
    let cursor = 0;
    let done = 0;
    async function run() {
        while (cursor < ids.length) {
            const idx = cursor++;
            results[idx] = await worker(ids[idx], idx);
            done++;
            if (done % 50 === 0) console.log('  进度 ' + done + '/' + ids.length);
        }
    }
    await Promise.all(Array.from({ length: CONCURRENCY }, run));
    return results;
}

/* ------------------------- 字段加工 ------------------------- */

function cleanFlavor(text) {
    return String(text || '')
        .replace(/[\n\f\r]+/g, ' ')
        .replace(/\s{2,}/g, ' ')
        .trim();
}

function pickFlavor(species) {
    // 1) 最新世代优先：先按图鉴文本所在版本的新旧排序，取最新一条中文
    const zh = (species.flavor_text_entries || []).filter(e => e.language.name === 'zh-hans');
    const en = (species.flavor_text_entries || []).filter(e => e.language.name === 'en');
    for (const pool of [zh, en]) {
        let best = null;
        for (const e of pool) {
            const ver = VERSIONS.find(v => v.key === e.version.name);
            const rank = ver ? ver.rank : 0;
            if (!best || rank > best.rank) best = { rank, e, ver };
        }
        if (best) {
            return {
                text: cleanFlavor(best.e.flavor_text),
                ver: best.ver ? best.ver.label : best.e.version.name,
                lang: pool === zh ? 'zh' : 'en'
            };
        }
    }
    return { text: '', ver: '', lang: '' };
}

function pickGenus(species) {
    const g = (species.genera || []).find(x => x.language.name === 'zh-hans')
        || (species.genera || []).find(x => x.language.name === 'en');
    return g ? g.genus : '';
}

function pickName(species) {
    const zh = (species.names || []).find(n => n.language.name === 'zh-hans');
    const en = (species.names || []).find(n => n.language.name === 'en');
    return {
        zh: zh ? zh.name : (en ? en.name : ''),
        en: en ? en.name : ''
    };
}

function buildEntry(id, species, poke, evoIds, abilityZh) {
    if (species.__empty || poke.__empty) return null;
    const gen = GENERATIONS.find(g => g.key === (species.generation && species.generation.name));
    const types = (poke.types || [])
        .sort((a, b) => a.slot - b.slot)
        .map(t => TYPE_ZH[t.type.name] || t.type.name)
        .filter(Boolean);
    const stats = {};
    let total = 0;
    for (const s of (poke.stats || [])) {
        const k = STAT_KEYS[s.stat.name];
        if (k) { stats[k] = s.base_stat; total += s.base_stat; }
    }
    const dex = pickFlavor(species);
    const name = pickName(species);
    // 特性：zh 名查表，查不到兜底英文名；is_hidden 标隐藏特性
    const abilities = (poke.abilities || [])
        .sort((a, b) => a.slot - b.slot)
        .map(a => {
            const zh = abilityZh && abilityZh.get(a.ability && a.ability.url);
            return { name: zh || (a.ability && a.ability.name) || '', hidden: !!a.is_hidden };
        })
        .filter(a => a.name);
    // 标签：传说 / 幻之 / 最初的伙伴（御三家基础形态）/ 大器晚成（经验成长曲线 slow）
    const tags = [];
    if (species.is_legendary) tags.push('传说');
    if (species.is_mythical) tags.push('幻之');
    if (STARTERS.includes(id)) tags.push('最初的伙伴');
    if (LATE_BLOOMERS.includes(id)) tags.push('大器晚成');
    return {
        id: id,
        no: ('000' + id).slice(-3),
        name: name.zh || name.en,
        en: name.en,
        genus: pickGenus(species),
        types: types,
        region: gen ? gen.region : '',
        gen: gen ? gen.rank : 0,
        tags: tags,
        stats: stats,
        total: total,
        abilities: abilities,
        h: poke.height,          // 分米，展示时 /10 = 米
        w: poke.weight,          // 百克，展示时 /10 = 千克
        dex: dex.text,
        dexVer: dex.ver,
        dexLang: dex.lang,
        evo: evoIds || []        // 进化链上所有成员的 species id（按进化顺序）
    };
}

/* ------------------------- 进化链 ------------------------- */

// 从缓存 species 收集进化链 URL，逐条抓取并摊平成成员 id 列表（DFS 序）
function flattenChain(node, out, seen) {
    if (!node || seen.has(node.species.name)) return;
    seen.add(node.species.name);
    const m = node.species.url.match(/\/(\d+)\/?$/);
    if (m) out.push(parseInt(m[1], 10));
    for (const next of (node.evolves_to || [])) flattenChain(next, out, seen);
}

async function buildEvoMap(speciesArr) {
    const urlSet = new Set();
    for (const s of speciesArr) {
        if (s && !s.__empty && s.evolution_chain && s.evolution_chain.url) {
            urlSet.add(s.evolution_chain.url);
        }
    }
    console.log('共 ' + urlSet.size + ' 条进化链，开始抓取…');
    const urls = [...urlSet];
    const chainOf = await pool(urls, async (url) => {
        const cid = url.match(/\/(\d+)\/?$/)[1];
        let obj = readCache('chain', cid);
        if (!obj) {
            try {
                obj = await fetchJson(url);
                writeCache('chain', cid, obj);
            } catch (e) {
                console.warn('chain ' + cid + ' 失败: ' + e.message);
                obj = { __empty: true };
            }
        }
        return obj;
    });
    const map = new Map();   // species url -> [ids]
    for (let i = 0; i < urls.length; i++) {
        if (chainOf[i].__empty) continue;
        const out = [];
        flattenChain(chainOf[i].chain, out, new Set());
        map.set(urls[i], out);
    }
    return map;
}

/* ------------------------- 主流程 ------------------------- */

console.log('拉取精灵列表…');
const list = await fetchJson(API + '/pokemon-species?limit=100000');
const ids = (list.results || [])
    .map(r => { const m = r.url.match(/\/(\d+)\/?$/); return m ? parseInt(m[1], 10) : 0; })
    .filter(v => v >= 1 && v <= 20000)
    .sort((a, b) => a - b);
console.log('共 ' + ids.length + ' 只 species，开始抓取（并发 ' + CONCURRENCY + '）…');

const speciesArr = await pool(ids, async (id) => {
    let obj = readCache('species', id);
    if (!obj) {
        try {
            obj = await fetchJson(API + '/pokemon-species/' + id);
            writeCache('species', id, obj);
        } catch (e) {
            console.warn('species ' + id + ' 失败: ' + e.message);
            obj = { __empty: true };
        }
    }
    return obj;
});

const pokeArr = await pool(ids, async (id) => {
    let obj = readCache('poke', id);
    if (!obj) {
        try {
            obj = await fetchJson(API + '/pokemon/' + id);
            writeCache('poke', id, obj);
        } catch (e) {
            console.warn('poke ' + id + ' 失败: ' + e.message);
            obj = { __empty: true };
        }
    }
    return obj;
});

const evoMap = await buildEvoMap(speciesArr);

/* 特性中文名：收集全部去重的 ability url，逐条抓 /ability/{id} 取 zh-hans 名（缓存） */
console.log('抓取特性中文名…');
const abilityUrlSet = new Set();
for (const pk of pokeArr) {
    if (!pk || pk.__empty) continue;
    for (const a of (pk.abilities || [])) {
        if (a.ability && a.ability.url) abilityUrlSet.add(a.ability.url);
    }
}
const abilityUrls = [...abilityUrlSet];
console.log('共 ' + abilityUrls.length + ' 个特性，开始抓取…');
const abilityZh = new Map();
await pool(abilityUrls, async (url) => {
    const aid = url.match(/\/(\d+)\/?$/)[1];
    let obj = readCache('ability', aid);
    if (!obj) {
        try {
            obj = await fetchJson(url);
            writeCache('ability', aid, obj);
        } catch (e) {
            console.warn('ability ' + aid + ' 失败: ' + e.message);
            obj = { __empty: true };
        }
    }
    if (!obj || obj.__empty) return;
    const zh = (obj.names || []).find(n => n.language.name === 'zh-hans')
        || (obj.names || []).find(n => n.language.name === 'zh-Hans');
    if (zh) abilityZh.set(url, zh.name);
});
console.log('特性中文名: ' + abilityZh.size + '/' + abilityUrls.length);

const pokemon = [];
for (let i = 0; i < ids.length; i++) {
    const sp = speciesArr[i];
    const evoIds = (sp && !sp.__empty && sp.evolution_chain && evoMap.get(sp.evolution_chain.url)) || [];
    const entry = buildEntry(ids[i], sp, pokeArr[i], evoIds, abilityZh);
    if (entry) pokemon.push(entry);
}
// 补抓失败的（__empty 的）
const failed = ids.length - pokemon.length;
if (failed > 0) console.warn('有 ' + failed + ' 只抓取失败，已跳过（可重跑补齐）');

const out = {
    updated: new Date().toISOString().slice(0, 10),
    source: 'PokeAPI',
    count: pokemon.length,
    pokemon: pokemon
};
fs.writeFileSync(OUT, JSON.stringify(out));
const sizeKB = Math.round(fs.statSync(OUT).size / 1024);
console.log('完成：' + pokemon.length + ' 条 -> ' + OUT + '（' + sizeKB + ' KB）');
