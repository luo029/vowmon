/* ==========================================================================
   Vowmon Wiki —— 设定一致性检查器（纯逻辑，可在浏览器或 Node 跑）
   --------------------------------------------------------------------------
   用法：
     const report = ConsistencyCheck.run({
       vows: allVowsData, skills: allSkillsData || [], traits: allTraitsData || [],
       individuals: allIndividualsData || [], characters: allCharactersData || [],
       bloodlineSkills: allBloodlineSkillsData || [], families: allBloodlineFamiliesData || {},
       stages: allStagesData || []
     });
     report.issues → [{ level:'error'|'warn'|'info', type, target, message }]
   检查项：等级↔阶元 / taxonomy 进化链 / 引用完整性 / 图片缺失 /
           region 冲突 / 血脉技能 / 重复 ID / 进化链闭环
   ========================================================================== */
(function (root) {
    'use strict';

    function stageOf(level, stages) {
        var lv = Number(level) || 0;
        var list = Array.isArray(stages) && stages.length ? stages : [
            { name: '初灵', min: 1, max: 15 }, { name: '升灵', min: 16, max: 35 },
            { name: '族尊', min: 36, max: 50 }, { name: '基座', min: 51, max: 60 },
            { name: '灵相', min: 61, max: 70 }, { name: '律冠', min: 71, max: 89 },
            { name: '元灵', min: 90, max: 99 }, { name: '元', min: 100, max: null }
        ];
        var hit = list.find(function (b) { return lv >= b.min && (b.max == null || lv <= b.max); });
        return hit ? hit.name : '';
    }

    function run(data) {
        data = data || {};
        var issues = [];
        function add(level, type, target, message) { issues.push({ level: level, type: type, target: target, message: message }); }

        var vows = data.vows || [];
        var individuals = data.individuals || [];
        var characters = data.characters || [];
        var stages = data.stages || [];
        var vmap = {}, imap = {}, cmap = {};
        vows.forEach(function (v) {
            if (vmap[v.id]) add('error', '重复 ID', v.id, '图鉴中存在重复编号');
            vmap[v.id] = v;
        });
        individuals.forEach(function (i) {
            if (imap[i.id]) add('error', '重复 ID', i.id, '御兽精灵档案中存在重复 ID');
            imap[i.id] = i;
        });
        characters.forEach(function (c) {
            if (cmap[c.id]) add('error', '重复 ID', c.id, '御兽人物档案中存在重复 ID');
            cmap[c.id] = c;
        });

        /* 1. 个体等级 ↔ 阶元（用 StageConfig 口径推导） */
        individuals.forEach(function (i) {
            var sp = vmap[i.speciesId];
            var st = stageOf(i.level, stages);
            if (!st) add('warn', '等级区间', i.id, '等级 ' + i.level + ' 不在任何境界区间内');
            if (sp && sp.stage && st && sp.stage !== st) {
                // 图鉴 stage 是阶段（一阶/二阶/三阶）与境界名不是同一维度，只做提示
                add('info', '阶元对照', i.id, '个体等级推导为「' + st + '」，图鉴阶段记为「' + sp.stage + '」（两者维度不同，请人工确认）');
            }
        });

        /* 2. 进化链 taxonomy 一致性 + 闭环 */
        vows.forEach(function (v) {
            var to = Array.isArray(v.evoTo) ? v.evoTo : (v.evoTo ? [v.evoTo] : []);
            to.forEach(function (t) {
                var id = typeof t === 'object' ? (t.id || t) : t;
                var nxt = vmap[id];
                if (!nxt) { add('error', '进化链', v.id, 'evoTo 指向不存在的精灵 ' + id); return; }
                var back = Array.isArray(nxt.evoFrom) ? nxt.evoFrom : (nxt.evoFrom ? [nxt.evoFrom] : []);
                if (!back.map(String).includes(String(v.id))) add('warn', '进化链', v.id, 'evoTo → ' + id + ' 未反向登记 evoFrom');
            });
            var from = Array.isArray(v.evoFrom) ? v.evoFrom : (v.evoFrom ? [v.evoFrom] : []);
            from.forEach(function (f) {
                var id = typeof f === 'object' ? (f.id || f) : f;
                var prev = vmap[id];
                if (!prev) add('error', '进化链', v.id, 'evoFrom 指向不存在的精灵 ' + id);
            });
            var tx = v.taxonomy || {};
            var keys = ['domain','kingdom','phylum','class','order','family','genus'];
            keys.forEach(function (k) {
                var chain = [v];
                (function walk(cur, depth) {
                    if (depth > 20) return;
                    var outs = Array.isArray(cur.evoTo) ? cur.evoTo : (cur.evoTo ? [cur.evoTo] : []);
                    outs.forEach(function (o) {
                        var id = typeof o === 'object' ? (o.id || o) : o;
                        var n = vmap[id];
                        if (!n || chain.indexOf(n) >= 0) return;
                        if (tx[k] && n.taxonomy && n.taxonomy[k] && tx[k] !== n.taxonomy[k]) {
                            add('warn', 'taxonomy', v.id + ' ↔ ' + n.id, k + ' 不一致：「' + tx[k] + '」vs「' + n.taxonomy[k] + '」（同链应共用）');
                        }
                        chain.push(n); walk(n, depth + 1); chain.pop();
                    });
                })(v, 0);
            });
        });

        /* 3. 引用完整性 */
        individuals.forEach(function (i) {
            if (i.speciesId && !vmap[i.speciesId]) add('error', '引用', i.id, 'speciesId=' + i.speciesId + ' 找不到对应图鉴精灵');
            if (i.ownerId && !cmap[i.ownerId]) add('error', '引用', i.id, 'ownerId=' + i.ownerId + ' 找不到对应御兽人物');
            (i.skills || []).forEach(function (s) {
                var name = typeof s === 'string' ? s : s.name;
                var hit = (data.skills || []).find(function (x) { return x.name === name; });
                if (name && !hit) add('warn', '引用', i.id, '技能「' + name + '」不在技能库中');
            });
            (i.traits || []).forEach(function (t) {
                var hit = (data.traits || []).find(function (x) { return x.name === t; });
                if (t && !hit) add('warn', '引用', i.id, '特性「' + t + '」不在特性库中');
            });
        });
        characters.forEach(function (c) {
            (c.vowIds || []).forEach(function (id) {
                if (!imap[id]) add('error', '引用', c.id, 'vowIds 指向不存在的个体 ' + id);
            });
        });

        /* 4. 图片缺失 */
        vows.forEach(function (v) {
            if (!v.image) add('warn', '图片', v.id, '未填写主图');
            (v.shiny || []).forEach(function (s, idx) { if (!s) add('warn', '图片', v.id, '第 ' + (idx + 1) + ' 张异色图路径为空'); });
        });

        /* 5. region 形态冲突：相同 species 的精灵 region 重叠且形态同名 */
        var bySpecies = {};
        vows.forEach(function (v) {
            var sp = (v.taxonomy && v.taxonomy.species) || v.name;
            (bySpecies[sp] = bySpecies[sp] || []).push(v);
        });
        Object.keys(bySpecies).forEach(function (sp) {
            var list = bySpecies[sp];
            if (list.length < 2) return;
            var seen = {};
            list.forEach(function (v) {
                var forms = Array.isArray(v.form) ? v.form : [v.form || '主形态'];
                var regs = Array.isArray(v.region) ? v.region : (v.region ? [v.region] : []);
                forms.forEach(function (f) {
                    regs.forEach(function (r) {
                        var k = f + '@' + r;
                        if (seen[k]) add('error', 'region 冲突', sp, '形态「' + f + '」在地区「' + r + '」重复出现（' + seen[k] + ' / ' + v.id + '）');
                        seen[k] = v.id;
                    });
                });
            });
        });

        /* 6. 血脉技能 */
        var bsNames = (data.bloodlineSkills || []).map(function (s) { return s.name; });
        individuals.forEach(function (i) {
            if (i.bloodlineSkill && bsNames.length && !bsNames.includes(i.bloodlineSkill)) {
                add('warn', '血脉技能', i.id, '血脉技能「' + i.bloodlineSkill + '」不在血脉技能库中');
            }
        });
        var families = data.families || {};
        Object.keys(families).forEach(function (fam) {
            var g = families[fam];
            if (!g.zun) add('info', '血脉技能', fam, '族群未登记族尊（zun）');
            if (!(g.skills || []).length) add('warn', '血脉技能', fam, '族群技能包为空');
        });

        var counts = { error: 0, warn: 0, info: 0 };
        issues.forEach(function (x) { counts[x.level]++; });
        return { issues: issues, counts: counts, checked: { vows: vows.length, individuals: individuals.length, characters: characters.length } };
    }

    var api = { run: run, stageOf: stageOf };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    root.ConsistencyCheck = api;
})(typeof window !== 'undefined' ? window : globalThis);
