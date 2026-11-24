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
 * ── 取数顺序（本地优先，再和云端对比）────────────────────────────
 *   1. 本机镜像（localStorage: vowmon_mirror_<key>）
 *      后台刚改过 / 刚同步的数据，同一台电脑的前台**立刻**就能看到，不用等网络；
 *   2. 云端数据仓库（依次尝试三个源，前一个失败自动换下一个）：
 *      - window.VOWMON_SITE_CONFIG.dataCdnBase（默认是本站 /data 反向代理，CF 边缘缓存）
 *      - https://cdn.jsdelivr.net/gh/luo029/vowmon_data@main
 *      - https://raw.githubusercontent.com/luo029/vowmon_data/main
 *   拉到云端数据后会和本地镜像比对：
 *      - 一样 → 什么都不做；
 *      - 不一样且本地没有「未同步的修改」→ 用云端覆盖，页面自动刷新；
 *      - 不一样但本地有未同步的修改 → 保留本地，等你在后台点「一键同步」。
 *
 * ── 跨标签页即时同步 ───────────────────────────────────────────
 *   后台保存时写入本机镜像并广播；前台开着的标签页通过 storage 事件立刻刷新。
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

    const MIRROR_PREFIX = 'vowmon_mirror_';
    const DIRTY_KEY = 'vowmon_dirty_keys';

    /* ------------------------------ 本地存储小工具 ------------------------------ */

    function lsGet(key) {
        try { return localStorage.getItem(key); } catch (e) { return null; }
    }
    function lsSet(key, value) {
        try { localStorage.setItem(key, value); return true; } catch (e) { return false; }
    }

    function readMirror(key) {
        const raw = lsGet(MIRROR_PREFIX + key);
        if (!raw) return null;
        try {
            const obj = JSON.parse(raw);
            return (obj && typeof obj === 'object' && !Array.isArray(obj)) ? obj : null;
        } catch (e) { return null; }
    }
    function writeMirror(key, obj) {
        try { return lsSet(MIRROR_PREFIX + key, JSON.stringify(obj)); } catch (e) { return false; }
    }

    function dirtyMap() {
        try {
            const m = JSON.parse(lsGet(DIRTY_KEY) || '{}');
            return (m && typeof m === 'object') ? m : {};
        } catch (e) { return {}; }
    }
    function isDirty(key) { return !!dirtyMap()[key]; }
    function setDirty(key, value) {
        const m = dirtyMap();
        m[key] = !!value;
        lsSet(DIRTY_KEY, JSON.stringify(m));
    }

    /* ------------------------------ 全局变量写入 ------------------------------ */

    function vueReactive(value) {
        try {
            if (window.Vue && typeof window.Vue.reactive === 'function') return window.Vue.reactive(value);
        } catch (e) { /* ignore */ }
        return value;
    }
    function isReactiveObj(v) {
        try {
            return !!(window.Vue && typeof window.Vue.isReactive === 'function' && window.Vue.isReactive(v));
        } catch (e) { return false; }
    }

    /**
     * 把数据写进全局变量。
     * 如果全局变量已经是 Vue 响应式对象，就**原地替换内容**，
     * 这样所有引用它的页面（列表 / 图鉴 / 技能…）会立刻重新渲染，不用刷新页面。
     */
    function setGlobal(name, value) {
        const cur = window[name];
        if (isReactiveObj(cur) && Array.isArray(value) && Array.isArray(cur)) {
            cur.splice(0, cur.length);
            for (let i = 0; i < value.length; i++) cur.push(value[i]);
            return cur;
        }
        if (isReactiveObj(cur) && value && typeof value === 'object' && !Array.isArray(value)
            && cur && typeof cur === 'object' && !Array.isArray(cur)) {
            for (const k in cur) {
                if (!Object.prototype.hasOwnProperty.call(value, k)) delete cur[k];
            }
            Object.assign(cur, value);
            return cur;
        }
        window[name] = (value && typeof value === 'object') ? vueReactive(value) : value;
        return window[name];
    }

    /* ------------------------------ 变更通知 ------------------------------ */

    const listeners = {};

    function emitChange(key, data) {
        const list = listeners[key] || [];
        for (let i = 0; i < list.length; i++) {
            try { list[i](data); } catch (e) { /* 单个监听出错不影响其它 */ }
        }
        try {
            document.dispatchEvent(new CustomEvent('vowmon:data-changed', { detail: { key: key, data: data } }));
        } catch (e) { /* ignore */ }
    }

    /**
     * 把一份数据（云端或本地镜像）写进全局变量并通知页面。
     */
    function applyData(key, data) {
        const meta = FILES[key];
        if (!meta || !data) return;
        let assigned = 0;
        for (const k in meta.keys) {
            if (Object.prototype.hasOwnProperty.call(data, k)) {
                setGlobal(meta.keys[k], data[k]);
                assigned++;
            }
        }
        if (!assigned) return;
        if (key === 'items') syncItemConfig(data);
        emitChange(key, data);
    }

    /* ------------------------------ 数据源地址 ------------------------------ */

    function bases() {
        const cfg = window.VOWMON_SITE_CONFIG || {};
        // 后台「同步配置」里填的数据基址优先；读 localStorage 而不是读缓存的对象，
        // 这样在后台改完地址、不刷新页面直接跳到前台也能立刻生效。
        let localBase = '';
        try {
            const local = JSON.parse(lsGet('vowmon_sync_config') || '{}') || {};
            localBase = local.dataCdnBase || '';
        } catch (e) {
            localBase = '';
        }
        const raw = [localBase, cfg.dataCdnBase].concat(FALLBACK_BASES);
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

    /* ------------------------------ 拉取云端 ------------------------------ */

    async function fetchRemote(key, fresh) {
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
                let has = false;
                for (const k in meta.keys) {
                    if (Object.prototype.hasOwnProperty.call(data, k)) { has = true; break; }
                }
                if (!has) {
                    lastErr = new Error(base + ' 里没有' + meta.label + '数据字段');
                    continue;
                }
                return data;
            } catch (e) {
                lastErr = e;
            }
        }
        throw new Error(meta.label + '数据加载失败：' + (lastErr && lastErr.message ? lastErr.message : '网络错误'));
    }

    function sameData(a, b) {
        if (!a || !b) return false;
        try { return JSON.stringify(a) === JSON.stringify(b); } catch (e) { return false; }
    }

    /**
     * 后台对账：把云端数据和本机镜像比一比。
     *   云端 == 本地 → 什么都不做；
     *   本地有未同步修改 → 保留本地（别把还没上传的改动冲掉）；
     *   否则 → 用云端覆盖并刷新页面。
     */
    async function reconcile(key) {
        const meta = FILES[key];
        if (!meta) return null;
        let remote;
        try {
            remote = await fetchRemote(key, false);
        } catch (e) {
            return null;   // 云端取不到就保持现状，别把页面搞空
        }
        const local = readMirror(key);
        if (sameData(local, remote)) return remote;
        if (isDirty(key)) return local;
        applyData(key, remote);
        writeMirror(key, remote);
        return remote;
    }

    /* ------------------------------ 加载入口 ------------------------------ */

    function loadKey(key, fresh) {
        const meta = FILES[key];
        if (!meta) return Promise.reject(new Error('未知数据键：' + key));

        const mirror = readMirror(key);

        // 本机已有镜像：先用它渲染（后台刚改完，前台立刻可见），再去云端对账
        if (mirror && !fresh) {
            applyData(key, mirror);
            reconcile(key).catch(function () { /* 对账失败不影响已渲染的内容 */ });
            return Promise.resolve(mirror);
        }

        // 没有镜像（第一次访问 / 换设备）：必须等云端
        return fetchRemote(key, fresh).then(function (data) {
            applyData(key, data);
            // 本地有未同步修改时，不要用云端覆盖镜像
            if (!isDirty(key)) writeMirror(key, data);
            return data;
        });
    }

    function load(keys, opts) {
        const fresh = !!(opts && opts.fresh);
        const list = (keys && keys.length) ? keys : ['pets'];
        const tasks = list.map(function (k) {
            const ck = k + (fresh ? ':fresh' : '');
            if (!fresh && cache[ck]) return cache[ck];
            const p = loadKey(k, fresh);
            if (!fresh) cache[ck] = p;
            return p;
        });
        return Promise.all(tasks).then(function () {
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
            'position:fixed; inset:0; z-index:99999',
            'display:flex; flex-direction:column; align-items:center; justify-content:center',
            'gap:14px; background:#fff; color:#6b7280',
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

    /* ------------------------------ 跨标签页同步 ------------------------------ */

    window.addEventListener('storage', function (e) {
        if (!e.key || e.key.indexOf(MIRROR_PREFIX) !== 0) return;
        const key = e.key.slice(MIRROR_PREFIX.length);
        if (!FILES[key]) return;
        const data = readMirror(key);
        if (!data) return;
        applyData(key, data);
    });

    /* ------------------------------ 对外接口 ------------------------------ */

    window.VowmonData = {
        files: FILES,
        bases: bases,
        /** 数据到位后再执行；失败会显示可重试的错误页 */
        ready: function (keys, opts) {
            // 本机所有请求的数据都有镜像且不强制回源 → 数据立刻就能到位，
            // 不显示加载遮罩，避免页面每次打开都闪一下「正在加载数据…」
            const fresh = !!(opts && opts.fresh);
            const list = (keys && keys.length) ? keys : ['pets'];
            const allLocal = !fresh && list.every(function (k) { return !!readMirror(k); });
            if (!allLocal) showBoot();
            const p = load(keys, opts);
            p.then(function () {
                // 挂载发生在同一轮微任务里，rAF 之后隐藏遮罩就不会闪到 {{ }}
                requestAnimationFrame(function () { hideBoot(); });
                // 后台标签页里 rAF 会被节流甚至不触发，用定时器兜底，避免遮罩一直挂着
                setTimeout(function () { hideBoot(); }, 150);
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
        /**
         * 监听某类数据的变化。
         * 回调会收到新的原始数据对象，页面自己决定怎么更新界面。
         */
        onChange: function (key, cb) {
            if (!FILES[key] || typeof cb !== 'function') return;
            (listeners[key] = listeners[key] || []).push(cb);
        },
        hideBoot: hideBoot
    };

    /**
     * 本地数据仓库（后台写、前台读）
     *   save()       —— 后台保存时调用：写本机镜像 + 标记「有未同步修改」+ 广播
     *   markSynced() —— 一键同步成功后调用：清掉「未同步」标记
     */
    window.VowmonStore = {
        save: function (key, data) {
            if (!FILES[key] || !data) return;
            writeMirror(key, data);
            setDirty(key, true);
            // 同一标签页里的其它组件也能马上收到通知
            try {
                document.dispatchEvent(new CustomEvent('vowmon:data-changed', { detail: { key: key, data: data } }));
            } catch (e) { /* ignore */ }
        },
        markSynced: function (key) {
            setDirty(key, false);
        },
        /**
         * 用一份「确定就是最新的」数据覆盖本机镜像（后台从云端拉取后用），
         * 同时清掉「未同步」标记。
         */
        replace: function (key, data) {
            if (!FILES[key] || !data) return;
            writeMirror(key, data);
            setDirty(key, false);
            try {
                document.dispatchEvent(new CustomEvent('vowmon:data-changed', { detail: { key: key, data: data } }));
            } catch (e) { /* ignore */ }
        },
        isDirty: isDirty,
        getMirror: readMirror,
        dirtyKeys: dirtyMap
    };
})();
