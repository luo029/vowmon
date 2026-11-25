/* ==========================================================================
   Vowmon Wiki 后台 —— 御兽精灵档案管理（书中精灵个体）
   --------------------------------------------------------------------------
   数据链路（与 admin-lore / admin-skills 一致）：
     编辑 -> VowmonStore.save('individuals', { individuals }) 写本机镜像（前台立即生效）
          -> 点「一键同步」把 individuals-data.json 推到 GitHub 数据仓库
     前台 individuals.html 读取生效。
   等级八阶默认：初灵1-15 / 升灵16-35 / 族尊36-50 / 基座51-60 /
             灵相61-70 / 律冠71-89 / 元灵90-99 / 元100起（不封顶）
   —— 阶段表已可在后台「阶段境界管理」自定义，见 js/stage-config.js
   字段说明：
     nickname  昵称（选填！很多精灵直接拿种族名当称呼）
     nature    性格（图鉴性格，影响种族值成长倾向，数据来自 natures-data.json）
     personality 习性（自由描述这只精灵的脾气，与「性格」是两回事）
     traits    特性（可从图鉴特性搜索选择，也可自由输入）
     skills    技能 + 熟练度（皆传模式迅疾/刚猛是出手时选的，档案里不存）
   注意：模板里用到的每个方法/状态都必须在 setup 的 return 里
         （undefined 引用会让生产版渲染静默失效，表现为弹窗打不开/白屏）。
   ========================================================================== */

const { createApp, ref, computed, onMounted, nextTick, watch } = Vue;

/* 阶段境界（等级 → 境界名/颜色）统一走 js/stage-config.js：
   后台「阶段境界管理」可自定义，这里不再硬编码 */
const BLOODLINES = ['无', '异变', '黑暗', '光明', '属性'];
const BLOOD_COLORS = { '异变': '#7F77DD', '黑暗': '#37474F', '光明': '#d4a017', '属性': '#0F6E56' };
const SKILL_LEVELS = ['入门', '熟练', '专精', '完美'];
const LV_META = {
    '入门': { color: '#90a4ae', desc: '80% 威力' },
    '熟练': { color: '#378ADD', desc: '满威力' },
    '专精': { color: '#7F77DD', desc: '不失败 · 可开皆传' },
    '完美': { color: '#BA7517', desc: '0.1s · 可组合技' }
};
const GENDERS = ['雄', '雌', '未知'];
const TAX_FIELDS = [
    { key: 'domain', label: '域' }, { key: 'kingdom', label: '界' },
    { key: 'phylum', label: '门' }, { key: 'class', label: '纲' },
    { key: 'order', label: '目' }, { key: 'family', label: '科' },
    { key: 'genus', label: '属' }, { key: 'species', label: '种' }
];
/* 阶位 → 可掌的阶元：初灵掌种、升灵掌属、族尊掌科、基座掌目、
   灵相掌纲、律冠掌门、元灵掌界、元掌域（八阶对八级阶元） */
const RANK_SCOPE = {
    '初灵': { key: 'species', label: '种' },
    '升灵': { key: 'genus',   label: '属' },
    '族尊': { key: 'family',  label: '科' },
    '基座': { key: 'order',   label: '目' },
    '灵相': { key: 'class',   label: '纲' },
    '律冠': { key: 'phylum',  label: '门' },
    '元灵': { key: 'kingdom', label: '界' },
    '元':   { key: 'domain',  label: '域' }
};
/* 权 / 位 / 力 三律标记：权柄（阶元）、生态位（阶位）、战力（等级） */
const RANK_FLAGS = [
    { key: 'quan', label: '权', name: '权柄', color: '#c2410c', tip: '权柄：掌辖某一层阶元的掌权者（族尊掌科、基座掌目、灵相掌纲…），掌权后同族借力，也背负整层的托举' },
    { key: 'wei',  label: '位', name: '生态位', color: '#7048e8', tip: '生态位：精灵在生态界中占据的位置，对应八阶阶位' },
    { key: 'li',   label: '力', name: '战力', color: '#1971c2', tip: '战力：自身的数值面板与技能，对应等级，修炼就能增长' }
];
/* 新建个体默认勾【位】【力】；【权】要明确是某层阶元的掌权者才勾 */
const DEFAULT_FLAGS = { quan: false, wei: true, li: true };

const stageNameOf = (level) => StageConfig.stageName(level);

function normalizeIndividual(v) {
    const p = Object.assign({}, v || {});
    p.id = String(p.id == null ? '' : p.id);
    p.nickname = String(p.nickname == null ? '' : p.nickname);
    p.speciesId = String(p.speciesId == null ? '' : p.speciesId);
    p.gender = GENDERS.includes(p.gender) ? p.gender : '';
    p.nature = String(p.nature == null ? '' : p.nature);
    p.personality = String(p.personality == null ? '' : p.personality);
    p.traits = Array.isArray(p.traits) ? p.traits.map(t => String(t)).filter(t => t && t.trim()).slice(0, 1) : [];
    p.skills = Array.isArray(p.skills)
        ? p.skills.map(s => ({
            name: String((s && s.name) || '').trim(),
            level: SKILL_LEVELS.includes(s && s.level) ? s.level : '入门'
        })).filter(s => s.name)
        : [];
    p.bloodline = BLOODLINES.includes(p.bloodline) ? p.bloodline : '无';
    p.bloodlineSkill = String(p.bloodlineSkill == null ? '' : p.bloodlineSkill);
    p.bloodlineAttr = String(p.bloodlineAttr == null ? '' : p.bloodlineAttr);
    p.level = Number(p.level) || 0;
    p.shiny = !!p.shiny;
    const rf = (p.rankFlags && typeof p.rankFlags === 'object') ? p.rankFlags : {};
    p.rankFlags = {
        quan: rf.quan === undefined ? DEFAULT_FLAGS.quan : !!rf.quan,
        wei:  rf.wei  === undefined ? DEFAULT_FLAGS.wei  : !!rf.wei,
        li:   rf.li   === undefined ? DEFAULT_FLAGS.li   : !!rf.li
    };
    /* 权柄自定义：法则 / 规则 / 抽象概念 / 外在表现 等，非阶元也能写 */
    p.scopeNote = String(p.scopeNote == null ? '' : p.scopeNote);
    const TAX_KEYS = ['domain', 'kingdom', 'phylum', 'class', 'order', 'family', 'genus', 'species'];
    const tax = (p.taxonomy && typeof p.taxonomy === 'object') ? p.taxonomy : {};
    p.taxonomy = {};
    TAX_KEYS.forEach(k => { p.taxonomy[k] = String(tax[k] == null ? '' : tax[k]); });
    p.ownerId = String(p.ownerId == null ? '' : p.ownerId);
    p.items = Array.isArray(p.items)
        ? p.items.map(t => String(t).trim()).filter(t => t && t.trim())
        : String(p.items == null ? '' : p.items).split(/[,，、]/).map(t => t.trim()).filter(Boolean);
    p.contractDate = String(p.contractDate == null ? '' : p.contractDate);
    p.contractChapter = String(p.contractChapter == null ? '' : p.contractChapter);
    p.milestones = Array.isArray(p.milestones)
        ? p.milestones.map(m => ({
            chapter: String((m && m.chapter) || '').trim(),
            title: String((m && m.title) || '').trim(),
            date: String((m && m.date) || '').trim(),
            note: String((m && m.note) || '').trim()
        })).filter(m => m.title || m.chapter || m.date)
        : [];
    p.experience = String(p.experience == null ? '' : p.experience);
    p.notes = String(p.notes == null ? '' : p.notes);
    /* 自定义属性（[{label, value}]，作家助手式自由字段） */
    p.customFields = Array.isArray(p.customFields)
        ? p.customFields.map(f => ({
            label: String((f && f.label) || '').trim(),
            value: String((f && f.value) || '')
        })).filter(f => f.label)
        : [];
    return p;
}

VowmonData.ready(['individuals', 'vows', 'characters', 'traits', 'natures', 'skills', 'bloodlineSkills', 'stages'], { fresh: true }).then(function () {

const app = createApp({
    setup() {
        /* ------------------------------------------------------------ 同步配置 */
        const config = ref({ token: '', owner: '', dataRepos: 'vowmon_data', imgRepos: 'vowmon_imgs', imgCdnBase: '' });

        /* ---------------------------------------------------------------- 数据 */
        const individuals = ref([]);
        const characters = ref([]);
        const vows = ref([]);
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
            nature: '', personality: '', traits: [], skills: [],
            bloodline: '无', bloodlineSkill: '', bloodlineAttr: '',
            level: 1, ownerId: '', items: [], shiny: false,
            rankFlags: { quan: true, wei: false, li: true },
            scopeNote: '',
            taxonomy: { domain: '', kingdom: '', phylum: '', class: '', order: '', family: '', genus: '', species: '' },
            contractDate: '', contractChapter: '', milestones: [],
            experience: '', customFields: []
        });
        const form = ref(defaultForm());
        const traitInput = ref('');
        const itemsInput = ref('');

        /* ------------------------------------ 自定义属性（含默认字段模板，模板存 individuals-data.json） */
        const fieldTemplates = ref([]);
        const addCustomField = (label) => { form.value.customFields.push({ label: String(label || '').trim(), value: '' }); };
        const removeCustomField = (i) => { form.value.customFields.splice(i, 1); };
        const knownFieldLabels = computed(() => {
            const set = new Set(fieldTemplates.value);
            individuals.value.forEach(c => (c.customFields || []).forEach(f => { if (f.label) set.add(f.label); }));
            const mine = new Set((form.value.customFields || []).map(f => f.label));
            return [...set].filter(l => !mine.has(l));
        });
        const isTemplateField = (label) => fieldTemplates.value.includes(label);
        const toggleTemplateField = (label) => {
            const l = String(label || '').trim();
            if (!l) return;
            const i = fieldTemplates.value.indexOf(l);
            if (i > -1) {
                fieldTemplates.value.splice(i, 1);
                saveLocal();
                VowmonDialog.toast('已取消「' + l + '」的默认字段，以后新建个体不再自动带上', 'success');
            } else {
                fieldTemplates.value.push(l);
                saveLocal();
                VowmonDialog.toast('已设为默认字段：以后新建个体会自动带上「' + l + '」\n改完记得点「一键同步」推到仓库', 'success', { duration: 3200 });
            }
        };
        const applyFieldToAll = (label) => {
            const l = String(label || '').trim();
            if (!l) return;
            const src = (form.value.customFields || []).find(f => f.label === l);
            VowmonDialog.confirm(
                '把字段「' + VowmonDialog.esc(l) + '」添加到全部 <b class="font-num">' + individuals.value.length + '</b> 只御兽精灵？<br>已经有这个字段的个体不会被覆盖。',
                { type: 'info', title: '同步到所有个体', okText: '全部添加', html: true }
            ).then((ok) => {
                if (!ok) return;
                let n = 0;
                individuals.value.forEach((c, idx) => {
                    const fields = Array.isArray(c.customFields) ? c.customFields : [];
                    if (fields.some(f => f.label === l)) return;
                    fields.push({ label: l, value: src ? src.value : '' });
                    individuals.value.splice(idx, 1, normalizeIndividual(Object.assign({}, c, { customFields: fields })));
                    n++;
                });
                if (n) saveLocal();
                VowmonDialog.toast(n ? '已为 ' + n + ' 只个体添加字段「' + l + '」' : '所有个体都已有这个字段', 'success');
            });
        };

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

        /* 分类学联动：科/属/种已存在时自动补全域界门纲目（只填空，不覆盖） */
        watch(() => [form.value.taxonomy.family, form.value.taxonomy.genus, form.value.taxonomy.species], () => {
            const t = form.value.taxonomy;
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
                targets.forEach(k => { if (!String(t[k] || '').trim() && hit.taxonomy[k]) t[k] = hit.taxonomy[k]; });
            });
        });

        /* ------------------------------------------------------------- 工具 */
        const vowById = computed(() => {
            const m = new Map();
            (vows.value || []).forEach(p => m.set(String(p.id), p));
            return m;
        });
        const chaById = computed(() => {
            const m = new Map();
            (characters.value || []).forEach(c => m.set(c.id, c));
            return m;
        });
        const speciesOf = (id) => vowById.value.get(String(id)) || null;
        const speciesLabel = (id) => {
            const s = speciesOf(id);
            return s ? (s.name + ' #' + s.id) : (id ? '#' + id : '未关联种族');
        };
        const speciesImageOf = (item) => {
            const s = speciesOf(item && item.speciesId);
            if (!s) return '';
            /* 标记为异色（闪光）时，直接显示该种族的异色图 */
            if (item && item.shiny && Array.isArray(s.shiny) && s.shiny.length) return getImgUrl(s.shiny[0]);
            return s.image ? getImgUrl(s.image) : '';
        };
        /* 昵称选填：没起昵称就直呼种族名 */
        const displayName = (item) => {
            const nick = item && item.nickname && String(item.nickname).trim();
            if (nick) return nick;
            const s = speciesOf(item && item.speciesId);
            return s ? s.name : '未命名精灵';
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
        const stageColorOf = (item) => StageConfig.stageColor(stageNameOf(item && item.level));
        const stageColorOfName = (name) => StageConfig.stageColor(name);
        const bloodColorOf = (b) => BLOOD_COLORS[b] || '#90a4ae';
        const lvColorOf = (lv) => (LV_META[lv] || {}).color || '#90a4ae';
        const lvDescOf = (lv) => (LV_META[lv] || {}).desc || '';

        /* 图鉴特性（traits-data.json）；图鉴性格（natures-data.json，影响种族值） */
        const allTraits = (typeof allTraitsData !== 'undefined' && Array.isArray(allTraitsData)) ? allTraitsData : [];
        const traitNames = allTraits.map(t => String(t.name || '')).filter(Boolean);
        const allNatures = (typeof allNaturesData !== 'undefined' && Array.isArray(allNaturesData)) ? allNaturesData : [];

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
                VowmonStore.save('individuals', { individuals: individuals.value, fieldTemplates: fieldTemplates.value });
            }
        };

        /* ------------------------------------------------------------- 列表 */
        const searchName = ref('');
        const filteredList = computed(() => {
            const kw = searchName.value.trim().toLowerCase();
            if (!kw) return individuals.value;
            return individuals.value.filter(p =>
                [p.nickname, displayName(p), speciesLabel(p.speciesId), ownerLabel(p.ownerId), p.personality, p.experience]
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
                /* 新个体自动带出「默认字段」模板 */
                form.value.customFields = fieldTemplates.value.map(l => ({ label: l, value: '' }));
            }
            traitInput.value = '';
            itemsInput.value = form.value.items.join(', ');
            showSpeciesModal.value = false;
            showTraitMenu.value = false;
            activeSkillIndex.value = -1;
            editingSkillIndex.value = -1;
            showModal.value = true;
        };
        /* 模板里的「选择种族」按钮（必须是已定义的方法，见文件头注释） */
        const openSpeciesModal = () => {
            speciesSearchInput.value = '';
            showSpeciesModal.value = true;
        };

        /* --------------------------------------------------- 特性（输入关键词搜索图鉴） */
        const showTraitMenu = ref(false);
        const onTraitInput = () => { showTraitMenu.value = !!traitInput.value.trim(); };
        /* 只有输入关键词后才出候选，避免特性一多就整屏弹列表 */
        const traitSuggestions = computed(() => {
            const kw = traitInput.value.trim().toLowerCase();
            if (!kw) return [];
            return traitNames
                .filter(n => !form.value.traits.includes(n))
                .filter(n => n.toLowerCase().includes(kw))
                .slice(0, 8);
        });
        const addTrait = (e) => {
            /* 中文输入法回车确认拼音时也会触发 keydown（isComposing / 229），不能当成「添加」 */
            if (e && (e.isComposing || e.keyCode === 229)) return;
            const name = traitInput.value.trim();
            if (!name) return;
            /* 一只精灵只有一个特性：再次添加直接替换 */
            form.value.traits = [name];
            traitInput.value = '';
            showTraitMenu.value = false;
            traitAdding.value = false;
        };
        const pickTrait = (name) => {
            form.value.traits = [name];
            traitInput.value = '';
            showTraitMenu.value = false;
            traitAdding.value = false;
        };
        const removeTrait = (name) => {
            form.value.traits = form.value.traits.filter(t => t !== name);
        };
        /* 独立弹窗添加特性：列表只负责显示，不再是一条假输入框 */
        const traitAdding = ref(false);
        const traitInputEl = ref(null);
        /* 「暂未添加特性」本身就是输入框：点整块空白就把光标放进输入框 */
        const focusTraitInput = () => {
            traitAdding.value = true;
            nextTick(() => { if (traitInputEl.value && traitInputEl.value.focus) traitInputEl.value.focus(); });
        };
        const openTraitInput = () => focusTraitInput();
        const cancelTraitInput = () => { traitAdding.value = false; traitInput.value = ''; showTraitMenu.value = false; };
        const addTraitViaDialog = async () => {
            const name = await VowmonDialog.prompt('输入特性名', {
                title: '添加特性',
                placeholder: '',
                okText: '添加'
            });
            const v = String(name == null ? '' : name).trim();
            if (!v) return;
            if (form.value.traits.includes(v)) {
                VowmonDialog.toast('这个特性已经添加过了', 'warning');
                return;
            }
            form.value.traits.push(v);
        };
        const traitFromBook = (name) => traitNames.includes(name);

        /* --------------------------------------------------- 技能与熟练度（默认展示为胶囊，点击才编辑） */
        const editingSkillIndex = ref(-1);
        const newSkill = () => {
            form.value.skills.push({ name: '', level: '入门' });
            editingSkillIndex.value = form.value.skills.length - 1;
        };
        const editSkill = (i) => { editingSkillIndex.value = i; };
        const finishSkill = (i) => {
            const s = form.value.skills[i];
            if (s && !String(s.name || '').trim()) form.value.skills.splice(i, 1);
            editingSkillIndex.value = -1;
        };
        const removeSkill = (i) => {
            form.value.skills.splice(i, 1);
            editingSkillIndex.value = -1;
        };
        /* 技能属性图标：来自技能表 type → type-config.js 的图标 */
        const skillTypeIcon = (name) => {
            const s = (typeof allSkillsData !== 'undefined' && Array.isArray(allSkillsData) ? allSkillsData : [])
                .find(x => x.name === name);
            const t = (typeof typeData !== 'undefined' && Array.isArray(typeData) ? typeData : [])
                .find(x => x.name === (s && s.type));
            return (t && t.icon) || 'fa-solid fa-bolt';
        };
        const skillNames = (typeof allSkillsData !== 'undefined' && Array.isArray(allSkillsData))
            ? allSkillsData.map(s => String(s.name || '')).filter(Boolean) : [];
        const activeSkillIndex = ref(-1);
        /* 只按当前行输入的关键词过滤，最多 8 条 */
        const skillSuggestions = computed(() => {
            const i = activeSkillIndex.value;
            const s = form.value.skills[i];
            const kw = s ? String(s.name || '').trim().toLowerCase() : '';
            if (!s || !kw) return [];
            return skillNames.filter(n => n.toLowerCase().includes(kw)).slice(0, 8);
        });
        const setSkillName = (i, name) => {
            if (form.value.skills[i]) form.value.skills[i].name = name;
            activeSkillIndex.value = -1;
        };

        /* --------------------------------------------------- 成就经历 */
        const addMilestone = () => { form.value.milestones.push({ chapter: '', title: '', date: '', note: '' }); };

        /* ------------------------------------------------------------- 保存 */
        const saveItem = () => {
            if (!form.value.speciesId) {
                VowmonDialog.toast('请先选择种族（昵称可以不填，默认用种族名当称呼）', 'warning');
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

        /* --------------------------------------------------- 性格（影响种族值） */
        const natureOptions = computed(() => allNatures.map(n => ({
            value: String(n.name || ''),
            label: String(n.name || ''),
            hint: (n.up ? '+' + n.up : '') + (n.up && n.down ? ' / ' : '') + (n.down ? '-' + n.down : '')
        })).filter(n => n.value));
        const natureHintOf = (name) => {
            const n = allNatures.find(x => x.name === name);
            return n ? ((n.up ? '+' + n.up : '') + (n.up && n.down ? ' / ' : '') + (n.down ? '-' + n.down : '')) : '';
        };

        /* --------------------------------------------------- 主人下拉选项 */
        const ownerOptions = computed(() => characters.value.map(c => ({ value: c.id, label: c.name })));

        /* --------------------------------------------------- 血脉技能：属性 → 技能两级选择 */
        const attrOptions = (typeof typeData !== 'undefined' && Array.isArray(typeData)) ? typeData.map(t => t.name) : [];
        /* 科优先取个体自带，否则继承种族图鉴的科；决定族尊下发的十八系技能 */
        const speciesFamily = computed(() => {
            const s = speciesOf(form.value.speciesId);
            return String((s && s.taxonomy && s.taxonomy.family) || '');
        });
        const effectiveFamily = computed(() => String(form.value.taxonomy && form.value.taxonomy.family || '') || speciesFamily.value);
        const bloodlineSkillOptions = computed(() => {
            const fam = effectiveFamily.value;
            const families = (typeof allBloodlineFamiliesData !== 'undefined' && allBloodlineFamiliesData && typeof allBloodlineFamiliesData === 'object')
                ? allBloodlineFamiliesData : {};
            const cur = String(form.value.bloodlineSkill || '');
            let list = [];
            if (fam && families[fam] && Array.isArray(families[fam].skills)) {
                /* 同一科共用族尊下发的十八系技能；选了血脉属性就优先显示对应系 */
                const rows = families[fam].skills;
                let picked = rows.filter(s => s && s.type === form.value.bloodlineAttr).map(s => String(s.name || ''));
                if (!picked.length) picked = rows.map(s => String((s && s.name) || '')).filter(Boolean);
                list = picked;
            } else {
                const all = (typeof allBloodlineSkillsData !== 'undefined' && Array.isArray(allBloodlineSkillsData)) ? allBloodlineSkillsData : [];
                list = all.filter(s => s && s.type === form.value.bloodlineAttr).map(s => String(s.name || '')).filter(Boolean);
            }
            if (cur && !list.includes(cur)) list = list.concat([cur]);   // 兼容旧数据 / 自定义名
            return list.filter(Boolean);
        });
        /* 换属性时清空已选技能，避免选到别的属性的技能 */
        const bloodlineAttrModel = computed({
            get: () => form.value.bloodlineAttr,
            set: (v) => { form.value.bloodlineAttr = v; form.value.bloodlineSkill = ''; }
        });

        /* --------------------------------------------------- 种族选择（单选） */
        const filteredSpecies = computed(() => {
            const kw = speciesSearchInput.value.trim().toLowerCase();
            let pool = (vows.value || []).filter(p => p.name)
                .map(p => ({ id: String(p.id), name: String(p.name), img: p.image ? getImgUrl(p.image) : '' }));
            if (kw) {
                pool = pool.filter(p => p.name.toLowerCase().includes(kw) || p.id.includes(kw));
            }
            return pool.slice(0, 120);
        });
        /* 种族自带唯一特性时（ability 字段 / 图鉴特性绑定），选完种族直接自动填上 */
        const traitsForSpecies = (vow) => {
            if (!vow) return [];
            const found = [vow.ability, vow.ability2, vow.hiddenAbility].filter(Boolean).map(String);
            allTraits.forEach(t => {
                const binds = (Array.isArray(t.pokemons) ? t.pokemons : []).concat(Array.isArray(t.hiddenPokemons) ? t.hiddenPokemons : []);
                if (binds.includes(vow.name) && t.name) found.push(String(t.name));
            });
            return Array.from(new Set(found.map(n => n.trim()).filter(Boolean)));
        };
        const pickSpecies = (vow) => {
            form.value.speciesId = vow.id;
            const auto = traitsForSpecies(vow);
            if (auto.length === 1 && !form.value.traits.includes(auto[0])) {
                form.value.traits.push(auto[0]);
                VowmonDialog.toast('已自动填入该种族的特性：' + auto[0], 'success', { duration: 2200 });
            }
            showSpeciesModal.value = false;
        };
        const formSpeciesLabel = computed(() => {
            const s = speciesOf(form.value.speciesId);
            return s ? { name: s.name, id: '#' + s.id } : {};
        });
        const formSpeciesImage = computed(() => speciesImageOf(form.value));
        const formStageColor = computed(() => stageColorOfName(stageNameOf(form.value.level)));

        /* ------------------------------------------------ 权 · 位 · 力（阶元 / 阶位 / 等级） */
        const speciesTaxOf = (key) => {
            const s = speciesOf(form.value.speciesId);
            return String((s && s.taxonomy && s.taxonomy[key]) || '');
        };
        /* 当前等级对应的阶位能掌哪一层阶元（族尊→科、基座→目…） */
        const formScope = computed(() => RANK_SCOPE[stageNameOf(form.value.level)] || RANK_SCOPE['元']);
        /* 该层阶元的具体名字：先看个体自己的分类学，再继承种族图鉴 */
        const formScopeValue = computed(() => {
            const t = form.value.taxonomy || {};
            return String(t[formScope.value.key] || '') || speciesTaxOf(formScope.value.key);
        });
        const scopeOfItem = (item) => RANK_SCOPE[stageNameOf(item && item.level)] || null;
        const scopeTextOf = (item) => {
            const custom = String((item && item.scopeNote) || '').trim();
            if (custom) return custom;
            const sc = scopeOfItem(item);
            if (!sc) return '掌权';
            const t = (item && item.taxonomy) || {};
            const s = speciesOf(item && item.speciesId);
            const v = String(t[sc.key] || '') || String((s && s.taxonomy && s.taxonomy[sc.key]) || '');
            return '掌' + sc.label + (v ? '·' + v : '');
        };
        const toggleFlag = (key) => { form.value.rankFlags[key] = !form.value.rankFlags[key]; };

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
                const content = JSON.stringify({ individuals: individuals.value, fieldTemplates: fieldTemplates.value }, null, 1) + '\n';
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
                fieldTemplates.value = Array.isArray(bag.fieldTemplates) ? bag.fieldTemplates.map(String).filter(Boolean) : [];
                if (window.VowmonStore) VowmonStore.replace('individuals', { individuals: individuals.value, fieldTemplates: fieldTemplates.value });
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

            /* 点击特性/技能搜索框以外的区域时，收起对应下拉 */
            document.addEventListener('click', (e) => {
                const target = e.target && e.target.closest ? e.target : null;
                if (!target || !target.closest('.trait-wrap')) showTraitMenu.value = false;
                if (!target || !target.closest('.skill-edit-wrap')) activeSkillIndex.value = -1;
            });

            try {
                const mirror = window.VowmonStore ? VowmonStore.getMirror('individuals') : null;
                if (mirror && Array.isArray(mirror.individuals)) {
                    individuals.value = mirror.individuals.map(normalizeIndividual);
                } else {
                    individuals.value = ((typeof allIndividualsData !== 'undefined' && allIndividualsData) || []).map(normalizeIndividual);
                }
                fieldTemplates.value = (mirror && Array.isArray(mirror.fieldTemplates)) ? mirror.fieldTemplates.map(String).filter(Boolean) : [];
                characters.value = ((typeof allCharactersData !== 'undefined' && allCharactersData) || []).map(c => Object.assign({}, c));
                vows.value = (typeof allVowsData !== 'undefined' && allVowsData) || [];
            } catch (err) {
                console.error('御兽精灵档案初始化失败', err);
            }
        });

        return {
            config, individuals, characters, isSyncing,
            showModal, isEdit, form, traitInput, itemsInput,
            searchName, filteredList, indexOfItem,
            avgLevel, bloodCount, ownerCount,
            speciesLabel, speciesImageOf, ownerLabel, displayName,
            cardColor, stageColorOf, stageColorOfName, bloodColorOf,
            lvColorOf, lvDescOf,
            stageName: stageNameOf, RANK_BANDS: StageConfig.bands(),
            GENDERS, BLOODLINES, SKILL_LEVELS, TAX_FIELDS, traitInputEl,
            natureOptions, natureHintOf, ownerOptions,
            attrOptions, bloodlineSkillOptions, bloodlineAttrModel, speciesFamily, effectiveFamily,
            showTraitMenu, onTraitInput, traitSuggestions, addTrait, pickTrait, removeTrait, addTraitViaDialog, traitFromBook,
            traitAdding, openTraitInput, focusTraitInput, cancelTraitInput,
            activeSkillIndex, skillSuggestions, setSkillName,
            editingSkillIndex, skillTypeIcon, newSkill, editSkill, finishSkill, removeSkill,
            addMilestone,
            fieldTemplates, addCustomField, removeCustomField,
            knownFieldLabels, isTemplateField, toggleTemplateField, applyFieldToAll,
            openEditor, saveItem,
            openDeleteConfirm, closeModal,
            showSpeciesModal, speciesSearchInput, filteredSpecies, pickSpecies,
            openSpeciesModal, formSpeciesLabel, formSpeciesImage, formStageColor,
            RANK_FLAGS, RANK_SCOPE, formScope, formScopeValue, scopeTextOf, scopeOfItem, toggleFlag,
            syncToGitHub, pullFromRepo
        };
    }
});
app.component('vow-select', window.VowSelect);
app.component('vow-textarea', window.VowTextarea);
app.mount('#app');
});
