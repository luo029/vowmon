/* ==========================================================================
   Vowmon Wiki 后台 —— 物品管理逻辑
   --------------------------------------------------------------------------
   数据链路（与技能 / 特性后台保持一致）：
     编辑 -> 写入 localStorage['vowmon_items_data']
          -> 点「一键同步」把 items-data.js 推到 GitHub 数据仓库
          -> 前台 items.html 读取同源 items-data.js 生效

   物品字段见 README「物品（item）」一节；分组 / 类型取自 js/item-config.js（唯一来源）。
   ========================================================================== */

const { createApp, ref, computed, onMounted, watch } = Vue;

createApp({
    setup() {
        /* ------------------------------------------------------------ 同步配置 */
        const config = ref({
            token: '',
            owner: '',
            dataRepos: 'vowmon_data',
            imgRepos: 'vowmon_imgs',
            imgCdnBase: '',
            imgSize: 512
        });

        /* ---------------------------------------------------------------- 数据 */
        const items = ref([]);
        const isSyncing = ref(false);

        /* ---------------------------------------------------------------- 弹窗 */
        const showModal = ref(false);
        const isEdit = ref(false);
        const editIndex = ref(-1);
        const activeDropdown = ref('');

        const showDeleteModal = ref(false);
        const deleteTargetIndex = ref(-1);
        const deleteTargetName = ref('');

        const isUploading = ref(false);
        const iconFileInput = ref(null);

        const defaultForm = () => ({
            id: '',
            name: '',
            kind: itemKinds[0],
            group: itemGroups[0].name,
            category: '',
            icon: '',
            iconClass: '',
            color: '',
            desc: '',
            obtain: []
        });

        const form = ref(defaultForm());
        const obtainText = ref('');

        /* -------------------------------------------------------------- 规整 */
        const normalizeItems = (list) => (list || []).map(raw => {
            const item = Object.assign({}, raw);
            item.id = String(item.id || '');
            item.name = String(item.name || '').trim();
            item.kind = normalizeItemKind(item.kind);
            item.group = item.group && String(item.group).trim() ? String(item.group).trim() : ITEM_FALLBACK_GROUP.name;
            item.category = String(item.category || '').trim();
            item.icon = String(item.icon || '').trim();
            item.color = item.color || getItemFallbackColor(item);
            item.iconClass = item.iconClass || getItemFallbackIcon(item);
            item.desc = String(item.desc || '').trim();
            item.obtain = Array.isArray(item.obtain)
                ? item.obtain.map(o => String(o).trim()).filter(Boolean)
                : (item.obtain ? [String(item.obtain)] : []);
            return item;
        });

        /* ------------------------------------------------------------ 显示列 */
        const showColSettings = ref(false);
        const allColumns = {
            icon: '图标', name: '物品名称', kind: '类型',
            group: '分组', obtain: '获取方式', desc: '描述'
        };
        const COLS_KEY = 'vowmon_items_visible_cols';
        const loadVisibleCols = () => {
            try {
                const raw = localStorage.getItem(COLS_KEY);
                if (raw === null) return null;
                const saved = JSON.parse(raw);
                if (!Array.isArray(saved)) return null;
                const valid = Object.keys(allColumns);
                const filtered = saved.filter(k => valid.includes(k));
                if (saved.length && !filtered.length) return null;
                return filtered;
            } catch (err) {
                console.warn('显示列配置解析失败，改用默认', err);
                return null;
            }
        };
        const visibleCols = ref(loadVisibleCols() ?? Object.keys(allColumns));
        watch(visibleCols, (val) => {
            localStorage.setItem(COLS_KEY, JSON.stringify(val));
        }, { deep: true });

        /* ---------------------------------------------------------------- 工具 */
        const iconSrc = (path) => {
            if (!path) return '';
            if (/^(https?:)?\/\//i.test(path) || path.startsWith('data:')) return path;
            const base = String(config.value.imgCdnBase || '').replace(/\/$/, '');
            return base ? base + '/' + path : path;
        };
        const displayIcon = computed(() => iconSrc(form.value.icon));

        const nextItemId = () => {
            let max = 0;
            items.value.forEach(it => {
                const num = parseInt(String(it.id || '').replace(/\D/g, ''), 10);
                if (!isNaN(num) && num > max) max = num;
            });
            return 'i' + String(max + 1).padStart(3, '0');
        };

        const saveLocal = () => {
            localStorage.setItem('vowmon_items_data', JSON.stringify(items.value));
        };

        /* ---------------------------------------------------------------- 编辑 */
        const openEditor = (item, index) => {
            if (item && typeof index === 'number') {
                isEdit.value = true;
                editIndex.value = index;
                form.value = Object.assign(defaultForm(), JSON.parse(JSON.stringify(item)));
                obtainText.value = (item.obtain || []).join('\n');
            } else {
                isEdit.value = false;
                editIndex.value = -1;
                form.value = defaultForm();
                form.value.id = nextItemId();
                form.value.iconClass = getItemFallbackIcon(form.value);
                form.value.color = getItemFallbackColor(form.value);
                obtainText.value = '';
            }
            activeDropdown.value = '';
            showModal.value = true;
        };

        // 分组默认图标 / 配色（新建时先给一个能看的图标）
        const resetIconFont = () => {
            form.value.iconClass = getItemGroupIcon(form.value.group);
            form.value.color = getItemGroupColor(form.value.group);
        };

        /* ------------------------------------------------------------ 图标上传 */
        const triggerIconUpload = () => {
            if (!config.value.token || !config.value.owner || !config.value.imgRepos) {
                alert('请先在「精灵管理 → 同步配置」里填写 Token、用户名和图片仓库名');
                return;
            }
            if (!String(form.value.id || '').trim()) form.value.id = nextItemId();
            if (iconFileInput.value) iconFileInput.value.click();
        };

        const handleIconUpload = async (event) => {
            const file = event.target.files && event.target.files[0];
            if (!file) return;

            isUploading.value = true;
            try {
                if (!window.ImageUtils) throw new Error('图片处理模块未加载，请强制刷新页面（Ctrl + F5）后重试');
                const img = await ImageUtils.compressToPng(file, config.value.imgSize || 512);
                const repo = String(config.value.imgRepos || '').split(',')[0].trim();
                if (!repo) throw new Error('请先在【同步配置】中填写图片仓库名');

                const path = `items/${form.value.id}.png`;
                await GitHubSync.uploadFile(
                    config.value.token, config.value.owner, repo,
                    path, img.base64, `Upload item icon: ${path}`, true
                );
                form.value.icon = path;
                alert(`✅ 图标已上传：${path}\n已压缩为 ${img.canvasSize}×${img.canvasSize}（${ImageUtils.formatBytes(img.bytes)}）`);
            } catch (err) {
                alert('❌ 图标上传失败：\n' + err.message);
            } finally {
                isUploading.value = false;
                event.target.value = '';
            }
        };

        /* ---------------------------------------------------------------- 保存 */
        const saveItem = () => {
            const name = String(form.value.name || '').trim();
            if (!name) return alert('请填写物品名称');

            const item = JSON.parse(JSON.stringify(form.value));
            item.name = name;
            item.id = String(item.id || '').trim() || nextItemId();
            item.kind = normalizeItemKind(item.kind);
            item.group = String(item.group || '').trim() || ITEM_FALLBACK_GROUP.name;
            item.category = String(item.category || '').trim();
            item.icon = String(item.icon || '').trim();
            item.iconClass = String(item.iconClass || '').trim() || getItemFallbackIcon(item);
            item.color = String(item.color || '').trim() || getItemFallbackColor(item);
            item.desc = String(item.desc || '').trim();
            item.obtain = String(obtainText.value || '')
                .split('\n')
                .map(line => line.trim())
                .filter(Boolean);

            // 名称去重，避免图鉴里出现两个同名物品
            const dup = items.value.find((it, i) =>
                it.name === item.name && !(isEdit.value && i === editIndex.value));
            if (dup) return alert(`已经有一个叫「${item.name}」的物品了，改个名字或直接编辑那一条。`);

            if (isEdit.value && editIndex.value > -1) {
                items.value.splice(editIndex.value, 1, item);
            } else {
                items.value.unshift(item);
            }

            saveLocal();
            showModal.value = false;
        };

        /* ---------------------------------------------------------------- 删除 */
        const openDeleteConfirm = (index, name) => {
            deleteTargetIndex.value = index;
            deleteTargetName.value = name;
            showDeleteModal.value = true;
        };

        const confirmDelete = () => {
            if (deleteTargetIndex.value > -1) {
                items.value.splice(deleteTargetIndex.value, 1);
                saveLocal();
            }
            showDeleteModal.value = false;
        };

        // 弹窗关闭统一收口：遮罩点击 / Esc / 关闭按钮 都走这里（见 js/common-ui.js）
        const closeModal = (target) => {
            if (target === 'edit') showModal.value = false;
            else if (target === 'delete') showDeleteModal.value = false;
        };

        /* ---------------------------------------------------------------- 同步 */
        const syncToGitHub = async () => {
            const cfg = config.value;
            if (!cfg.token || !cfg.owner) {
                alert('请先在「精灵管理 → 同步配置」里填写 Token 和用户名');
                return;
            }

            const repos = String(cfg.dataRepos || '')
                .split(/[\s,，]+/)
                .map(s => s.trim())
                .filter(Boolean);
            if (!repos.length) {
                alert('请先在「精灵管理 → 同步配置」里填写数据仓库名');
                return;
            }

            isSyncing.value = true;
            const content = '// items-data.js\n' +
                'const allItemsData = ' + JSON.stringify(items.value, null, 4) + ';\n';

            try {
                for (const repo of repos) {
                    await GitHubSync.uploadFile(
                        cfg.token, cfg.owner, repo, 'items-data.js',
                        content, 'update items data'
                    );
                }
                alert('物品数据同步成功，共 ' + repos.length + ' 个仓库');
            } catch (err) {
                alert('同步失败：' + (err && err.message ? err.message : err));
            } finally {
                isSyncing.value = false;
            }
        };

        /* -------------------------------------------------------------- 初始化 */
        onMounted(() => {
            const savedConfig = localStorage.getItem('vowmon_sync_config');
            if (savedConfig) {
                try {
                    config.value = Object.assign({}, config.value, JSON.parse(savedConfig));
                } catch (err) {
                    console.warn('同步配置解析失败', err);
                }
            }
            if (!config.value.imgSize) config.value.imgSize = 512;

            const savedData = localStorage.getItem('vowmon_items_data');
            if (savedData) {
                try {
                    items.value = normalizeItems(JSON.parse(savedData));
                } catch (err) {
                    console.warn('本地物品数据解析失败，改用默认数据', err);
                    items.value = normalizeItems(allItemsData);
                }
            } else {
                items.value = normalizeItems(typeof allItemsData !== 'undefined' ? allItemsData : []);
            }

            // 点击「显示列」面板以外的地方时收起面板。
            // 必须自己判断是否点在面板内，否则复选框的勾选会被当成外部点击打断（详见 README）。
            document.addEventListener('click', (e) => {
                const el = e.target && e.target.closest ? e.target : null;
                if (!(el && el.closest('.col-settings-wrap'))) showColSettings.value = false;
            }, true);
        });

        return {
            itemKinds, itemGroups,
            getItemGroupIcon, getItemGroupColor,
            config, items, isSyncing,
            showColSettings, allColumns, visibleCols,
            showModal, isEdit, form, obtainText, activeDropdown, displayIcon,
            isUploading, iconFileInput,
            showDeleteModal, deleteTargetName,
            openEditor, saveItem, openDeleteConfirm, confirmDelete, closeModal,
            triggerIconUpload, handleIconUpload, resetIconFont,
            syncToGitHub
        };
    }
}).mount('#app');
