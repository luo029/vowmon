/* ==========================================================================
   Vowmon Wiki 精灵对战引擎 —— 纯逻辑，不含任何 UI
   --------------------------------------------------------------------------
   独立可测：所有函数都是纯计算（随机数通过 rng 注入），页面在 battle/index.html。

   伤害公式（宝可梦官方公式改造，等级 L）：
       基础 = floor(floor(2L/5 + 2) × 威力 × 攻/防) / 50) + 2
       修正 = 能力阶级 × 击中要害 × 本系 1.5 × 属性克制 × 天气 × 场地 × 灼伤 × 随机 0.85~1.0

   机制全部照抄宝可梦（52poke 百科）：
       · 能力变化   ±6 级，+n=×(2+n)/2、-n=×2/(2-n)，攻击/防御/特攻/特防/速度
       · 击中要害   1/24 概率，伤害 ×1.5；要害时攻方降阶按 0、守方升阶按 0 计算
       · 异常状态   灼伤(物伤×0.5+每回合1/16)、中毒(1/8)、剧毒(递增1/16)、
                    麻痹(速度×0.5+25%无法行动)、睡眠(1~3回合)、冰冻(20%/回合解冻)
                    火免疫灼伤、冰免疫冰冻、电免疫麻痹、毒/钢免疫中毒；
                    大日照下不会冰冻；电气场地不入睡；迷雾场地不中异常状态
       · 状态变化   混乱(1~4回合，50%自伤40威力)、畏缩(本回合未行动则无法行动)
       · 优先度     先制招式优先行动（知名先制技名单 + 效果文本含「先制」）
       · 追加效果   异常状态 / 能力升降 / 畏缩 / 混乱 / 吸取回复 / 反作用力伤害
                    —— 全部由技能「效果」文案关键词解析，改文案即可生效
       · 天气/场地  大晴天/下雨/沙暴/冰雹/下雪/大雾/大日照/大雨 + 四场地，持续 5 回合
   ========================================================================== */

const BattleEngine = (function () {
    'use strict';

    /* ------------------------------------------------------------ 天气 / 场地定义 */

    const WEATHERS = {
        sun:      { key: 'sun',      name: '大晴天', icon: '☀️', color: '#d97706', desc: '火系伤害 ×1.5，水系 ×0.5' },
        rain:     { key: 'rain',     name: '下雨',   icon: '🌧️', color: '#2563eb', desc: '水系伤害 ×1.5，火系 ×0.5；打雷必中' },
        sand:     { key: 'sand',     name: '沙暴',   icon: '🌪️', color: '#b45309', desc: '回合末非地面/岩石/钢系受 1/16 伤害；岩石系特防 ×1.5' },
        hail:     { key: 'hail',     name: '冰雹',   icon: '🧊', color: '#3b82f6', desc: '回合末非冰系受 1/16 伤害；暴风雪必中' },
        snow:     { key: 'snow',     name: '下雪',   icon: '🌨️', color: '#93c5fd', desc: '冰系防御 ×1.5（无回合末伤害）' },
        fog:      { key: 'fog',      name: '大雾',   icon: '🌫️', color: '#6b7280', desc: '技能命中率 ×0.6' },
        desolate: { key: 'desolate', name: '大日照', icon: '🔥', color: '#c2410c', desc: '火系 ×1.5，水系招式完全失效' },
        deluge:   { key: 'deluge',   name: '大雨',   icon: '🌊', color: '#1d4ed8', desc: '水系 ×1.5，火系招式完全失效' }
    };

    const TERRAINS = {
        electric: { key: 'electric', name: '电气场地', icon: '⚡', color: '#eab308', boostType: '电',     desc: '电系伤害 ×1.3；地面上的精灵不会入睡' },
        grassy:   { key: 'grassy',   name: '青草场地', icon: '🌿', color: '#22c55e', boostType: '草',     desc: '草系伤害 ×1.3；回合末双方回复 1/16 最大体力' },
        psychic:  { key: 'psychic',  name: '精神场地', icon: '🔮', color: '#ec4899', boostType: '超能力', desc: '超能力系伤害 ×1.3' },
        misty:    { key: 'misty',    name: '迷雾场地', icon: '💨', color: '#c084fc', vsType: '龙',        desc: '龙系伤害 ×0.5；不会陷入异常状态' }
    };

    /* 技能触发天气/场地的持续回合（宝可梦标准：5 回合） */
    const FIELD_TURNS = 5;

    /* 天气触发关键词：按优先级依次匹配（大日照/大雨要在普通晴雨之前，避免「日照」「大雨」误匹配） */
    const WEATHER_KEYWORDS = [
        { key: 'desolate', re: /大日照|烈日当空|炽烈日照/ },
        { key: 'deluge',   re: /始源之海|无尽暴雨|滂沱大雨/ },
        { key: 'sun',      re: /烈阳|大晴天|日照|阳光|放晴|烈日/ },
        { key: 'rain',     re: /下雨|降雨|大雨|雨天|求雨/ },
        { key: 'sand',     re: /沙暴|沙尘/ },
        { key: 'hail',     re: /冰雹|暴雪/ },
        { key: 'snow',     re: /下雪|降雪|落雪|飘雪/ },
        { key: 'fog',      re: /起雾|大雾|浓雾/ }
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

    /* 极端天气下设置其他天气的招式会失败（大日照挡雨、大雨挡晴） */
    function weatherChangeBlocked(cur, next) {
        if (cur === 'desolate') return next !== 'sun' && next !== null;
        if (cur === 'deluge') return next !== 'rain' && next !== null;
        return false;
    }

    /* ------------------------------------------------------------ 异常状态定义 */

    const STATUS_META = {
        burn:      { key: 'burn',      name: '灼伤', icon: '🔥', color: '#ea580c', desc: '物理伤害 ×0.5，回合末损失 1/16 最大体力' },
        para:      { key: 'para',      name: '麻痹', icon: '⚡', color: '#ca8a04', desc: '速度 ×0.5，25% 无法行动' },
        poison:    { key: 'poison',    name: '中毒', icon: '☠️', color: '#7c3aed', desc: '回合末损失 1/8 最大体力' },
        badpoison: { key: 'badpoison', name: '剧毒', icon: '☠️', color: '#6d28d9', desc: '回合末损失递增（1/16、2/16…最多 15/16）' },
        sleep:     { key: 'sleep',     name: '睡眠', icon: '💤', color: '#64748b', desc: '1~3 回合无法行动后自然苏醒' },
        freeze:    { key: 'freeze',    name: '冰冻', icon: '🧊', color: '#0ea5e9', desc: '无法行动，每回合 20% 解冻；受火系招式立即解冻' }
    };
    const CONFUSION_META = { key: 'confusion', name: '混乱', icon: '💫', color: '#db2777', desc: '1~4 回合内 50% 攻击自己' };

    /* 属性对异常状态的免疫（宝可梦规则） */
    const STATUS_IMMUNE_TYPES = {
        burn: ['火'],
        freeze: ['冰'],
        para: ['电'],
        poison: ['毒', '钢'],
        badpoison: ['毒', '钢']
    };

    /* 先制招式名单（52poke「优先度」条目） */
    const PRIORITY_MOVES = {
        '神速': 2, '电光一闪': 1, '子弹拳': 1, '冰砾': 1, '音速拳': 1, '影子偷袭': 1, '突袭': 1,
        '真空波': 1, '水流喷射': 1, '飞水手里剑': 1, '击掌奇袭': 3, '守住': 4, '看穿': 4, '挺住': 4, '佯攻': 2
    };

    /* ------------------------------------------------------------ 能力阶级 */

    // natures-data 里 up/down 用中文能力名，映射到内部键
    const STAT_NAME_TO_KEY = { '攻击': 'atk', '防御': 'def', '特攻': 'spa', '特防': 'spd', '速度': 'spe' };
    const STAT_KEY_TO_NAME = { atk: '攻击', def: '防御', spa: '特攻', spd: '特防', spe: '速度' };

    /* ±6 级修正倍率：+n = (2+n)/2，-n = 2/(2-n)（宝可梦第三世代起标准） */
    function stageMult(stage) {
        const s = Math.max(-6, Math.min(6, stage | 0));
        return s >= 0 ? (2 + s) / 2 : 2 / (2 - s);
    }

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

    /* 麻痹 ×0.5 + 速度阶级（行动顺序用） */
    function effSpeed(f) {
        let v = f.stats.spe * stageMult(f.stages ? f.stages.spe : 0);
        if (f.status && f.status.key === 'para') v *= 0.5;
        return v;
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
            stages: { atk: 0, def: 0, spa: 0, spd: 0, spe: 0 },
            status: null,        // 异常状态 { key, turns }（灼伤/中毒等 turns 无意义）
            confusion: 0,        // 状态变化：混乱剩余行动次数
            flinch: false,       // 状态变化：畏缩（本回合未行动则跳过）
            toxicCounter: 1,     // 剧毒伤害计数
            maxHp: 0,
            hp: 0
        };
    }

    const initHp = (fighter) => { fighter.maxHp = fighter.stats.hp; fighter.hp = fighter.stats.hp; };

    /* ------------------------------------------------------------ 追加效果解析 */

    /**
     * 从技能「效果」文案解析追加效果。全部来自 52poke「追加效果」条目分类：
     *   异常状态 / 能力升降 / 畏缩 / 混乱 / 吸取回复 / 反作用力
     * 返回数组，元素形如：
     *   { type:'status', key:'burn', chance:0.1 }
     *   { type:'stat', target:'self'|'foe', stat:'atk', delta:1, chance:1 }
     *   { type:'flinch'|'confusion', chance }
     *   { type:'drain', frac:0.5 } / { type:'recoil', frac:0.25 }
     */
    function parseEffects(skill) {
        const text = String(skill.effect || '');
        if (!text) return [];
        const out = [];
        const chanceOf = (seg) => {
            const m = seg.match(/(\d+(?:\.\d+)?)%/);
            if (m) return Math.min(1, parseFloat(m[1]) / 100);
            if (/有时|偶尔|几率|概率|一定几率|可能/.test(seg)) return 0.1;
            if (skill.category === '变化') return 1;
            return 0.1;   // 攻击招式未写概率时按宝可梦最常见的 10% 处理
        };

        // 异常状态（混乱单独归类为状态变化）
        const stMap = [
            [/灼烧|烧伤|炙烧|烫伤/, 'burn', 'status'],
            [/麻痹/, 'para', 'status'],
            [/剧毒/, 'badpoison', 'status'],
            [/中毒/, 'poison', 'status'],
            [/冰冻|冻僵/, 'freeze', 'status'],
            [/睡眠|催眠|陷入沉睡|哈欠/, 'sleep', 'status']
        ];
        for (const [re, key, type] of stMap) {
            if (re.test(text)) { out.push({ type: type, key: key, chance: chanceOf(text) }); break; }
        }
        if (/混乱/.test(text)) out.push({ type: 'confusion', chance: chanceOf(text) });
        if (/畏缩|退缩|害怕/.test(text)) out.push({ type: 'flinch', chance: chanceOf(text) });

        // 能力变化：逐句解析（「令目标的攻击降低1级」「提高自己的防御」等）
        for (const seg of text.split(/[\n。；]/)) {
            const m = seg.match(/(攻击|防御|特攻|特防|速度)[^\u4e00-\u9fa5]{0,6}?(提高|提升|上升|增强|降低|下降|减弱)(?:\s*)(\d)?\s*级?/);
            if (!m) continue;
            const stat = STAT_NAME_TO_KEY[m[1]];
            if (!stat) continue;
            if (/无视|无法/.test(seg)) continue;
            const up = /提高|提升|上升|增强/.test(m[2]);
            const delta = (m[3] ? parseInt(m[3]) : (/大幅|巨幅|极大幅/.test(seg) ? 2 : 1)) * (up ? 1 : -1);
            let target;
            if (/目标|对手|对方/.test(seg) && !/自己|自身/.test(seg)) target = 'foe';
            else if (/自己|自身|我方/.test(seg)) target = 'self';
            else target = up ? 'self' : 'foe';
            out.push({ type: 'stat', target: target, stat: stat, delta: delta, chance: chanceOf(seg) });
        }

        // 吸取 / 反作用力
        if (/回复[^。\n]{0,10}伤害|吸取|吸血|吸收/.test(text)) out.push({ type: 'drain', frac: /一半|1\/2/.test(text) ? 0.5 : 0.25 });
        if (/反作用|自己[^。\n]{0,12}受到[^。\n]{0,12}伤害|受到不小的伤害/.test(text)) out.push({ type: 'recoil', frac: /三分之一|1\/3/.test(text) ? 1 / 3 : 0.25 });
        return out;
    }

    /* 优先度：数据字段优先，其次知名先制技名单，最后效果文本含「先制」 */
    function getPriority(skill) {
        if (!skill) return 0;
        if (typeof skill.priority === 'number') return skill.priority;
        if (PRIORITY_MOVES[skill.name]) return PRIORITY_MOVES[skill.name];
        if (/先制|必定先攻|先手攻击/.test(String(skill.effect || ''))) return 1;
        return 0;
    }

    /* ------------------------------------------------------------ 伤害计算 */

    /** 天气对技能威力的影响。返回 { mult, failed }，failed 表示招式完全失效 */
    function weatherDamageMult(weatherKey, skillType) {
        if (weatherKey === 'sun') {
            if (skillType === '火') return { mult: 1.5 };
            if (skillType === '水') return { mult: 0.5 };
        }
        if (weatherKey === 'desolate') {
            if (skillType === '火') return { mult: 1.5 };
            if (skillType === '水') return { failed: true };
        }
        if (weatherKey === 'rain') {
            if (skillType === '水') return { mult: 1.5 };
            if (skillType === '火') return { mult: 0.5 };
        }
        if (weatherKey === 'deluge') {
            if (skillType === '水') return { mult: 1.5 };
            if (skillType === '火') return { failed: true };
        }
        return { mult: 1 };
    }

    function terrainDamageMult(terrainKey, skillType) {
        const t = TERRAINS[terrainKey];
        if (!t) return 1;
        if (t.boostType && skillType === t.boostType) return 1.3;
        if (t.vsType && skillType === t.vsType) return 0.5;
        return 1;
    }

    /* 暴雨中的打雷 / 冰雹中的暴风雪必中（宝可梦规则） */
    const ALWAYS_HIT_IN_WEATHER = [
        { re: /打雷|鸣雷|雷击|雷霆/, weather: 'rain' },
        { re: /暴风雪|雪崩/, weather: 'hail' }
    ];

    /**
     * 计算一次攻击。返回事件对象（含伤害、倍率明细、是否命中/失效/要害）。
     * field = { weather, terrain, weatherTurns, terrainTurns }
     */
    function calcAttack(attacker, defender, skill, field, rng) {
        const random = rng || Math.random;
        const ev = {
            kind: 'attack',
            attacker: attacker.name,
            defender: defender.name,
            skill: skill,
            missed: false,
            failed: false,
            critical: false,
            damage: 0,
            effectiveness: 1,
            breakdown: []
        };

        // 极端天气下的招式失效（大日照下水系 / 大雨下火系）
        const w0 = weatherDamageMult(field.weather, skill.type);
        if (w0.failed) {
            ev.failed = true;
            ev.text = (WEATHERS[field.weather] || {}).name + '之下，' + skill.type + '属性招式完全失效——' + attacker.name + '的' + skill.name + '没能造成任何伤害！';
            return ev;
        }

        // 命中判定：大雾 ×0.6；暴雨中的打雷 / 冰雹中的暴风雪必中
        const always = ALWAYS_HIT_IN_WEATHER.find(h => h.weather === field.weather && h.re.test(String(skill.name || '')));
        if (!always && field.weather === 'fog' && random() > 0.6) {
            ev.missed = true;
            ev.text = attacker.name + '的' + skill.name + '在大雾中偏了，没有命中！';
            return ev;
        }
        if (always && field.weather === 'fog' && random() > 0.9) {
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
        // 能力阶级修正（击中要害时：攻方降阶按 0、守方升阶按 0——宝可梦第三世代起规则）
        const crit = random() < 1 / 24;
        ev.critical = crit;
        const offKey = isPhysical ? 'atk' : 'spa';
        const defKey = isPhysical ? 'def' : 'spd';
        const offStage = crit ? Math.max(0, attacker.stages[offKey]) : attacker.stages[offKey];
        const defStage = crit ? Math.min(0, defender.stages[defKey]) : defender.stages[defKey];
        const A = Math.floor(attacker.stats[offKey] * stageMult(offStage));
        let D = Math.floor(defender.stats[defKey] * stageMult(defStage));
        if (crit) ev.breakdown.push('击中要害！');
        if (offStage !== 0) ev.breakdown.push(STAT_KEY_TO_NAME[offKey] + (offStage > 0 ? '+' : '') + offStage + '（×' + stageMult(offStage).toFixed(2) + '）');
        if (defStage !== 0) ev.breakdown.push('对方' + STAT_KEY_TO_NAME[defKey] + (defStage > 0 ? '+' : '') + defStage + '（×' + stageMult(defStage).toFixed(2) + '）');

        const power = Math.max(1, skill.power || 40);

        // 沙暴：岩石系特防 ×1.5；下雪：冰系防御 ×1.5（宝可梦规则）
        if (field.weather === 'sand' && !isPhysical && (defender.types || []).indexOf('岩石') !== -1) {
            D = Math.floor(D * 1.5);
            ev.breakdown.push('沙暴中岩石系特防 ×1.5');
        }
        if (field.weather === 'snow' && isPhysical && (defender.types || []).indexOf('冰') !== -1) {
            D = Math.floor(D * 1.5);
            ev.breakdown.push('下雪中冰系防御 ×1.5');
        }

        // 宝可梦官方公式（Gen5+ 取整方式）
        let base = Math.floor(Math.floor((Math.floor(2 * attacker.level / 5) + 2) * power * A / D) / 50) + 2;
        ev.breakdown.push('基础伤害 ' + base);

        let mult = 1;
        if (crit) { mult *= 1.5; ev.breakdown.push('击中要害 ×1.5'); }

        const stab = (attacker.types || []).indexOf(skill.type) !== -1;
        if (stab) { mult *= 1.5; ev.breakdown.push('本系加成 ×1.5'); }

        if (typeMult !== 1) { mult *= typeMult; ev.breakdown.push('属性克制 ×' + typeMult); }

        const wMult = w0.mult;
        if (wMult !== 1) { mult *= wMult; ev.breakdown.push((WEATHERS[field.weather] || {}).name + ' ×' + wMult); }

        const tMult = terrainDamageMult(field.terrain, skill.type);
        if (tMult !== 1) { mult *= tMult; ev.breakdown.push((TERRAINS[field.terrain] || {}).name + ' ×' + tMult); }

        // 灼伤：物理伤害 ×0.5（宝可梦规则）
        if (attacker.status && attacker.status.key === 'burn' && isPhysical) {
            mult *= 0.5;
            ev.breakdown.push('灼伤 ×0.5');
        }

        const roll = (0.85 + random() * 0.15);
        mult *= roll;
        ev.breakdown.push('随机波动 ×' + roll.toFixed(2));

        const damage = Math.max(1, Math.floor(base * mult));
        ev.damage = damage;
        ev.text = attacker.name + '使用了' + skill.name + '！'
            + (crit ? '击中了要害！' : '')
            + (typeMult > 1 ? '效果拔群！' : (typeMult < 1 ? '效果不理想…' : ''));
        return ev;
    }

    /* ------------------------------------------------------------ 状态施加 */

    /**
     * 尝试给目标施加异常状态 / 混乱。
     * 返回事件；失败（免疫/已有状态）返回 note 事件。
     */
    function applyStatus(attacker, target, key, field) {
        const label = key === 'confusion' ? CONFUSION_META.name : STATUS_META[key].name;
        // 迷雾场地：不会陷入异常状态（宝可梦规则）；电气场地：不会入睡
        if (field.terrain === 'misty' && key !== 'confusion') {
            return { kind: 'note', text: '迷雾场地守护着' + target.name + '，不会陷入' + label + '状态。' };
        }
        if (field.terrain === 'electric' && key === 'sleep') {
            return { kind: 'note', text: '电气场地之下，' + target.name + '不会入睡。' };
        }
        if (key !== 'confusion') {
            // 异常状态不可共存（宝可梦规则）
            if (target.status) {
                return { kind: 'note', text: target.name + '已经处于' + STATUS_META[target.status.key].name + '状态，不会陷入' + label + '。' };
            }
            // 属性免疫
            const immune = STATUS_IMMUNE_TYPES[key] || [];
            if ((target.types || []).some(t => immune.indexOf(t) !== -1)) {
                return { kind: 'note', text: target.name + '是' + immune.join('/') + '属性，免疫' + label + '状态。' };
            }
            // 大日照下不会冰冻（宝可梦规则）
            if (key === 'freeze' && (field.weather === 'sun' || field.weather === 'desolate')) {
                return { kind: 'note', text: (WEATHERS[field.weather] || {}).name + '之下，' + target.name + '不会陷入冰冻状态。' };
            }
            const meta = STATUS_META[key];
            target.status = { key: key, turns: key === 'sleep' ? 1 + Math.floor(Math.random() * 3) : 0 };
            return { kind: 'status', text: target.name + '陷入了' + meta.name + '状态！（' + meta.desc + '）', side: target.side, key: key };
        }
        // 混乱（状态变化，可与异常状态共存）
        if (target.confusion > 0) {
            return { kind: 'note', text: target.name + '已经处于混乱状态。' };
        }
        target.confusion = 1 + Math.floor(Math.random() * 4);   // 1~4 行动次数
        return { kind: 'status', text: target.name + '混乱了！（' + CONFUSION_META.desc + '）', side: target.side, key: 'confusion' };
    }

    /** 能力阶级变化（±6 级封顶，宝可梦规则） */
    function applyStatChange(target, stat, delta) {
        const name = STAT_KEY_TO_NAME[stat];
        const before = target.stages[stat];
        const after = Math.max(-6, Math.min(6, before + delta));
        target.stages[stat] = after;
        if (after === before) {
            return { kind: 'note', text: target.name + '的' + name + '已经无法再' + (delta > 0 ? '提高' : '降低') + '了！' };
        }
        const steps = Math.abs(after - before);
        const word = delta > 0 ? (steps >= 2 ? '大幅提高了' : '提高了') : (steps >= 2 ? '大幅降低了' : '降低了');
        return { kind: 'stat-change', text: target.name + '的' + name + word + steps + '级！', side: target.side, stat: stat, delta: delta, after: after };
    }

    /* ------------------------------------------------------------ 回合流程 */

    /** 回合末结算：异常状态磨血 → 天气磨血/青草回复 → 天气/场地消退 */
    function endOfTurn(a, b, field, events) {
        for (const f of [a, b]) {
            if (f.hp <= 0) continue;
            if (f.status && f.status.key === 'burn') {
                const dmg = Math.max(1, Math.floor(f.maxHp / 16));
                f.hp = Math.max(0, f.hp - dmg);
                events.push({ kind: 'status-dmg', text: '灼伤折磨着' + f.name + '，损失了 ' + dmg + ' 点体力。', side: f.side, hpAfter: f.hp });
                if (f.hp <= 0) events.push({ kind: 'faint', text: f.name + '倒下了！' });
            } else if (f.status && (f.status.key === 'poison' || f.status.key === 'badpoison')) {
                const n = f.status.key === 'poison' ? 8 : 16;
                const cnt = f.status.key === 'badpoison' ? Math.min(15, f.toxicCounter++) : 1;
                const dmg = Math.max(1, Math.floor(f.maxHp * cnt / n));
                f.hp = Math.max(0, f.hp - dmg);
                events.push({ kind: 'status-dmg', text: '毒素侵蚀着' + f.name + '，损失了 ' + dmg + ' 点体力。', side: f.side, hpAfter: f.hp });
                if (f.hp <= 0) events.push({ kind: 'faint', text: f.name + '倒下了！' });
            }
        }
        // 天气磨血 / 青草回复
        for (const f of [a, b]) {
            if (f.hp <= 0) continue;
            if (field.weather === 'sand' || field.weather === 'hail') {
                const immune = field.weather === 'sand' ? ['地面', '岩石', '钢'] : ['冰'];
                const hurt = !(f.types || []).some(t => immune.indexOf(t) !== -1);
                if (!hurt) {
                    events.push({ kind: 'note', text: f.name + '不受' + (WEATHERS[field.weather] || {}).name + '影响。' });
                } else {
                    const dmg = Math.max(1, Math.floor(f.maxHp / 16));
                    f.hp = Math.max(0, f.hp - dmg);
                    events.push({ kind: 'chip', text: (WEATHERS[field.weather] || {}).name + '刮着，' + f.name + '受到了 ' + dmg + ' 点伤害！', side: f.side, hpAfter: f.hp });
                    if (f.hp <= 0) events.push({ kind: 'faint', text: f.name + '倒下了！' });
                }
            }
            if (field.terrain === 'grassy') {
                const heal = Math.max(1, Math.floor(f.maxHp / 16));
                f.hp = Math.min(f.maxHp, f.hp + heal);
                events.push({ kind: 'heal', text: '青草场地滋养着' + f.name + '，回复了 ' + heal + ' 点体力。', side: f.side, hpAfter: f.hp });
            }
        }
        // 天气 / 场地消退
        const defs = [
            ['weather', 'weatherTurns', '天气', 'weather-end'],
            ['terrain', 'terrainTurns', '场地', 'terrain-end']
        ];
        for (const [key, nKey, label, kind] of defs) {
            const n = field[nKey];
            if (typeof n !== 'number' || !isFinite(n) || n <= 0) continue;
            field[nKey] = n - 1;
            if (field[nKey] === 0 && field[key]) {
                events.push({ kind: kind, text: label + '的效果消失了。', key: field[key] });
                field[key] = null;
            }
        }
    }

    /**
     * 执行一个回合。
     * a / b     两名参战精灵（buildFighter 产物，已 initHp）
     * skillA/B  双方本回合选的技能对象
     * field     { weather, terrain, weatherTurns, terrainTurns }（会被本函数修改）
     * rng       可注入的随机函数
     * 返回 { events: [...], over: bool, winner: name|null }
     */
    function executeTurn(a, b, skillA, skillB, field, rng) {
        const random = rng || Math.random;
        const events = [];
        const acted = new Set();   // 已行动的精灵（畏缩判定用）

        /** 单个行动（先手判定后的全部状态检查） */
        const act = (attacker, defender, skill) => {
            if (attacker.hp <= 0) return;

            // 畏缩（宝可梦：本回合未行动时无法使出招式）
            if (attacker.flinch) {
                attacker.flinch = false;
                events.push({ kind: 'flinch', text: attacker.name + '因为害怕而畏缩了，无法使出招式！' });
                return;
            }

            // 混乱（宝可梦：50% 攻击自己，40 威力物理）
            if (attacker.confusion > 0) {
                attacker.confusion--;
                if (random() < 0.5) {
                    const selfEv = calcAttack(attacker, attacker, { name: '混乱中的胡乱攻击', type: '一般', category: '物理', power: 40 }, field, random);
                    selfEv.attacker = attacker.name;
                    selfEv.defender = attacker.name;
                    selfEv.text = attacker.name + '混乱了，攻击了自己！';
                    selfEv.selfHit = true;
                    events.push(selfEv);
                    if (!selfEv.missed && selfEv.damage > 0) {
                        attacker.hp = Math.max(0, attacker.hp - selfEv.damage);
                        selfEv.defenderHpAfter = attacker.hp;
                        if (attacker.hp <= 0) events.push({ kind: 'faint', text: attacker.name + '倒下了！' });
                    }
                    if (attacker.confusion <= 0) events.push({ kind: 'note', text: attacker.name + '的混乱解除了。' });
                    return;
                }
                if (attacker.confusion <= 0) {
                    events.push({ kind: 'note', text: attacker.name + '的混乱解除了。' });
                } else {
                    events.push({ kind: 'note', text: attacker.name + '头晕目眩，但稳住了心神…' });
                }
            }

            // 睡眠（宝可梦：1~3 回合后苏醒，苏醒当回合可行动）
            if (attacker.status && attacker.status.key === 'sleep') {
                if (attacker.status.turns > 1) {
                    attacker.status.turns--;
                    events.push({ kind: 'note', text: attacker.name + '睡得很沉…（还剩 ' + attacker.status.turns + ' 回合）' });
                    return;
                }
                attacker.status = null;
                events.push({ kind: 'note', text: attacker.name + '醒过来了！' });
            }

            // 冰冻（宝可梦：每回合 20% 解冻，受火系招式解冻）
            if (attacker.status && attacker.status.key === 'freeze') {
                if (random() < 0.2) {
                    attacker.status = null;
                    events.push({ kind: 'note', text: attacker.name + '的冰冻解除了！' });
                } else {
                    events.push({ kind: 'note', text: attacker.name + '被冻住了，动弹不得…' });
                    return;
                }
            }

            // 麻痹（宝可梦：25% 无法行动）
            if (attacker.status && attacker.status.key === 'para' && random() < 0.25) {
                events.push({ kind: 'note', text: attacker.name + '身体麻痹，无法行动！' });
                return;
            }

            // 天气 / 场地技能
            const fieldChange = detectFieldSkill(skill);
            if (fieldChange) {
                if (fieldChange.type === 'weather') {
                    const cur = field.weather;
                    if (fieldChange.key !== null && fieldChange.key !== cur && weatherChangeBlocked(cur, fieldChange.key)) {
                        events.push({
                            kind: 'note',
                            text: (WEATHERS[cur] || {}).name + '之下，' + attacker.name + '的' + skill.name + '无法改变天气！'
                        });
                        return;
                    }
                    field.weather = fieldChange.key;
                    field.weatherTurns = fieldChange.key === null ? Infinity : FIELD_TURNS;
                    const w = WEATHERS[fieldChange.key];
                    events.push({
                        kind: 'weather',
                        text: w ? (attacker.name + '使用了' + skill.name + '，天气变成了' + w.name + '！（' + w.desc + '，持续 ' + FIELD_TURNS + ' 回合）')
                                : (attacker.name + '使用了' + skill.name + '，天气恢复了正常。'),
                        key: fieldChange.key,
                        prev: cur
                    });
                } else {
                    field.terrain = fieldChange.key;
                    field.terrainTurns = fieldChange.key === null ? Infinity : FIELD_TURNS;
                    const t = TERRAINS[fieldChange.key];
                    events.push({
                        kind: 'terrain',
                        text: attacker.name + '使用了' + skill.name + '，' + (t ? '场地变成了' + t.name + '！（' + t.desc + '，持续 ' + FIELD_TURNS + ' 回合）' : '场地恢复了正常。'),
                        key: fieldChange.key,
                        prev: field.terrain
                    });
                }
                return;
            }

            const ev = calcAttack(attacker, defender, skill, field, random);
            events.push(ev);
            if (ev.missed || ev.failed) return;

            if (ev.damage > 0) {
                defender.hp = Math.max(0, defender.hp - ev.damage);
                ev.defenderHpAfter = defender.hp;
                if (defender.hp <= 0) {
                    events.push({ kind: 'faint', text: defender.name + '倒下了！' });
                    return;
                }
                // 火系招式命中冰冻目标 → 解冻（宝可梦规则）
                if (defender.status && defender.status.key === 'freeze' && skill.type === '火') {
                    defender.status = null;
                    events.push({ kind: 'note', text: '烈焰融化了坚冰，' + defender.name + '的冰冻解除了！' });
                }
            }

            // 追加效果（宝可梦：命中之后按概率触发）
            for (const fx of parseEffects(skill)) {
                if (random() >= (fx.chance === undefined ? 1 : fx.chance)) continue;
                if (fx.type === 'status' || fx.type === 'confusion') {
                    if (ev.damage <= 0) continue;
                    events.push(applyStatus(attacker, defender, fx.type === 'confusion' ? 'confusion' : fx.key, field));
                } else if (fx.type === 'flinch') {
                    if (ev.damage <= 0 || acted.has(defender)) continue;
                    defender.flinch = true;
                    events.push({ kind: 'note', text: defender.name + '被吓得畏缩了！' });
                } else if (fx.type === 'stat') {
                    const target = fx.target === 'self' ? attacker : defender;
                    events.push(applyStatChange(target, fx.stat, fx.delta));
                } else if (fx.type === 'drain' && ev.damage > 0) {
                    const heal = Math.max(1, Math.floor(ev.damage * fx.frac));
                    attacker.hp = Math.min(attacker.maxHp, attacker.hp + heal);
                    events.push({ kind: 'heal', text: attacker.name + '吸取了力量，回复了 ' + heal + ' 点体力。', side: attacker.side, hpAfter: attacker.hp });
                } else if (fx.type === 'recoil' && ev.damage > 0) {
                    const rec = Math.max(1, Math.floor(ev.damage * fx.frac));
                    attacker.hp = Math.max(0, attacker.hp - rec);
                    events.push({ kind: 'status-dmg', text: attacker.name + '受到了 ' + rec + ' 点反作用力伤害！', side: attacker.side, hpAfter: attacker.hp });
                    if (attacker.hp <= 0) events.push({ kind: 'faint', text: attacker.name + '倒下了！' });
                }
            }
        };

        // 行动顺序：先比优先度（先制招式必先动），同优先度比速度，同速随机（宝可梦规则）
        const priA = getPriority(skillA), priB = getPriority(skillB);
        let aFirst;
        if (priA !== priB) aFirst = priA > priB;
        else {
            const speA = effSpeed(a), speB = effSpeed(b);
            aFirst = speA > speB || (speA === speB && random() < 0.5);
        }
        const order = aFirst
            ? [[a, b, skillA], [b, a, skillB]]
            : [[b, a, skillB], [a, b, skillA]];

        if (priA !== priB) {
            const fast = priA > priB ? a.name : b.name;
            events.push({ kind: 'note', text: fast + '的招式优先度更高，抢先行动！' });
        }

        for (const [att, def, skill] of order) {
            act(att, def, skill);
            acted.add(att);
        }

        // 回合末：异常状态磨血 → 天气磨血/青草回复 → 天气/场地消退
        endOfTurn(a, b, field, events);

        const over = a.hp <= 0 || b.hp <= 0;
        return {
            events: events,
            over: over,
            winner: over ? (a.hp > 0 ? a.name : (b.hp > 0 ? b.name : null)) : null
        };
    }

    /** 清除双方全部状态（异常状态/混乱/能力阶级/畏缩），供页面重置按钮调用 */
    function clearStates(f) {
        f.status = null;
        f.confusion = 0;
        f.flinch = false;
        f.toxicCounter = 1;
        f.stages = { atk: 0, def: 0, spa: 0, spd: 0, spe: 0 };
    }

    return {
        WEATHERS: WEATHERS,
        TERRAINS: TERRAINS,
        STATUS_META: STATUS_META,
        CONFUSION_META: CONFUSION_META,
        FIELD_TURNS: FIELD_TURNS,
        detectFieldSkill: detectFieldSkill,
        parseEffects: parseEffects,
        getPriority: getPriority,
        stageMult: stageMult,
        computeStats: computeStats,
        buildFighter: buildFighter,
        initHp: initHp,
        calcAttack: calcAttack,
        executeTurn: executeTurn,
        clearStates: clearStates
    };
})();

// 挂到 window 上，方便页面与其他脚本以 window.BattleEngine 访问
window.BattleEngine = BattleEngine;
