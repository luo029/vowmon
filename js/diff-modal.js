/* ==========================================================================
   Vowmon 同步差异预览弹窗（唯一来源）
   --------------------------------------------------------------------------
   配套样式：css/diff-modal.css（类名前缀 vwdiff-）
   作用：一键同步 / 从仓库拉取前，先把「本机 ↔ 云端」的差异列出来，
        每一条差异都可以单独勾选要不要同步，确认后才真正执行。
        彻底替代以前那种「点了同步就整包覆盖 / 点了拉取就整个回滚」的盲操作。

   用法（Promise 化）：
       const res = await VowmonDiff.review({
           mode: 'push',            // 'push' = 上传预览（本机 → 云端）
                                    // 'pull' = 拉取预览（云端 → 本机）
           sourceLabel: '本机草稿',
           targetLabel: '云端仓库',
           sections: [
               // 数组段：最常见的形态（精灵 / 技能 / 特性 / 物品……）
               { label: '技能', local: skills.value, remote: bag.skills,
                 key: s => s.id, name: s => s.name },
               // 对象段：键值对形态（血脉技能包 families / 页面文本块 blocks）
               { label: '技能包', kind: 'map', local: families.value, remote: bag.families }
           ]
       });
       if (!res.ok) return;                 // 用户取消，或两边本来就一致
       // res.sections[i].merged —— 按用户勾选合并好的最终数组/对象
       // res.all                —— 是否全选（= 完整同步，可安全 markSynced）
       // res.count              —— 勾选的差异数

   勾选默认值：新增 ✓ / 修改 ✓ / 删除 ✗（删除必须手动勾，防误删）。
   遵循全局动画开关 vowmon_anim_on = 'false'；Esc 取消、Enter 确认。
   ========================================================================== */
(function () {
    'use strict';
    if (window.VowmonDiff) return;

    /* ------------------------------------------------------------ 小工具 */

    function el(tag, cls, text) {
        var node = document.createElement(tag);
        if (cls) node.className = cls;
        if (text != null) node.textContent = text;
        return node;
    }

    function animOn() {
        try { return localStorage.getItem('vowmon_anim_on') !== 'false'; }
        catch (e) { return true; }
    }

    // 键序无关的稳定序列化，用来比较两份数据是否相等
    function stable(value) {
        if (value === null || typeof value !== 'object') return JSON.stringify(value) + '·' + (typeof value);
        if (Array.isArray(value)) return '[' + value.map(stable).join(',') + ']';
        var keys = Object.keys(value).sort();
        return '{' + keys.map(function (k) { return JSON.stringify(k) + ':' + stable(value[k]); }).join(',') + '}';
    }
    function same(a, b) { return stable(a) === stable(b); }

    function trunc(str, n) {
        str = String(str);
        return str.length > n ? str.slice(0, n) + '…' : str;
    }

    // 把一个值压成适合展示的短文本
    function fmt(v) {
        if (v === undefined || v === null || v === '') return '（空）';
        if (Array.isArray(v)) {
            if (!v.length) return '（空）';
            var allPrim = v.every(function (x) { return x === null || typeof x !== 'object'; });
            return trunc(allPrim ? v.join('、') : JSON.stringify(v), 64);
        }
        if (typeof v === 'object') return trunc(JSON.stringify(v), 64);
        return trunc(v, 64);
    }

    // 常见字段的中文名（没收录的字段直接显示原键名）
    var FIELD_LABELS = {
        id: 'ID', name: '名称', nickname: '昵称', types: '属性', type: '属性',
        level: '等级', image: '图片', shinyImage: '异色图', region: '出现地区',
        taxonomy: '分类', evoFrom: '进化自', evoTo: '进化为', realmTags: '境界标签',
        note: '说明', effect: '效果', category: '类别', power: '威力',
        speciesId: '种族', ownerId: '持有者', vowIds: '持有精灵',
        personality: '习性', nature: '性格', skills: '技能', traits: '特性',
        min: '最低等级', max: '最高等级', color: '颜色', icon: '图标',
        pokemons: '拥有精灵', hiddenPokemons: '隐藏精灵', description: '描述',
        text: '文本', html: '内容', title: '标题', label: '标签'
    };
    function fieldLabel(k) { return FIELD_LABELS[k] || k; }

    // 两份数据的字段级差异（from → to 方向由调用方决定谁先传）
    function fieldChanges(a, b) {
        // 数组值（如技能包里的技能列表）不做键拆分，整包一行显示
        if (Array.isArray(a) || Array.isArray(b)) {
            if (same(a, b)) return [];
            return [{ field: '内容', from: fmt(a), to: fmt(b) }];
        }
        var keys = {};
        var i;
        var ak = Object.keys(a || {}), bk = Object.keys(b || {});
        for (i = 0; i < ak.length; i++) keys[ak[i]] = 1;
        for (i = 0; i < bk.length; i++) keys[bk[i]] = 1;
        var out = [];
        Object.keys(keys).forEach(function (k) {
            if (same((a || {})[k], (b || {})[k])) return;
            out.push({ field: fieldLabel(k), from: fmt((a || {})[k]), to: fmt((b || {})[k]) });
        });
        return out;
    }

    /* ------------------------------------------------------------- 差异计算 */

    // 统一把一段数据取成 [{key, value}] 列表
    function entriesOf(section, side) {
        var data = side === 'local' ? section.local : section.remote;
        var list = [];
        if (section.kind === 'map') {
            if (data && typeof data === 'object') {
                Object.keys(data).forEach(function (k) { list.push({ key: k, value: data[k] }); });
            }
            return list;
        }
        if (!Array.isArray(data)) return list;
        var keyFn = typeof section.key === 'function' ? section.key : function (x) { return x && (x.id !== undefined ? x.id : x.name); };
        data.forEach(function (item) {
            var k = keyFn(item);
            if (k === undefined || k === null || k === '') k = '(no-key)';
            list.push({ key: String(k), value: item });
        });
        return list;
    }

    function nameOf(section, value) {
        if (typeof section.name === 'function') return String(section.name(value) || '（未命名）');
        if (section.kind === 'map') return '（值）';
        return String((value && (value.name || value.nickname || value.id)) || '（未命名）');
    }

    /*
     * 计算一个 section 的差异。
     * push 模式：added=本机独有(将上传)  modified=两边都有但不同(本机覆盖云端)  removed=云端独有(上传后删除)
     * pull 模式：added=云端独有(将拉入)  modified=两边都有但不同(云端覆盖本机)  removed=本机独有(拉取后删除)
     */
    function buildItems(mode, section, sectionIndex) {
        var L = entriesOf(section, 'local');
        var R = entriesOf(section, 'remote');
        var lmap = {}, rmap = {}, i;
        L.forEach(function (e) { if (!lmap[e.key]) lmap[e.key] = e; });
        R.forEach(function (e) { if (!rmap[e.key]) rmap[e.key] = e; });

        var items = [];
        function push(type, key, localValue, remoteValue) {
            var from = mode === 'push' ? remoteValue : localValue;
            var to = mode === 'push' ? localValue : remoteValue;
            var changes;
            if (type === 'modified') changes = fieldChanges(from, to);
            else if (type === 'added') changes = fieldChanges(null, to);
            else changes = [];                       // 删除项不展示字段 diff，用简介行说明即可
            items.push({
                section: section.label,
                sectionIndex: sectionIndex,
                type: type,
                key: key,
                // 对象段（families / lore blocks）的键本身就是名字
                name: section.kind === 'map' ? String(key) : nameOf(section, type === 'removed' ? from : to),
                changes: changes.slice(0, 12),
                selected: type !== 'removed',
                expanded: false,
                localValue: localValue,
                remoteValue: remoteValue
            });
        }

        // added / modified
        var srcA = mode === 'push' ? L : R;
        var other = mode === 'push' ? rmap : lmap;
        for (i = 0; i < srcA.length; i++) {
            var e = srcA[i];
            if (!other[e.key]) push('added', e.key, e.value, undefined);
            else if (!same(e.value, other[e.key].value)) push('modified', e.key, lmap[e.key].value, rmap[e.key].value);
        }
        // removed：本段里「对方独有」的（值放到它真正所属的那一侧）
        var srcB = mode === 'push' ? R : L;
        var own = mode === 'push' ? lmap : rmap;
        for (i = 0; i < srcB.length; i++) {
            var e2 = srcB[i];
            if (!own[e2.key]) {
                if (mode === 'push') push('removed', e2.key, undefined, e2.value);
                else push('removed', e2.key, e2.value, undefined);
            }
        }
        return items;
    }

    /* ------------------------------------------------------------- 合并 */

    /*
     * 按勾选结果合并出最终数据：
     *   push → 以云端为基础，套用勾选的本机新增/修改，删掉勾选的云端独有项 → 用于上传
     *   pull → 以本机为基础，套用勾选的云端新增/修改，删掉勾选的本机独有项 → 用于落盘
     */
    function mergeSection(mode, section, items) {
        var itemMap = {};
        items.forEach(function (it) { itemMap[it.key] = it; });

        if (section.kind === 'map') {
            var base = mode === 'push'
                ? (section.remote && typeof section.remote === 'object' ? section.remote : {})
                : (section.local && typeof section.local === 'object' ? section.local : {});
            var srcEntries = entriesOf(section, mode === 'push' ? 'local' : 'remote');
            var out = {};
            Object.keys(base).forEach(function (k) {
                var it = itemMap[k];
                if (it && it.type === 'removed' && it.selected) return;           // 勾选了删除 → 不带
                if (it && it.type === 'modified' && it.selected) {
                    out[k] = JSON.parse(JSON.stringify(mode === 'push' ? it.localValue : it.remoteValue));
                    return;
                }
                out[k] = JSON.parse(JSON.stringify(base[k]));
            });
            srcEntries.forEach(function (e) {
                var it = itemMap[e.key];
                if (it && it.type === 'added' && it.selected) {
                    out[e.key] = JSON.parse(JSON.stringify(e.value));
                }
            });
            return out;
        }

        var arr = [];
        var baseList = entriesOf(section, mode === 'push' ? 'remote' : 'local');
        var newList = entriesOf(section, mode === 'push' ? 'local' : 'remote');
        baseList.forEach(function (e) {
            var it = itemMap[e.key];
            if (it && it.type === 'removed' && it.selected) return;
            if (it && it.type === 'modified' && it.selected) {
                arr.push(JSON.parse(JSON.stringify(mode === 'push' ? it.localValue : it.remoteValue)));
                return;
            }
            arr.push(JSON.parse(JSON.stringify(e.value)));
        });
        newList.forEach(function (e) {
            var it = itemMap[e.key];
            if (it && it.type === 'added' && it.selected) arr.push(JSON.parse(JSON.stringify(e.value)));
        });
        return arr;
    }

    /* ------------------------------------------------------------- 弹窗 UI */

    var open = false;

    var TYPE_META = {
        added:   { text: '新增', icon: 'fa-solid fa-circle-plus' },
        modified:{ text: '修改', icon: 'fa-solid fa-pen' },
        removed: { text: '删除', icon: 'fa-solid fa-circle-minus' }
    };
    // removed 的含义随模式变化，列表里写清楚到底删的是哪边的东西
    function removedHint(mode, section) {
        return mode === 'push' ? '云端独有' : '本机独有';
    }
    function removedDesc(mode) {
        return mode === 'push' ? '上传后将从此仓库删除' : '拉取后将从本机删除';
    }

    function buildNode(job) {
        var opts = job.opts;
        var mode = opts.mode;
        var items = job.items;               // [{...item, el 引用后面填}]
        var accent = mode === 'push' ? '#3182ce' : '#2f9e6e';

        var root = el('div', 'vwdiff-root' + (animOn() ? '' : ' is-static'));
        root.style.setProperty('--vwdiff-c', accent);
        var mask = el('div', 'vwdiff-mask');
        var card = el('div', 'vwdiff-card');
        card.setAttribute('role', 'dialog');
        card.setAttribute('aria-modal', 'true');

        /* ---- 头部 ---- */
        var head = el('div', 'vwdiff-head');
        var headIcon = el('div', 'vwdiff-head-icon');
        var hi = document.createElement('i');
        hi.className = mode === 'push' ? 'fa-solid fa-cloud-arrow-up' : 'fa-solid fa-cloud-arrow-down';
        headIcon.appendChild(hi);
        var headText = el('div', 'vwdiff-head-text');
        headText.appendChild(el('div', 'vwdiff-title', opts.title || (mode === 'push' ? '同步预览' : '拉取预览')));
        headText.appendChild(el('div', 'vwdiff-subtitle',
            (opts.sourceLabel || (mode === 'push' ? '本机' : '云端仓库')) + ' → ' + (opts.targetLabel || (mode === 'push' ? '云端仓库' : '本机')) +
            '　·　每条差异可单独勾选'));
        head.appendChild(headIcon);
        head.appendChild(headText);
        var closeBtn = el('button', 'vwdiff-close');
        closeBtn.type = 'button';
        var ci = document.createElement('i');
        ci.className = 'fa-solid fa-xmark';
        closeBtn.appendChild(ci);
        closeBtn.addEventListener('click', function () { finish(null); });
        head.appendChild(closeBtn);
        card.appendChild(head);

        var isEmpty = !items.length;
        if (isEmpty) {
            /* ---- 空态：两边一致 ---- */
            var empty = el('div', 'vwdiff-empty');
            var eIcon = el('div', 'vwdiff-empty-icon');
            var ei = document.createElement('i');
            ei.className = 'fa-solid fa-circle-check';
            eIcon.appendChild(ei);
            empty.appendChild(eIcon);
            empty.appendChild(el('div', 'vwdiff-empty-title', '内容完全一致'));
            empty.appendChild(el('div', 'vwdiff-empty-sub',
                (opts.sourceLabel || '本机') + '与' + (opts.targetLabel || '云端') + '的数据没有差异，无需' + (mode === 'push' ? '同步' : '拉取') + '。'));
            card.appendChild(empty);
            var footEmpty = el('div', 'vwdiff-foot vwdiff-foot-center');
            var okBtnEmpty = el('button', 'vwdiff-btn vwdiff-btn-ok', '好的');
            okBtnEmpty.type = 'button';
            okBtnEmpty.addEventListener('click', function () { finish(null); });
            footEmpty.appendChild(okBtnEmpty);
            card.appendChild(footEmpty);
        } else {
            /* ---- 统计条 ---- */
            var counts = { added: 0, modified: 0, removed: 0 };
            items.forEach(function (it) { counts[it.type]++; });
            var bar = el('div', 'vwdiff-bar');
            var chips = el('div', 'vwdiff-chips');
            [['added', counts.added], ['modified', counts.modified], ['removed', counts.removed]].forEach(function (p) {
                if (!p[1]) return;
                var chip = el('span', 'vwdiff-chip vwdiff-chip-' + p[0]);
                var tic = document.createElement('i');
                tic.className = TYPE_META[p[0]].icon;
                chip.appendChild(tic);
                chip.appendChild(document.createTextNode(TYPE_META[p[0]].text + ' ' + p[1]));
                chips.appendChild(chip);
            });
            bar.appendChild(chips);
            var barRight = el('div', 'vwdiff-bar-right');
            var selAll = el('button', 'vwdiff-linkbtn', '全选');
            selAll.type = 'button';
            var selNone = el('button', 'vwdiff-linkbtn', '清空');
            selNone.type = 'button';
            var selCount = el('span', 'vwdiff-selcount', '');
            barRight.appendChild(selAll);
            barRight.appendChild(selNone);
            barRight.appendChild(selCount);
            bar.appendChild(barRight);
            card.appendChild(bar);

            /* ---- 列表 ---- */
            var list = el('div', 'vwdiff-list');
            var multi = job.sections.length > 1;
            var lastSection = null;
            items.forEach(function (it) {
                if (multi && it.section !== lastSection) {
                    list.appendChild(el('div', 'vwdiff-section-title', it.section));
                    lastSection = it.section;
                }
                list.appendChild(buildItemNode(it, mode, multi));
            });
            card.appendChild(list);

            /* ---- 底部 ---- */
            var foot = el('div', 'vwdiff-foot');
            var hint = el('div', 'vwdiff-hint',
                mode === 'push'
                    ? '只上传勾选的修改；未勾选的保持云端原样（云端独有内容默认保留）。'
                    : '只拉取勾选的修改；未勾选的本机草稿将原样保留。');
            var actions = el('div', 'vwdiff-actions');
            var cancelBtn = el('button', 'vwdiff-btn vwdiff-btn-cancel', '取消');
            cancelBtn.type = 'button';
            cancelBtn.addEventListener('click', function () { finish(null); });
            var okBtn = el('button', 'vwdiff-btn vwdiff-btn-ok', '');
            okBtn.type = 'button';
            okBtn.addEventListener('click', function () { submit(); });
            actions.appendChild(cancelBtn);
            actions.appendChild(okBtn);
            var footRight = el('div', 'vwdiff-foot-actions');
            footRight.appendChild(hint);
            footRight.appendChild(actions);
            foot.appendChild(footRight);
            card.appendChild(foot);

            /* ---- 状态刷新 ---- */
            function refresh() {
                var n = 0;
                items.forEach(function (it) { if (it.selected) n++; });
                selCount.textContent = '已选 ' + n + ' / ' + items.length;
                okBtn.textContent = (mode === 'push' ? '上传 ' : '拉取 ') + n + ' 处修改';
                okBtn.disabled = n === 0;
                okBtn.classList.toggle('is-disabled', n === 0);
                items.forEach(function (it) {
                    if (it._check) it._check.classList.toggle('is-on', it.selected);
                });
            }
            selAll.addEventListener('click', function () {
                items.forEach(function (it) { it.selected = true; });
                refresh();
            });
            selNone.addEventListener('click', function () {
                items.forEach(function (it) { it.selected = false; });
                refresh();
            });
            job._refresh = refresh;
            refresh();
        }

        function submit() {
            if (!items || !items.length) return finish(null);
            var sel = items.filter(function (it) { return it.selected; });
            if (!sel.length) return;
            finish(sel);
        }

        root.appendChild(mask);
        root.appendChild(card);
        mask.addEventListener('click', function () { finish(null); });

        return { root: root, card: card, okBtn: isEmpty ? null : card.querySelector('.vwdiff-btn-ok') };
    }

    function buildItemNode(it, mode, multi) {
        var row = el('div', 'vwdiff-item');
        row.dataset.type = it.type;

        // 勾选框
        var check = el('span', 'vwdiff-check');
        var tick = document.createElement('i');
        tick.className = 'fa-solid fa-check';
        check.appendChild(tick);
        it._check = check;

        // 类型徽章
        var badge = el('span', 'vwdiff-badge');
        var bi = document.createElement('i');
        bi.className = TYPE_META[it.type].icon;
        badge.appendChild(bi);
        badge.appendChild(document.createTextNode(TYPE_META[it.type].text));

        // 名称
        var nameWrap = el('div', 'vwdiff-name-wrap');
        nameWrap.appendChild(el('span', 'vwdiff-name', it.name));

        // 摘要 / 详情
        var body = el('div', 'vwdiff-item-body');
        var main = el('div', 'vwdiff-item-main');
        main.appendChild(check);
        main.appendChild(badge);
        main.appendChild(nameWrap);
        row.appendChild(main);

        if (it.type === 'removed') {
            nameWrap.appendChild(el('span', 'vwdiff-removed-hint', removedHint(mode) + ' · ' + removedDesc(mode)));
        }

        if (it.changes && it.changes.length) {
            var detail = el('div', 'vwdiff-detail');
            it.changes.forEach(function (ch) { detail.appendChild(makeChangeLine(ch)); });
            var more = null;
            if (it.changes.length > 2) {
                more = el('button', 'vwdiff-more', '+' + (it.changes.length - 2) + ' 处改动 ▾');
                more.type = 'button';
                more.addEventListener('click', function (e) {
                    e.stopPropagation();
                    it.expanded = !it.expanded;
                    row.classList.toggle('is-expanded', it.expanded);
                    more.textContent = it.expanded ? '收起 ▴' : '+' + (it.changes.length - 2) + ' 处改动 ▾';
                });
            }
            var preview = el('div', 'vwdiff-preview');
            it.changes.slice(0, 2).forEach(function (ch) { preview.appendChild(makeChangeLine(ch)); });
            row.appendChild(preview);
            if (more) row.appendChild(more);
            row.appendChild(detail);
        } else if (it.type === 'added' || it.type === 'removed') {
            var sideVal = it.type === 'added'
                ? (mode === 'push' ? it.localValue : it.remoteValue)
                : (mode === 'push' ? it.remoteValue : it.localValue);
            var brief = describeValue(sideVal);
            if (brief) row.appendChild(el('div', 'vwdiff-brief', brief));
        }

        // 点整行 = 切换勾选（「+N 处改动」按钮自己 stopPropagation）
        row.addEventListener('click', function (e) {
            if (e.target && e.target.closest && e.target.closest('.vwdiff-more')) return;
            it.selected = !it.selected;
            row.classList.add('is-flash');
            setTimeout(function () { row.classList.remove('is-flash'); }, 260);
            if (typeof it._jobRefresh === 'function') it._jobRefresh();
        });
        return row;
    }

    // 一条「字段: 旧 → 新」对比行；旧值为空（新增）时只显示新值
    function makeChangeLine(ch) {
        var line = el('div', 'vwdiff-change');
        line.appendChild(el('span', 'vwdiff-field', ch.field));
        var vals = el('span', 'vwdiff-vals');
        if (ch.from !== '（空）') {
            vals.appendChild(el('span', 'vwdiff-old', ch.from));
            if (ch.to !== '（空）') {
                var arrow = document.createElement('i');
                arrow.className = 'fa-solid fa-arrow-right-long';
                vals.appendChild(arrow);
            }
        }
        if (ch.to !== '（空）') vals.appendChild(el('span', 'vwdiff-new', ch.to));
        if (!vals.childNodes.length) vals.appendChild(el('span', 'vwdiff-new', '（清空）'));
        line.appendChild(vals);
        return line;
    }

    // 新增/删除条目的一行简介
    function describeValue(v) {
        if (v == null) return '';
        if (typeof v === 'string' || typeof v === 'number') return trunc(v, 80);
        if (Array.isArray(v)) return fmt(v);
        if (typeof v !== 'object') return String(v);
        var parts = [];
        if (v.name) parts.push(String(v.name));
        if (v.nickname) parts.push('昵称：' + v.nickname);
        if (Array.isArray(v.types) && v.types.length) parts.push('属性：' + v.types.join('、'));
        if (v.level !== undefined) parts.push('等级：' + v.level);
        if (v.min !== undefined) parts.push('等级：' + v.min + (v.max === null || v.max === undefined ? ' 起' : ' ~ ' + v.max));
        if (!parts.length) {
            var keys = Object.keys(v).slice(0, 3);
            parts = keys.map(function (k) { return k + '：' + trunc(v[k], 24); });
        }
        return parts.join('　·　') ? trunc(parts.join('　·　'), 110) : '';
    }

    /* ------------------------------------------------------------- 主流程 */

    function show(job) {
        // buildNode 已在 review() 里调用过一次（job.built），这里只负责挂载 + 进场动画
        var built = job.built;
        document.body.appendChild(built.root);
        void built.root.offsetWidth;
        built.root.classList.add('is-show');

        setTimeout(function () {
            var focusTarget = built.okBtn || built.card.querySelector('.vwdiff-btn-ok');
            if (focusTarget) { try { focusTarget.focus({ preventScroll: true }); } catch (e) { focusTarget.focus(); } }
        }, 40);
    }

    function finish(result) {   // result = 勾选的 items 或 null（取消/空态关闭）
        if (!current) return;
        var job = current;
        current = null;
        document.removeEventListener('keydown', onKey, true);
        var root = job.built.root;
        root.classList.remove('is-show');
        var wait = animOn() ? 200 : 0;
        setTimeout(function () {
            if (root.parentNode) root.parentNode.removeChild(root);
        }, wait + 30);

        if (!result) {
            try { job.resolve({ ok: false, empty: !job.items.length, busy: false, count: 0, all: false, sections: job.opts.sections }); } catch (e) {}
            return;
        }

        // 按勾选合并每个 section 的最终数据
        var bySec = {};
        result.forEach(function (it) {
            (bySec[it.sectionIndex] = bySec[it.sectionIndex] || []).push(it);
        });
        var sections = job.opts.sections.map(function (sec, i) {
            var items = job.items.filter(function (x) { return x.sectionIndex === i; });
            return {
                label: sec.label,
                kind: sec.kind || 'array',
                merged: mergeSection(job.opts.mode, sec, bySec[i] || [])
            };
        });
        var all = job.items.every(function (it) { return it.selected; });
        try { job.resolve({ ok: true, count: result.length, all: all, sections: sections }); } catch (e) {}
    }

    var current = null;

    function onKey(e) {
        if (!current) return;
        if (e.key === 'Escape' || e.key === 'Esc') {
            e.preventDefault();
            e.stopPropagation();
            finish(null);
            return;
        }
        if (e.key === 'Enter') {
            var t = e.target;
            if (t && (t.tagName === 'TEXTAREA' || t.tagName === 'INPUT' || t.isContentEditable)) return;
            e.preventDefault();
            e.stopPropagation();
            if (current.built.okBtn && !current.built.okBtn.disabled && current.items.length) {
                var sel = current.items.filter(function (it) { return it.selected; });
                if (sel.length) finish(sel);
            } else if (!current.items.length) {
                finish(null);
            }
        }
    }

    /**
     * 打开差异预览弹窗。返回 Promise：
     *   { ok:false }                                     —— 取消 / 两边一致
     *   { ok:true, count, all, sections:[{label,kind,merged}] }
     */
    function review(opts) {
        opts = opts || {};
        if (open) {
            return Promise.resolve({ ok: false, busy: true, count: 0, all: false, sections: opts.sections || [] });
        }
        var mode = opts.mode === 'pull' ? 'pull' : 'push';

        // 计算全部差异
        var sections = Array.isArray(opts.sections) ? opts.sections : [];
        var items = [];
        sections.forEach(function (sec, i) {
            buildItems(mode, sec, i).forEach(function (it) {
                it.sectionIndex = i;
                items.push(it);
            });
        });

        return new Promise(function (resolve) {
            open = true;
            var job = { opts: opts, sections: sections, items: items, resolve: done };
            function done(res) {
                open = false;
                resolve(res);
            }
            current = job;
            job.built = buildNode(job);
            // 把行点击接到统一刷新上
            items.forEach(function (it) { it._jobRefresh = job._refresh; });
            show(job);
            document.addEventListener('keydown', onKey, true);
        });
    }

    window.VowmonDiff = {
        review: review,
        same: same,
        /** 供页面直接复用的合并函数（一般不用手动调） */
        mergeSection: mergeSection,
        isOpen: function () { return open; }
    };
})();
