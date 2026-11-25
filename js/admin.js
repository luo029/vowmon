const { createApp, ref, reactive, computed, onMounted, watch } = Vue;
VowmonData.ready(['vows', 'traits'], { fresh: true }).then(function () {

createApp({
    setup() {
        // 支持通过 URL 参数直接定位到指定标签页（如从技能/特性管理页跳转过来）
        // 例如 admin.html?tab=settings 会直接打开「同步配置」
        const urlParams = new URLSearchParams(window.location.search);
        const initialTab = (urlParams.get('tab') === 'settings' || urlParams.get('tab') === 'realm') ? urlParams.get('tab') : 'sprites';
        const currentTab = ref(initialTab);

        // 切换标签页时同步更新地址栏，保证刷新/深链都能停留在当前页
        const switchTab = (tab) => {
            currentTab.value = tab;
            try {
                const url = new URL(window.location.href);
                if (tab === 'settings' || tab === 'realm') url.searchParams.set('tab', tab);
                else url.searchParams.delete('tab');
                history.replaceState(null, '', url.pathname + url.search);
            } catch (e) {
                // file:// 等受限环境下无法改写历史，忽略即可，标签切换本身不受影响
            }
            if (window.AdminSidebar) window.AdminSidebar.setActive(tab);
        };
        /* 侧边栏（admin/sidebar.js）Tab 点击：无刷新切换 */
        window.addEventListener('admin:tab', (e) => { if (e && e.detail) switchTab(e.detail); });
        const vows = ref([]);
        // 特性库（traits-data.json），用于：① 特性候选池 ② 保存精灵时双向同步特性 ↔ 精灵关联
        const traits = ref([]);
        const showModal = ref(false);
        const isEdit = ref(false);
        const editIndex = ref(-1);
        const isSyncing = ref(false);
        const isUploading = ref(false);
        const isSaving = ref(false);
        
        // 列表分页
        const listPage = ref(1);
        const listPageSize = 15;
        
        // 列显隐状态
        const showColSettings = ref(false);
        const allColumns = {
            image: '头像', id: '编号', name: '名称', types: '属性', typeIcon: '属性图标', stage: '阶数', form: '形态', ability: '特性',
            hp: 'HP', atk: '攻击', def: '防御', spAtk: '特攻', spDef: '特防', spd: '速度'
        };
        // 显示列状态持久化：localStorage['vowmon_vows_visible_cols']
        // 未存过 -> null（用下面这份默认列）；存过 -> 数组（可能是空数组，代表用户全取消）
        const COLS_KEY = 'vowmon_vows_visible_cols';
        const loadVisibleCols = () => {
            try {
                const raw = localStorage.getItem(COLS_KEY) || localStorage.getItem('vowmon_pets_visible_cols');
                if (raw === null) return null;
                const saved = JSON.parse(raw);
                if (!Array.isArray(saved)) return null;
                const valid = Object.keys(allColumns);
                const filtered = saved.filter(k => valid.includes(k));
                // 存过但是全是已不存在的列（改过字段名）→ 视为无效，回默认；空数组则尊重用户"全取消"
                if (saved.length && !filtered.length) return null;
                return filtered;
            } catch (err) {
                console.warn('显示列配置解析失败，改用默认', err);
                return null;
            }
        };
        const DEFAULT_COLS = ['image', 'id', 'name', 'types', 'typeIcon', 'stage', 'form'];
        const visibleCols = ref(loadVisibleCols() || DEFAULT_COLS.slice());
        // 勾选/取消勾选立即落盘，刷新后保持用户选择
        watch(visibleCols, (val) => {
            localStorage.setItem(COLS_KEY, JSON.stringify(val));
        }, { deep: true });

        const activeDropdown = ref('');
        
        // 选择器弹窗状态
        const showSelectionModal = ref(false);
        const selectionType = ref('ability');
        const selectionSearchQuery = ref('');
        const selectionPage = ref(1);
        const selectionPageSize = 10;

        // 删除确认状态（弹窗本身由 VowmonDialog 负责显示）
        const deleteTargetIndex = ref(-1);
        const deleteTargetName = ref('');

        const fileInput = ref(null);
        const previewImageUrl = ref('');

        // 异色图片（可多张）：挂在精灵对象上的 shiny 数组，不占编号、不算独立条目
        const shinyFileInput = ref(null);
        const shinyInput = ref('');
        const isShinyUploading = ref(false);
        const shinyProgress = ref('');

        // 支持多仓库配置
        const config = ref({
            token: '', 
            owner: '', 
            dataRepos: 'vowmon_data',  // 支持逗号分隔
            imgRepos: 'vowmon_imgs',   // 支持逗号分隔
            dataCdnBase: '',           // 数据公开地址，留空用 js/site-config.js 的默认值
            imgCdnBase: '',            // 图片公开地址，留空同上
            imgSize: 512               // 上传时自动压缩的最长边（px）
        });

        const resetDataBase = () => { config.value.dataCdnBase = ''; };
        const resetImgBase = () => { config.value.imgCdnBase = ''; };

        // 图片压缩尺寸下拉项（统一由 js/image-utils.js 提供，避免两处写死）
        const imgSizeOptions = (window.ImageUtils && ImageUtils.SIZE_OPTIONS) || [256, 512, 768, 1024];

        const defaultForm = () => ({
            /* 阶级（rank）已移除手工输入：位阶由阶数推导（一阶=初灵、二阶=升灵、三阶=族尊），是御兽精灵个体的属性 */
            id: '', name: '', types: [], stage: '一阶', evoPos: '初始', form: '主形态',
            ability: '', abilityEffect: '',
            ability2: '', ability2Effect: '',           // 第二特性（多特性随机触发其一）
            hiddenAbility: '', hiddenAbilityEffect: '', // 隐藏特性（不填默认为空）
            evoFrom: [], evoTo: [],                     // 进化链：进化自 / 进化为（存精灵 id，可多选）
            realmTags: [],                              // 天地图鉴类别：legendary/mythical/starter/late（天地图鉴页按此分组展示）
            eggGroup: '', rideable: '', height: '', weight: '',
            // 分类学：域界门纲目科属种（科决定族尊下发的十八系血脉技能）
            taxonomy: { domain: '', kingdom: '', phylum: '', class: '', order: '', family: '', genus: '', species: '' },
            origin: '',                                 // 原型 / 取材自（自由填写，默认空）
            image: '', shiny: [], description: '',
            stats: { hp: 0, atk: 0, def: 0, spAtk: 0, spDef: 0, spd: 0 }
        });

        const form = reactive(defaultForm());

        /* 分类学联动：科 / 属 / 种只要有一个已录入过，就自动补全前面的域界门纲目。
           只填空字段，不覆盖用户已写内容；匹配优先级：种 → 属 → 科。 */
        watch(() => [form.taxonomy.family, form.taxonomy.genus, form.taxonomy.species], () => {
            const t = form.taxonomy;
            const rules = [
                ['species', ['domain', 'kingdom', 'phylum', 'class', 'order', 'family', 'genus']],
                ['genus', ['domain', 'kingdom', 'phylum', 'class', 'order', 'family']],
                ['family', ['domain', 'kingdom', 'phylum', 'class', 'order']]
            ];
            rules.forEach(([key, targets]) => {
                const val = String(t[key] || '').trim();
                if (!val) return;
                const hit = vows.value.find(p => p && p.taxonomy && String(p.taxonomy[key] || '').trim() === val);
                if (!hit) return;
                targets.forEach(k => {
                    if (!String(t[k] || '').trim() && hit.taxonomy[k]) t[k] = hit.taxonomy[k];
                });
            });
        });

        onMounted(() => {
            const storedData = localStorage.getItem('vowmon_vows_data') || localStorage.getItem('vowmon_pets_data');
            if (storedData) {
                vows.value = JSON.parse(storedData);
            } else if (typeof allVowsData !== 'undefined') {
                vows.value = JSON.parse(JSON.stringify(allVowsData));
            }
            const storedTraits = localStorage.getItem('vowmon_traits_data');
            if (storedTraits) {
                try { traits.value = JSON.parse(storedTraits); } catch (e) { traits.value = []; }
            } else if (typeof allTraitsData !== 'undefined') {
                traits.value = JSON.parse(JSON.stringify(allTraitsData));
            }
            const storedConfig = localStorage.getItem('vowmon_sync_config');
            if (storedConfig) {
                try {
                    config.value = Object.assign({}, config.value, JSON.parse(storedConfig));
                } catch (e) {
                    console.warn('同步配置解析失败，已使用默认值', e);
                }
            }
            // 兼容旧配置：没有存过压缩尺寸时补默认值
            if (!config.value.imgSize) config.value.imgSize = 512;

            // 点击「显示列」浮层以外的地方时收起面板。
            // 触发按钮与面板本身都写了 @click.stop，正常不会冒泡到这里；
            // 这里再用 closest 兜一层，确保面板内的勾选点击永远不会被误判成「外部点击」，
            // 否则复选框的默认勾选/取消会被中途打断（要点好几次才生效）。
            document.addEventListener('click', (e) => {
                const el = e.target && e.target.closest ? e.target : null;
                if (!(el && el.closest('.col-settings-wrap'))) showColSettings.value = false;
            });
        });

        // 编号数字（取编号开头的数字，无数字的排最后）
        const vowIdNum = (p) => {
            const m = String((p && p.id) || '').trim().match(/^\d+/);
            return m ? parseInt(m[0], 10) : -1;
        };

        // 分页数据：按编号从大到小排序后再切页（不改动 vows.value 本身的存储顺序）
        const paginatedVows = computed(() => {
            const sorted = vows.value.slice().sort((a, b) => vowIdNum(b) - vowIdNum(a));
            const start = (listPage.value - 1) * listPageSize;
            return sorted.slice(start, start + listPageSize);
        });

        // 辅助获取图标和颜色（Map 缓存，避免每行都扫一遍 typeData）
        const adminTypeMap = new Map(typeData.map(t => [t.name, t]));
        const getTypeIcon = (name) => (adminTypeMap.get(name) || {}).icon || '';
        const getTypeColor = (name) => (adminTypeMap.get(name) || {}).color || '#ccc';

        // 生成缩略图路径
        // 本次会话上传过的「仓库路径 → 压缩后的 base64」。
        // 两个用途：① 预览优先用它，刚上传就能显示，不必等 CDN 就绪；② 改编号保存时按新编号重传，不用重新选图。
        const uploadedImageCache = new Map();

        // 图片仓库列表（同步配置支持逗号分隔多仓；上传只写第一个）
        const imgRepos = computed(() => String(config.value.imgRepos || '').split(',').map(s => s.trim()).filter(Boolean));
        const primaryImgRepo = () => imgRepos.value[0] || '';

        // 生成图片仓库的公开前缀，优先级：
        //   ① 后台同步配置里的「图片CDN基础路径」（支持 {repo} 占位符，也支持把已配置的仓库名替换成目标仓库）
        //   ② 仓库里的 js/site-config.js 的 imgCdnBase
        //   ③ 用 owner + 仓库名拼 jsDelivr 默认地址
        const buildCdnBase = (repo) => {
            const target = repo || primaryImgRepo();
            let raw = String(config.value.imgCdnBase || '').trim().replace(/\/+$/, '');
            if (!raw) raw = String((window.VOWMON_SITE_CONFIG || {}).imgCdnBase || '').trim().replace(/\/+$/, '');
            if (raw) {
                if (raw.indexOf('{repo}') !== -1) return raw.replace(/\{repo\}/g, target);
                // 长的仓库名优先替换，避免 img1 先命中 img10 的前缀
                const sorted = imgRepos.value.slice().sort((a, b) => b.length - a.length);
                for (const r of sorted) {
                    if (r && raw.indexOf(r) !== -1) return raw.split(r).join(target);
                }
                return raw;
            }
            if (config.value.owner && target) return `https://cdn.jsdelivr.net/gh/${config.value.owner}/${target}@main`;
            return '';
        };

        const getThumbUrl = (path) => {
            if (!path) return '';
            const p = String(path);
            if (/^(https?:)?\/\//i.test(p) || p.startsWith('data:')) return p;
            const cached = uploadedImageCache.get(p);
            if (cached) return `data:image/png;base64,${cached}`;
            const base = buildCdnBase();
            // 实在没有前缀就退回原路径（相对当前页面），至少不会拼出 `//` 这种死链
            return base ? base + '/' + p.replace(/^\/+/, '') : p;
        };

        // 选择器逻辑
        const selectionTarget = ref('ability'); // 当前选择器写给哪个字段：ability / ability2 / hiddenAbility
        const openSelectionModal = (type, target) => {
            selectionType.value = type;
            selectionTarget.value = target || type;
            selectionSearchQuery.value = '';
            selectionPage.value = 1;
            showSelectionModal.value = true;
            activeDropdown.value = '';
        };

        const rawSelectionList = computed(() => {
            if (selectionType.value === 'ability') {
                // 汇总特性候选：特性库（traits-data）优先，再补精灵档案里的 特性1/特性2/隐藏特性
                const map = new Map();
                traits.value.forEach(t => {
                    if (t && t.name && !map.has(t.name)) map.set(t.name, t.effect || '无说明');
                });
                vows.value.forEach(p => {
                    if (p.ability && !map.has(p.ability)) map.set(p.ability, p.abilityEffect || '无说明');
                    if (p.ability2 && !map.has(p.ability2)) map.set(p.ability2, p.ability2Effect || '无说明');
                    if (p.hiddenAbility && !map.has(p.hiddenAbility)) map.set(p.hiddenAbility, p.hiddenAbilityEffect || '无说明');
                });
                return Array.from(map.entries()).map(([key, desc]) => ({ key, desc }));
            } else {
                const set = new Set();
                vows.value.forEach(p => { if (p.eggGroup) set.add(p.eggGroup); });
                return Array.from(set).map(key => ({ key, desc: '' }));
            }
        });

        const filteredSelectionList = computed(() => {
            if (!selectionSearchQuery.value) return rawSelectionList.value;
            return rawSelectionList.value.filter(item => item.key.includes(selectionSearchQuery.value));
        });

        const paginatedSelectionList = computed(() => {
            const start = (selectionPage.value - 1) * selectionPageSize;
            return filteredSelectionList.value.slice(start, start + selectionPageSize);
        });

        const selectFromModal = (item) => {
            if (selectionType.value === 'ability') {
                const desc = item.desc === '无说明' ? '' : item.desc;
                if (selectionTarget.value === 'ability2') {
                    form.ability2 = item.key;
                    form.ability2Effect = desc;
                } else if (selectionTarget.value === 'hiddenAbility') {
                    form.hiddenAbility = item.key;
                    form.hiddenAbilityEffect = desc;
                } else {
                    form.ability = item.key;
                    form.abilityEffect = desc;
                }
            } else {
                form.eggGroup = item.key;
            }
            showSelectionModal.value = false;
        };

        /* -------------------------------------------------------- 进化链选择 */
        const showEvoModal = ref(false);
        const evoTarget = ref('evoTo');          // 'evoFrom' | 'evoTo'
        const evoSearchQuery = ref('');
        const evoSelection = ref([]);            // 弹窗内的临时多选

        const vowNameById = (id) => {
            const p = vows.value.find(x => String(x.id) === String(id));
            return p ? p.name : id;
        };

        const filteredEvoVows = computed(() => {
            const q = evoSearchQuery.value.trim();
            const list = vows.value.filter(p => String(p.id || '') !== String(form.id || ''));
            const matched = q ? list.filter(p => (p.name || '').includes(q) || String(p.id || '').includes(q)) : list;
            return matched.slice(0, 60);
        });

        const openEvoModal = (target) => {
            evoTarget.value = target;
            evoSearchQuery.value = '';
            evoSelection.value = [...(Array.isArray(form[target]) ? form[target] : [])];
            showEvoModal.value = true;
        };
        const toggleEvoPick = (id) => {
            const i = evoSelection.value.findIndex(x => String(x) === String(id));
            if (i > -1) evoSelection.value.splice(i, 1);
            else evoSelection.value.push(id);
        };
        const confirmEvoModal = () => {
            const target = evoTarget.value;
            const other = target === 'evoFrom' ? 'evoTo' : 'evoFrom';
            const oldIds = [...(Array.isArray(form[target]) ? form[target] : [])];
            const newIds = [...evoSelection.value];
            form[target] = newIds;
            // 双向自动关联：对方精灵的反向字段同步加上/移除自己
            const myId = String(form.id || '');
            if (myId) {
                const removed = oldIds.filter(id => !newIds.some(x => String(x) === String(id)));
                const added = newIds.filter(id => !oldIds.some(x => String(x) === String(id)));
                vows.value.forEach(p => {
                    const pid = String(p.id || '');
                    if (!pid) return;
                    if (p[other] && !Array.isArray(p[other])) p[other] = [p[other]];
                    if (!Array.isArray(p[other])) p[other] = [];
                    if (removed.some(id => String(id) === pid)) {
                        p[other] = p[other].filter(x => String(x) !== myId);
                    }
                    if (added.some(id => String(id) === pid) && !p[other].some(x => String(x) === myId)) {
                        p[other].push(myId);
                    }
                });
            }
            showEvoModal.value = false;
        };
        const removeEvo = (target, id) => {
            if (!Array.isArray(form[target])) form[target] = [];
            form[target] = form[target].filter(x => String(x) !== String(id));
        };

        // 表单交互
        const closeAllDropdowns = () => { 
            activeDropdown.value = ''; 
            showColSettings.value = false;
        };
        const toggleDropdown = (name) => {
            activeDropdown.value = activeDropdown.value === name ? '' : name;
        };
        const selectOption = (field, val) => {
            form[field] = val;
            activeDropdown.value = '';
        };

        const generateNextId = () => {
            if (vows.value.length === 0) return '001';
            let maxId = 0;
            vows.value.forEach(p => {
                const match = String(p.id == null ? '' : p.id).trim().match(/^(\d+)/);
                if (match) {
                    const num = parseInt(match[1], 10);
                    if (num > maxId) maxId = num;
                }
            });
            return String(maxId + 1).padStart(3, '0');
        };

        const saveToLocal = () => {
            localStorage.setItem('vowmon_vows_data', JSON.stringify(vows.value));
            localStorage.setItem('vowmon_site_config', JSON.stringify({ imgRepo: config.value.imgCdnBase }));
        };

        // 同步配置面板：令牌显隐 + 已填写项统计
        const showToken = ref(false);

        const configFilledCount = computed(() => {
            const c = config.value;
            return [c.token, c.owner, c.dataRepos, c.imgRepos, c.dataCdnBase, c.imgCdnBase]
                .filter(v => !!(v && String(v).trim())).length;
        });

        const saveConfig = () => {
            localStorage.setItem('vowmon_sync_config', JSON.stringify(config.value));
            saveToLocal();
            VowmonDialog.toast('同步配置已保存', 'success');
        };

        const openEditor = (vow = null) => {
            // 列表是按编号排序展示的，索引一律按对象引用反查，避免换算错位
            const index = vow ? vows.value.indexOf(vow) : -1;
            isEdit.value = !!vow;
            editIndex.value = index;
            activeDropdown.value = '';
            
            if (vow) {
                Object.assign(form, defaultForm(), JSON.parse(JSON.stringify(vow)));
            } else {
                Object.assign(form, defaultForm(), { id: generateNextId() });
            }
            // 兼容早期没有 shiny 字段的旧数据
            if (!Array.isArray(form.shiny)) form.shiny = [];
            // 天地图鉴类别：缺省为空数组（旧数据没有此字段）
            if (!Array.isArray(form.realmTags)) form.realmTags = [];
            // 兼容进化链字段：旧数据可能是单个 id 字符串或缺失
            if (form.evoFrom && !Array.isArray(form.evoFrom)) form.evoFrom = [form.evoFrom];
            if (!Array.isArray(form.evoFrom)) form.evoFrom = [];
            if (form.evoTo && !Array.isArray(form.evoTo)) form.evoTo = [form.evoTo];
            if (!Array.isArray(form.evoTo)) form.evoTo = [];
            shinyInput.value = '';
            
            if (form.image) {
                previewImageUrl.value = getThumbUrl(form.image);
            } else {
                previewImageUrl.value = '';
            }
            showModal.value = true;
        };

        const toggleType = (name) => {
            const index = form.types.indexOf(name);
            if (index > -1) form.types.splice(index, 1);
            else form.types.push(name);
        };

        /* 天地图鉴类别（天地图鉴页按此分组展示）：传说 / 梦幻 / 初始 / 晚成 */
        const REALM_META = [
            { key: 'legendary', label: '权柄精灵', icon: 'fa-solid fa-crown', color: '#d4a017' },
            { key: 'mythical',  label: '遥世精灵', icon: 'fa-solid fa-cloud-moon', color: '#b678e0' },
            { key: 'starter',   label: '伙伴精灵', icon: 'fa-solid fa-seedling', color: '#48bb78' },
            { key: 'late',      label: '晚熟精灵', icon: 'fa-solid fa-hourglass-half', color: '#ed8936' }
        ];
        const toggleRealm = (key) => {
            if (!Array.isArray(form.realmTags)) form.realmTags = [];
            const index = form.realmTags.indexOf(key);
            if (index > -1) form.realmTags.splice(index, 1);
            else form.realmTags.push(key);
        };

        const updatePreview = () => {
            previewImageUrl.value = getThumbUrl(form.image);
            if(!previewImageUrl.value && form.image) {
                previewImageUrl.value = form.image;
            }
        };

        /* -------------------------------------------------------- 图片上传 */
        // 仓库内的精灵图目录与命名规则：
        //   主图  sprites/编号.png
        //   异色  sprites/编号_s.png → 第二张 _s2 → 第三张 _s3 …
        const IMG_DIR = 'sprites/';

        const spriteFileName = (id, n) => {
            const base = String(id || '').trim() || `temp_${Date.now()}`;
            if (!n) return `${base}.png`;
            return n === 1 ? `${base}_s.png` : `${base}_s${n}.png`;
        };

        // 本次会话上传过的「仓库路径 → 压缩后的 base64」——
        // 声明在 getThumbUrl 之前，见上方 uploadedImageCache。

        const isRepoPath = (p) => !!p && !/^(https?:)?\/\//i.test(String(p)) && !String(p).startsWith('data:');

        // 统一上传入口：压缩 → 按编号命名 → 写入 GitHub
        const uploadCompressedImage = async (file, seq) => {
            if (!window.ImageUtils) throw new Error('图片处理模块未加载，请强制刷新页面（Ctrl + F5）后重试');
            const firstImgRepo = String(config.value.imgRepos || '').split(',')[0].trim();
            if (!firstImgRepo) throw new Error('请先在【同步配置】中填写图片仓库名');

            const img = await ImageUtils.compressToPng(file, config.value.imgSize || 512);
            if (!img.base64) throw new Error('图片压缩失败，请换一张图试试');

            const fileName = spriteFileName(form.id, seq);
            const path = IMG_DIR + fileName;

            await GitHubSync.uploadFile(
                config.value.token, config.value.owner, firstImgRepo,
                path, img.base64, `Upload sprite: ${fileName}`, true
            );
            uploadedImageCache.set(path, img.base64);
            return { path, img };
        };

        const triggerFileUpload = () => {
            if (!config.value.token || !config.value.owner || !config.value.imgRepos) {
                VowmonDialog.alert('请先在【同步配置】中完整填写 Token、用户名和图片仓库名，才能上传图片。', {
                    type: 'warning',
                    title: '还没配置好',
                    okText: '去配置'
                }).then(() => switchTab('settings'));
                return;
            }
            if (!String(form.id || '').trim()) {
                VowmonDialog.toast('请先填写编号，图片会按编号自动命名', 'warning');
                return;
            }
            fileInput.value.click();
        };

        const handleFileUpload = (event) => {
            const file = event.target.files && event.target.files[0];
            if (!file) return;
            if (!String(form.id || '').trim()) {
                event.target.value = '';
                VowmonDialog.toast('请先填写编号，图片会按编号自动命名', 'warning');
                return;
            }

            isUploading.value = true;
            uploadCompressedImage(file, 0)
                .then(({ path, img }) => {
                    form.image = path;
                    previewImageUrl.value = `data:image/png;base64,${img.base64}`;
                    VowmonDialog.toast(`上传成功：${path}\n已压缩为 ${img.canvasSize}×${img.canvasSize}（${ImageUtils.formatBytes(img.bytes)}）`, 'success', { duration: 3600 });
                })
                .catch((err) => {
                    VowmonDialog.alert('上传失败，请检查 Token 权限 / 图片仓库名。', {
                        type: 'danger',
                        title: '上传失败',
                        detail: err && err.message ? err.message : String(err)
                    });
                })
                .finally(() => {
                    isUploading.value = false;
                    event.target.value = '';
                });
        };

        /* ------------------------------------------------------------ 异色图片 */
        // 下一张异色图的序号：扫已有路径里的 _s / _s2 与旧版 _shiny{n}，取没被占用的最小值
        const nextShinySeq = () => {
            const used = new Set();
            (Array.isArray(form.shiny) ? form.shiny : []).forEach(p => {
                const name = String(p).split('/').pop();
                let m = name.match(/_shiny(\d+)\./i);
                if (m) { used.add(parseInt(m[1], 10)); return; }
                m = name.match(/_s(\d+)\./i);
                if (m) { used.add(parseInt(m[1], 10)); return; }
                if (/_s\.png$/i.test(name)) used.add(1);
            });
            let n = 1;
            while (used.has(n)) n++;
            return n;
        };

        // 缩略图地址：外链直接用，仓库路径拼图片 CDN 前缀
        const shinyPreview = (path) => getThumbUrl(path) || path || '';

        const addShinyByInput = () => {
            const val = shinyInput.value.trim();
            if (!val) return;
            if (!Array.isArray(form.shiny)) form.shiny = [];
            if (form.shiny.includes(val)) {
                VowmonDialog.toast('这张图已经在列表里了', 'warning');
                return;
            }
            form.shiny.push(val);
            shinyInput.value = '';
        };

        const removeShiny = (index) => {
            if (!Array.isArray(form.shiny)) return;
            form.shiny.splice(index, 1);
        };

        const triggerShinyUpload = () => {
            if (!config.value.token || !config.value.owner || !config.value.imgRepos) {
                VowmonDialog.alert('请先在【同步配置】中完整填写 Token、用户名和图片仓库名，才能上传图片。', {
                    type: 'warning',
                    title: '还没配置好',
                    okText: '去配置'
                }).then(() => switchTab('settings'));
                return;
            }
            if (!String(form.id || '').trim()) {
                VowmonDialog.toast('请先填写编号，异色图会按编号自动命名', 'warning');
                return;
            }
            if (shinyFileInput.value) shinyFileInput.value.click();
        };

        // 一次可多选：逐张串行上传（压缩 + 命名在上传函数里统一处理），避免触发 GitHub 频率限制
        const handleShinyUpload = async (event) => {
            const files = Array.from(event.target.files || []);
            if (!files.length) return;
            if (!String(form.id || '').trim()) {
                event.target.value = '';
                VowmonDialog.toast('请先填写编号，异色图会按编号自动命名', 'warning');
                return;
            }

            if (!Array.isArray(form.shiny)) form.shiny = [];

            isShinyUploading.value = true;
            let ok = 0;
            let fail = 0;
            let bytes = 0;
            const errors = [];

            for (let i = 0; i < files.length; i++) {
                shinyProgress.value = `处理中 ${i + 1}/${files.length}`;
                try {
                    const { path, img } = await uploadCompressedImage(files[i], nextShinySeq());
                    form.shiny.push(path);
                    bytes += img.bytes;
                    ok++;
                } catch (err) {
                    console.error('异色图片上传失败', err);
                    errors.push(err && err.message ? err.message : String(err));
                    fail++;
                }
            }

            isShinyUploading.value = false;
            shinyProgress.value = '';
            event.target.value = '';

            if (ok && !fail) {
                VowmonDialog.toast(`已上传 ${ok} 张异色图片\n已压缩为 ${config.value.imgSize || 512}px 以内的 PNG（${ImageUtils.formatBytes(bytes)}）`, 'success', { duration: 3600 });
            } else if (ok && fail) {
                VowmonDialog.alert(`成功 ${ok} 张，失败 ${fail} 张。\n\n失败原因：\n${errors.slice(0, 3).join('\n')}`, {
                    type: 'warning',
                    title: '部分失败'
                });
            } else {
                VowmonDialog.alert(errors[0] || '上传失败，请检查 Token 权限 / 图片仓库名。', {
                    type: 'danger',
                    title: '上传失败'
                });
            }
        };

        // 编号被改过时，把本次会话上传过的图按新编号重传，并删掉旧文件
        const renameUploadedImages = async () => {
            const tasks = [];
            if (isRepoPath(form.image)) {
                tasks.push({ path: form.image, seq: 0, apply: (p) => { form.image = p; } });
            }
            (Array.isArray(form.shiny) ? form.shiny : []).forEach((p, i) => {
                if (isRepoPath(p)) tasks.push({ path: p, seq: i + 1, apply: (np) => { form.shiny[i] = np; } });
            });
            if (!tasks.length) return 0;

            const repo = String(config.value.imgRepos || '').split(',')[0].trim();
            if (!repo) return 0;

            let renamed = 0;
            for (const task of tasks) {
                const want = IMG_DIR + spriteFileName(form.id, task.seq);
                if (task.path === want) continue;

                const b64 = uploadedImageCache.get(task.path);
                if (!b64) continue; // 手填路径、或刷新过页面拿不到原图：保持原样

                try {
                    await GitHubSync.uploadFile(
                        config.value.token, config.value.owner, repo,
                        want, b64, `Rename sprite: ${want}`, true
                    );
                    uploadedImageCache.set(want, b64);
                    task.apply(want);
                    renamed++;

                    // 旧文件删除失败不影响保存结果，最多留一张没人引用的图
                    try {
                        const sha = await GitHubSync.getFileSha(config.value.token, config.value.owner, repo, task.path);
                        if (sha) {
                            await GitHubSync.deleteFile(
                                config.value.token, config.value.owner, repo,
                                task.path, sha, `Remove old sprite: ${task.path}`
                            );
                        }
                    } catch (e) { console.warn('旧图删除失败（可忽略）', task.path, e); }
                } catch (e) {
                    console.warn('图片重命名失败，保留原路径', task.path, e);
                }
            }
            return renamed;
        };

        // 弹窗关闭统一收口：遮罩点击 / Esc / 关闭按钮 都走这里（见 js/common-ui.js）
        const closeModal = (target) => {
            if (target === 'edit') showModal.value = false;
            else if (target === 'selection') showSelectionModal.value = false;
        };

        const saveVow = async () => {
            const id = String(form.id || '').trim();
            const name = String(form.name || '').trim();
            if (!id || !name) {
                VowmonDialog.toast('编号和名称不能为空', 'warning');
                return;
            }

            // 编号唯一性校验（编辑时排除自己）
            const dup = vows.value.find((p, i) => String(p.id || '').trim() === id && !(isEdit.value && i === editIndex.value));
            if (dup) {
                VowmonDialog.alert(`编号 <strong>${VowmonDialog.esc(id)}</strong> 已被「${VowmonDialog.esc(dup.name)}」占用，请换一个编号。`, {
                    type: 'warning',
                    title: '编号重复',
                    html: true
                });
                return;
            }

            form.id = id;
            form.name = name;

            // 编号改过 → 把本次上传的图按新编号重传（只处理本地缓存过的图，失败则保留原路径）
            isSaving.value = true;
            try {
                await renameUploadedImages();
            } catch (e) {
                console.warn('图片重命名流程异常，已跳过', e);
            } finally {
                isSaving.value = false;
            }

            const vowData = JSON.parse(JSON.stringify(form));
            if (!Array.isArray(vowData.shiny)) vowData.shiny = [];
            vowData.origin = String(vowData.origin || '').trim();   // 原型 / 取材自，默认留空

            if (isEdit.value) vows.value[editIndex.value] = vowData;
            else vows.value.unshift(vowData);

            saveToLocal();
            // 写入本机镜像：前台（同一台电脑）立刻就能看到这次改动
            if (window.VowmonStore) VowmonStore.save('vows', { vows: vows.value });
            // 双向互通：把精灵的特性写回特性库（traits-data）——
            //   特性1/特性2 → 该特性的 pokemons；隐藏特性 → hiddenPokemons；
            //   精灵上已删掉的特性会从对应特性条目里移除；特性库里没有的自动创建
            syncVowTraitsToTraitList(vowData);
            showModal.value = false;
        };

        // 特性 ↔ 精灵 双向同步（精灵编辑器侧）
        const nextTraitIdLocal = () => {
            let max = 0;
            traits.value.forEach(t => {
                const m = String((t && t.id) || '').trim().match(/^t(\d+)$/);
                if (m) max = Math.max(max, parseInt(m[1], 10));
            });
            return 't' + String(max + 1).padStart(3, '0');
        };

        const syncVowTraitsToTraitList = (vowData) => {
            const vowName = vowData.name;
            if (!vowName) return;
            const normal = [vowData.ability, vowData.ability2].filter(n => n && String(n).trim());
            const hidden = (vowData.hiddenAbility && String(vowData.hiddenAbility).trim()) ? [vowData.hiddenAbility] : [];
            const normalSet = new Set(normal);
            const hiddenSet = new Set(hidden);
            let changed = false;

            traits.value.forEach(t => {
                if (!t || !t.name) return;
                if (!Array.isArray(t.pokemons)) t.pokemons = [];
                if (!Array.isArray(t.hiddenPokemons)) t.hiddenPokemons = [];
                const shouldNormal = normalSet.has(t.name);
                const shouldHidden = hiddenSet.has(t.name);
                if (!shouldNormal && !shouldHidden) {
                    const before = t.pokemons.length + t.hiddenPokemons.length;
                    t.pokemons = t.pokemons.filter(n => n !== vowName);
                    t.hiddenPokemons = t.hiddenPokemons.filter(n => n !== vowName);
                    if (before !== t.pokemons.length + t.hiddenPokemons.length) changed = true;
                } else if (shouldHidden) {
                    if (!t.hiddenPokemons.includes(vowName)) { t.hiddenPokemons.push(vowName); changed = true; }
                    if (t.pokemons.includes(vowName)) { t.pokemons = t.pokemons.filter(n => n !== vowName); changed = true; }
                } else {
                    if (!t.pokemons.includes(vowName)) { t.pokemons.push(vowName); changed = true; }
                    if (t.hiddenPokemons.includes(vowName)) { t.hiddenPokemons = t.hiddenPokemons.filter(n => n !== vowName); changed = true; }
                }
            });

            // 精灵上填写但特性库里不存在的特性 → 自动创建条目
            const ensureTrait = (name, effect, isHidden) => {
                if (!name || traits.value.some(t => t.name === name)) return;
                traits.value.unshift({
                    id: nextTraitIdLocal(),
                    name,
                    types: Array.isArray(vowData.types) ? JSON.parse(JSON.stringify(vowData.types)) : [],
                    pokemons: isHidden ? [] : [vowName],
                    hiddenPokemons: isHidden ? [vowName] : [],
                    effect: effect || ''
                });
                changed = true;
            };
            ensureTrait(vowData.ability, vowData.abilityEffect, false);
            ensureTrait(vowData.ability2, vowData.ability2Effect, false);
            ensureTrait(vowData.hiddenAbility, vowData.hiddenAbilityEffect, true);

            if (changed) {
                localStorage.setItem('vowmon_traits_data', JSON.stringify(traits.value));
                if (window.VowmonStore) VowmonStore.save('traits', { traits: traits.value });
            }
        };

        // 删除逻辑：确认弹窗走统一的 VowmonDialog（js/dialog.js + css/dialog.css）
        const openDeleteConfirm = (vow) => {
            // 列表按编号排序展示，删除索引按对象引用反查
            const index = vows.value.indexOf(vow);
            deleteTargetIndex.value = index;
            deleteTargetName.value = vow ? vow.name : '';
            VowmonDialog.confirm(
                `您确定要永久删除精灵 <strong>${VowmonDialog.esc(name)}</strong> 吗？此操作不可撤销。`,
                { type: 'danger', title: '确认删除', okText: '确认删除', cancelText: '再想想', html: true }
            ).then((ok) => {
                if (ok) confirmDelete();
            });
        };

        const confirmDelete = () => {
            if (deleteTargetIndex.value > -1) {
                vows.value.splice(deleteTargetIndex.value, 1);
                if (vows.value.length > 0 && (listPage.value - 1) * listPageSize >= vows.value.length) {
                    listPage.value--;
                }
                saveToLocal();
                if (window.VowmonStore) VowmonStore.save('vows', { vows: vows.value });
                VowmonDialog.toast('已删除', 'success');
            }
            deleteTargetIndex.value = -1;
        };

        // 同步到多个仓库
        /* ———— 天地图鉴 Tab：四个类别的中文名与说明可自定义（存数据仓库 realm-data.json） ———— */
        const REALM_KEYS = [
            { key: 'legendary', icon: 'fa-solid fa-crown', color: '#d4a017' },
            { key: 'mythical', icon: 'fa-solid fa-cloud-moon', color: '#b678e0' },
            { key: 'starter', icon: 'fa-solid fa-seedling', color: '#48bb78' },
            { key: 'late', icon: 'fa-solid fa-hourglass-half', color: '#ed8936' }
        ];
        const DEFT_REALM_LABELS = { legendary: '权柄精灵', mythical: '遥世精灵', starter: '伙伴精灵', late: '晚熟精灵' };
        const DEFT_REALM_DESCS = {
            legendary: '能够执掌世界规则的精灵。它们是天地秩序的基石，力量稳定而宏大，在世界的记载里拥有明确的名号与定位。',
            mythical: '栖身于远离凡俗的偏远秘境，和人类活动的世界相互隔绝。并非隐匿自身，只是居所遥不可及，绝大多数训练家终生无缘相见。',
            starter: '适合和新人结伴启程的精灵，性格亲和，容易建立羁绊，是踏上旅途时可供选择的搭档。',
            late: '成长节奏更为缓慢的精灵。前期实力平平，需要长久陪伴与磨砺，待到后期才能解锁潜藏的力量。'
        };
        const realmLabels = ref(Object.assign({}, DEFT_REALM_LABELS));
        const realmDescs = ref(Object.assign({}, DEFT_REALM_DESCS));
        const isRealmSyncing = ref(false);
        const applyRealmData = (data) => {
            if (data && data.labels && typeof data.labels === 'object') {
                for (const k in DEFT_REALM_LABELS) {
                    realmLabels.value[k] = (data.labels[k] && String(data.labels[k]).trim()) || DEFT_REALM_LABELS[k];
                }
            }
            if (data && data.descs && typeof data.descs === 'object') {
                for (const k in DEFT_REALM_DESCS) {
                    realmDescs.value[k] = (data.descs[k] && String(data.descs[k]).trim()) || DEFT_REALM_DESCS[k];
                }
            }
        };
        // 天地图鉴配置是可选增强数据：用 softReady 静默加载，失败就保持内置默认
        VowmonData.softReady(['realm']).then(applyRealmData).catch(function () { /* ignore */ });
        VowmonData.onChange('realm', applyRealmData);

        // 保存天地图鉴配置（写本机镜像，前台立刻生效；「一键同步」后进仓库）
        const saveRealm = () => {
            for (const k in realmLabels.value) realmLabels.value[k] = String(realmLabels.value[k] || '').trim() || DEFT_REALM_LABELS[k];
            if (window.VowmonStore) VowmonStore.save('realm', { labels: realmLabels.value, descs: realmDescs.value });
            VowmonDialog.toast('天地图鉴配置已保存，前台即刻生效；记得一键同步进仓库', 'success');
        };

        /* ———— 天地图鉴 Tab 内直接管理类别成员（添加 / 移除精灵的 realmTags） ———— */
        const realmSearch = ref({});
        const realmMembers = (key) => vows.value.filter(v => Array.isArray(v.realmTags) && v.realmTags.includes(key));
        const realmSearchResults = (key) => {
            const q = String(realmSearch.value[key] || '').trim().toLowerCase();
            if (!q) return [];
            const members = realmMembers(key);
            return vows.value
                .filter(v => !members.includes(v))
                .filter(v => String(v.name || '').toLowerCase().includes(q) || String(v.id || '').toLowerCase().includes(q))
                .slice(0, 8);
        };
        const persistVowsQuick = () => {
            saveToLocal();
            // 写入本机镜像：前台（同一台电脑）立刻就能看到这次改动
            if (window.VowmonStore) VowmonStore.save('vows', { vows: vows.value });
        };
        const addRealmVow = (key, vow) => {
            if (!vow) return;
            if (!Array.isArray(vow.realmTags)) vow.realmTags = [];
            if (!vow.realmTags.includes(key)) vow.realmTags.push(key);
            realmSearch.value[key] = '';
            persistVowsQuick();
            VowmonDialog.toast('已加入「' + (realmLabels.value[key] || key) + '」', 'success', { duration: 1600 });
        };
        const removeRealmVow = (key, vow) => {
            if (!vow || !Array.isArray(vow.realmTags)) return;
            vow.realmTags = vow.realmTags.filter(t => t !== key);
            persistVowsQuick();
            VowmonDialog.toast('已移出「' + (realmLabels.value[key] || key) + '」', 'info', { duration: 1600 });
        };
        const hideImgOnError = (e) => { if (e && e.target) e.target.style.display = 'none'; };
        // 天地图鉴配置同步到数据仓库
        const syncRealm = async () => {
            if (!config.value.token || !config.value.owner || !config.value.dataRepos) {
                VowmonDialog.alert('请先在【同步配置】中填写信息。', { type: 'warning', title: '还没配置好', okText: '去配置' }).then(() => switchTab('settings'));
                return;
            }
            isRealmSyncing.value = true;
            try {
                const jsonString = JSON.stringify({ labels: realmLabels.value, descs: realmDescs.value }, null, 4) + '\n';
                const repos = config.value.dataRepos.split(',').map(s => s.trim()).filter(s => s);
                for (const repo of repos) {
                    await GitHubSync.uploadFile(
                        config.value.token, config.value.owner, repo,
                        'realm-data.json', jsonString, 'Admin Panel: Update realm data', false
                    );
                }
                if (window.VowmonStore) VowmonStore.markSynced('realm');
                VowmonDialog.toast('天地图鉴配置已同步到所有配置的仓库', 'success', { duration: 3200 });
            } catch (error) {
                VowmonDialog.alert('同步失败，请检查 Token 权限和仓库名。', {
                    type: 'danger',
                    title: '同步失败',
                    detail: error && error.message ? error.message : String(error)
                });
            } finally {
                isRealmSyncing.value = false;
            }
        };

        const syncToGitHub = async () => {
            if (!config.value.token || !config.value.owner || !config.value.dataRepos) {
                VowmonDialog.alert('请先在【同步配置】中填写信息。', {
                    type: 'warning',
                    title: '还没配置好',
                    okText: '去配置'
                }).then(() => switchTab('settings'));
                return;
            }
            isSyncing.value = true;
            try {
                const jsonString = JSON.stringify({ vows: vows.value }, null, 4) + '\n';
                
                // 解析多个数据仓库
                const repos = config.value.dataRepos.split(',').map(s => s.trim()).filter(s => s);
                for (let repo of repos) {
                    await GitHubSync.uploadFile(
                        config.value.token, config.value.owner, repo,
                        'vow-data.json', jsonString, 'Admin Panel: Update vow data', false
                    );
                }
                
                // 同步成功：本机镜像与云端一致，清掉「未同步」标记
                if (window.VowmonStore) VowmonStore.markSynced('vows');
                VowmonDialog.toast('数据已成功同步到所有配置的仓库', 'success', { duration: 3200 });
            } catch (error) {
                VowmonDialog.alert('同步失败，请检查 Token 权限和仓库名。', {
                    type: 'danger',
                    title: '同步失败',
                    detail: error && error.message ? error.message : String(error)
                });
            } finally {
                isSyncing.value = false;
            }
        };

        // 从数据仓库拉取最新数据（数据仓库是唯一数据源，会覆盖本机草稿）
        const pullFromRepo = async () => {
            const repo = String(config.value.dataRepos || '').split(/[\s,，]+/).map(s => s.trim()).filter(Boolean)[0];
            if (!config.value.token || !config.value.owner || !repo) {
                VowmonDialog.alert('请先在【同步配置】中填写 Token、用户名和数据仓库名。', {
                    type: 'warning', title: '还没配置好', okText: '去配置'
                }).then(() => switchTab('settings'));
                return;
            }
            const ok = await VowmonDialog.confirm(
                '将从「' + repo + '」读取 vow-data.json，并覆盖本机未同步的改动。继续？',
                { type: 'warning', title: '从数据仓库拉取', okText: '拉取' }
            );
            if (!ok) return;

            isSyncing.value = true;
            try {
                const bag = await GitHubSync.downloadJson(config.value.token, config.value.owner, repo, 'vow-data.json');
                if (!bag || !Array.isArray(bag.vows)) throw new Error('仓库里没有 vow-data.json，或字段不是 vows 数组');

                vows.value = JSON.parse(JSON.stringify(bag.vows));
                localStorage.setItem('vowmon_vows_data', JSON.stringify(vows.value));
                if (window.VowmonStore) VowmonStore.replace('vows', { vows: vows.value });
                // 顺带刷新特性库（保持精灵 ↔ 特性关联一致）
                try {
                    const tbag = await GitHubSync.downloadJson(config.value.token, config.value.owner, repo, 'traits-data.json');
                    if (tbag && Array.isArray(tbag.traits)) {
                        traits.value = tbag.traits.map(t => ({
                            ...t,
                            pokemons: Array.isArray(t.pokemons) ? t.pokemons : [],
                            hiddenPokemons: Array.isArray(t.hiddenPokemons) ? t.hiddenPokemons : []
                        }));
                        localStorage.setItem('vowmon_traits_data', JSON.stringify(traits.value));
                        if (window.VowmonStore) VowmonStore.replace('traits', { traits: traits.value });
                    }
                } catch (e) { /* traits-data 拉取失败不影响精灵数据 */ }
                listPage.value = 1;
                VowmonDialog.toast('已从 ' + repo + ' 拉取 ' + vows.value.length + ' 条精灵数据', 'success', { duration: 3200 });
            } catch (error) {
                VowmonDialog.alert('拉取失败，请检查 Token 权限和仓库名。', {
                    type: 'danger',
                    title: '拉取失败',
                    detail: error && error.message ? error.message : String(error)
                });
            } finally {
                isSyncing.value = false;
            }
        };

        return {
            currentTab, switchTab, vows, config, typeData, showModal, isEdit, form, isSyncing, isUploading, isSaving,
            imgSizeOptions, REALM_META, toggleRealm,
            REALM_KEYS, realmLabels, realmDescs, isRealmSyncing, saveRealm, syncRealm,
            realmSearch, realmMembers, realmSearchResults, addRealmVow, removeRealmVow, hideImgOnError,
            showToken, configFilledCount, resetDataBase, resetImgBase,
            activeDropdown, fileInput, previewImageUrl,
            shinyFileInput, shinyInput, isShinyUploading, shinyProgress,
            shinyPreview, addShinyByInput, removeShiny, triggerShinyUpload, handleShinyUpload,
            showColSettings, allColumns, visibleCols,
            showSelectionModal, selectionType, selectionSearchQuery, selectionPage,
            filteredSelectionList, paginatedSelectionList,
            showEvoModal, evoTarget, evoSearchQuery, evoSelection,
            vowNameById, filteredEvoVows, openEvoModal, toggleEvoPick, confirmEvoModal, removeEvo,
            listPage, listPageSize, paginatedVows,
            deleteTargetName,
            closeModal,
            closeAllDropdowns, toggleDropdown, selectOption, openSelectionModal, selectFromModal,
            openEditor, saveVow, openDeleteConfirm, confirmDelete, saveConfig, syncToGitHub, pullFromRepo, toggleType, 
            triggerFileUpload, handleFileUpload, updatePreview, getThumbUrl, getTypeIcon, getTypeColor,
            window
        };
    }
}).mount('#app');
});