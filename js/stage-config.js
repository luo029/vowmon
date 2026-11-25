/* ==========================================================================
   Vowmon Wiki —— 阶段境界（等级 → 境界名/颜色）统一来源
   --------------------------------------------------------------------------
   之前八阶表硬编码在 admin-individuals.js / records/individuals.html /
   records/characters.html 三处，改一次要同步三处；现在统一走这里：
     数据：数据仓库 stages-data.json { stages: [{name, min, max, color}] }
           （max 为 null 表示不封顶，如「元 100 → ∞」）
     后台：admin/admin-stages.html 可自定义境界个数/名字/区间/颜色
     读取：window.StageConfig.bands() / stageName(level) / stageColor(name)
   未配置 stages-data.json 或数据为空时，回退到 DEFAULT_STAGES（八阶默认表）。
   用法：页面 VowmonData.ready(['stages', ...]) 之后再取数/挂载 Vue。
   ========================================================================== */
(function () {
    'use strict';

    /* 默认八阶（与书中设定一致；升灵 16-35、族尊 36-50，元 = 最初存在现已不存在） */
    var DEFAULT_STAGES = [
        { name: '初灵', min: 1,   max: 15,  color: '#8bc34a' },
        { name: '升灵', min: 16,  max: 35,  color: '#26a69a' },
        { name: '族尊', min: 36,  max: 50,  color: '#5c6bc0' },
        { name: '基座', min: 51,  max: 60,  color: '#ba7517' },
        { name: '灵相', min: 61,  max: 70,  color: '#1971c2' },
        { name: '律冠', min: 71,  max: 89,  color: '#7048e8' },
        { name: '元灵', min: 90,  max: 99,  color: '#d4a017' },
        { name: '元',   min: 100, max: null, color: '#e24b4a' }
    ];

    function normalize(list) {
        var out = (Array.isArray(list) ? list : []).map(function (s) {
            var min = Math.max(0, Math.floor(Number(s && s.min) || 0));
            var max = (s && s.max == null) ? null : Math.floor(Number(s.max) || 0);
            if (max != null && max < min) max = min;
            return {
                name: String((s && s.name) || '').trim(),
                min: min,
                max: max,
                color: String((s && s.color) || '').trim() || '#718096'
            };
        }).filter(function (s) { return s.name; });
        /* 按起始等级升序，保证推导正确 */
        out.sort(function (a, b) { return a.min - b.min; });
        return out.length ? out : DEFAULT_STAGES.map(function (s) { return Object.assign({}, s); });
    }

    function bands() {
        return normalize((typeof allStagesData !== 'undefined' && Array.isArray(allStagesData)) ? allStagesData : DEFAULT_STAGES);
    }

    function stageName(level) {
        var lv = Number(level) || 0;
        if (lv <= 0) return '未记录';
        var hit = bands().find(function (b) { return lv >= b.min && (b.max == null || lv <= b.max); });
        return hit ? hit.name : '未记录';
    }

    function stageColor(name) {
        var hit = bands().find(function (b) { return b.name === name; });
        return hit ? hit.color : '#718096';
    }

    window.StageConfig = Object.freeze({
        bands: bands,
        stageName: stageName,
        stageColor: stageColor,
        DEFAULT_STAGES: Object.freeze(DEFAULT_STAGES.map(function (s) { return Object.freeze(Object.assign({}, s)); }))
    });
})();
