/* ==========================================================================
   Vowmon Wiki 后台 —— 御兽人物档案管理（书中角色）
   --------------------------------------------------------------------------
   数据链路（与 admin-individuals 一致）：
     编辑 -> VowmonStore.save('characters', { characters }) 写本机镜像（前台立即生效）
          -> 点「一键同步」把 characters-data.json 推到 GitHub 数据仓库
     前台 characters.html 读取生效。
   人物持有精灵通过 petIds 引用御兽精灵档案的 id。
   ========================================================================== */

const { createApp, ref, computed, onMounted } = Vue;

function normalizeCharacter(c) {
    const p = Object.assign({}, c || {});
    p.id = String(p.id == null ? '' : p.id);
    p.name = String(p.name == null ? '' : p.name);
    p.title = String(p.title == null ? '' : p.title);
    p.faction = String(p.faction == null ? '' : p.faction);
    p.money = Number(p.money) || 0;
    p.inventory = Array.isArray(p.inventory)
        ? p.inventory.map(it => (typeof it === 'string' ? { name: it, note: '' } : { name: String((it && it.name) || '').trim(), note: String((it && it.note) || '') }))
            .filter(it => it.name)
        : [];
    p.petIds = Array.isArray(p.petIds) ? p.petIds.map(String).filter(Boolean) : [];
    p.bio = String(p.bio == null ? '' : p.bio);
    p.notes = String(p.notes == null ? '' : p.notes);
    return p;
}

VowmonData.ready(['characters', 'individuals'], { fresh: true }).then(function () {

createApp({
    setup() {
        const config = ref({ token: '', owner: '', dataRepos: 'vowmon_data', imgRepos: 'vowmon_imgs', imgCdnBase: '' });

        const characters = ref([]);
        const individuals = ref([]);
        const isSyncing = ref(false);

        const showModal = ref(false);
        const isEdit = ref(false);
        const editIndex = ref(-1);
        const deleteTargetIndex = ref(-1);
        const showPetModal = ref(false);
        const petSearchInput = ref('');

        const defaultForm = () => ({
            id: '', name: '', title: '', faction: '', money: 0,
            inventory: [], petIds: [], bio: '', notes: ''
        });
        const form = ref(defaultForm());

        /* ------------------------------------------------------------- 工具 */
        const indById = computed(() => {
            const m = new Map();
            (individuals.value || []).forEach(p => m.set(String(p.id), p));
            return m;
        });
        const speciesLabel = (id) => {
            const s = (typeof allPetsData !== 'undefined' ? allPetsData : []).find(x => String(x.id) === String(id));
            return s ? (s.name + ' #' + s.id) : (id ? '#' + id : '未关联种族');
        };
        const indLabel = (p) => p.nickname + (p.speciesId ? '（' + speciesLabel(p.speciesId) + '）' : '');
        const pickedPets = computed(() => form.value.petIds.map(id => indById.value.get(String(id))).filter(Boolean));

        const fmtMoney = (n) => Number(n || 0).toLocaleString('zh-CN');

        const nextId = () => {
            let max = 0;
            characters.value.forEach(item => {
                const num = parseInt(String(item.id || '').replace(/\D/g, ''), 10);
                if (!isNaN(num) && num > max) max = num;
            });
            return 'cha' + String(max + 1).padStart(3, '0');
        };

        const saveLocal = () => {
            if (window.VowmonStore) {
                VowmonStore.save('characters', { characters: characters.value });
            }
        };

        /* ------------------------------------------------------------- 列表 */
        const searchName = ref('');
        const filteredList = computed(() => {
            const kw = searchName.value.trim().toLowerCase();
            if (!kw) return characters.value;
            return characters.value.filter(c =>
                [c.name, c.faction, c.title, c.bio].join(' ').toLowerCase().includes(kw)
            );
        });
        const indexOfItem = (item) => characters.value.indexOf(item);

        /* ------------------------------------------------------------- 编辑 */
        const openEditor = (item, index) => {
            if (item && typeof index === 'number') {
                isEdit.value = true;
                editIndex.value = index;
                form.value = normalizeCharacter(item);
            } else {
                isEdit.value = false;
                editIndex.value = -1;
                form.value = defaultForm();
                form.value.id = nextId();
            }
            showPetModal.value = false;
            showModal.value = true;
        };

        const addInventory = () => { form.value.inventory.push({ name: '', note: '' }); };

        const saveItem = () => {
            if (!form.value.name || !String(form.value.name).trim()) {
                VowmonDialog.toast('请填写姓名', 'warning');
                return;
            }
            const item = normalizeCharacter(form.value);
            if (isEdit.value && editIndex.value > -1) {
                characters.value.splice(editIndex.value, 1, item);
            } else {
                characters.value.push(item);
            }
            saveLocal();
            showModal.value = false;
            VowmonDialog.toast('已保存到本机，前台已生效。改完记得点「一键同步」推到仓库', 'success', { duration: 3600 });
        };

        const openDeleteConfirm = (index, name) => {
            deleteTargetIndex.value = index;
            VowmonDialog.confirm(
                '确定要删除御兽人物 <strong>' + VowmonDialog.esc(name || '') + '</strong> 吗？<br>他/她名下的御兽精灵档案不会被删除，但会变成「无主」状态。',
                { type: 'danger', title: '确认删除', okText: '确认删除', cancelText: '再想想', html: true }
            ).then((ok) => {
                if (ok && deleteTargetIndex.value > -1) {
                    characters.value.splice(deleteTargetIndex.value, 1);
                    saveLocal();
                    VowmonDialog.toast('已删除', 'success');
                }
                deleteTargetIndex.value = -1;
            });
        };

        /* --------------------------------------------------- 精灵关联（多选） */
        const filteredPets = computed(() => {
            const kw = petSearchInput.value.trim().toLowerCase();
            const pool = individuals.value;
            if (!kw) return pool;
            return pool.filter(p =>
                [p.nickname, speciesLabel(p.speciesId), String(p.id)].join(' ').toLowerCase().includes(kw)
            );
        });
        const togglePet = (p) => {
            const id = String(p.id);
            const i = form.value.petIds.indexOf(id);
            if (i > -1) form.value.petIds.splice(i, 1);
            else form.value.petIds.push(id);
        };
        const removePet = (id) => {
            form.value.petIds = form.value.petIds.filter(x => x !== String(id));
        };
        const openPetModal = () => {
            petSearchInput.value = '';
            showPetModal.value = true;
        };

        const closeModal = (target) => {
            if (target === 'edit') showModal.value = false;
            if (target === 'pet') showPetModal.value = false;
        };

        /* ------------------------------------------------------------- 同步 */
        const targetRepos = () => String(config.value.dataRepos || '')
            .split(/[\s,，]+/).map(s => s.trim()).filter(Boolean);

        const syncToGitHub = async () => {
            if (!config.value.token || !config.value.owner || targetRepos().length === 0) {
                VowmonDialog.alert('请先在「精灵管理 → 同步配置」里填写 Token、用户名和数据仓库名', { type: 'warning', title: '还没配置好' });
                return;
            }
            isSyncing.value = true;
            try {
                const content = JSON.stringify({ characters: characters.value }, null, 1) + '\n';
                for (const repo of targetRepos()) {
                    await GitHubSync.uploadFile(config.value.token, config.value.owner, repo, 'characters-data.json', content, 'update characters data');
                }
                if (window.VowmonStore) VowmonStore.markSynced('characters');
                VowmonDialog.toast('御兽人物档案同步成功，前台一两分钟后更新', 'success');
            } catch (err) {
                VowmonDialog.alert('同步失败，请检查 Token 权限和仓库名。', {
                    type: 'danger', title: '同步失败',
                    detail: err && err.message ? err.message : String(err)
                });
            } finally {
                isSyncing.value = false;
            }
        };

        const pullFromRepo = async () => {
            const cfg = config.value;
            const repo = targetRepos()[0];
            if (!cfg.token || !cfg.owner || !repo) {
                VowmonDialog.alert('请先在「精灵管理 → 同步配置」里填写 Token、用户名和数据仓库名', { type: 'warning', title: '还没配置好' });
                return;
            }
            const ok = await VowmonDialog.confirm(
                '将从「' + repo + '」读取 characters-data.json，并覆盖本机未同步的改动。继续？',
                { type: 'warning', title: '从数据仓库拉取', okText: '拉取' }
            );
            if (!ok) return;
            isSyncing.value = true;
            try {
                const bag = await GitHubSync.downloadJson(cfg.token, cfg.owner, repo, 'characters-data.json');
                if (!bag || !Array.isArray(bag.characters)) throw new Error('仓库里没有 characters-data.json，或字段不是 characters 数组');
                characters.value = bag.characters.map(normalizeCharacter);
                if (window.VowmonStore) VowmonStore.replace('characters', { characters: characters.value });
                VowmonDialog.toast('已从 ' + repo + ' 拉取 ' + characters.value.length + ' 位御兽人物', 'success', { duration: 3200 });
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
                if (savedConfig) config.value = Object.assign({}, config.value, JSON.parse(savedConfig));
            } catch (err) { console.warn('同步配置解析失败', err); }

            const mirror = window.VowmonStore ? VowmonStore.getMirror('characters') : null;
            if (mirror && Array.isArray(mirror.characters)) {
                characters.value = mirror.characters.map(normalizeCharacter);
            } else {
                characters.value = (allCharactersData || []).map(normalizeCharacter);
            }
            individuals.value = (allIndividualsData || []).map(p => Object.assign({}, p));
        });

        return {
            config, characters, isSyncing,
            showModal, isEdit, form,
            searchName, filteredList, indexOfItem,
            fmtMoney, indLabel, pickedPets,
            openEditor, addInventory, saveItem, openDeleteConfirm, closeModal,
            showPetModal, petSearchInput, filteredPets, togglePet, removePet, openPetModal,
            speciesLabel,
            syncToGitHub, pullFromRepo
        };
    }
}).mount('#app');
});
