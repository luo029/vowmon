/**
 * 页面内容替换器（世界观文本块 CMS 化的渲染端）
 *
 * 数据来自数据仓库的 lore-data.json（经 data-loader 加载进 window.allLoreBlocks）：
 *   { "pages": [...], "blocks": { "ranks.c1": { "label": "…", "html": "…" } } }
 *
 * 页面里带 data-lore="页.序" 属性的元素，其 innerHTML 会被 JSON 里的 html 覆盖；
 * 没有对应键 / 数据加载失败时，保留 HTML 里写死的内置文本作为兜底。
 *
 * 替换完成后广播 vowmon:lore-applied 事件，
 * 需要在替换后重新处理文本的脚本（如元域演化史的【属性】胶囊渲染）监听它即可。
 */
(function () {
    'use strict';

    function apply() {
        var map = window.allLoreBlocks;
        if (!map || typeof map !== 'object') return;
        var nodes = document.querySelectorAll('[data-lore]');
        for (var i = 0; i < nodes.length; i++) {
            var key = nodes[i].getAttribute('data-lore');
            var item = map[key];
            if (item && typeof item.html === 'string') {
                nodes[i].innerHTML = item.html;
            }
        }
        try {
            document.dispatchEvent(new CustomEvent('vowmon:lore-applied'));
        } catch (e) { /* ignore */ }
    }

    window.applyLoreContent = apply;

    // 任何来源的 lore 数据更新（首次加载 / 后台保存广播 / 跨标签页）都重新替换
    document.addEventListener('vowmon:data-changed', function (e) {
        if (e && e.detail && e.detail.key === 'lore') apply();
    });

    function boot() {
        if (!(window.VowmonData && typeof window.VowmonData.softReady === 'function')) return;
        // 静默加载：不显示加载遮罩，失败也不弹错误页（页面有内置兜底文本）
        window.VowmonData.softReady(['lore']).then(apply).catch(function () { /* 保持内置文本 */ });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', boot);
    } else {
        boot();
    }
})();
