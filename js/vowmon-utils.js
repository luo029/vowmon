/**
 * 精灵数据规整（前台通用）
 *
 * 后台草稿 / 云端数据里的精灵，字段可能不完整（没有 stats、types 是空数组等）。
 * 模板里直接写 vow.stats.hp，遇到缺字段的精灵会抛异常，
 * 结果就是**整页渲染失败变白屏**。所以统一在这里补齐默认值。
 */
(function () {
    function normalize(p) {
        const vow = Object.assign({}, p || {});
        vow.id = String(vow.id == null ? '' : vow.id);
        vow.name = String(vow.name == null ? '' : vow.name);
        vow.types = Array.isArray(vow.types) ? vow.types : [];
        vow.stage = vow.stage == null ? '' : String(vow.stage);
        vow.form = vow.form == null ? '' : String(vow.form);
        vow.shiny = Array.isArray(vow.shiny) ? vow.shiny : [];
        vow.stats = (vow.stats && typeof vow.stats === 'object' && !Array.isArray(vow.stats))
            ? vow.stats
            : {};
        return vow;
    }

    // 编号数字（取编号开头的数字；无数字的排最后）
    function idNum(vow) {
        const m = String(vow.id || '').trim().match(/^\d+/);
        return m ? parseInt(m[0], 10) : Infinity;
    }

    function normalizeAll(list) {
        // 前台统一按编号从小到大排序（图鉴 / 列表共用此入口），不动数据存储顺序
        return (Array.isArray(list) ? list : [])
            .map(normalize)
            .sort((a, b) => idNum(a) - idNum(b));
    }

    /** 能力值合计（缺项按 0 算，不会出现 NaN） */
    function total(stats) {
        const s = stats || {};
        return (s.hp || 0) + (s.atk || 0) + (s.def || 0)
            + (s.spAtk || 0) + (s.spDef || 0) + (s.spd || 0);
    }

    window.VowmonUtils = {
        normalize: normalize,
        normalizeAll: normalizeAll,
        total: total
    };
})();
