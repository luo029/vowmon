const { createApp, ref, reactive, computed, onMounted, watch } = Vue;

createApp({
    setup() {
        // 支持通过 URL 参数直接定位到指定标签页（如从技能/特性管理页跳转过来）
        // 例如 admin.html?tab=settings 会直接打开「同步配置」
        const urlParams = new URLSearchParams(window.location.search);
        const initialTab = urlParams.get('tab') === 'settings' ? 'settings' : 'sprites';
        const currentTab = ref(initialTab);

        // 切换标签页时同步更新地址栏，保证刷新/深链都能停留在当前页
        const switchTab = (tab) => {
            currentTab.value = tab;
            try {
                const url = new URL(window.location.href);
                if (tab === 'settings') url.searchParams.set('tab', 'settings');
                else url.searchParams.delete('tab');
                history.replaceState(null, '', url.pathname + url.search);
            } catch (e) {
                // file:// 等受限环境下无法改写历史，忽略即可，标签切换本身不受影响
            }
        };
        const pets = ref([]);
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
        // 显示列状态持久化：localStorage['vowmon_pets_visible_cols']
        // 未存过 -> null（用下面这份默认列）；存过 -> 数组（可能是空数组，代表用户全取消）
        const COLS_KEY = 'vowmon_pets_visible_cols';
        const loadVisibleCols = () => {
            try {
                const raw = localStorage.getItem(COLS_KEY);
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

        // 删除确认状态
        const showDeleteModal = ref(false);
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
            imgCdnBase: '',
            imgSize: 512               // 上传时自动压缩的最长边（px）
        });

        // 图片压缩尺寸下拉项（统一由 js/image-utils.js 提供，避免两处写死）
        const imgSizeOptions = (window.ImageUtils && ImageUtils.SIZE_OPTIONS) || [256, 512, 768, 1024];

        const defaultForm = () => ({
            id: '', name: '', types: [], stage: '一阶', evoPos: '初始', form: '主形态', rank: '',
            ability: '', abilityEffect: '', eggGroup: '', rideable: '', height: '', weight: '',
            image: '', shiny: [], description: '',
            stats: { hp: 0, atk: 0, def: 0, spAtk: 0, spDef: 0, spd: 0 }
        });

        const form = reactive(defaultForm());

        onMounted(() => {
            const storedData = localStorage.getItem('vowmon_pets_data');
            if (storedData) {
                pets.value = JSON.parse(storedData);
            } else if (typeof allPetsData !== 'undefined') {
                pets.value = JSON.parse(JSON.stringify(allPetsData));
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

        // 分页数据
        const paginatedPets = computed(() => {
            const start = (listPage.value - 1) * listPageSize;
            return pets.value.slice(start, start + listPageSize);
        });

        // 辅助获取图标和颜色
        const getTypeIcon = (name) => typeData.find(t => t.name === name)?.icon || '';
        const getTypeColor = (name) => typeData.find(t => t.name === name)?.color || '#ccc';

        // 生成缩略图路径
        const getThumbUrl = (path) => {
            if (!path) return '';
            if (path.startsWith('http')) return path;
            if (config.value.imgCdnBase) return config.value.imgCdnBase.replace(/\/$/, '') + '/' + path;
            return ''; 
        };

        // 选择器逻辑
        const openSelectionModal = (type) => {
            selectionType.value = type;
            selectionSearchQuery.value = '';
            selectionPage.value = 1;
            showSelectionModal.value = true;
            activeDropdown.value = '';
        };

        const rawSelectionList = computed(() => {
            if (selectionType.value === 'ability') {
                const map = new Map();
                pets.value.forEach(p => {
                    if (p.ability && !map.has(p.ability)) map.set(p.ability, p.abilityEffect || '无说明');
                });
                return Array.from(map.entries()).map(([key, desc]) => ({ key, desc }));
            } else {
                const set = new Set();
                pets.value.forEach(p => { if (p.eggGroup) set.add(p.eggGroup); });
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
                form.ability = item.key;
                form.abilityEffect = item.desc === '无说明' ? '' : item.desc;
            } else {
                form.eggGroup = item.key;
            }
            showSelectionModal.value = false;
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
            if (pets.value.length === 0) return '001';
            let maxId = 0;
            pets.value.forEach(p => {
                const match = String(p.id == null ? '' : p.id).trim().match(/^(\d+)/);
                if (match) {
                    const num = parseInt(match[1], 10);
                    if (num > maxId) maxId = num;
                }
            });
            return String(maxId + 1).padStart(3, '0');
        };

        const saveToLocal = () => {
            localStorage.setItem('vowmon_pets_data', JSON.stringify(pets.value));
            localStorage.setItem('vowmon_site_config', JSON.stringify({ imgRepo: config.value.imgCdnBase }));
        };

        // 同步配置面板：令牌显隐 + 已填写项统计
        const showToken = ref(false);

        const configFilledCount = computed(() => {
            const c = config.value;
            return [c.token, c.owner, c.dataRepos, c.imgRepos, c.imgCdnBase]
                .filter(v => !!(v && String(v).trim())).length;
        });

        const saveConfig = () => {
            localStorage.setItem('vowmon_sync_config', JSON.stringify(config.value));
            saveToLocal();
            alert('配置已保存！');
        };

        const openEditor = (pet = null, index = -1) => {
            isEdit.value = !!pet;
            editIndex.value = index;
            activeDropdown.value = '';
            
            if (pet) {
                Object.assign(form, defaultForm(), JSON.parse(JSON.stringify(pet)));
            } else {
                Object.assign(form, defaultForm(), { id: generateNextId() });
            }
            // 兼容早期没有 shiny 字段的旧数据
            if (!Array.isArray(form.shiny)) form.shiny = [];
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

        // 本次会话上传过的「仓库路径 → 压缩后的 base64」。
        // 作用：改完编号点保存时，可以按新编号直接重传，不必让用户重新选图。
        const uploadedImageCache = new Map();

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
                alert('请先在【同步配置】中完整填写 Token、用户名和图片仓库名，才能上传图片。');
                switchTab('settings');
                return;
            }
            if (!String(form.id || '').trim()) {
                alert('请先填写编号，图片会按编号自动命名。');
                return;
            }
            fileInput.value.click();
        };

        const handleFileUpload = (event) => {
            const file = event.target.files && event.target.files[0];
            if (!file) return;
            if (!String(form.id || '').trim()) {
                event.target.value = '';
                return alert('请先填写编号，图片会按编号自动命名。');
            }

            isUploading.value = true;
            uploadCompressedImage(file, 0)
                .then(({ path, img }) => {
                    form.image = path;
                    previewImageUrl.value = `data:image/png;base64,${img.base64}`;
                    alert(`✅ 上传成功：${path}\n已压缩为 ${img.canvasSize}×${img.canvasSize}（${ImageUtils.formatBytes(img.bytes)}）`);
                })
                .catch((err) => {
                    alert('❌ 上传失败：\n' + err.message);
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
            if (form.shiny.includes(val)) return alert('这张图已经在列表里了。');
            form.shiny.push(val);
            shinyInput.value = '';
        };

        const removeShiny = (index) => {
            if (!Array.isArray(form.shiny)) return;
            form.shiny.splice(index, 1);
        };

        const triggerShinyUpload = () => {
            if (!config.value.token || !config.value.owner || !config.value.imgRepos) {
                alert('请先在【同步配置】中完整填写 Token、用户名和图片仓库名，才能上传图片。');
                switchTab('settings');
                return;
            }
            if (!String(form.id || '').trim()) {
                alert('请先填写编号，异色图会按编号自动命名。');
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
                return alert('请先填写编号，异色图会按编号自动命名。');
            }

            if (!Array.isArray(form.shiny)) form.shiny = [];

            isShinyUploading.value = true;
            let ok = 0;
            let fail = 0;
            let bytes = 0;

            for (let i = 0; i < files.length; i++) {
                shinyProgress.value = `处理中 ${i + 1}/${files.length}`;
                try {
                    const { path, img } = await uploadCompressedImage(files[i], nextShinySeq());
                    form.shiny.push(path);
                    bytes += img.bytes;
                    ok++;
                } catch (err) {
                    console.error('异色图片上传失败', err);
                    fail++;
                }
            }

            isShinyUploading.value = false;
            shinyProgress.value = '';
            event.target.value = '';

            if (ok && !fail) alert(`✅ 已上传 ${ok} 张异色图片\n已压缩为 ${config.value.imgSize || 512}px 以内的 PNG（${ImageUtils.formatBytes(bytes)}）`);
            else if (ok && fail) alert(`⚠️ 成功 ${ok} 张，失败 ${fail} 张（详见控制台）`);
            else alert('❌ 异色图片上传失败，请检查 Token 权限 / 图片仓库名。');
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
            else if (target === 'delete') showDeleteModal.value = false;
        };

        const savePet = async () => {
            const id = String(form.id || '').trim();
            const name = String(form.name || '').trim();
            if (!id || !name) return alert('编号和名称不能为空！');

            // 编号唯一性校验（编辑时排除自己）
            const dup = pets.value.find((p, i) => String(p.id || '').trim() === id && !(isEdit.value && i === editIndex.value));
            if (dup) return alert(`编号 ${id} 已被「${dup.name}」占用，请换一个编号。`);

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

            const petData = JSON.parse(JSON.stringify(form));
            if (!Array.isArray(petData.shiny)) petData.shiny = [];

            if (isEdit.value) pets.value[editIndex.value] = petData;
            else pets.value.unshift(petData);
            
            saveToLocal();
            showModal.value = false;
        };

        // 删除逻辑
        const openDeleteConfirm = (index, name) => {
            deleteTargetIndex.value = index;
            deleteTargetName.value = name;
            showDeleteModal.value = true;
        };

        const confirmDelete = () => {
            if (deleteTargetIndex.value > -1) {
                pets.value.splice(deleteTargetIndex.value, 1);
                if (pets.value.length > 0 && (listPage.value - 1) * listPageSize >= pets.value.length) {
                    listPage.value--;
                }
                saveToLocal();
            }
            showDeleteModal.value = false;
        };

        // 同步到多个仓库
        const syncToGitHub = async () => {
            if (!config.value.token || !config.value.owner || !config.value.dataRepos) {
                alert('请先在【同步配置】中填写信息！');
                switchTab('settings');
                return;
            }
            isSyncing.value = true;
            try {
                const jsString = `// vow-data.js\nconst allPetsData = ` + JSON.stringify(pets.value, null, 4) + ';\n';
                
                // 解析多个数据仓库
                const repos = config.value.dataRepos.split(',').map(s => s.trim()).filter(s => s);
                for (let repo of repos) {
                    await GitHubSync.uploadFile(
                        config.value.token, config.value.owner, repo,
                        'vow-data.js', jsString, 'Admin Panel: Update vow data', false
                    );
                }
                
                alert('✅ 数据已成功同步到所有配置的仓库！');
            } catch (error) {
                alert('❌ 同步失败：\n' + error.message);
            } finally {
                isSyncing.value = false;
            }
        };

        return {
            currentTab, switchTab, pets, config, typeData, showModal, isEdit, form, isSyncing, isUploading, isSaving,
            imgSizeOptions,
            showToken, configFilledCount,
            activeDropdown, fileInput, previewImageUrl,
            shinyFileInput, shinyInput, isShinyUploading, shinyProgress,
            shinyPreview, addShinyByInput, removeShiny, triggerShinyUpload, handleShinyUpload,
            showColSettings, allColumns, visibleCols,
            showSelectionModal, selectionType, selectionSearchQuery, selectionPage,
            filteredSelectionList, paginatedSelectionList,
            listPage, listPageSize, paginatedPets,
            showDeleteModal, deleteTargetName,
            closeModal,
            closeAllDropdowns, toggleDropdown, selectOption, openSelectionModal, selectFromModal,
            openEditor, savePet, openDeleteConfirm, confirmDelete, saveConfig, syncToGitHub, toggleType, 
            triggerFileUpload, handleFileUpload, updatePreview, getThumbUrl, getTypeIcon, getTypeColor,
            window
        };
    }
}).mount('#app');