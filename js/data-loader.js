/**
 * 数据加载器（站点与数据解耦的唯一入口）
 *
 * 站点仓库（vowmon）只放网站本体，**不再保存任何数据**；
 * 所有数据都在数据仓库（vowmon_data）里，以 JSON 存放：
 *
 *   vow-data.json      精灵
 *   skills-data.json   技能
 *   traits-data.json   特性
 *   items-data.json    物品
 *   natures-data.json  性格
 *
 * 用法（页面里）：
 *   VowmonData.ready(['pets']).then(function () { ... 数据到位后再挂载 Vue ... });
 *
 * 数据源优先级：
 *   1. window.VOWMON_SITE_CONFIG.dataCdnBase（默认是本站 /data 反向代理，走 CF 边缘缓存）
 *   2. https://cdn.jsdelivr.net/gh/luo029/vowmon_data@main
 *   3. https://raw.githubusercontent.com/luo029/vowmon_data/main
 * 前一个源失败自动换下一个，任何一个成功就赋值对应全局变量。
 */
(function () {
    // keys：JSON 里的字段名 → 要赋值的全局变量名
    const FILES = {
        pets: {
            file: 'vow-data.json', label: '精灵',
            keys: { pets: 'allPetsData' }
        },
        skills: {
            file: 'skills-data.json', label: '技能',
            keys: { skills: 'allSkillsData' }
        },
        traits: {
            file: 'traits-data.json', label: '特性',
            keys: { traits: 'allTraitsData' }
        },
        items: {
            file: 'items-data.json', label: '物品',
            keys: {
                kinds: 'itemKindsData',
                groups: 'itemGroupsData',
                categories: 'itemCategoriesData',
                items: 'allItemsData'
            }
        },
        natures: {
            file: 'natures-data.json', label: '性格',
            keys: { natures: 'allNaturesData', stats: 'natureStats' }
        }
    };

    const FALLBACK_BASES = [
        'https://cdn.jsdelivr.net/gh/luo029/vowmon_data@main',
        'https://raw.githubusercontent.com/luo029/vowmon_data/main'
    ];

    function bases() {
        const cfg = window.VOWMON_SITE_CONFIG || {};
        const raw = [cfg.dataCdnBase].concat(FALLBACK_BASES);
        const out = [];
        for (let i = 0; i < raw.length; i++) {
            const b = String(raw[i] || '').trim().replace(/\/+$/, '');
            if (b && out.indexOf(b) === -1) out.push(b);
        }
        return out;
    }

    const cache = {};

    /**
     * 物品的自定义类型 / 分组 / 细分类是在 js/item-config.js 里「加载时」算出来的，
     * 而数据要到 fetch 回来才存在，所以这里补一次：把远端列表写回 item-config。
     * 空数组不动手（空 = 用内置默认）。
     */
    function syncItemConfig(data) {
        try {
            const groups = (Array.isArray(data.groups) ? data.groups : [])
                .map(g => (typeof g === 'string' ? { name: g } : g))
                .filter(g => g && String(g.name || '').trim());
            if (Array.isArray(data.kinds) && data.kinds.length && typeof setItemKinds === 'function') {
                setItemKinds(data.kinds.map(k => String(k).trim()).filter(Boolean));
            }
            if (groups.length && typeof setItemGroups === 'function') setItemGroups(groups);
            if (Array.isArray(data.categories) && data.categories.length && typeof setItemCategories === 'function') {
                setItemCategories(data.categories.map(c => String(c).trim()).filter(Boolean));
            }
        } catch (e) {
            // 没引入 item-config.js 的页面不需要这一步
        }
    }

    async function fetchOne(key, fresh) {
        const meta = FILES[key];
        if (!meta) throw new Error('未知数据键：' + key);

        const bust = fresh ? '?_=' + Date.now() : '';
        let lastErr = null;

        for (const base of bases()) {
            try {
                const res = await fetch(base + '/' + meta.file + bust, {
                    cache: fresh ? 'no-store' : 'default'
                });
                if (!res.ok) {
                    lastErr = new Error(base + ' 返回 HTTP ' + res.status);
                    continue;
                }
                const data = await res.json();
                if (!data || typeof data !== 'object' || Array.isArray(data)) {
                    lastErr = new Error(base + ' 返回的数据格式不对');
                    continue;
                }
                let assigned = 0;
                for (const k in meta.keys) {
                    if (Object.prototype.hasOwnProperty.call(data, k)) {
                        window[meta.keys[k]] = data[k];
                        assigned++;
                    }
                }
                if (!assigned) {
                    lastErr = new Error(base + ' 里没有 ' + meta.label + '数据字段');
                    continue;
                }
                if (key === 'items') syncItemConfig(data);
                return data;
            } catch (e) {
                lastErr = e;
            }
        }
        throw new Error(meta.label + '数据加载失败：' + (lastErr && lastErr.message ? lastErr.message : '网络错误'));
    }

    function load(keys, opts) {
        const fresh = !!(opts && opts.fresh);
        const list = (keys && keys.length) ? keys : ['pets'];
        return Promise.all(list.map(function (k) {
            const ck = k + (fresh ? ':fresh' : '');
            if (!fresh && cache[ck]) return cache[ck];
            const p = fetchOne(k, fresh);
            if (!fresh) cache[ck] = p;
            return p;
        })).then(function () {
            document.dispatchEvent(new CustomEvent('vowmon:data-ready', { detail: { keys: list } }));
        });
    }

    /* ---------- 加载遮罩：避免数据回来前露出未编译的 {{ }} ---------- */

    let bootEl = null;
    let bootTimer = null;

    function showBoot() {
        if (bootEl || !document.body) return;
        bootEl = document.createElement('div');
        bootEl.id = 'vowmon-boot';
        bootEl.setAttribute('style', [
            'position:fixed', 'inset:0', 'z-index:99999',
            'display:flex', 'flex-direction:column', 'align-items:center', 'justify-content:center',
            'gap:14px', 'background:#fff', 'color:#6b7280',
            'font:600 14px/1.6 system-ui,-apple-system,"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif'
        ].join(';'));
        bootEl.innerHTML =
            '<div style="width:34px;height:34px;border-radius:50%;border:3px solid #ffe3ea;border-top-color:#ff6b8a;animation:vowmon-spin .7s linear infinite"></div>' +
            '<div>正在加载数据…</div>';
        if (!document.getElementById('vowmon-boot-style')) {
            const st = document.createElement('style');
            st.id = 'vowmon-boot-style';
            st.textContent = '@keyframes vowmon-spin{to{transform:rotate(360deg)}}';
            document.head.appendChild(st);
        }
        document.body.appendChild(bootEl);

        bootTimer = setTimeout(function () {
            const t = bootEl && bootEl.querySelector('div:last-child');
            if (t) t.textContent = '数据加载有点慢，请检查网络…';
        }, 8000);
    }

    function hideBoot() {
        if (bootTimer) clearTimeout(bootTimer);
        if (!bootEl) return;
        bootEl.style.transition = 'opacity .18s ease';
        bootEl.style.opacity = '0';
        const el = bootEl;
        setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, 200);
        bootEl = null;
    }

    function showError(err) {
        if (bootTimer) clearTimeout(bootTimer);
        if (!bootEl) showBoot();
        if (!bootEl) return;
        bootEl.innerHTML =
            '<div style="font-size:15px;font-weight:800;color:#e11d48">数据加载失败</div>' +
            '<div style="max-width:520px;text-align:center;line-height:1.7">' + String(err && err.message || err) + '</div>' +
            '<button id="vowmon-boot-retry" style="margin-top:6px;padding:8px 18px;border:0;border-radius:999px;background:#ff6b8a;color:#fff;font-weight:700;cursor:pointer">重新加载</button>';
        const btn = bootEl.querySelector('#vowmon-boot-retry');
        if (btn) btn.onclick = function () { location.reload(); };
    }

    window.VowmonData = {
        files: FILES,
        bases: bases,
        /** 数据到位后再执行；失败会显示可重试的错误页 */
        ready: function (keys, opts) {
            showBoot();
            const p = load(keys, opts);
            p.then(function () {
                // 挂载发生在同一轮微任务里，rAF 之后隐藏遮罩就不会闪到 {{ }}
                requestAnimationFrame(function () { hideBoot(); });
            }, function (err) {
                showError(err);
                throw err;
            });
            return p;
        },
        /** 强制回源（后台用） */
        reload: function (keys) { return load(keys, { fresh: true }); },
        get: function (key) {
            const meta = FILES[key];
            if (!meta) return undefined;
            const first = Object.keys(meta.keys)[0];
            return window[meta.keys[first]];
        },
        hideBoot: hideBoot
    };
})();
