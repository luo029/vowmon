/* ==========================================================================
   Vowmon Wiki 后台 —— 页面内容管理（双模式：可视化 + 列表编辑）
   --------------------------------------------------------------------------
   数据链路（两种模式共用同一份 lore-data.json）：
     编辑文本块 -> VowmonStore.save('lore', data) 写入本机镜像（前台立即生效）
                -> 点「一键同步」把 lore-data.json 推到 GitHub 数据仓库
                -> 前台 lore-apply.js 把 JSON 里的 html 覆盖到 [data-lore] 元素

   可视化模式：iframe 渲染真实前台页面，点击 [data-lore] 文本块就地编辑
              （contenteditable + 顶部浮条），保存后 iframe 自动重载。
   列表模式：  按页签 + 搜索逐块查找，textarea 编辑 + 实时预览。
   ========================================================================== */

const { createApp, ref, computed, onMounted } = Vue;

/* 注入到 iframe 里的编辑态样式 */
const FRAME_CSS = [
    '[data-lore]{ cursor: pointer !important; outline: 2px dashed rgba(76,110,245,0) !important; outline-offset: 2px; border-radius: 4px; }',
    '[data-lore]:hover{ outline-color: rgba(76,110,245,.65) !important; background: rgba(76,110,245,.06); }',
    '.vw-editing{ outline: 2px solid #4c6ef5 !important; outline-offset: 3px !important;',
    '  background: rgba(76,110,245,.05) !important; cursor: text !important;',
    '  box-shadow: 0 0 0 6px rgba(76,110,245,.12); }',
    '.vw-edit-bar{ position: fixed; top: 12px; left: 50%; transform: translateX(-50%);',
    '  z-index: 2147483000; display: flex; align-items: center; gap: 10px;',
    '  background: #1f2937; color: #f9fafb; padding: 8px 14px; border-radius: 999px;',
    '  box-shadow: 0 8px 24px rgba(0,0,0,.35); font: 12.5px/1.4 "Inter","Microsoft YaHei",sans-serif; }',
    '.vw-bar-label{ font-weight: 800; max-width: 300px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }',
    '.vw-bar-hint{ color: #9ca3af; font-size: 11px; white-space: nowrap; }',
    '.vw-bar-btn{ border: 0; border-radius: 999px; padding: 6px 14px; font-weight: 800; cursor: pointer; font-size: 12.5px; }',
    '.vw-bar-save{ background: #4c6ef5; color: #fff; }',
    '.vw-bar-cancel{ background: #374151; color: #e5e7eb; }',
    '.vw-bar-btn:hover{ filter: brightness(1.15); }',
    /* 编辑视图里隐藏首页导航条，只保留正文内容 */
    '#site-navbar{ display: none !important; }'
].join('\n');

const FALLBACK_FILES = {
    ranks: 'world/ranks.html',
    bloodlines: 'world/bloodlines.html',
    trainers: 'world/trainers.html',
    factions: 'world/factions.html',
    lore: 'world/lore.html'
};
const PAGE_TITLES = {
    ranks: '等级体系',
    bloodlines: '血脉图鉴',
    trainers: '御兽师图鉴',
    factions: '势力版图',
    lore: '元域演化史'
};

VowmonData.softReady(['lore']).then(function () {

const app = createApp({
    setup() {
        /* ------------------------------------------------------------ 同步配置 */
        const config = ref({
            token: '',
            owner: '',
            dataRepos: 'vowmon_data',
            imgRepos: 'vowmon_imgs',
            imgCdnBase: ''
        });

        /* ---------------------------------------------------------------- 数据 */
        // data = { pages: [{id,title,file,count}], blocks: { key: {label, html} } }
        const data = ref({ pages: [], blocks: {} });
        const loaded = ref(false);
        const loadError = ref('');
        const isSyncing = ref(false);
        const saving = ref(false);
        const isDirty = ref(false);
        const viewMode = ref('visual');   // 默认可视化
        const activePage = ref('');
        const activeKey = ref('');
        const searchQuery = ref('');
        const iframeSrc = ref('');
        const frameRef = ref(null);

        /* 旧本地草稿可能没有「势力版图」，用仓库数据补齐该页与全部文本块 */
        function withFactions(bag) {
            const pages = Array.isArray(bag.pages) ? bag.pages.map(p => Object.assign({}, p)) : [];
            const blocks = Object.assign({}, bag.blocks || {});
            const remotePages = Array.isArray(window.allLorePages) ? window.allLorePages : [];
            const remoteBlocks = (window.allLoreBlocks && typeof window.allLoreBlocks === 'object') ? window.allLoreBlocks : {};
            if (!pages.some(p => p.id === 'factions')) {
                const rp = remotePages.find(p => p.id === 'factions');
                pages.push(rp ? Object.assign({}, rp) : { id: 'factions', title: '势力版图', file: 'factions.html', count: 0 });
            }
            Object.keys(remoteBlocks).forEach(k => {
                if (k.indexOf('factions.') === 0 && !blocks[k]) blocks[k] = remoteBlocks[k];
            });
            const f = pages.find(p => p.id === 'factions');
            if (f) f.count = Object.keys(blocks).filter(k => k.indexOf('factions.') === 0).length;
            return { pages: pages, blocks: blocks };
        }

        function takeData() {
            const pages = Array.isArray(window.allLorePages) ? JSON.parse(JSON.stringify(window.allLorePages)) : [];
            const blocks = (window.allLoreBlocks && typeof window.allLoreBlocks === 'object')
                ? JSON.parse(JSON.stringify(window.allLoreBlocks)) : {};
            pages.forEach(p => { if (!p.title) p.title = PAGE_TITLES[p.id] || p.id; });
            return withFactions({ pages: pages, blocks: blocks });
        }

        function applyData(bag) {
            const merged = withFactions(bag);
            data.value = {
                pages: (Array.isArray(merged.pages) ? merged.pages : []).map(p => ({
                    id: p.id, title: p.title || PAGE_TITLES[p.id] || p.id, file: p.file || '', count: p.count || 0
                })),
                blocks: JSON.parse(JSON.stringify(merged.blocks || {}))
            };
            loaded.value = true;
            if (!activePage.value && data.value.pages.length) {
                pickPage(data.value.pages[0].id);
            }
        }

        function pageFile(id) {
            const p = data.value.pages.find(x => x.id === id);
            return (p && p.file) ? p.file : (FALLBACK_FILES[id] || id + '.html');
        }

        /* ------------------------------------------------------------- 模式切换 */
        const toggleView = (mode) => {
            if (viewMode.value === mode) return;
            cancelEdit();               // 离开可视化模式前先退出编辑态
            viewMode.value = mode;
        };

        const pickPage = (id) => {
            cancelEdit();
            activePage.value = id;
            const keys = Object.keys(data.value.blocks).filter(k => k.indexOf(id + '.') === 0);
            if (!keys.some(k => k === activeKey.value)) activeKey.value = keys.length ? keys[0] : '';
            iframeSrc.value = '../' + pageFile(id);
        };
        const pickBlock = (key) => { activeKey.value = key; };

        /* ------------------------------------------------- 可视化模式：就地编辑 */
        let editing = null;   // { key, el, original }
        let editBar = null;

        function onFrameLoad() {
            setupFrame();
            if (pendingScroll > 0) {
                try { iframeRef().contentWindow.scrollTo(0, pendingScroll); } catch (e) { /* ignore */ }
                pendingScroll = 0;
            }
        }

        function iframeRef() { return frameRef.value; }

        function setupFrame() {
            const iframe = iframeRef();
            if (!iframe || !iframe.contentDocument) return;
            const doc = iframe.contentDocument;
            editing = null;
            editBar = null;
            try {
                const style = doc.createElement('style');
                style.textContent = FRAME_CSS;
                (doc.head || doc.documentElement).appendChild(style);
            } catch (e) { /* ignore */ }

            // 捕获阶段拦下所有点击：链接/按钮一律不跳转，文本块进入编辑。
            // 编辑浮条内部的按钮要正常工作，直接放行。
            doc.addEventListener('click', function (e) {
                if (e.target.closest && e.target.closest('.vw-edit-bar')) return;
                e.preventDefault();
                e.stopPropagation();
                // 元域演化史的「触摸石板」按钮：编辑模式下直接解锁
                if (e.target.closest && e.target.closest('#revealBtn')) {
                    const tablet = doc.getElementById('hiddenTablet');
                    if (tablet) tablet.classList.remove('locked');
                    return;
                }
                const el = e.target.closest ? e.target.closest('[data-lore]') : null;
                if (el) {
                    // 正在编辑时点了另一个文本块：先保存当前块再切换（不刷新 iframe，避免跳动）
                    if (editing && el !== editing.el) { saveEdit(true); startEdit(el, doc); }
                    else if (!editing) startEdit(el, doc);
                } else if (editing) {
                    // 点了文本块以外的空白区域：自动保存（原来静默还原，常被误以为「改了没生效」）
                    saveEdit(true);
                }
            }, true);

            doc.addEventListener('keydown', function (e) {
                if (!editing) return;
                if (e.key === 'Escape') {
                    e.preventDefault();
                    cancelEdit();
                    try { VowmonDialog.toast('已还原，本次改动未保存', 'info'); } catch (err) { /* ignore */ }
                } else if ((e.ctrlKey || e.metaKey) && (e.key === 'Enter' || e.key === 's' || e.key === 'S')) {
                    e.preventDefault();
                    saveEdit();
                }
            }, true);
        }

        function blockLabel(key) {
            const b = data.value.blocks[key];
            return (b && b.label) ? b.label : key;
        }

        function startEdit(el, doc) {
            if (editing) return;
            const key = el.getAttribute('data-lore');
            if (!key) return;
            editing = { key: key, el: el, original: el.innerHTML };
            el.classList.add('vw-editing');
            el.setAttribute('contenteditable', 'true');
            try { el.focus(); } catch (e) { /* ignore */ }

            const bar = doc.createElement('div');
            bar.className = 'vw-edit-bar';
            bar.innerHTML =
                '<span class="vw-bar-label"></span>' +
                '<button type="button" class="vw-bar-btn vw-bar-save">保存</button>' +
                '<button type="button" class="vw-bar-btn vw-bar-cancel">取消</button>' +
                '<span class="vw-bar-hint">Esc 取消 · Ctrl+Enter 保存</span>';
            doc.body.appendChild(bar);
            bar.querySelector('.vw-bar-save').addEventListener('click', saveEdit);
            bar.querySelector('.vw-bar-cancel').addEventListener('click', cancelEdit);
            editBar = bar;
            updateBar();
        }

        function updateBar() {
            if (!editBar || !editing) return;
            editBar.querySelector('.vw-bar-label').textContent =
                '正在编辑：' + blockLabel(editing.key) + '（' + editing.key + '）';
        }

        function finishEdit() {
            if (!editing) return;
            const el = editing.el;
            el.classList.remove('vw-editing');
            el.removeAttribute('contenteditable');
            if (editBar && editBar.parentNode) editBar.parentNode.removeChild(editBar);
            editBar = null;
            editing = null;
        }

        function cancelEdit() {
            if (!editing) return;
            editing.el.innerHTML = editing.original;
            finishEdit();
        }

        function saveEdit(skipReload) {
            if (!editing) return;
            const key = editing.key;
            const html = editing.el.innerHTML;
            const label = blockLabel(key);
            if (data.value.blocks[key]) {
                data.value.blocks[key].html = html;
            } else {
                data.value.blocks[key] = { label: key, html: html };
            }
            finishEdit();
            try {
                if (window.VowmonStore) {
                    VowmonStore.save('lore', JSON.parse(JSON.stringify({
                        pages: data.value.pages, blocks: data.value.blocks
                    })));
                }
                isDirty.value = true;
            } catch (err) {
                VowmonDialog.alert('保存失败：' + (err && err.message ? err.message : err), { type: 'danger', title: '保存失败' });
                return;
            }
            VowmonDialog.toast('「' + label + '」已保存，前台已生效。改完记得点「一键同步」推到仓库', 'success', { duration: 3600 });
            if (!skipReload) reloadFrame();
        }

        let pendingScroll = 0;
        function reloadFrame() {
            const iframe = iframeRef();
            if (!iframe || !iframe.contentWindow) return;
            try { pendingScroll = iframe.contentWindow.scrollY || 0; } catch (e) { pendingScroll = 0; }
            try {
                iframe.contentWindow.location.reload();
            } catch (e) {
                iframeSrc.value = iframeSrc.value; // 触发重载的兜底
            }
        }

        /* ------------------------------------------------- 列表模式：逐块编辑 */
        const pageTitle = computed(() => {
            const p = data.value.pages.find(x => x.id === activePage.value);
            return p ? (p.title || p.id) : '';
        });
        const pageBlockKeys = computed(() => {
            const prefix = activePage.value + '.';
            const q = searchQuery.value.trim().toLowerCase();
            return Object.keys(data.value.blocks)
                .filter(k => k.indexOf(prefix) === 0)
                .filter(k => {
                    if (!q) return true;
                    const b = data.value.blocks[k];
                    return (b.label || '').toLowerCase().indexOf(q) > -1
                        || (b.html || '').toLowerCase().indexOf(q) > -1
                        || k.toLowerCase().indexOf(q) > -1;
                })
                .sort((a, b) => {
                    const na = parseInt(a.slice(a.indexOf('.') + 1), 10) || 0;
                    const nb = parseInt(b.slice(b.indexOf('.') + 1), 10) || 0;
                    return na - nb;
                });
        });
        const currentBlock = computed(() => {
            return data.value.blocks[activeKey.value] || null;
        });
        const currentHtml = computed({
            get: () => (currentBlock.value ? currentBlock.value.html : ''),
            set: (val) => {
                if (currentBlock.value) {
                    currentBlock.value.html = val;
                    isDirty.value = true;
                }
            }
        });
        const currentLabel = computed(() => (currentBlock.value ? currentBlock.value.label : ''));

        // 保存到本机（前台立即生效；「未同步」状态会一直亮着直到一键同步）
        const saveLocal = () => {
            saving.value = true;
            try {
                const payload = JSON.parse(JSON.stringify(data.value));
                if (window.VowmonStore) VowmonStore.save('lore', payload);
                isDirty.value = true;
                VowmonDialog.toast('已保存到本机，前台已生效。改完记得点「一键同步」推到仓库', 'success', { duration: 3600 });
            } catch (err) {
                VowmonDialog.alert('保存失败：' + (err && err.message ? err.message : err), { type: 'danger', title: '保存失败' });
            } finally {
                saving.value = false;
            }
        };

        /* ------------------------------------------------------------ 一键同步 */
        const targetRepos = () => String(config.value.dataRepos || '')
            .split(/[\s,，]+/).map(s => s.trim()).filter(Boolean);

        const ensureConfig = () => {
            if (!config.value.token || !config.value.owner || targetRepos().length === 0) {
                VowmonDialog.alert('请先在「精灵管理 → 同步配置」里填写 Token、用户名和数据仓库名', { type: 'warning', title: '还没配置好' });
                return false;
            }
            return true;
        };

        // 一键同步：把 lore-data.json 推到数据仓库
        // 正在编辑时先自动保存当前块，而不是静默撤销（否则改了等于白改，还误以为同步了）
        //
        // 【三方合并防回滚】一键同步推的是整个本机镜像。若镜像里某些块落后于仓库
        //（云端被另一台设备改过 / 仓库侧修过数据，而本机对账没拉到），整包上传会
        // 把云端的修改悄悄回滚掉。因此上传前先取仓库当前版本做合并：
        //   · 镜像没动过（与上次同步快照一致）而云端变了 → 采用云端版本；
        //   · 镜像动过 → 采用镜像（用户的编辑优先）；
        //   · 云端新增的块 → 并入；镜像没动而云端已删除的块 → 跟随删除。
        const syncToGitHub = async () => {
            if (editing) saveEdit();
            if (!ensureConfig()) return;
            const cfg = config.value;
            const repos = targetRepos();
            isSyncing.value = true;
            try {
                /* 取「上次同步成功的快照」和「仓库当前版本」 */
                let lastPush = null;
                try { lastPush = JSON.parse(localStorage.getItem('vowmon_lore_lastpush') || 'null'); } catch (err) { lastPush = null; }
                let remoteNow = null;
                try { remoteNow = await GitHubSync.downloadJson(cfg.token, cfg.owner, repos[0], 'lore-data.json'); } catch (err) { remoteNow = null; }

                const merged = JSON.parse(JSON.stringify({ pages: data.value.pages, blocks: data.value.blocks }));
                if (remoteNow && remoteNow.blocks && typeof remoteNow.blocks === 'object') {
                    const snap = (lastPush && lastPush.blocks) || null;
                    const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
                    Object.keys(remoteNow.blocks).forEach(k => {
                        const inMirror = Object.prototype.hasOwnProperty.call(merged.blocks, k);
                        if (!inMirror) { merged.blocks[k] = JSON.parse(JSON.stringify(remoteNow.blocks[k])); return; }   // 云端新增 → 并入
                        if (snap && same(merged.blocks[k], snap[k]) && !same(remoteNow.blocks[k], snap[k])) {
                            merged.blocks[k] = JSON.parse(JSON.stringify(remoteNow.blocks[k]));   // 镜像没动、云端被外部改过 → 采云端
                        }
                    });
                    Object.keys(merged.blocks).forEach(k => {
                        if (!Object.prototype.hasOwnProperty.call(remoteNow.blocks, k)
                            && snap && snap[k] !== undefined && same(merged.blocks[k], snap[k])) {
                            delete merged.blocks[k];   // 镜像没动、云端已删除 → 跟随删除
                        }
                    });
                    const ids = new Set(merged.pages.map(p => p.id));
                    (Array.isArray(remoteNow.pages) ? remoteNow.pages : []).forEach(p => {
                        if (!ids.has(p.id)) merged.pages.push(JSON.parse(JSON.stringify(p)));
                    });
                }

                applyData(merged);
                const content = JSON.stringify({ pages: merged.pages, blocks: merged.blocks }, null, 1) + '\n';
                for (const repo of repos) {
                    await GitHubSync.uploadFile(cfg.token, cfg.owner, repo, 'lore-data.json', content, 'update page content');
                }
                try { localStorage.setItem('vowmon_lore_lastpush', JSON.stringify({ pages: merged.pages, blocks: merged.blocks })); } catch (err) { /* ignore */ }
                if (window.VowmonStore) VowmonStore.markSynced('lore');
                isDirty.value = false;
                if (viewMode.value === 'visual') reloadFrame();
                VowmonDialog.toast('页面内容同步成功（已自动合并云端最新修改），前台一两分钟后更新', 'success');
            } catch (err) {
                VowmonDialog.alert('同步失败，请检查 Token 权限和仓库名。', {
                    type: 'danger', title: '同步失败',
                    detail: err && err.message ? err.message : String(err)
                });
            } finally {
                isSyncing.value = false;
            }
        };

        // 从数据仓库拉取（覆盖本机草稿）
        const pullFromRepo = async () => {
            cancelEdit();
            const cfg = config.value;
            const repo = targetRepos()[0];
            if (!cfg.token || !cfg.owner || !repo) {
                VowmonDialog.alert('请先在「精灵管理 → 同步配置」里填写 Token、用户名和数据仓库名', { type: 'warning', title: '还没配置好' });
                return;
            }
            const ok = await VowmonDialog.confirm(
                '将从「' + repo + '」读取 lore-data.json，并覆盖本机未同步的改动。继续？',
                { type: 'warning', title: '从数据仓库拉取', okText: '拉取' }
            );
            if (!ok) return;
            isSyncing.value = true;
            try {
                const bag = await GitHubSync.downloadJson(cfg.token, cfg.owner, repo, 'lore-data.json');
                if (!bag || !bag.blocks || typeof bag.blocks !== 'object') {
                    throw new Error('仓库里没有 lore-data.json，或数据格式不对');
                }
                applyData(bag);
                if (window.VowmonStore) VowmonStore.replace('lore', bag);
                isDirty.value = false;
                if (viewMode.value === 'visual') reloadFrame();
                VowmonDialog.toast('已从 ' + repo + ' 拉取 ' + Object.keys(bag.blocks).length + ' 个文本块', 'success', { duration: 3200 });
            } catch (err) {
                VowmonDialog.alert('拉取失败，请检查 Token 权限和仓库名。', {
                    type: 'danger', title: '拉取失败',
                    detail: err && err.message ? err.message : String(err)
                });
            } finally {
                isSyncing.value = false;
            }
        };

        /* ------------------------------------------------------------ 初始化 */
        onMounted(() => {
            try {
                const savedConfig = localStorage.getItem('vowmon_sync_config');
                if (savedConfig) {
                    const parsed = JSON.parse(savedConfig);
                    config.value = Object.assign({}, config.value, parsed);
                }
            } catch (err) { console.warn('同步配置解析失败', err); }

            const mirror = window.VowmonStore ? VowmonStore.getMirror('lore') : null;
            if (mirror && mirror.blocks) {
                applyData(mirror);
            } else if (window.allLoreBlocks && Object.keys(window.allLoreBlocks).length) {
                applyData({ pages: window.allLorePages, blocks: window.allLoreBlocks });
            } else {
                loadError.value = true;
                // 没有数据也要能打开可视化模式的第一页
                if (!activePage.value) pickPage('ranks');
            }
            if (window.VowmonStore) isDirty.value = !!VowmonStore.isDirty('lore');

            /* 旧本机草稿可能缺「势力版图」整页：从数据仓库补齐，不影响已有编辑 */
            if (!Object.keys(data.value.blocks || {}).some(k => k.indexOf('factions.') === 0)) {
                fetch('https://vowmon.pages.dev/data/lore-data.json', { cache: 'no-store' })
                    .then(r => r.ok ? r.json() : null)
                    .then(bag => {
                        if (!bag || !bag.blocks) return;
                        const merged = withFactions({ pages: data.value.pages, blocks: data.value.blocks });
                        Object.keys(bag.blocks).forEach(k => {
                            if (k.indexOf('factions.') === 0 && !merged.blocks[k]) merged.blocks[k] = bag.blocks[k];
                        });
                        data.value = merged;
                    })
                    .catch(() => {});
            }

            // 其他标签页改了 lore 数据且当前没在编辑 → 跟进
            document.addEventListener('vowmon:data-changed', function (e) {
                if (e && e.detail && e.detail.key === 'lore' && !editing && e.detail.data) {
                    applyData(e.detail.data);
                    isDirty.value = window.VowmonStore ? !!VowmonStore.isDirty('lore') : isDirty.value;
                }
            });
        });

        return {
            config, data, loaded, loadError, isSyncing, saving, isDirty,
            viewMode, activePage, activeKey, searchQuery, iframeSrc, frameRef,
            toggleView, pickPage, pickBlock, onFrameLoad,
            pageTitle, pageBlockKeys, currentBlock, currentHtml, currentLabel,
            saveLocal, syncToGitHub, pullFromRepo
        };
    }
});

app.mount('#app');
});
