/* ==========================================================================
   Vowmon Wiki 后台 —— 特性管理逻辑
   --------------------------------------------------------------------------
   数据链路（与 admin.js 保持一致）：
     编辑 -> 写入 localStorage['vowmon_traits_data']
          -> 点「一键同步」把 traits-data.js 推到 GitHub 数据仓库
          -> 前台 traits.html 读取同源 traits-data.js 生效
   ========================================================================== */

const { createApp, ref, computed, onMounted, watch } = Vue;
VowmonData.ready(['pets','traits'], { fresh: true }).then(function () {

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
            pokemons: [],        // 常规特性持有者（精灵名）
            hiddenPokemons: [],  // 隐藏特性持有者（精灵名）
            effect: ''
        });

        // 规整一批特性数据：老数据可能缺 pokemons / hiddenPokemons 字段，统一补齐，
        // 否则表格渲染 .slice 会抛错导致整页白屏
        const normalizeTraitList = (list) => (Array.isArray(list) ? list : []).map(t => ({
            ...t,
            types: Array.isArray(t.types) ? t.types : [],
            pokemons: Array.isArray(t.pokemons) ? t.pokemons : [],
            hiddenPokemons: Array.isArray(t.hiddenPokemons) ? t.hiddenPokemons : []
        }));
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
            // 写入本机镜像：前台（同一台电脑）立刻就能看到这次改动
            if (window.VowmonStore) VowmonStore.save('traits', { traits: traits.value });
        };

        /* ---------------------------------------------------------------- 编辑 */
        const openEditor = (trait, index) => {
            if (trait && typeof index === 'number') {
                isEdit.value = true;
                editIndex.value = index;
                const copy = JSON.parse(JSON.stringify(trait));
                if (!Array.isArray(copy.types)) copy.types = [];
                if (!Array.isArray(copy.pokemons)) copy.pokemons = [];
                if (!Array.isArray(copy.hiddenPokemons)) copy.hiddenPokemons = [];
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
                VowmonDialog.toast('请填写特性名称', 'warning');
                return;
            }
            const item = JSON.parse(JSON.stringify(form.value));
            item.name = String(item.name).trim();
            if (!item.id) item.id = nextTraitId();
            if (!Array.isArray(item.pokemons)) item.pokemons = [];
            if (!Array.isArray(item.hiddenPokemons)) item.hiddenPokemons = [];

            if (isEdit.value && editIndex.value > -1) {
                traits.value.splice(editIndex.value, 1, item);
            } else {
                traits.value.unshift(item);
            }

            saveLocal();
            syncTraitToPets(item);
            showModal.value = false;
            VowmonDialog.toast('已保存，并同步到相关精灵档案', 'success');
        };

        /* ---------------------------------------------------------------- 删除 */
        const openDeleteConfirm = (index, name) => {
            deleteTargetIndex.value = index;
            deleteTargetName.value = name;
            VowmonDialog.confirm(
                `确定要删除特性 <strong>${VowmonDialog.esc(name)}</strong> 吗？`,
                { type: 'danger', title: '确认删除', okText: '确认删除', cancelText: '再想想', html: true }
            ).then((ok) => {
                if (ok) confirmDelete();
            });
        };

        const confirmDelete = () => {
            if (deleteTargetIndex.value > -1) {
                traits.value.splice(deleteTargetIndex.value, 1);
                saveLocal();
                VowmonDialog.toast('已删除', 'success');
            }
            deleteTargetIndex.value = -1;
        };

        /* ------------------------------------------------------------ 选精灵（多选 + 普通/隐藏切换） */
        const openPokemonModal = () => {
            pokemonSearchQuery.value = '';
            pokemonPage.value = 1;
            showPokemonSearchModal.value = true;
        };

        // 是否已勾选（常规或隐藏都算）
        const isPokemonPicked = (pet) => {
            const name = pet && pet.name;
            if (!name) return false;
            return form.value.pokemons.includes(name) || form.value.hiddenPokemons.includes(name);
        };

        // 点击候选：勾选 → 加入常规；再次点击 → 移除（常规/隐藏都移除）
        const togglePokemonSelect = (pet) => {
            const name = pet && pet.name;
            if (!name) return;
            if (isPokemonPicked(pet)) {
                form.value.pokemons = form.value.pokemons.filter(n => n !== name);
                form.value.hiddenPokemons = form.value.hiddenPokemons.filter(n => n !== name);
            } else {
                form.value.pokemons.push(name);
            }
        };

        // 常规 ↔ 隐藏 互相切换
        const flipPokemonSlot = (name) => {
            if (form.value.pokemons.includes(name)) {
                form.value.pokemons = form.value.pokemons.filter(n => n !== name);
                if (!form.value.hiddenPokemons.includes(name)) form.value.hiddenPokemons.push(name);
            } else {
                form.value.hiddenPokemons = form.value.hiddenPokemons.filter(n => n !== name);
                if (!form.value.pokemons.includes(name)) form.value.pokemons.push(name);
            }
        };

        const removePokemon = (name) => {
            form.value.pokemons = form.value.pokemons.filter(n => n !== name);
            form.value.hiddenPokemons = form.value.hiddenPokemons.filter(n => n !== name);
        };

        // 保存特性时，把勾选结果双向同步进精灵档案：
        //   常规 → 依次落位 pet.ability / pet.ability2（已占则填另一个）
        //   隐藏 → pet.hiddenAbility
        //   从勾选中移除的精灵，对应槽位上的该特性会被清掉
        const syncTraitToPets = (item) => {
            const name = item.name;
            const effect = item.effect || '';
            const normal = new Set(item.pokemons || []);
            const hidden = new Set(item.hiddenPokemons || []);
            pets.value.forEach(pet => {
                if (pet.ability === name && !normal.has(pet.name)) { pet.ability = ''; pet.abilityEffect = ''; }
                if (pet.ability2 === name && !normal.has(pet.name)) { pet.ability2 = ''; pet.ability2Effect = ''; }
                if (pet.hiddenAbility === name && !hidden.has(pet.name)) { pet.hiddenAbility = ''; pet.hiddenAbilityEffect = ''; }
                if (normal.has(pet.name) && pet.ability !== name && pet.ability2 !== name) {
                    if (!pet.ability) { pet.ability = name; if (!pet.abilityEffect) pet.abilityEffect = effect; }
                    else { pet.ability2 = name; if (!pet.ability2Effect) pet.ability2Effect = effect; }
                }
                if (hidden.has(pet.name) && pet.hiddenAbility !== name) {
                    pet.hiddenAbility = name;
                    if (!pet.hiddenAbilityEffect) pet.hiddenAbilityEffect = effect;
                }
            });
            localStorage.setItem('vowmon_pets_data', JSON.stringify(pets.value));
            if (window.VowmonStore) VowmonStore.save('pets', { pets: pets.value });
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
                .map(item => item.trim())
                .filter(Boolean);

            if (repos.length === 0) {
                VowmonDialog.toast('请先在「精灵管理 → 同步配置」里填写数据仓库名', 'warning', { duration: 3400 });
                return;
            }

            isSyncing.value = true;
            const content = JSON.stringify({ traits: traits.value }, null, 4) + '\n';

            try {
                for (const repo of repos) {
                    await GitHubSync.uploadFile(
                        cfg.token, cfg.owner, repo, 'traits-data.json',
                        content, 'update traits data'
                    );
                }
                VowmonDialog.toast('特性数据同步成功，共 ' + repos.length + ' 个仓库', 'success');
            } catch (err) {
                VowmonDialog.alert('特性数据同步失败，请检查 Token 权限和仓库名。', {
                    type: 'danger',
                    title: '同步失败',
                    detail: err && err.message ? err.message : String(err)
                });
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
                    traits.value = normalizeTraitList(JSON.parse(savedTraits));
                } catch (err) {
                    console.warn('本地特性数据解析失败，改用默认数据', err);
                    traits.value = normalizeTraitList(JSON.parse(JSON.stringify(allTraitsData)));
                }
            } else {
                traits.value = normalizeTraitList(JSON.parse(JSON.stringify(allTraitsData)));
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
        };

        // 从数据仓库拉取最新数据（数据仓库是唯一数据源，会覆盖本机草稿）
        const pullFromRepo = async () => {
            const cfg = config.value;
            const repo = String(cfg.dataRepos || '').split(/[\s,，]+/).map(s => s.trim()).filter(Boolean)[0];
            if (!cfg.token || !cfg.owner || !repo) {
                VowmonDialog.alert('请先在「精灵管理 → 同步配置」里填写 Token、用户名和数据仓库名', { type: 'warning', title: '还没配置好' });
                return;
            }
            const ok = await VowmonDialog.confirm(
                '将从「' + repo + '」读取 traits-data.json，并覆盖本机未同步的改动。继续？',
                { type: 'warning', title: '从数据仓库拉取', okText: '拉取' }
            );
            if (!ok) return;

            isSyncing.value = true;
            try {
                const bag = await GitHubSync.downloadJson(cfg.token, cfg.owner, repo, 'traits-data.json');
                if (!bag || !Array.isArray(bag.traits)) throw new Error('仓库里没有 traits-data.json，或字段不是 traits 数组');

                traits.value = normalizeTraitList(JSON.parse(JSON.stringify(bag.traits)));
                localStorage.setItem('vowmon_traits_data', JSON.stringify(traits.value));
                if (window.VowmonStore) VowmonStore.replace('traits', { traits: traits.value });
                VowmonDialog.toast('已从 ' + repo + ' 拉取 ' + traits.value.length + ' 条特性', 'success', { duration: 3200 });
            } catch (err) {
                VowmonDialog.alert('拉取失败，请检查 Token 权限和仓库名。', {
                    type: 'danger', title: '拉取失败', detail: err && err.message ? err.message : String(err)
                });
            } finally {
                isSyncing.value = false;
            }
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
            isPokemonPicked, togglePokemonSelect, flipPokemonSlot, removePokemon,
            syncToGitHub,
            pullFromRepo
        };
    }
}).mount('#app');
});
