/* ==========================================================================
   Vowmon Wiki 后台 —— 御兽精灵档案管理（书中精灵个体）
   --------------------------------------------------------------------------
   数据链路（与 admin-lore / admin-skills 一致）：
     编辑 -> VowmonStore.save('individuals', { individuals }) 写本机镜像（前台立即生效）
          -> 点「一键同步」把 individuals-data.json 推到 GitHub 数据仓库
     前台 individuals.html 读取生效。
   等级八阶：初灵1-15 / 升灵16-36 / 族尊37-50 / 基座51-60 /
             灵相61-70 / 律冠71-89 / 元灵90-99 / 元100
   ========================================================================== */

const { createApp, ref, computed, onMounted } = Vue;

const RANK_BANDS = [
    { name: '初灵', min: 1,   max: 15 },
    { name: '升灵', min: 16,  max: 36 },
    { name: '族尊', min: 37,  max: 50 },
    { name: '基座', min: 51,  max: 60 },
    { name: '灵相', min: 61,  max: 70 },
    { name: '律冠', min: 71,  max: 89 },
    { name: '元灵', min: 90,  max: 99 },
    { name: '元',   min: 100, max: 9999 }
];
const BLOODLINES = ['无', '异变', '黑暗', '光明', '属性'];

function stageNameOf(level) {
    const lv = Number(level) || 0;
    if (lv <= 0) return '未记录';
    const band = RANK_BANDS.find(b => lv >= b.min && lv <= b.max);
    return band ? band.name : '未记录';
}

function normalizeIndividual(v) {
    const p = Object.assign({}, v || {});
    p.id = String(p.id == null ? '' : p.id);
    p.nickname = String(p.nickname == null ? '' : p.nickname);
    p.speciesId = String(p.speciesId == null ? '' : p.speciesId);
    p.gender = String(p.gender == null ? '' : p.gender);
    p.personality = String(p.personality == null ? '' : p.personality);
    p.traits = Array.isArray(p.traits) ? p.traits.map(t => String(t)).filter(t => t && t.trim()) : [];
    p.skills = Array.isArray(p.skills)
        ? p.skills.map(s => ({
            name: String((s && s.name) || '').trim(),
            level: ['入门', '熟练', '专精', '完美'].includes(s && s.level) ? s.level : '入门',
            mode: ['迅疾', '刚猛'].includes(s && s.mode) ? s.mode : ''
        })).filter(s => s.name)
        : [];
    p.bloodline = BLOODLINES.includes(p.bloodline) ? p.bloodline : '无';
    p.bloodlineSkill = String(p.bloodlineSkill == null ? '' : p.bloodlineSkill);
    p.bloodlineAttr = String(p.bloodlineAttr == null ? '' : p.bloodlineAttr);
    p.level = Number(p.level) || 0;
    p.ownerId = String(p.ownerId == null ? '' : p.ownerId);
    p.items = Array.isArray(p.items)
        ? p.items.map(t => String(t).trim()).filter(t => t && t.trim())
        : String(p.items == null ? '' : p.items).split(/[,，、]/).map(t => t.trim()).filter(Boolean);
    p.experience = String(p.experience == null ? '' : p.experience);
    p.notes = String(p.notes == null ? '' : p.notes);
    return p;
}

VowmonData.ready(['individuals', 'pets', 'characters'], { fresh: true }).then(function () {

createApp({
    setup() {
        /* ------------------------------------------------------------ 同步配置 */
        const config = ref({ token: '', owner: '', dataRepos: 'vowmon_data', imgRepos: 'vowmon_imgs', imgCdnBase: '' });

        /* ---------------------------------------------------------------- 数据 */
        const individuals = ref([]);
        const characters = ref([]);
        const pets = ref([]);
        const isSyncing = ref(false);

        /* ---------------------------------------------------------------- 弹窗 */
        const showModal = ref(false);
        const isEdit = ref(false);
        const editIndex = ref(-1);
        const deleteTargetIndex = ref(-1);
        const showSpeciesModal = ref(false);
        const speciesSearchInput = ref('');

        const defaultForm = () => ({
            id: '', nickname: '', speciesId: '', gender: '',
            personality: '', traits: [], skills: [],
            bloodline: '无', bloodlineSkill: '', bloodlineAttr: '',
            level: 1, ownerId: '', items: [],
            experience: '', notes: ''
        });
        const form = ref(defaultForm());
        const traitInput = ref('');
        const itemsInput = ref('');

        /* ------------------------------------------------------------- 工具 */
        const petById = computed(() => {
            const m = new Map();
            (pets.value || []).forEach(p => m.set(String(p.id), p));
            return m;
        });
        const chaById = computed(() => {
            const m = new Map();
            (characters.value || []).forEach(c => m.set(c.id, c));
            return m;
        });
        const speciesLabel = (id) => {
            const s = petById.value.get(String(id));
            return s ? (s.name + ' #' + s.id) : (id ? '#' + id : '未关联');
        };
        const ownerLabel = (id) => {
            const c = chaById.value.get(String(id));
            return c ? c.name : (id ? '未知主人' : '—');
        };
        const traitNames = computed(() =>
            (typeof allTraitsData !== 'undefined' ? allTraitsData : []).map(t => t.name).filter(Boolean)
        );

        const nextId = () => {
            let max = 0;
            individuals.value.forEach(item => {
                const num = parseInt(String(item.id || '').replace(/\D/g, ''), 10);
                if (!isNaN(num) && num > max) max = num;
            });
            return 'ind' + String(max + 1).padStart(3, '0');
        };

        const saveLocal = () => {
            if (window.VowmonStore) {
                VowmonStore.save('individuals', { individuals: individuals.value });
            }
        };

        /* ------------------------------------------------------------- 列表 */
        const searchName = ref('');
        const filteredList = computed(() => {
            const kw = searchName.value.trim().toLowerCase();
            if (!kw) return individuals.value;
            return individuals.value.filter(p =>
                [p.nickname, speciesLabel(p.speciesId), ownerLabel(p.ownerId), p.personality, p.experience]
                    .join(' ').toLowerCase().includes(kw)
            );
        });
        const indexOfItem = (item) => individuals.value.indexOf(item);

        /* ------------------------------------------------------------- 编辑 */
        const openEditor = (item, index) => {
            if (item && typeof index === 'number') {
                isEdit.value = true;
                editIndex.value = index;
                form.value = normalizeIndividual(item);
            } else {
                isEdit.value = false;
                editIndex.value = -1;
                form.value = defaultForm();
                form.value.id = nextId();
            }
            traitInput.value = '';
            itemsInput.value = form.value.items.join(', ');
            showSpeciesModal.value = false;
            showModal.value = true;
        };

        const addTrait = () => {
            const name = traitInput.value.trim();
            if (!name) return;
            if (!form.value.traits.includes(name)) form.value.traits.push(name);
            traitInput.value = '';
        };
        const removeTrait = (name) => {
            form.value.traits = form.value.traits.filter(t => t !== name);
        };
        const addSkill = () => { form.value.skills.push({ name: '', level: '入门', mode: '' }); };

        const saveItem = () => {
            if (!form.value.nickname || !String(form.value.nickname).trim()) {
                VowmonDialog.toast('请填写昵称', 'warning');
                return;
            }
            const item = normalizeIndividual(form.value);
            item.items = itemsInput.value.split(/[,，、]/).map(t => t.trim()).filter(Boolean);
            if (isEdit.value && editIndex.value > -1) {
                individuals.value.splice(editIndex.value, 1, item);
            } else {
                individuals.value.push(item);
            }
            saveLocal();
            showModal.value = false;
            VowmonDialog.toast('已保存到本机，前台已生效。改完记得点「一键同步」推到仓库', 'success', { duration: 3600 });
        };

        const openDeleteConfirm = (index, name) => {
            deleteTargetIndex.value = index;
            VowmonDialog.confirm(
                '确定要删除御兽精灵 <strong>' + VowmonDialog.esc(name || '') + '</strong> 吗？<br>引用它的人物档案会失去这只精灵。',
                { type: 'danger', title: '确认删除', okText: '确认删除', cancelText: '再想想', html: true }
            ).then((ok) => {
                if (ok && deleteTargetIndex.value > -1) {
                    individuals.value.splice(deleteTargetIndex.value, 1);
                    saveLocal();
                    VowmonDialog.toast('已删除', 'success');
                }
                deleteTargetIndex.value = -1;
            });
        };

        /* --------------------------------------------------- 种族选择（单选） */
        const filteredSpecies = computed(() => {
            const kw = speciesSearchInput.value.trim().toLowerCase();
            const pool = (pets.value || []).map(p => ({ id: String(p.id), name: String(p.name || '') })).filter(p => p.name);
            if (!kw) return pool;
            return pool.filter(p => p.name.toLowerCase().includes(kw) || p.id.includes(kw));
        });
        const pickSpecies = (pet) => {
            form.value.speciesId = pet.id;
            showSpeciesModal.value = false;
        };

        const closeModal = (target) => {
            if (target === 'edit') showModal.value = false;
            if (target === 'species') showSpeciesModal.value = false;
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
                const content = JSON.stringify({ individuals: individuals.value }, null, 1) + '\n';
                for (const repo of targetRepos()) {
                    await GitHubSync.uploadFile(config.value.token, config.value.owner, repo, 'individuals-data.json', content, 'update individuals data');
                }
                if (window.VowmonStore) VowmonStore.markSynced('individuals');
                VowmonDialog.toast('御兽精灵档案同步成功，前台一两分钟后更新', 'success');
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
                '将从「' + repo + '」读取 individuals-data.json，并覆盖本机未同步的改动。继续？',
                { type: 'warning', title: '从数据仓库拉取', okText: '拉取' }
            );
            if (!ok) return;
            isSyncing.value = true;
            try {
                const bag = await GitHubSync.downloadJson(cfg.token, cfg.owner, repo, 'individuals-data.json');
                if (!bag || !Array.isArray(bag.individuals)) throw new Error('仓库里没有 individuals-data.json，或字段不是 individuals 数组');
                individuals.value = bag.individuals.map(normalizeIndividual);
                if (window.VowmonStore) VowmonStore.replace('individuals', { individuals: individuals.value });
                VowmonDialog.toast('已从 ' + repo + ' 拉取 ' + individuals.value.length + ' 位御兽精灵', 'success', { duration: 3200 });
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

            const mirror = window.VowmonStore ? VowmonStore.getMirror('individuals') : null;
            if (mirror && Array.isArray(mirror.individuals)) {
                individuals.value = mirror.individuals.map(normalizeIndividual);
            } else {
                individuals.value = (allIndividualsData || []).map(normalizeIndividual);
            }
            characters.value = (allCharactersData || []).map(c => Object.assign({}, c));
            pets.value = allPetsData || [];
        });

        return {
            config, individuals, characters, isSyncing,
            showModal, isEdit, form, traitInput, itemsInput,
            searchName, filteredList, indexOfItem,
            speciesLabel, ownerLabel, traitNames, stageName: stageNameOf,
            openEditor, addTrait, removeTrait, addSkill, saveItem,
            openDeleteConfirm, closeModal,
            showSpeciesModal, speciesSearchInput, filteredSpecies, pickSpecies,
            syncToGitHub, pullFromRepo
        };
    }
}).mount('#app');
});
