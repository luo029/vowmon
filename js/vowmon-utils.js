/**
 * 精灵数据规整（前台通用）
 *
 * 后台草稿 / 云端数据里的精灵，字段可能不完整（没有 stats、types 是空数组等）。
 * 模板里直接写 pet.stats.hp，遇到缺字段的精灵会抛异常，
 * 结果就是**整页渲染失败变白屏**。所以统一在这里补齐默认值。
 */
(function () {
    function normalize(p) {
        const pet = Object.assign({}, p || {});
        pet.id = String(pet.id == null ? '' : pet.id);
        pet.name = String(pet.name == null ? '' : pet.name);
        pet.types = Array.isArray(pet.types) ? pet.types : [];
        pet.stage = pet.stage == null ? '' : String(pet.stage);
        pet.form = pet.form == null ? '' : String(pet.form);
        pet.shiny = Array.isArray(pet.shiny) ? pet.shiny : [];
        pet.stats = (pet.stats && typeof pet.stats === 'object' && !Array.isArray(pet.stats))
            ? pet.stats
            : {};
        return pet;
    }

    function normalizeAll(list) {
        return (Array.isArray(list) ? list : []).map(normalize);
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
