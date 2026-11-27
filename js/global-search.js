/* ==========================================================================
   Vowmon Wiki —— 全局搜索面板（Ctrl / ⌘ + K）
   --------------------------------------------------------------------------
   由 navbar.js 按需注入，所有前台页面自动可用；数据首次打开时加载。
   暴露 window.VowmonGlobalSearch = { open(keyword), close(), isOpen() }
   ========================================================================== */
(function () {
    'use strict';
    if (window.VowmonGlobalSearch) return;

    var ROOT = /\/(admin|dex|reference|world|records|battle|tools)\//.test(window.location.pathname) ? '../' : '';
    var DATA_FILES = [
        { key: 'vows', file: 'vow-data.json' },
        { key: 'skills', file: 'skills-data.json' },
        { key: 'traits', file: 'traits-data.json' },
        { key: 'items', file: 'items-data.json' },
        { key: 'individuals', file: 'individuals-data.json' },
        { key: 'characters', file: 'characters-data.json' },
        { key: 'lore', file: 'lore-data.json' }
    ];
    var CATS = [
        { key: 'all', label: '全部' }, { key: 'vow', label: '精灵' }, { key: 'skill', label: '技能' },
        { key: 'trait', label: '特性' }, { key: 'item', label: '物品' },
        { key: 'individual', label: '个体' }, { key: 'character', label: '人物' }, { key: 'lore', label: '世界观' }
    ];
    var PAGES = { ranks: 'ranks', bloodlines: 'bloodlines', trainers: 'trainers', factions: 'factions', lore: 'lore' };
    var cache = null, loading = null, root = null, input = null, list = null, chips = null;
    var cat = 'all', keyword = '', opened = false, previousFocus = null;

    function dataBase() {
        var cfg = window.VOWMON_SITE_CONFIG || {};
        return String(cfg.dataCdnBase || 'https://vowmon.pages.dev/data').replace(/\/+$/, '');
    }
    function fetchJson(file) {
        return fetch(dataBase() + '/' + file + '?_=' + Date.now()).then(function (r) {
            if (!r.ok) throw new Error(file + ' ' + r.status);
            return r.json();
        }).catch(function () { return null; });
    }
    function loadAll() {
        if (cache) return Promise.resolve(cache);
        if (loading) return loading;
        loading = Promise.all(DATA_FILES.map(function (f) { return fetchJson(f.file); })).then(function (bags) {
            cache = {};
            DATA_FILES.forEach(function (f, i) { cache[f.key] = bags[i] || {}; });
            return cache;
        }).finally(function () { loading = null; });
        return loading;
    }
    function el(tag, cls, text) {
        var n = document.createElement(tag);
        if (cls) n.className = cls;
        if (text !== undefined) n.textContent = text;
        return n;
    }
    function build() {
        if (root) return;
        root = el('div', 'gs-root');
        root.setAttribute('role', 'dialog');
        root.setAttribute('aria-label', '全站搜索');
        var panel = el('div', 'gs-panel');
        var head = el('div', 'gs-head');
        var icon = el('i', 'fa-solid fa-magnifying-glass');
        head.appendChild(icon);
        input = el('input', 'gs-input');
        input.type = 'search';
        input.placeholder = '搜索精灵 / 技能 / 特性 / 物品 / 人物 / 世界观…';
        input.autocomplete = 'off';
        var esc = el('span', 'gs-esc', 'ESC');
        head.appendChild(input); head.appendChild(esc);
        chips = el('div', 'gs-chips');
        CATS.forEach(function (c) {
            var b = el('button', 'gs-chip' + (c.key === cat ? ' on' : ''), c.label);
            b.type = 'button'; b.dataset.cat = c.key;
            b.addEventListener('click', function () { cat = c.key; refreshChips(); render(); input.focus(); });
            chips.appendChild(b);
        });
        list = el('div', 'gs-list');
        var foot = el('div', 'gs-foot', '↑ ↓ 选择　·　Enter 打开　·　Esc 关闭');
        panel.appendChild(head); panel.appendChild(chips); panel.appendChild(list); panel.appendChild(foot);
        root.appendChild(panel);
        root.addEventListener('click', function (e) { if (e.target === root) close(); });
        input.addEventListener('input', function () { keyword = input.value.trim(); render(); });
        input.addEventListener('keydown', function (e) {
            var items = Array.prototype.slice.call(list.querySelectorAll('.gs-item'));
            var idx = items.findIndex(function (x) { return x.classList.contains('on'); });
            if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                e.preventDefault();
                if (!items.length) return;
                var next = e.key === 'ArrowDown' ? (idx + 1) % items.length : (idx <= 0 ? items.length - 1 : idx - 1);
                items.forEach(function (x) { x.classList.remove('on'); });
                items[next].classList.add('on');
                items[next].scrollIntoView({ block: 'nearest' });
            } else if (e.key === 'Enter') {
                e.preventDefault();
                if (items[idx >= 0 ? idx : 0]) items[idx >= 0 ? idx : 0].click();
            } else if (e.key === 'Escape') {
                e.preventDefault(); close();
            }
        });
        document.body.appendChild(root);
    }
    function refreshChips() {
        Array.prototype.forEach.call(chips.children, function (b) { b.classList.toggle('on', b.dataset.cat === cat); });
    }
    function arr(v) { return Array.isArray(v) ? v : (v ? [v] : []); }
    function collect() {
        var d = cache || {}, out = [];
        function hit(text) { return String(text || '').toLowerCase().indexOf(keyword.toLowerCase()) >= 0; }
        (arr(d.vows.vows)).forEach(function (v) {
            if (!hit([v.id, v.name, (v.types || []).join(' '), v.description].join(' '))) return;
            out.push({ cat: 'vow', icon: 'fa-paw', title: v.name, sub: 'No.' + v.id + ' · ' + (v.types || []).join(' / '),
                href: ROOT + 'dex/vow-detail.html?id=' + encodeURIComponent(v.id), key: v.id });
        });
        (arr(d.skills.skills)).forEach(function (s) {
            if (!hit([s.name, s.type, s.effect, s.category].join(' '))) return;
            out.push({ cat: 'skill', icon: 'fa-bolt', title: s.name, sub: (s.type || '') + ' · ' + (s.category || ''),
                href: ROOT + 'reference/skill-detail.html?id=' + encodeURIComponent(s.id || s.name), key: s.id });
        });
        (arr(d.traits.traits)).forEach(function (t) {
            if (!hit([t.name, t.effect, t.description].join(' '))) return;
            out.push({ cat: 'trait', icon: 'fa-leaf', title: t.name, sub: (t.effect || '').slice(0, 40),
                href: ROOT + 'reference/traits.html?q=' + encodeURIComponent(t.name), key: t.name });
        });
        (arr(d.items.items)).forEach(function (i) {
            if (!hit([i.id, i.name, i.kind, i.description].join(' '))) return;
            out.push({ cat: 'item', icon: 'fa-box', title: i.name, sub: (i.kind || '') + ' · ' + (i.id || ''),
                href: ROOT + 'reference/items.html?id=' + encodeURIComponent(i.id || i.name), key: i.id });
        });
        (arr(d.individuals.individuals)).forEach(function (i) {
            if (!hit([i.id, i.nickname, i.speciesId, i.personality].join(' '))) return;
            out.push({ cat: 'individual', icon: 'fa-user-paw', title: i.nickname || i.speciesId || i.id,
                sub: '御兽精灵 · ' + (i.id || ''), href: ROOT + 'records/individuals.html?id=' + encodeURIComponent(i.id), key: i.id });
        });
        (arr(d.characters.characters)).forEach(function (c) {
            if (!hit([c.name, c.title, c.faction, c.bio].join(' '))) return;
            out.push({ cat: 'character', icon: 'fa-user', title: c.name, sub: (c.title || '') + ' · ' + (c.faction || ''),
                href: ROOT + 'records/characters.html?id=' + encodeURIComponent(c.id), key: c.id });
        });
        var blocks = d.lore.blocks || {};
        Object.keys(blocks).forEach(function (k) {
            var b = blocks[k];
            var text = String((b && b.html) || b || '').replace(/<[^>]+>/g, ' ');
            if (!hit(text)) return;
            var page = k.split('.')[0];
            out.push({ cat: 'lore', icon: 'fa-book', title: text.replace(/\s+/g, ' ').trim().slice(0, 40) || k,
                sub: '世界观 · ' + (PAGES[page] || page), href: ROOT + 'world/' + (PAGES[page] || 'lore') + '.html', key: k });
        });
        return out.filter(function (x) { return cat === 'all' || x.cat === cat; }).slice(0, 40);
    }
    function render() {
        if (!list) return;
        list.innerHTML = '';
        if (!keyword) {
            var tip = el('div', 'gs-tip', '输入关键词开始搜索；也可以使用上方分类筛选。');
            list.appendChild(tip); return;
        }
        if (!cache) {
            list.appendChild(el('div', 'gs-tip', '正在加载全站数据…')); return;
        }
        var items = collect();
        if (!items.length) { list.appendChild(el('div', 'gs-tip', '没有找到匹配内容。')); return; }
        var lastCat = '';
        items.forEach(function (x) {
            if (x.cat !== lastCat) {
                lastCat = x.cat;
                var label = (CATS.find(function (c) { return c.key === x.cat; }) || {}).label || x.cat;
                list.appendChild(el('div', 'gs-group', label));
            }
            var a = el('a', 'gs-item');
            a.href = x.href;
            var i = el('i', 'fa-solid ' + x.icon);
            var body = el('div', 'gs-body');
            body.appendChild(el('div', 'gs-title', x.title));
            body.appendChild(el('div', 'gs-sub', x.sub));
            a.appendChild(i); a.appendChild(body);
            a.addEventListener('click', function () { close(); });
            list.appendChild(a);
        });
    }
    function open(kw) {
        build();
        previousFocus = document.activeElement;
        opened = true;
        root.classList.add('is-open');
        document.body.classList.add('gs-open');
        if (typeof kw === 'string') { keyword = kw; input.value = kw; }
        input.focus(); input.select();
        render();
        loadAll().then(function () { if (opened) render(); });
    }
    function close() {
        if (!root) return;
        opened = false;
        root.classList.remove('is-open');
        document.body.classList.remove('gs-open');
        if (previousFocus && previousFocus.focus) try { previousFocus.focus(); } catch (e) {}
    }
    document.addEventListener('keydown', function (e) {
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
            e.preventDefault();
            if (opened) close(); else open();
        } else if (e.key === 'Escape' && opened) {
            e.preventDefault(); close();
        }
    });
    window.VowmonGlobalSearch = Object.freeze({ open: open, close: close, isOpen: function () { return opened; } });
})();
