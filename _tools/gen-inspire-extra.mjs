/**
 * 生成「每日灵感」特性库 / 技能库 -> D:/novels/vowmon_data/
 *   inspiration-abilities.json  特性卡（四源）
 *   inspiration-skills.json     技能卡（四源）
 *
 * 数据源（全部一次性抓取 / 已有缓存，图片引用源站 URL 不落盘）：
 *   宝可梦：_tools/.pokemon-cache/ability-*.json（中文名+中文描述+拥有者）+ PokeAPI /move/{id}（技能）
 *   洛克：rocokingdomworld.org 页面内嵌 JSON（224 特性含描述/拥有者；586 技能含 learnset）
 *   赛尔号：seer-data.json 的魂印 + SMW ask 分类:技能（技能名/效果/归属精灵/威力…）
 *   奥奇：aoqi-data.json 的技能/特长
 *
 * 用法：node _tools/gen-inspire-extra.mjs
 * 断点续传：move 缓存在 _tools/.pokemon-cache/move-{id}.json，SMW 缓存在 _tools/.seer-skill-cache/
 */
import fs from 'node:fs';
import path from 'node:path';

const DATA = 'D:/novels/vowmon_data';
const PK_CACHE = path.resolve('_tools/.pokemon-cache');
const SE_CACHE = path.resolve('_tools/.seer-skill-cache');
const API = 'https://pokeapi.co/api/v2';
const SEER_API = 'https://wiki.biligame.com/seer/api.php';
const CONCURRENCY = 10;
const GAP = 4500;
fs.mkdirSync(SE_CACHE, { recursive: true });

const sleep = ms => new Promise(r => setTimeout(r, ms));
const clean = s => String(s || '').replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ').replace(/&middot;/g, '·').replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
    .replace(/&[\w]+;/g, '').replace(/\s+/g, ' ').trim();

async function fetchJson(url, headers = {}) {
    let lastErr;
    for (let i = 0; i < 4; i++) {
        try {
            const res = await fetch(url, { headers: { 'User-Agent': 'vowmon-wiki-data-gen', ...headers } });
            if (res.status === 429 || res.status >= 500) { await sleep(1500 * (i + 1)); lastErr = new Error('HTTP ' + res.status); continue; }
            if (!res.ok) throw new Error('HTTP ' + res.status);
            const text = await res.text();
            if (text.startsWith('<!doctype html') || text.startsWith('<html')) throw new Error('WAF 拦截页');
            return JSON.parse(text);
        } catch (e) { lastErr = e; await sleep(2000 * (i + 1)); }
    }
    throw lastErr || new Error('fetch failed');
}

async function pool(ids, worker) {
    const results = new Array(ids.length);
    let cursor = 0, done = 0;
    await Promise.all(Array.from({ length: CONCURRENCY }, async () => {
        while (cursor < ids.length) {
            const idx = cursor++;
            results[idx] = await worker(ids[idx]);
            if (++done % 100 === 0) console.log('  进度 ' + done + '/' + ids.length);
        }
    }));
    return results;
}

function readJson(file) { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { return null; } }
function writeJson(file, obj) { fs.writeFileSync(file, JSON.stringify(obj)); }

/* ================= 宝可梦特性（缓存） ================= */
const abilities = [];
const skillPool = [];      // 统一格式：{id, src, name, ...}
const abilityPool = [];

function pkNameFromUrl(url) {
    const m = url && url.match(/\/(\d+)\/?$/);
    return m ? parseInt(m[1], 10) : 0;
}

console.log('宝可梦特性（本地缓存）…');
{
    const pkData = readJson(path.join(DATA, 'pokemon-data.json'));
    const idToName = {};
    for (const p of (pkData.pokemon || [])) idToName[p.id] = p.name;
    const files = fs.readdirSync(PK_CACHE).filter(f => /^ability-\d+\.json$/.test(f));
    for (const f of files) {
        const a = readJson(path.join(PK_CACHE, f));
        if (!a || a.__empty) continue;
        const zh = (a.names || []).find(n => n.language.name === 'zh-hans');
        const flavor = (a.flavor_text_entries || []).find(e => e.language.name === 'zh-hans');
        const effect = (a.effect_entries || []).find(e => e.language.name === 'en');
        const learners = (a.pokemon || []).map(e => ({ id: pkNameFromUrl(e.pokemon.url), hidden: !!e.is_hidden }))
            .filter(e => e.id && idToName[e.id])
            .map(e => ({ id: e.id, name: idToName[e.id], hidden: e.hidden, src: 'pk' }));
        abilityPool.push({
            id: 'pk-' + a.id, src: 'pk', name: zh ? zh.name : a.name, en: a.name,
            desc: flavor ? clean(flavor.flavor_text) : (effect ? clean(effect.effect).slice(0, 180) : ''),
            learners: learners
        });
    }
    console.log('  特性 ' + abilityPool.length + ' 条');
}

/* ================= 洛克特性 / 技能（页面内嵌 JSON） ================= */
console.log('洛克特性 + 技能（内嵌 JSON）…');
{
    const embedded = async url => {
        const res = await fetch(url, { headers: { 'User-Agent': 'vowmon-wiki-data-gen' } });
        const html = await res.text();
        const m = [...html.matchAll(/<script type="application\/json"[^>]*>([\s\S]*?)<\/script>/g)]
            .find(x => x[1].length > 100000);
        return m ? JSON.parse(m[1]).data : null;
    };
    {
        const d = await embedded('https://rocokingdomworld.org/abilities/');
        const spiritById = {};
        for (const s of (d.spirits || [])) spiritById[s.id] = s.names.zh || s.names.en;
        for (const t of (d.traits || [])) {
            const learners = (t.spiritIds || []).map(id => spiritById[id]).filter(Boolean)
                .map(name => ({ id: name, name: name, src: 'rk' }));
            abilityPool.push({
                id: 'rk-' + t.id, src: 'rk', name: t.names.zh || t.names.en || t.id, en: t.names.en || '',
                desc: t.descriptions && t.descriptions.zh ? t.descriptions.zh : '', learners: learners
            });
        }
        console.log('  洛克特性 ' + (d.traits || []).length + ' 条');
    }
    {
        const d = await embedded('https://rocokingdomworld.org/skills/');
        const learnerMap = {};   // skillId -> [{name, lv}]
        for (const sp of (d.spirits || [])) {
            for (const row of (sp.skills || [])) {
                const sid = String(row[0]);
                if (!learnerMap[sid]) learnerMap[sid] = [];
                learnerMap[sid].push({ id: sp.names.zh || sp.names.en, name: sp.names.zh || sp.names.en, lv: row[2], src: 'rk' });
            }
        }
        const typeZh = { Normal: '一般', Fire: '火', Water: '水', Electric: '电', Grass: '草', Ice: '冰', Fighting: '格斗', Poison: '毒', Ground: '地面', Flying: '飞行', Psychic: '超能力', Bug: '虫', Rock: '岩石', Ghost: '幽灵', Dragon: '龙', Dark: '恶', Steel: '钢', Fairy: '妖精' };
        for (const s of (d.skills || [])) {
            skillPool.push({
                id: 'rk-' + s.id, src: 'rk', name: s.names.zh || s.names.en || s.id, en: s.names.en || '',
                type: typeZh[s.type] || s.type || '', icon: s.icon ? 'https://rocokingdomworld.org' + s.icon : '',
                desc: '', learners: learnerMap[s.id] || []
            });
        }
        console.log('  洛克技能 ' + (d.skills || []).length + ' 条');
    }
}

/* ================= 赛尔号魂印（已有数据） ================= */
console.log('赛尔号魂印…');
{
    const seer = readJson(path.join(DATA, 'seer-data.json'));
    let cnt = 0;
    for (const p of (seer.pets || [])) {
        for (const s of (p.soulSeal || [])) {
            abilityPool.push({
                id: 'se-seal-' + p.no + '-' + cnt, src: 'se', name: p.name + '的魂印',
                en: '', desc: s.effect || '', icon: s.icon || '',
                learners: [{ id: p.no, name: p.name, src: 'se' }]
            });
            cnt++;
        }
    }
    console.log('  魂印 ' + cnt + ' 条');
}

/* ================= 奥奇特长（已有数据） ================= */
console.log('奥奇特长…');
{
    const aq = readJson(path.join(DATA, 'aoqi-data.json'));
    for (const p of (aq.pets || [])) {
        if (p.talent && p.talent !== '无') {
            abilityPool.push({
                id: 'aq-talent-' + p.id, src: 'aq', name: p.talent, en: '',
                desc: p.dex ? String(p.dex).slice(0, 100) : '', learners: [{ id: p.id, name: p.name, src: 'aq' }]
            });
        }
        for (const key of ['skill', 'ult']) {
            const name = p[key];
            if (name && name !== '无') {
                const fx = p[key === 'skill' ? 'skillFx' : 'ultFx'];
                skillPool.push({
                    id: 'aq-' + key + '-' + p.id, src: 'aq', name: String(name).replace(/（[^）]*）$/, ''),
                    en: '', type: key === 'ult' ? '超杀技' : '普通技', desc: fx && fx !== '无' ? fx : '',
                    learners: [{ id: p.id, name: p.name, src: 'aq' }]
                });
            }
        }
    }
    console.log('  奥奇技能 ' + skillPool.filter(s => s.src === 'aq').length + ' 条');
}

/* ================= 宝可梦技能（PokeAPI，缓存续抓） ================= */
console.log('宝可梦技能（PokeAPI /move）…');
{
    const pkData = readJson(path.join(DATA, 'pokemon-data.json'));
    const idToName = {};
    for (const p of (pkData.pokemon || [])) idToName[p.id] = p.name;
    const list = await fetchJson(API + '/move?limit=100000');
    const ids = (list.results || []).map(r => { const m = r.url.match(/\/(\d+)\/?$/); return m ? parseInt(m[1], 10) : 0; }).filter(Boolean);
    console.log('  共 ' + ids.length + ' 个技能');
    const moves = await pool(ids, async id => {
        const cf = path.join(PK_CACHE, 'move-' + id + '.json');
        let obj = readJson(cf);
        if (!obj) {
            obj = await fetchJson(API + '/move/' + id);
            writeJson(cf, obj);
        }
        return obj;
    });
    const TYPE_ZH = { normal: '一般', fire: '火', water: '水', electric: '电', grass: '草', ice: '冰', fighting: '格斗', poison: '毒', ground: '地面', flying: '飞行', psychic: '超能力', bug: '虫', rock: '岩石', ghost: '幽灵', dragon: '龙', dark: '恶', steel: '钢', fairy: '妖精' };
    const CAT_ZH = { physical: '物理', special: '特殊', status: '变化' };
    for (const mv of moves) {
        if (!mv) continue;
        const zh = (mv.names || []).find(n => n.language.name === 'zh-hans');
        const flavor = (mv.flavor_text_entries || []).find(e => e.language.name === 'zh-hans');
        const effect = (mv.effect_entries || []).find(e => e.language.name === 'en');
        const learners = (mv.learned_by_pokemon || []).map(e => pkNameFromUrl(e.url))
            .filter(id => id && idToName[id]).map(id => ({ id, name: idToName[id], src: 'pk' }))
            .slice(0, 80);
        skillPool.push({
            id: 'pk-' + mv.id, src: 'pk', name: zh ? zh.name : mv.name, en: mv.name,
            type: TYPE_ZH[mv.type && mv.type.name] || (mv.type && mv.type.name) || '',
            cat: CAT_ZH[mv.damage_class && mv.damage_class.name] || '',
            power: mv.power || 0, acc: mv.accuracy || 0, pp: mv.pp || 0,
            desc: flavor ? clean(flavor.flavor_text) : (effect ? clean(effect.effect).slice(0, 180) : ''),
            learners: learners
        });
    }
    console.log('  宝可梦技能 ' + skillPool.filter(s => s.src === 'pk').length + ' 条');
}

/* ================= 赛尔号技能（SMW ask，缓存续抓） ================= */
console.log('赛尔号技能（SMW ask）…');
{
    // 技能页 wikitext 参数：技能序号/技能名称/技能类型/技能属性/威力/次数/先制/命中率/技能效果
    // 归属精灵、学习精灵是 SMW 对象属性（用于「谁会这招」）
    const PROPS = ['技能序号', '技能名称', '技能类型', '技能属性', '技能效果', '威力', '次数', '先制', '命中率', '归属精灵', '学习精灵'];
    let offset = 0;
    const rows = [];
    while (true) {
        const cf = path.join(SE_CACHE, 'ask2-' + offset + '.html');
        let html;
        try { html = fs.readFileSync(cf, 'utf8'); console.log('  offset=' + offset + '（缓存）'); }
        catch (e) {
            try {
                const q = encodeURIComponent('{{#ask:[[分类:技能]]|limit=1000|offset=' + offset + '|mainlabel=页面|' + PROPS.map(p => '?' + p).join('|') + '}}');
                const j = await fetchJson(SEER_API + '?format=json&action=parse&text=' + q);
                html = j.parse.text['*'];
                fs.writeFileSync(cf, html);
                await sleep(GAP);
            } catch (err) {
                // WAF 拦截时降级：跳过赛尔号技能，不阻断其余三源落盘（下次重跑读缓存续抓）
                console.warn('  SMW 拉取失败（' + err.message + '），跳过赛尔号技能');
                break;
            }
        }
        const found = [...html.matchAll(/<tr data-row-number="\d+"[^>]*>([\s\S]*?)<\/tr>/g)];
        if (!found.length) break;
        rows.push(...found.map(m => m[1]));
        if (found.length < 1000) break;
        offset += 1000;
    }
    const seer = readJson(path.join(DATA, 'seer-data.json'));
    const byNo = {};
    for (const p of (seer.pets || [])) byNo[p.no] = p;
    for (const tr of rows) {
        const cells = {};
        for (const m of tr.matchAll(/<td class="([^"]*)"[^>]*>([\s\S]*?)<\/td>/g)) {
            for (const cls of m[1].split(/\s+/)) if (PROPS.includes(cls)) cells[cls] = cells[cls] || m[2];
        }
        // wiki 的「技能名称」属性存的是序号文本（1/2/3…），直接用会显示成一串数字；
        // 改用「效果第一小句（截 10 字）」做可读名字；desc 截 200 字控制文件体积。
        const no = clean(cells['技能序号'] || '').match(/\d+/);
        const fx = clean(cells['技能效果'] || '');
        const firstClause = fx.split(/[,，。；;]/)[0].trim();
        const name = firstClause ? firstClause.slice(0, 10) : ('技能 ' + (no ? no[0] : ''));
        const nums = s => String(s || '').match(/\d+/g) || [];
        const ownerNos = [...new Set([...nums(cells['归属精灵']), ...nums(cells['学习精灵'])])];
        const learners = ownerNos.map(n => byNo[n]).filter(Boolean).map(p => ({ id: p.no, name: p.name, src: 'se' }));
        const powerM = clean(cells['威力'] || '').match(/\d+/);
        skillPool.push({
            id: 'se-skill-' + clean(cells['技能序号'] || name), src: 'se', name: name, en: '',
            type: clean(cells['技能属性'] || ''), cat: clean(cells['技能类型'] || ''),
            power: powerM ? parseInt(powerM[0], 10) : 0,
            pp: (clean(cells['次数'] || '').match(/\d+/) || [0])[0],
            desc: fx.slice(0, 200), learners: learners
        });
    }
    console.log('  赛尔号技能 ' + skillPool.filter(s => s.src === 'se').length + ' 条（' + rows.length + ' 行）');
}

/* ================= 输出 ================= */
function finish(pool, file, kind) {
    // 去重：宝可梦/洛克/奥奇按「同 src 同名」合并 learners；
    // 赛尔号技能名是效果摘要（易重名），改按 id（技能序号）去重避免误合。
    const map = new Map();
    for (const e of pool) {
        const key = e.src + '|' + (kind === 'skill' && e.src === 'se' ? e.id : e.name);
        const old = map.get(key);
        if (old) {
            const names = new Set(old.learners.map(l => l.name));
            for (const l of e.learners) if (!names.has(l.name)) { old.learners.push(l); names.add(l.name); }
            if (!old.desc && e.desc) old.desc = e.desc;
        } else map.set(key, e);
    }
    const arr = [...map.values()].filter(e => e.name);
    // learners 瘦身：去掉冗余 src 字段（模板只用 name/id/hidden/lv）
    for (const e of arr) {
        e.learners = (e.learners || []).map(l => {
            const o = { id: l.id, name: l.name };
            if (l.hidden) o.hidden = true;
            if (l.lv) o.lv = l.lv;
            return o;
        });
    }
    const out = { updated: new Date().toISOString().slice(0, 10), count: arr.length, kind: kind, items: arr };
    writeJson(path.join(DATA, file), out);
    const bySrc = {};
    for (const e of arr) bySrc[e.src] = (bySrc[e.src] || 0) + 1;
    console.log('完成 ' + file + '：' + arr.length + ' 条 ' + JSON.stringify(bySrc));
}
finish(abilityPool, 'inspiration-abilities.json', 'ability');
finish(skillPool, 'inspiration-skills.json', 'skill');
