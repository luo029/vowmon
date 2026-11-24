/* ==========================================================================
   Vowmon Wiki 后台 —— 御兽精灵档案管理（书中精灵个体）
   --------------------------------------------------------------------------
   数据链路（与 admin-lore / admin-skills 一致）：
     编辑 -> VowmonStore.save('individuals', { individuals }) 写本机镜像（前台立即生效）
          -> 点「一键同步」把 individuals-data.json 推到 GitHub 数据仓库
     前台 individuals.html 读取生效。
   等级八阶：初灵1-15 / 升灵16-36 / 族尊37-50 / 基座51-60 /
             灵相61-70 / 律冠71-89 / 元灵90-99 / 元100
   注意：模板里用到的每个方法/状态都必须在 setup 的 return 里
         （undefined 引用会让生产版渲染静默失效，表现为弹窗打不开/白屏）。
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
const STAGE_COLORS = {
    '初灵': '#8bc34a', '升灵': '#26a69a', '族尊': '#5c6bc0', '基座': '#ba7517',
    '灵相': '#1971c2', '律冠': '#7048e8', '元灵': '#d4a017', '元': '#e24b4a'
};
const BLOODLINES = ['无', '异变', '黑暗', '光明', '属性'];
const BLOOD_COLORS = { '异变': '#7F77DD', '黑暗': '#37474F', '光明': '#d4a017', '属性': '#0F6E56' };

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

        /* ------------------------------------------------------- 图片与属性 */
        let imgBase = '';
        try {
            const cfg = JSON.parse(localStorage.getItem('vowmon_sync_config') || '{}') || {};
            const raw = String(cfg.imgCdnBase || (window.VOWMON_SITE_CONFIG || {}).imgCdnBase || '').trim().replace(/\/+$/, '');
            imgBase = raw ? raw + '/' : '';
        } catch (e) { imgBase = ''; }
        const getImgUrl = (path) => {
            if (!path) return '';
            if (/^(https?:)?\/\//i.test(path) || String(path).indexOf('data:') === 0) return path;
            return imgBase + String(path).replace(/^\/+/, '');
        };
        const typeMap = (typeof typeData !== 'undefined' && Array.isArray(typeData))
            ? new Map(typeData.map(t => [t.name, t])) : new Map();
        const typeColor = (t) => (typeMap.get(t) || {}).color || '#cbd5e0';

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
        const speciesOf = (id) => petById.value.get(String(id)) || null;
        const speciesLabel = (id) => {
            const s = speciesOf(id);
            return s ? (s.name + ' #' + s.id) : (id ? '#' + id : '未关联种族');
        };
        const speciesImageOf = (item) => {
            const s = speciesOf(item && item.speciesId);
            return s && s.image ? getImgUrl(s.image) : '';
        };
        const ownerLabel = (id) => {
            const c = chaById.value.get(String(id));
            return c ? c.name : (id ? '未知主人' : '无主 / 未定');
        };
        const cardColor = (item) => {
            const s = speciesOf(item && item.speciesId);
            const t = s && s.types && s.types[0] ? typeColor(s.types[0]) : '#cbd5e0';
            return t + '4d';
        };
        const stageColorOf = (item) => STAGE_COLORS[stageNameOf(item && item.level)] || '#718096';
        const stageColorOfName = (name) => STAGE_COLORS[name] || '#718096';
        const bloodColorOf = (b) => BLOOD_COLORS[b] || '#90a4ae';

        const traitNames = computed(() =>
            (typeof allTraitsData !== 'undefined' && Array.isArray(allTraitsData))
                ? allTraitsData.map(t => t.name).filter(Boolean) : []
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

        /* ------------------------------------------------------------ 统计 */
        const avgLevel = computed(() => {
            const arr = individuals.value.filter(p => p.level > 0);
            if (!arr.length) return '—';
            return Math.round(arr.reduce((a, p) => a + p.level, 0) / arr.length);
        });
        const bloodCount = computed(() =>
            individuals.value.filter(p => p.bloodline && p.bloodline !== '无').length
        );
        const ownerCount = computed(() =>
            individuals.value.filter(p => p.ownerId).length
        );

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
        /* 模板里的「选择种族」按钮（必须是已定义的方法，见文件头注释） */
        const openSpeciesModal = () => {
            speciesSearchInput.value = '';
            showSpeciesModal.value = true;
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
            let pool = (pets.value || []).filter(p => p.name)
                .map(p => ({ id: String(p.id), name: String(p.name), img: p.image ? getImgUrl(p.image) : '' }));
            if (kw) {
                pool = pool.filter(p => p.name.toLowerCase().includes(kw) || p.id.includes(kw));
            }
            return pool.slice(0, 120);
        });
        const pickSpecies = (pet) => {
            form.value.speciesId = pet.id;
            showSpeciesModal.value = false;
        };
        const formSpeciesLabel = computed(() => {
            const s = speciesOf(form.value.speciesId);
            return s ? { name: s.name, id: '#' + s.id } : {};
        });
        const formSpeciesImage = computed(() => speciesImageOf(form.value));
        const formStageColor = computed(() => stageColorOfName(stageNameOf(form.value.level)));

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

            try {
                const mirror = window.VowmonStore ? VowmonStore.getMirror('individuals') : null;
                if (mirror && Array.isArray(mirror.individuals)) {
                    individuals.value = mirror.individuals.map(normalizeIndividual);
                } else {
                    individuals.value = ((typeof allIndividualsData !== 'undefined' && allIndividualsData) || []).map(normalizeIndividual);
                }
                characters.value = ((typeof allCharactersData !== 'undefined' && allCharactersData) || []).map(c => Object.assign({}, c));
                pets.value = (typeof allPetsData !== 'undefined' && allPetsData) || [];
            } catch (err) {
                console.error('御兽精灵档案初始化失败', err);
            }
        });

        return {
            config, individuals, characters, isSyncing,
            showModal, isEdit, form, traitInput, itemsInput,
            searchName, filteredList, indexOfItem,
            avgLevel, bloodCount, ownerCount,
            speciesLabel, speciesImageOf, ownerLabel,
            cardColor, stageColorOf, stageColorOfName, bloodColorOf,
            stageName: stageNameOf, RANK_BANDS,
            openEditor, addTrait, removeTrait, addSkill, saveItem,
            openDeleteConfirm, closeModal,
            showSpeciesModal, speciesSearchInput, filteredSpecies, pickSpecies,
            openSpeciesModal, formSpeciesLabel, formSpeciesImage, formStageColor,
            syncToGitHub, pullFromRepo
        };
    }
}).mount('#app');
});
