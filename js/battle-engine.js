/* ==========================================================================
   Vowmon Wiki 精灵对战引擎 —— 纯逻辑，不含任何 UI
   --------------------------------------------------------------------------
   独立可测：所有函数都是纯计算（随机数通过 rng 注入），页面在 battle/index.html。

   伤害公式（宝可梦官方公式改造，等级 L）：
       基础 = floor(floor(2L/5 + 2) × 威力 × 攻/防) / 50) + 2
       修正 = 本系加成 1.5 × 属性克制 × 天气 × 场地 × 随机 0.85~1.0

   天气/场地照抄宝可梦：
       烈日    火系 ×1.5，水系 ×0.5
       下雨    水系 ×1.5，火系 ×0.5
       沙暴    回合末对非地面/岩石/钢系造成 1/16 最大体力伤害
       冰雹    回合末对非冰系造成 1/16 最大体力伤害
       大雾    技能命中率降为 80%
       电气场地 电系 ×1.3
       青草场地 草系 ×1.3，回合末双方回复 1/16 最大体力
       精神场地 超能力系 ×1.3
       迷雾场地 龙系 ×0.5

   天气/场地由「变化类技能」触发：按技能名 + 效果文本的关键词自动识别，
   不用改技能数据；以后新增天气技能只要文案里带对应关键词就能被识别。
   ========================================================================== */

const BattleEngine = (function () {
    'use strict';

    /* ------------------------------------------------------------ 天气 / 场地定义 */

    const WEATHERS = {
        sun:  { key: 'sun',  name: '烈日', icon: '☀️', color: '#d97706', desc: '火系伤害 ×1.5，水系 ×0.5' },
        rain: { key: 'rain', name: '下雨', icon: '🌧️', color: '#2563eb', desc: '水系伤害 ×1.5，火系 ×0.5' },
        sand: { key: 'sand', name: '沙暴', icon: '🌪️', color: '#b45309', desc: '回合末对非地面/岩石/钢系精灵造成 1/16 最大体力伤害' },
        hail: { key: 'hail', name: '冰雹', icon: '❄️', color: '#3b82f6', desc: '回合末对非冰系精灵造成 1/16 最大体力伤害' },
        fog:  { key: 'fog',  name: '大雾', icon: '🌫️', color: '#6b7280', desc: '技能命中率降为 80%' }
    };

    const TERRAINS = {
        electric: { key: 'electric', name: '电气场地', icon: '⚡', color: '#eab308', boostType: '电',     desc: '电系伤害 ×1.3' },
        grassy:   { key: 'grassy',   name: '青草场地', icon: '🌿', color: '#22c55e', boostType: '草',     desc: '草系伤害 ×1.3；回合末双方回复 1/16 最大体力' },
        psychic:  { key: 'psychic',  name: '精神场地', icon: '🔮', color: '#ec4899', boostType: '超能力', desc: '超能力系伤害 ×1.3' },
        misty:    { key: 'misty',    name: '迷雾场地', icon: '💨', color: '#c084fc', vsType: '龙',        desc: '龙系伤害 ×0.5' }
    };

    /* 天气触发关键词：按优先级依次匹配技能名 → 效果文本 */
    const WEATHER_KEYWORDS = [
        { key: 'sun',  re: /烈阳|大晴天|日照|阳光|放晴|烈日/ },
        { key: 'rain', re: /下雨|降雨|大雨|雨天|求雨/ },
        { key: 'sand', re: /沙暴|沙尘|沙暴/ },
        { key: 'hail', re: /冰雹|下雪|落雪|飘雪|暴雪/ },
        { key: 'fog',  re: /起雾|大雾|浓雾/ }
    ];

    const TERRAIN_KEYWORDS = [
        { key: 'electric', re: /电气场地|电场/ },
        { key: 'grassy',   re: /青草场地|草场/ },
        { key: 'psychic',  re: /精神场地/ },
        { key: 'misty',    re: /迷雾场地|迷雾/ }
    ];

    /**
     * 识别一个技能是否改变天气/场地。
     * 规则：只在变化类技能里找，避免攻击技能效果描述里带「下雨」被误伤。
     * 返回 { type: 'weather'|'terrain', key } 或 null。
     */
    function detectFieldSkill(skill) {
        if (!skill || skill.category !== '变化') return null;
        const text = String(skill.name || '') + ' ' + String(skill.effect || '');
        if (/清空|消除.*天气|天气恢复正常/.test(text)) return { type: 'weather', key: null };
        for (const w of WEATHER_KEYWORDS) if (w.re.test(text)) return { type: 'weather', key: w.key };
        for (const t of TERRAIN_KEYWORDS) if (t.re.test(text)) return { type: 'terrain', key: t.key };
        return null;
    }

    /* ------------------------------------------------------------ 能力值计算 */

    // natures-data 里 up/down 用中文能力名，这里映射到内部键
    const STAT_NAME_TO_KEY = { '攻击': 'atk', '防御': 'def', '特攻': 'spa', '特防': 'spd', '速度': 'spe' };

    /**
     * 宝可梦能力值公式（个体值按满值 31、无努力值折算）：
     *   HP    = floor((2×种族 + 31) × L / 100) + L + 10
     *   其他  = (floor((2×种族 + 31) × L / 100) + 5) × 性格修正
     */
    function computeStats(base, level, nature) {
        const L = Math.max(1, level | 0);
        const stat = (key) => {
            const b = base[key] === undefined ? 1 : base[key];
            return Math.floor((2 * b + 31) * L / 100) + 5;
        };
        const out = {
            hp: Math.floor((2 * (base.hp === undefined ? 1 : base.hp) + 31) * L / 100) + L + 10,
            atk: stat('atk'),
            def: stat('def'),
            spa: stat('spa'),
            spd: stat('spd'),
            spe: stat('spe')
        };

        // 性格加减（±10%）
        if (nature) {
            const up = STAT_NAME_TO_KEY[nature.up];
            const down = STAT_NAME_TO_KEY[nature.down];
            if (up && up !== 'hp') out[up] = Math.floor(out[up] * 1.1);
            if (down && down !== 'hp') out[down] = Math.floor(out[down] * 0.9);
        }
        return out;
    }

    /**
     * 组装一名参战精灵。
     * vow      种族数据（types / stats / image / name）
     * opts     { level, nature, skills: [{name,type,category,power}], displayName, image }
     */
    function buildFighter(vow, opts) {
        const o = opts || {};
        const level = Math.max(1, Math.min(100, o.level || 50));
        const base = vow.stats || {};
        return {
            side: o.side || 'A',
            name: o.displayName || vow.name,
            speciesName: vow.name,
            types: (vow.types || []).slice(),
            level: level,
            image: o.image !== undefined ? o.image : (vow.image || ''),
            stats: computeStats(base, level, o.nature),
            skills: (o.skills || []).slice(),
            maxHp: 0,
            hp: 0
        };
    }

    const initHp = (fighter) => { fighter.maxHp = fighter.stats.hp; fighter.hp = fighter.stats.hp; };

    /* ------------------------------------------------------------ 伤害计算 */

    function weatherDamageMult(weatherKey, skillType) {
        if (weatherKey === 'sun') {
            if (skillType === '火') return 1.5;
            if (skillType === '水') return 0.5;
        }
        if (weatherKey === 'rain') {
            if (skillType === '水') return 1.5;
            if (skillType === '火') return 0.5;
        }
        return 1;
    }

    function terrainDamageMult(terrainKey, skillType) {
        const t = TERRAINS[terrainKey];
        if (!t) return 1;
        if (t.boostType && skillType === t.boostType) return 1.3;
        if (t.vsType && skillType === t.vsType) return 0.5;
        return 1;
    }

    /**
     * 计算一次攻击。返回事件对象（含伤害、倍率明细、是否命中、是否倒下）。
     * field = { weather: 'sun'|null, terrain: 'grassy'|null }
     */
    function calcAttack(attacker, defender, skill, field, rng) {
        const random = rng || Math.random;
        const ev = {
            kind: 'attack',
            attacker: attacker.name,
            defender: defender.name,
            skill: skill,
            missed: false,
            damage: 0,
            effectiveness: 1,
            breakdown: []
        };

        // 大雾命中判定
        if (field.weather === 'fog' && random() > 0.8) {
            ev.missed = true;
            ev.text = attacker.name + '的' + skill.name + '在大雾中偏了，没有命中！';
            return ev;
        }

        const typeMult = (typeof getComboMultiplier === 'function')
            ? getComboMultiplier(skill.type, defender.types || [])
            : 1;
        ev.effectiveness = typeMult;
        if (typeMult === 0) {
            ev.damage = 0;
            ev.text = '这对' + defender.name + '完全没有效果…';
            return ev;
        }

        const isPhysical = skill.category === '物理';
        const A = isPhysical ? attacker.stats.atk : attacker.stats.spa;
        const D = isPhysical ? defender.stats.def : defender.stats.spd;
        const power = Math.max(1, skill.power || 40);

        // 宝可梦官方公式（Gen5+ 取整方式）
        let base = Math.floor(Math.floor((Math.floor(2 * attacker.level / 5) + 2) * power * A / D) / 50) + 2;
        ev.breakdown.push('基础伤害 ' + base);

        let mult = 1;
        const stab = (attacker.types || []).indexOf(skill.type) !== -1;
        if (stab) { mult *= 1.5; ev.breakdown.push('本系加成 ×1.5'); }

        if (typeMult !== 1) { mult *= typeMult; ev.breakdown.push('属性克制 ×' + typeMult); }

        const wMult = weatherDamageMult(field.weather, skill.type);
        if (wMult !== 1) { mult *= wMult; ev.breakdown.push((WEATHERS[field.weather] || {}).name + ' ×' + wMult); }

        const tMult = terrainDamageMult(field.terrain, skill.type);
        if (tMult !== 1) { mult *= tMult; ev.breakdown.push((TERRAINS[field.terrain] || {}).name + ' ×' + tMult); }

        const roll = (0.85 + random() * 0.15);
        mult *= roll;
        ev.breakdown.push('随机波动 ×' + roll.toFixed(2));

        const damage = Math.max(typeMult === 1 ? 1 : 1, Math.floor(base * mult));
        ev.damage = damage;
        ev.text = attacker.name + '使用了' + skill.name + '！'
            + (typeMult > 1 ? '效果拔群！' : (typeMult < 1 ? '效果不理想…' : ''));
        return ev;
    }

    /* ------------------------------------------------------------ 回合流程 */

    /**
     * 执行一个回合。
     * a / b     两名参战精灵（buildFighter 产物，已 initHp）
     * skillA/B  双方本回合选的技能对象
     * field     { weather, terrain }（会被本函数修改）
     * rng       可注入的随机函数
     * 返回 { events: [...], over: bool, winner: name|null }
     */
    function executeTurn(a, b, skillA, skillB, field, rng) {
        const random = rng || Math.random;
        const events = [];

        const act = (attacker, defender, skill) => {
            if (attacker.hp <= 0) return;

            // 天气 / 场地技能
            const fieldChange = detectFieldSkill(skill);
            if (fieldChange) {
                if (fieldChange.type === 'weather') {
                    const prev = field.weather;
                    field.weather = fieldChange.key;
                    const w = WEATHERS[fieldChange.key];
                    events.push({
                        kind: 'weather',
                        text: w ? (attacker.name + '使用了' + skill.name + '，天气变成了' + w.name + '！（' + w.desc + '）')
                                : (attacker.name + '使用了' + skill.name + '，天气恢复了正常。'),
                        key: fieldChange.key,
                        prev: prev
                    });
                } else {
                    const prev = field.terrain;
                    field.terrain = fieldChange.key;
                    const t = TERRAINS[fieldChange.key];
                    events.push({
                        kind: 'terrain',
                        text: attacker.name + '使用了' + skill.name + '，' + (t ? '场地变成了' + t.name + '！（' + t.desc + '）' : '场地恢复了正常。'),
                        key: fieldChange.key,
                        prev: prev
                    });
                }
                return;
            }

            const ev = calcAttack(attacker, defender, skill, field, random);
            events.push(ev);
            if (!ev.missed && ev.damage > 0) {
                defender.hp = Math.max(0, defender.hp - ev.damage);
                ev.defenderHpAfter = defender.hp;
                if (defender.hp <= 0) {
                    events.push({ kind: 'faint', text: defender.name + '倒下了！' });
                }
            }
        };

        // 先手：速度高者先动，同速随机
        const aFirst = a.stats.spe > b.stats.spe || (a.stats.spe === b.stats.spe && random() < 0.5);
        const order = aFirst ? [[a, b, skillA], [b, a, skillB]] : [[b, a, skillB], [a, b, skillA]];

        for (const [att, def, skill] of order) {
            act(att, def, skill);
        }

        // 回合末：沙暴 / 冰雹 / 青草场地
        if (a.hp > 0 && b.hp > 0) {
            const chip = (fighter, weatherKey) => {
                const immune = weatherKey === 'sand'
                    ? ['地面', '岩石', '钢']
                    : ['冰'];
                const hurt = !(fighter.types || []).some(t => immune.indexOf(t) !== -1);
                if (!hurt) {
                    events.push({ kind: 'note', text: fighter.name + '不受' + (WEATHERS[weatherKey] || {}).name + '影响。' });
                    return;
                }
                const dmg = Math.max(1, Math.floor(fighter.maxHp / 16));
                fighter.hp = Math.max(0, fighter.hp - dmg);
                events.push({ kind: 'chip', text: (WEATHERS[weatherKey] || {}).name + '刮着，' + fighter.name + '受到了 ' + dmg + ' 点伤害！', side: fighter.side, hpAfter: fighter.hp });
                if (fighter.hp <= 0) events.push({ kind: 'faint', text: fighter.name + '倒下了！' });
            };
            if (field.weather === 'sand') { chip(a, 'sand'); chip(b, 'sand'); }
            if (field.weather === 'hail') { chip(a, 'hail'); chip(b, 'hail'); }
            if (field.terrain === 'grassy') {
                for (const f of [a, b]) {
                    if (f.hp <= 0) continue;
                    const heal = Math.max(1, Math.floor(f.maxHp / 16));
                    f.hp = Math.min(f.maxHp, f.hp + heal);
                    events.push({ kind: 'heal', text: '青草场地滋养着' + f.name + '，回复了 ' + heal + ' 点体力。', side: f.side, hpAfter: f.hp });
                }
            }
        }

        const over = a.hp <= 0 || b.hp <= 0;
        return {
            events: events,
            over: over,
            winner: over ? (a.hp > 0 ? a.name : (b.hp > 0 ? b.name : null)) : null
        };
    }

    return {
        WEATHERS: WEATHERS,
        TERRAINS: TERRAINS,
        detectFieldSkill: detectFieldSkill,
        computeStats: computeStats,
        buildFighter: buildFighter,
        initHp: initHp,
        calcAttack: calcAttack,
        executeTurn: executeTurn
    };
})();

// 挂到 window 上，方便页面与其他脚本以 window.BattleEngine 访问
window.BattleEngine = BattleEngine;
