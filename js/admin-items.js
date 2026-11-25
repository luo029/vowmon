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
VowmonData.ready(['items'], { fresh: true }).then(function () {

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
            obtain: [],
            price: '',      // 价格数字，可留空
            currency: ITEM_DEFAULT_CURRENCY,   // 价格货币，默认联盟币，可自定义
            origin: ''      // 原型 / 取材自（自由填写，默认空）
        });

        const form = ref(defaultForm());
        const obtainText = ref('');

        /* ----------------------------------- 类型 / 分组 / 细分类（可自定义列表） */
        // 存的是「完整列表」，所以删掉就是真删掉；同步时会整份写回 data/items-data.js。
        const KINDS_KEY = 'vowmon_item_kinds';
        const GROUPS_KEY = 'vowmon_item_groups';
        const CATS_KEY = 'vowmon_item_categories';
        const CURR_KEY = 'vowmon_item_currencies';

        const kinds = ref([]);
        const groups = ref([]);
        const categories = ref([]);
        const currencies = ref([]);
        // 物品数据 + 自定义类型/分组/细分类/货币 一起写进本机镜像，前台立刻可见
        const saveMirror = () => {
            if (!window.VowmonStore) return;
            VowmonStore.save('items', {
                kinds: kinds.value,
                groups: groups.value,
                categories: categories.value,
                currencies: currencies.value,
                items: items.value
            });
        };
        const pickQuery = ref({ kind: '', group: '', category: '', currency: '' });
        // 分组图标：选中的图标（新建分组时用它，已有分组时点一下直接改）
        const iconDraft = ref(ITEM_DEFAULT_GROUP_ICON);
        const groupIconPresets = ITEM_GROUP_ICONS;

        const readStoredList = (key) => {
            try {
                const raw = localStorage.getItem(key);
                if (raw === null) return null;
                const val = JSON.parse(raw);
                return Array.isArray(val) ? val : null;
            } catch (err) {
                console.warn('自定义列表解析失败：' + key, err);
                return null;
            }
        };

        // 写盘 + 同步给 item-config 的 helper（图标 / 配色 / 归一都依赖它）
        const persistPickers = () => {
            localStorage.setItem(KINDS_KEY, JSON.stringify(kinds.value));
            localStorage.setItem(GROUPS_KEY, JSON.stringify(groups.value));
            localStorage.setItem(CATS_KEY, JSON.stringify(categories.value));
            localStorage.setItem(CURR_KEY, JSON.stringify(currencies.value));
            setItemKinds(kinds.value);
            setItemGroups(groups.value);
            setItemCategories(categories.value);
            setItemCurrencies(currencies.value);
            saveMirror();
        };

        const initPickers = () => {
            const storedKinds = readStoredList(KINDS_KEY);
            kinds.value = (storedKinds && storedKinds.length ? storedKinds : itemKinds)
                .map(k => String(k == null ? '' : k).trim()).filter(Boolean);

            const storedGroups = readStoredList(GROUPS_KEY);
            const srcGroups = storedGroups && storedGroups.length ? storedGroups : itemGroups;
            groups.value = srcGroups.map(g => {
                if (typeof g === 'string') return makeItemGroup(g);
                const name = String((g && g.name) || '').trim();
                if (!name) return null;
                return {
                    name,
                    icon: (g && g.icon) || ITEM_DEFAULT_GROUP_ICON,
                    color: (g && g.color) || makeItemGroup(name).color
                };
            }).filter(Boolean);

            // 细分类没有内置值：首次从现有物品里收集一遍，之后以列表为准
            const storedCats = readStoredList(CATS_KEY);
            categories.value = storedCats
                ? storedCats.map(c => String(c).trim()).filter(Boolean)
                : Array.from(new Set(items.value.map(it => it.category).filter(Boolean)));

            // 货币：首次以 item-config 的内置表为准（默认联盟币）
            const storedCurr = readStoredList(CURR_KEY);
            const currSrc = storedCurr && storedCurr.length ? storedCurr : itemCurrencies;
            const currList = Array.from(new Set(currSrc.map(c => String(c == null ? '' : c).trim()).filter(Boolean)));
            // 物品里用过但列表里没有的货币（例如从仓库拉下来的新货币）先补回来，别把数据洗掉
            items.value.forEach(it => {
                const c = String(it.currency || '').trim() || ITEM_DEFAULT_CURRENCY;
                if (!currList.includes(c)) currList.push(c);
            });
            if (!currList.includes(ITEM_DEFAULT_CURRENCY)) currList.unshift(ITEM_DEFAULT_CURRENCY);
            currencies.value = currList.length ? currList : [ITEM_DEFAULT_CURRENCY];

            if (!kinds.value.length) kinds.value = ITEM_BUILTIN_KINDS.slice();
            if (!groups.value.length) groups.value = ITEM_BUILTIN_GROUPS.map(g => Object.assign({}, g));
            if (!currencies.value.length) currencies.value = [ITEM_DEFAULT_CURRENCY];

            persistPickers();
        };

        /* ------------------------------- 选择器交互 */
        const closePick = () => {
            activeDropdown.value = '';
            pickQuery.value = { kind: '', group: '', category: '', currency: '' };
        };

        const togglePick = (name) => {
            if (activeDropdown.value === name) { closePick(); return; }
            activeDropdown.value = name;
            pickQuery.value = { kind: '', group: '', category: '', currency: '' };
            if (name === 'group') iconDraft.value = getItemGroupIcon(form.value.group);
        };

        const matchQuery = (text, q) => !q || String(text).toLowerCase().includes(q);

        const filteredKinds = computed(() => {
            const q = pickQuery.value.kind.trim().toLowerCase();
            return kinds.value.filter(k => matchQuery(k, q));
        });
        const filteredGroups = computed(() => {
            const q = pickQuery.value.group.trim().toLowerCase();
            return groups.value.filter(g => matchQuery(g.name, q));
        });
        const filteredCategories = computed(() => {
            const q = pickQuery.value.category.trim().toLowerCase();
            return categories.value.filter(c => matchQuery(c, q));
        });
        const filteredCurrencies = computed(() => {
            const q = pickQuery.value.currency.trim().toLowerCase();
            return currencies.value.filter(c => matchQuery(c, q));
        });

        const canCreateKind = computed(() => {
            const name = pickQuery.value.kind.trim();
            return !!name && !kinds.value.includes(name);
        });
        const canCreateGroup = computed(() => {
            const name = pickQuery.value.group.trim();
            return !!name && !groups.value.some(g => g.name === name);
        });
        const canCreateCategory = computed(() => {
            const name = pickQuery.value.category.trim();
            return !!name && !categories.value.includes(name);
        });
        const canCreateCurrency = computed(() => {
            const name = pickQuery.value.currency.trim();
            return !!name && !currencies.value.includes(name);
        });

        const kindUsage = (name) => items.value.filter(it => it.kind === name).length;
        const groupUsage = (name) => items.value.filter(it => it.group === name).length;
        const currencyUsage = (name) => items.value.filter(it => (it.currency || ITEM_DEFAULT_CURRENCY) === name).length;

        /* ------------------------------------- 类型 */
        const addKind = () => {
            const name = pickQuery.value.kind.trim();
            if (!name) return;
            if (!kinds.value.includes(name)) {
                kinds.value = kinds.value.concat(name);
                persistPickers();
            }
            form.value.kind = name;
            closePick();
        };

        const removeKind = async (name) => {
            if (kinds.value.length <= 1) {
                VowmonDialog.toast('至少要保留一个类型', 'warning');
                return;
            }
            const used = kindUsage(name);
            const rest = kinds.value.filter(k => k !== name);
            const label = VowmonDialog.esc(name);
            if (used) {
                const ok = await VowmonDialog.confirm(
                    `「${label}」下还有 <strong>${used}</strong> 个物品，删除后它们会归到「${VowmonDialog.esc(rest[0])}」。`,
                    { type: 'danger', title: '删除类型', okText: '删除', html: true }
                );
                if (!ok) return;
                items.value.forEach(it => { if (it.kind === name) it.kind = rest[0]; });
                saveLocal();
            } else {
                const ok = await VowmonDialog.confirm(`确定删除类型「${label}」？`, {
                    type: 'danger', title: '删除类型', okText: '删除', html: true
                });
                if (!ok) return;
            }
            kinds.value = rest;
            if (form.value.kind === name) form.value.kind = rest[0];
            persistPickers();
            VowmonDialog.toast('类型已删除', 'success');
        };

        /* ------------------------------------- 分组 */
        // 当前分组用的图标：已有分组读它自己的，新建时读刚选的
        const currentGroupIcon = computed(() => {
            const hit = groups.value.find(g => g.name === form.value.group);
            return hit ? hit.icon : iconDraft.value;
        });

        // 点图标：已有分组直接改并落盘；新建分组先记着，等 addGroup 用
        const chooseGroupIcon = (icon) => {
            iconDraft.value = icon;
            const idx = groups.value.findIndex(g => g.name === form.value.group);
            if (idx > -1) {
                const old = groups.value[idx].icon;
                groups.value = groups.value.map((g, i) => (i === idx ? Object.assign({}, g, { icon }) : g));
                persistPickers();
                if (form.value.iconClass === old) form.value.iconClass = icon;
            } else {
                form.value.iconClass = icon;
            }
        };

        const addGroup = () => {
            const name = pickQuery.value.group.trim();
            if (!name) return;
            if (!groups.value.some(g => g.name === name)) {
                const grp = makeItemGroup(name);
                grp.icon = iconDraft.value || grp.icon;
                groups.value = groups.value.concat(grp);
                persistPickers();
            }
            form.value.group = name;
            resetIconFont();
            closePick();
        };

        const removeGroup = async (name) => {
            if (groups.value.length <= 1) {
                VowmonDialog.toast('至少要保留一个分组', 'warning');
                return;
            }
            const used = groupUsage(name);
            const rest = groups.value.filter(g => g.name !== name);
            const fallback = (rest.find(g => g.name === ITEM_FALLBACK_GROUP.name) || rest[0]).name;
            const label = VowmonDialog.esc(name);
            if (used) {
                const ok = await VowmonDialog.confirm(
                    `「${label}」下还有 <strong>${used}</strong> 个物品，删除后它们会归到「${VowmonDialog.esc(fallback)}」。`,
                    { type: 'danger', title: '删除分组', okText: '删除', html: true }
                );
                if (!ok) return;
                items.value.forEach(it => { if (it.group === name) it.group = fallback; });
                saveLocal();
            } else {
                const ok = await VowmonDialog.confirm(`确定删除分组「${label}」？`, {
                    type: 'danger', title: '删除分组', okText: '删除', html: true
                });
                if (!ok) return;
            }
            groups.value = rest;
            if (form.value.group === name) {
                form.value.group = fallback;
                resetIconFont();
            }
            persistPickers();
            VowmonDialog.toast('分组已删除', 'success');
        };

        /* ------------------------------------- 细分类 */
        const addCategory = () => {
            const name = pickQuery.value.category.trim();
            if (!name) return;
            if (!categories.value.includes(name)) {
                categories.value = categories.value.concat(name);
                persistPickers();
            }
            form.value.category = name;
            closePick();
        };

        // 从建议列表里移除，不动已经有这个细分类的物品
        const removeCategory = (name) => {
            categories.value = categories.value.filter(c => c !== name);
            if (form.value.category === name) form.value.category = '';
            persistPickers();
            VowmonDialog.toast('细分类已移除', 'success');
        };

        /* ------------------------------------- 货币 */
        const addCurrency = () => {
            const name = pickQuery.value.currency.trim();
            if (!name) return;
            if (!currencies.value.includes(name)) {
                currencies.value = currencies.value.concat(name);
                persistPickers();
            }
            form.value.currency = name;
            closePick();
        };

        // 删除货币：用到它的物品回落到联盟币（基准货币不允许删除）
        const removeCurrency = async (name) => {
            if (name === ITEM_DEFAULT_CURRENCY) {
                VowmonDialog.toast('联盟币是基准货币，不能删除', 'warning');
                return;
            }
            if (currencies.value.length <= 1) {
                VowmonDialog.toast('至少要保留一种货币', 'warning');
                return;
            }
            const used = currencyUsage(name);
            const label = VowmonDialog.esc(name);
            const ok = await VowmonDialog.confirm(
                used
                    ? `「${label}」还被 <strong>${used}</strong> 个物品使用，删除后这些物品的价格会改回联盟币。`
                    : `确定删除货币「${label}」？`,
                { type: 'danger', title: '删除货币', okText: '删除', html: true }
            );
            if (!ok) return;
            if (used) {
                items.value.forEach(it => {
                    if ((it.currency || ITEM_DEFAULT_CURRENCY) === name) it.currency = ITEM_DEFAULT_CURRENCY;
                });
                saveLocal();
            }
            currencies.value = currencies.value.filter(c => c !== name);
            if (form.value.currency === name) form.value.currency = ITEM_DEFAULT_CURRENCY;
            persistPickers();
            VowmonDialog.toast('货币已删除', 'success');
        };

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
            item.origin = String(item.origin || '').trim();
            item.price = item.price == null ? '' : String(item.price).trim();
            item.currency = String(item.currency || '').trim() || ITEM_DEFAULT_CURRENCY;
            item.obtain = Array.isArray(item.obtain)
                ? item.obtain.map(o => String(o).trim()).filter(Boolean)
                : (item.obtain ? [String(item.obtain)] : []);
            return item;
        });

        /* ------------------------------------------------------------ 显示列 */
        const showColSettings = ref(false);
        const allColumns = {
            icon: '图标', name: '物品名称', kind: '类型',
            group: '分组', price: '价格', obtain: '获取方式', desc: '描述'
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
                /* 只有老配置（v1）才补上新增的「价格」列；之后用户自己关掉就保持关掉 */
                if (localStorage.getItem(COLS_KEY + '_v') !== '2') {
                    if (!filtered.includes('price')) filtered.push('price');
                    localStorage.setItem(COLS_KEY + '_v', '2');
                }
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
            saveMirror();
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
                VowmonDialog.alert('请先在「精灵管理 → 同步配置」里填写 Token、用户名和图片仓库名。', {
                    type: 'warning', title: '还没配置好'
                });
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
                VowmonDialog.toast(`图标已上传：${path}\n已压缩为 ${img.canvasSize}×${img.canvasSize}（${ImageUtils.formatBytes(img.bytes)}）`, 'success', { duration: 3600 });
            } catch (err) {
                VowmonDialog.alert('图标上传失败，请检查 Token 权限 / 图片仓库名。', {
                    type: 'danger',
                    title: '上传失败',
                    detail: err && err.message ? err.message : String(err)
                });
            } finally {
                isUploading.value = false;
                event.target.value = '';
            }
        };

        /* ---------------------------------------------------------------- 保存 */
        const saveItem = () => {
            const name = String(form.value.name || '').trim();
            if (!name) {
                VowmonDialog.toast('请填写物品名称', 'warning');
                return;
            }

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
            item.origin = String(item.origin || '').trim();   // 原型 / 取材自，默认留空
            item.price = String(item.price == null ? '' : item.price).trim();   // 价格，可留空
            item.currency = String(item.currency || '').trim() || ITEM_DEFAULT_CURRENCY;   // 价格货币
            item.obtain = String(obtainText.value || '')
                .split('\n')
                .map(line => line.trim())
                .filter(Boolean);

            // 名称去重，避免图鉴里出现两个同名物品
            const dup = items.value.find((it, i) =>
                it.name === item.name && !(isEdit.value && i === editIndex.value));
            if (dup) {
                VowmonDialog.alert(`已经有一个叫「${VowmonDialog.esc(item.name)}」的物品了，改个名字或直接编辑那一条。`, {
                    type: 'warning',
                    title: '名称重复',
                    html: true
                });
                return;
            }

            if (isEdit.value && editIndex.value > -1) {
                items.value.splice(editIndex.value, 1, item);
            } else {
                items.value.unshift(item);
            }

            // 手输的新细分类自动进建议列表，下次可以直接选
            if (item.category && !categories.value.includes(item.category)) {
                categories.value = categories.value.concat(item.category);
                persistPickers();
            }

            saveLocal();
            showModal.value = false;
        };

        /* ---------------------------------------------------------------- 删除 */
        const openDeleteConfirm = (index, name) => {
            deleteTargetIndex.value = index;
            deleteTargetName.value = name;
            VowmonDialog.confirm(
                `确定要删除物品 <strong>${VowmonDialog.esc(name)}</strong> 吗？`,
                { type: 'danger', title: '确认删除', okText: '确认删除', cancelText: '再想想', html: true }
            ).then((ok) => {
                if (ok) confirmDelete();
            });
        };

        const confirmDelete = () => {
            if (deleteTargetIndex.value > -1) {
                items.value.splice(deleteTargetIndex.value, 1);
                saveLocal();
                VowmonDialog.toast('已删除', 'success');
            }
            deleteTargetIndex.value = -1;
        };

        // 弹窗关闭统一收口：遮罩点击 / Esc / 关闭按钮 都走这里（见 js/common-ui.js）
        const closeModal = (target) => {
            if (target === 'edit') showModal.value = false;
        };

        /* ---------------------------------------------------------------- 同步 */
        const syncToGitHub = async () => {
            const cfg = config.value;
            if (!cfg.token || !cfg.owner) {
                VowmonDialog.alert('请先在「精灵管理 → 同步配置」里填写 Token 和用户名。', {
                    type: 'warning', title: '还没配置好'
                });
                return;
            }

            const repos = String(cfg.dataRepos || '')
                .split(/[\s,，]+/)
                .map(s => s.trim())
                .filter(Boolean);
            if (!repos.length) {
                VowmonDialog.toast('请先在「精灵管理 → 同步配置」里填写数据仓库名', 'warning', { duration: 3400 });
                return;
            }

            isSyncing.value = true;
            // 自定义列表跟着数据一起同步，否则前台读不到新加的类型 / 分组
            const content = JSON.stringify({
                kinds: kinds.value,
                groups: groups.value,
                categories: categories.value,
                currencies: currencies.value,
                items: items.value
            }, null, 4) + '\n';

            try {
                for (const repo of repos) {
                    await GitHubSync.uploadFile(
                        cfg.token, cfg.owner, repo, 'items-data.json',
                        content, 'update items data'
                    );
                }
                VowmonDialog.toast('物品数据同步成功，共 ' + repos.length + ' 个仓库', 'success');
            } catch (err) {
                VowmonDialog.alert('物品数据同步失败，请检查 Token 权限和仓库名。', {
                    type: 'danger',
                    title: '同步失败',
                    detail: err && err.message ? err.message : String(err)
                });
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

            // 物品载入之后再初始化自定义列表：细分类首次要从现有物品里收集
            initPickers();

            // 点击「显示列」面板以外的地方时收起面板。
            // 必须自己判断是否点在面板内，否则复选框的勾选会被当成外部点击打断（详见 README）。
            document.addEventListener('click', (e) => {
                const el = e.target && e.target.closest ? e.target : null;
                if (!(el && el.closest('.col-settings-wrap'))) showColSettings.value = false;
                // 可搜索选择器同理：点在 .pick 内部不关，点外面才关
                if (!(el && el.closest('.pick'))) activeDropdown.value = '';
            }, true);
        });

        // 从数据仓库拉取最新数据（数据仓库是唯一数据源，会覆盖本机草稿）
        const pullFromRepo = async () => {
            const repo = String(config.value.dataRepos || '').split(/[\s,，]+/).map(s => s.trim()).filter(Boolean)[0];
            if (!config.value.token || !config.value.owner || !repo) {
                VowmonDialog.alert('请先在「精灵管理 → 同步配置」里填写 Token、用户名和数据仓库名', { type: 'warning', title: '还没配置好' });
                return;
            }
            const ok = await VowmonDialog.confirm(
                '将从「' + repo + '」读取 items-data.json（含类型 / 分组 / 细分类），并覆盖本机未同步的改动。继续？',
                { type: 'warning', title: '从数据仓库拉取', okText: '拉取' }
            );
            if (!ok) return;

            isSyncing.value = true;
            try {
                const bag = await GitHubSync.downloadJson(config.value.token, config.value.owner, repo, 'items-data.json');
                if (!bag || !Array.isArray(bag.items)) throw new Error('仓库里没有 items-data.json，或字段不是 items 数组');

                items.value = normalizeItems(bag.items);
                localStorage.setItem('vowmon_items_data', JSON.stringify(items.value));
                localStorage.setItem(KINDS_KEY, JSON.stringify(bag.kinds || []));
                localStorage.setItem(GROUPS_KEY, JSON.stringify(bag.groups || []));
                localStorage.setItem(CATS_KEY, JSON.stringify(bag.categories || []));
                localStorage.setItem(CURR_KEY, JSON.stringify(bag.currencies || []));
                initPickers();
                VowmonDialog.toast('已从 ' + repo + ' 拉取 ' + items.value.length + ' 件物品', 'success', { duration: 3200 });
            } catch (err) {
                VowmonDialog.alert('拉取失败，请检查 Token 权限和仓库名。', {
                    type: 'danger', title: '拉取失败', detail: err && err.message ? err.message : String(err)
                });
            } finally {
                isSyncing.value = false;
            }
        };

        return {
            itemKinds, itemGroups,
            getItemGroupIcon, getItemGroupColor,
            config, items, isSyncing,
            showColSettings, allColumns, visibleCols,
            showModal, isEdit, form, obtainText, activeDropdown, displayIcon,
            isUploading, iconFileInput,
            deleteTargetName,
            openEditor, saveItem, openDeleteConfirm, confirmDelete, closeModal,
            triggerIconUpload, handleIconUpload, resetIconFont,
            // 可自定义的类型 / 分组 / 细分类
            kinds, groups, categories, currencies, pickQuery,
            filteredKinds, filteredGroups, filteredCategories, filteredCurrencies,
            canCreateKind, canCreateGroup, canCreateCategory, canCreateCurrency,
            kindUsage, groupUsage, currencyUsage,
            addCurrency, removeCurrency, ITEM_DEFAULT_CURRENCY,
            togglePick, closePick,
            addKind, removeKind, addGroup, removeGroup, addCategory, removeCategory,
            // 分组图标
            groupIconPresets, currentGroupIcon, chooseGroupIcon,
            syncToGitHub,
            pullFromRepo
        };
    }
}).mount('#app');
});
