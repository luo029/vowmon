/* ==========================================================================
   Vowmon Wiki 后台 —— 页面内容管理（世界观文本块）
   --------------------------------------------------------------------------
   数据链路：
     编辑文本块 -> VowmonStore.save('lore', data) 写入本机镜像（前台立即生效）
                -> 点「一键同步」把 lore-data.json 推到 GitHub 数据仓库
                -> 前台 lore-apply.js 把 JSON 里的 html 覆盖到 [data-lore] 元素
   ========================================================================== */

const { createApp, ref, computed, onMounted } = Vue;

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
        const hasUnsaved = ref(false);
        const saving = ref(false);

        const activePage = ref('');
        const activeKey = ref('');
        const searchQuery = ref('');

        const PAGE_TITLES = {
            ranks: '等级体系',
            bloodlines: '血脉图鉴',
            trainers: '御兽师图鉴',
            lore: '元域演化史'
        };

        function takeData() {
            const pages = Array.isArray(window.allLorePages) ? JSON.parse(JSON.stringify(window.allLorePages)) : [];
            const blocks = (window.allLoreBlocks && typeof window.allLoreBlocks === 'object')
                ? JSON.parse(JSON.stringify(window.allLoreBlocks)) : {};
            // 兜底标题
            pages.forEach(p => { if (!p.title) p.title = PAGE_TITLES[p.id] || p.id; });
            return { pages: pages, blocks: blocks };
        }

        /* ------------------------------------------------------------ 计算属性 */
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
                    hasUnsaved.value = true;
                }
            }
        });
        const currentLabel = computed(() => (currentBlock.value ? currentBlock.value.label : ''));

        /* ---------------------------------------------------------------- 动作 */
        const pickPage = (id) => {
            activePage.value = id;
            const keys = Object.keys(data.value.blocks).filter(k => k.indexOf(id + '.') === 0);
            activeKey.value = keys.length ? keys[0] : '';
        };
        const pickBlock = (key) => { activeKey.value = key; };

        // 保存到本机（前台立即生效；「未同步」状态会一直亮着直到一键同步）
        const saveLocal = () => {
            saving.value = true;
            try {
                const payload = JSON.parse(JSON.stringify(data.value));
                if (window.VowmonStore) VowmonStore.save('lore', payload);
                hasUnsaved.value = false;
                VowmonDialog.toast('已保存到本机，前台已生效。改完记得点「一键同步」推到仓库', 'success', { duration: 3600 });
            } catch (err) {
                VowmonDialog.alert('保存失败：' + (err && err.message ? err.message : err), { type: 'danger', title: '保存失败' });
            } finally {
                saving.value = false;
            }
        };

        const targetRepos = () => String(config.value.dataRepos || '')
            .split(/[\s,，]+/).map(s => s.trim()).filter(Boolean);

        const ensureConfig = () => {
            if (!config.value.token || !config.value.owner || targetRepos().length === 0) {
                VowmonDialog.alert('请先在「精灵管理 → 同步配置」里填写 Token、用户名和数据仓库名', { type: 'warning', title: '还没配置好' });
                return false;
            }
            if (hasUnsaved.value) {
                VowmonDialog.alert('有未保存的修改，请先点「保存到本机」再同步。', { type: 'warning', title: '先保存' });
                return false;
            }
            return true;
        };

        // 一键同步：把 lore-data.json 推到数据仓库
        const syncToGitHub = async () => {
            if (!ensureConfig()) return;
            const cfg = config.value;
            const repos = targetRepos();
            isSyncing.value = true;
            try {
                const content = JSON.stringify({ pages: data.value.pages, blocks: data.value.blocks }, null, 1) + '\n';
                for (const repo of repos) {
                    await GitHubSync.uploadFile(cfg.token, cfg.owner, repo, 'lore-data.json', content, 'update page content');
                }
                if (window.VowmonStore) VowmonStore.markSynced('lore');
                VowmonDialog.toast('页面内容同步成功，前台一两分钟后更新', 'success');
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

        function applyData(bag) {
            data.value = {
                pages: (Array.isArray(bag.pages) ? bag.pages : []).map(p => ({
                    id: p.id, title: p.title || PAGE_TITLES[p.id] || p.id, file: p.file || '', count: p.count || 0
                })),
                blocks: JSON.parse(JSON.stringify(bag.blocks || {}))
            };
            loaded.value = true;
            hasUnsaved.value = false;
            if (!activePage.value && data.value.pages.length) {
                pickPage(data.value.pages[0].id);
            }
        }

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
            }

            // 其他标签页改了 lore 数据且本页没有未保存修改 → 跟进
            document.addEventListener('vowmon:data-changed', function (e) {
                if (e && e.detail && e.detail.key === 'lore' && !hasUnsaved.value && e.detail.data) {
                    applyData(e.detail.data);
                }
            });
        });

        return {
            config, data, loaded, loadError, isSyncing, hasUnsaved, saving,
            activePage, activeKey, searchQuery,
            pageTitle, pageBlockKeys, currentBlock, currentHtml, currentLabel,
            pickPage, pickBlock, saveLocal, syncToGitHub, pullFromRepo
        };
    }
});

app.mount('#app');
});
