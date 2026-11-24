/* ==========================================================================
   Vowmon Wiki 后台 —— 特性管理逻辑
   --------------------------------------------------------------------------
   数据链路（与 admin.js 保持一致）：
     编辑 -> 写入 localStorage['vowmon_traits_data']
          -> 点「一键同步」把 traits-data.js 推到 GitHub 数据仓库
          -> 前台 traits.html 读取同源 traits-data.js 生效
   ========================================================================== */

const { createApp, ref, computed, onMounted, watch } = Vue;

createApp({
    setup() {
        const typeDataList = typeData;

        /* ------------------------------------------------------------ 同步配置 */
        const config = ref({
            token: '',
            owner: '',
            dataRepos: 'vowmon_data',
            imgRepos: 'vowmon_imgs',
            imgCdnBase: ''
        });

        /* ---------------------------------------------------------------- 数据 */
        const traits = ref([]);
        const pets = ref([]);
        const isSyncing = ref(false);

        /* ---------------------------------------------------------------- 弹窗 */
        const showModal = ref(false);
        const isEdit = ref(false);
        const editIndex = ref(-1);

        const showDeleteModal = ref(false);
        const deleteTargetIndex = ref(-1);
        const deleteTargetName = ref('');

        /* ------------------------------------------------------------ 精灵选择 */
        const showPokemonSearchModal = ref(false);
        const pokemonSearchQuery = ref('');
        const pokemonPage = ref(1);

        const defaultForm = () => ({
            id: '',
            name: '',
            types: [],
            pokemons: [],
            effect: ''
        });

        const form = ref(defaultForm());

        /* ------------------------------------------------------------ 显示列 */
        const showColSettings = ref(false);
        const allColumns = {
            name: '特性名称', types: '属性', pokemons: '拥有精灵', effect: '效果'
        };
        // 显示列状态持久化：localStorage['vowmon_traits_visible_cols']
        // 未存过 -> null（默认全选）；存过 -> 数组（可能是空数组，代表用户全取消）
        const COLS_KEY = 'vowmon_traits_visible_cols';
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
        const visibleCols = ref(loadVisibleCols() ?? Object.keys(allColumns));
        // 勾选/取消勾选立即落盘，刷新后保持用户选择
        watch(visibleCols, (val) => {
            localStorage.setItem(COLS_KEY, JSON.stringify(val));
        }, { deep: true });

        /* ---------------------------------------------------------------- 工具 */
        // 属性图标 / 颜色，取自 type-config.js（全局唯一来源）
        const getTypeIcon = (name) => (typeDataList.find(t => t.name === name)?.icon) || 'fa-solid fa-circle';
        const getTypeColor = (name) => (typeDataList.find(t => t.name === name)?.color) || '#cbd5e0';

        // 属性胶囊多选切换
        const toggleType = (name) => {
            const idx = form.value.types.indexOf(name);
            if (idx > -1) form.value.types.splice(idx, 1);
            else form.value.types.push(name);
        };

        const pokemonsStr = computed({
            get() {
                return form.value.pokemons.join(', ');
            },
            set(value) {
                form.value.pokemons = String(value || '')
                    .split(/[,，、]/)
                    .map(item => item.trim())
                    .filter(Boolean);
            }
        });

        const filteredPokemons = computed(() => {
            const keyword = pokemonSearchQuery.value.trim().toLowerCase();
            if (!keyword) return pets.value;
            return pets.value.filter(pet => {
                const name = String(pet.name || '').toLowerCase();
                const id = String(pet.id || '').toLowerCase();
                return name.includes(keyword) || id.includes(keyword);
            });
        });

        const paginatedPokemons = computed(() => {
            const start = (pokemonPage.value - 1) * 10;
            return filteredPokemons.value.slice(start, start + 10);
        });

        /* ---------------------------------------------------------------- 工具 */
        const nextTraitId = () => {
            let max = 0;
            traits.value.forEach(item => {
                const num = parseInt(String(item.id || '').replace(/\D/g, ''), 10);
                if (!isNaN(num) && num > max) max = num;
            });
            return 't' + String(max + 1).padStart(3, '0');
        };

        const saveLocal = () => {
            localStorage.setItem('vowmon_traits_data', JSON.stringify(traits.value));
        };

        /* ---------------------------------------------------------------- 编辑 */
        const openEditor = (trait, index) => {
            if (trait && typeof index === 'number') {
                isEdit.value = true;
                editIndex.value = index;
                const copy = JSON.parse(JSON.stringify(trait));
                if (!Array.isArray(copy.types)) copy.types = [];
                if (!Array.isArray(copy.pokemons)) copy.pokemons = [];
                form.value = copy;
            } else {
                isEdit.value = false;
                editIndex.value = -1;
                form.value = defaultForm();
                form.value.id = nextTraitId();
            }
            showModal.value = true;
        };

        const saveTrait = () => {
            if (!form.value.name || !String(form.value.name).trim()) {
                alert('请填写特性名称');
                return;
            }
            const item = JSON.parse(JSON.stringify(form.value));
            item.name = String(item.name).trim();
            if (!item.id) item.id = nextTraitId();

            if (isEdit.value && editIndex.value > -1) {
                traits.value.splice(editIndex.value, 1, item);
            } else {
                traits.value.unshift(item);
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
                traits.value.splice(deleteTargetIndex.value, 1);
                saveLocal();
            }
            showDeleteModal.value = false;
        };

        /* ------------------------------------------------------------ 选精灵 */
        const openPokemonModal = () => {
            pokemonSearchQuery.value = '';
            pokemonPage.value = 1;
            showPokemonSearchModal.value = true;
        };

        const selectPokemon = (pet) => {
            if (pet && pet.name && !form.value.pokemons.includes(pet.name)) {
                form.value.pokemons.push(pet.name);
            }
            showPokemonSearchModal.value = false;
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
                .map(item => item.trim())
                .filter(Boolean);

            if (repos.length === 0) {
                alert('请先在「精灵管理 → 同步配置」里填写数据仓库名');
                return;
            }

            isSyncing.value = true;
            const content = '// traits-data.js\n' +
                'const allTraitsData = ' + JSON.stringify(traits.value, null, 4) + ';\n';

            try {
                for (const repo of repos) {
                    await GitHubSync.uploadFile(
                        cfg.token, cfg.owner, repo, 'traits-data.js',
                        content, 'update traits data'
                    );
                }
                alert('特性数据同步成功，共 ' + repos.length + ' 个仓库');
            } catch (err) {
                alert('同步失败：' + (err && err.message ? err.message : err));
            } finally {
                isSyncing.value = false;
            }
        };

        /* ---------------------------------------------------------------- 初始化 */
        onMounted(() => {
            const savedConfig = localStorage.getItem('vowmon_sync_config');
            if (savedConfig) {
                try {
                    const parsed = JSON.parse(savedConfig);
                    config.value = Object.assign({}, config.value, parsed);
                } catch (err) {
                    console.warn('同步配置解析失败', err);
                }
            }

            const savedTraits = localStorage.getItem('vowmon_traits_data');
            if (savedTraits) {
                try {
                    traits.value = JSON.parse(savedTraits);
                } catch (err) {
                    console.warn('本地特性数据解析失败，改用默认数据', err);
                    traits.value = JSON.parse(JSON.stringify(allTraitsData));
                }
            } else {
                traits.value = JSON.parse(JSON.stringify(allTraitsData));
            }

            const savedPets = localStorage.getItem('vowmon_pets_data');
            if (savedPets) {
                try {
                    pets.value = JSON.parse(savedPets);
                } catch (err) {
                    pets.value = JSON.parse(JSON.stringify(allPetsData));
                }
            } else {
                pets.value = JSON.parse(JSON.stringify(allPetsData));
            }

            // 点击「显示列」浮层以外的地方时收起面板。
            // 按钮与面板本身都写了 @click.stop，这里再用 closest 兜一层，
            // 确保面板内的勾选点击永远不会被误判成「外部点击」，否则复选框切换会被打断。
            document.addEventListener('click', (e) => {
                const el = e.target && e.target.closest ? e.target : null;
                if (!(el && el.closest('.col-settings-wrap'))) showColSettings.value = false;
            });
        });

        // 弹窗关闭统一收口：遮罩点击 / Esc / 关闭按钮 都走这里（见 js/common-ui.js）
        const closeModal = (target) => {
            if (target === 'edit') showModal.value = false;
            else if (target === 'pokemon') showPokemonSearchModal.value = false;
            else if (target === 'delete') showDeleteModal.value = false;
        };

        return {
            typeData: typeDataList,
            getTypeIcon, getTypeColor, toggleType,
            showColSettings, allColumns, visibleCols,
            traits,
            isSyncing,
            showModal,
            isEdit,
            form,
            pokemonsStr,
            showDeleteModal,
            deleteTargetName,
            showPokemonSearchModal,
            pokemonSearchQuery,
            pokemonPage,
            filteredPokemons,
            paginatedPokemons,
            closeModal,
            openEditor,
            saveTrait,
            openDeleteConfirm,
            confirmDelete,
            openPokemonModal,
            selectPokemon,
            syncToGitHub
        };
    }
}).mount('#app');
