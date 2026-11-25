/* ==========================================================================
   Vowmon Wiki 后台 —— 御兽人物档案管理（书中角色）
   --------------------------------------------------------------------------
   数据链路（与 admin-individuals 一致）：
     编辑 -> VowmonStore.save('characters', { characters }) 写本机镜像（前台立即生效）
          -> 点「一键同步」把 characters-data.json 推到 GitHub 数据仓库
     前台 characters.html 读取生效。
   人物持有精灵通过 vowIds 引用御兽精灵档案的 id。
   注意：模板里用到的每个方法/状态都必须在 setup 的 return 里
         （undefined 引用会让生产版渲染静默失效，表现为弹窗打不开/白屏）。
   ========================================================================== */

const { createApp, ref, computed, onMounted } = Vue;

const FACTION_COLORS = {
    '九牧联盟': '#2b6cb0',
    '荒野': '#2f855a'
};
const AVATAR_COLORS = ['#d69e2e', '#2b6cb0', '#38a169', '#7F77DD', '#d4537e', '#0F6E56', '#e24b4a', '#5c6bc0'];

/* 势力/分组默认值：人物数据里没存时使用（存进 characters-data.json 后以数据为准） */
const DEFT_FACTIONS = [
    { name: '九牧联盟', color: '#2b6cb0' },
    { name: '荒野', color: '#2f855a' }
];
const DEFT_GROUPS = [];

/* 分组/势力颜色候选盘（作家助手同款思路：建组时点色块选色） */
const ORG_PALETTE = ['#e53e3e', '#dd6b20', '#d69e2e', '#38a169', '#38b2ac', '#3182ce', '#5a67d8', '#9f7aea', '#d53f8c', '#718096', '#2f855a', '#b7791f'];

/* 按名字取稳定颜色：新建势力/分组没选色时的兜底，同名永远同色 */
function orgAutoColor(name) {
    let h = 0;
    const s = String(name || '');
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
    return ORG_PALETTE[h % ORG_PALETTE.length];
}

function normalizeOrgList(list, deft) {
    const arr = Array.isArray(list) ? list : deft;
    return (arr || []).map(o => ({
        name: String((o && o.name) || '').trim(),
        color: String((o && o.color) || '').trim() || orgAutoColor((o && o.name) || '')
    })).filter(o => o.name);
}

/* 关系预设：rev = 在对方档案里自动补的反向关系（没有 rev 的关系不做反向同步） */
const REL_PRESETS = [
    { name: '师父', rev: '徒弟' },
    { name: '徒弟', rev: '师父' },
    { name: '父亲', rev: '子女' },
    { name: '母亲', rev: '子女' },
    { name: '子女', rev: '父母' },
    { name: '兄弟', rev: '兄弟' },
    { name: '姐妹', rev: '姐妹' },
    { name: '兄妹', rev: '兄妹' },
    { name: '夫妻', rev: '夫妻' },
    { name: '挚友', rev: '挚友' },
    { name: '同门', rev: '同门' },
    { name: '上下级', rev: '上下级' },
    { name: '宿敌', rev: '宿敌' },
    { name: '仇敌', rev: '仇敌' },
    { name: '契约搭档', rev: '契约搭档' }
];

function normalizeCharacter(c) {
    const p = Object.assign({}, c || {});
    p.id = String(p.id == null ? '' : p.id);
    p.name = String(p.name == null ? '' : p.name);
    p.title = String(p.title == null ? '' : p.title);
    p.faction = String(p.faction == null ? '' : p.faction);
    p.birthplace = String(p.birthplace == null ? '' : p.birthplace);
    p.position = String(p.position == null ? '' : p.position);
    /* 联盟编号（默认展示，随联盟实力晋升变化）与国际编号（跨联盟通用，选填） */
    p.leagueNo = String(p.leagueNo == null ? '' : p.leagueNo).trim();
    p.intlNo = String(p.intlNo == null ? '' : p.intlNo).trim();
    p.money = Number(p.money) || 0;
    p.inventory = Array.isArray(p.inventory)
        ? p.inventory.map(it => (typeof it === 'string' ? { name: it, note: '' } : { name: String((it && it.name) || '').trim(), note: String((it && it.note) || '') }))
            .filter(it => it.name)
        : [];
    p.vowIds = Array.isArray(p.vowIds) ? p.vowIds.map(String).filter(Boolean) : (Array.isArray(p.petIds) ? p.petIds.map(String).filter(Boolean) : []);
    p.bio = String(p.bio == null ? '' : p.bio);
    p.background = String(p.background == null ? '' : p.background);
    p.personality = String(p.personality == null ? '' : p.personality);
    p.relations = String(p.relations == null ? '' : p.relations);
    p.links = Array.isArray(p.links)
        ? p.links.map(l => ({
            id: String((l && (l.id || l.targetId)) || '').trim(),
            rel: String((l && l.rel) || '').trim(),
            note: String((l && l.note) || '').trim()
        })).filter(l => l.id)
        : [];
    p.appearance = String(p.appearance == null ? '' : p.appearance);
    p.avatar = String(p.avatar == null ? '' : p.avatar);
    p.strength = String(p.strength == null ? '' : p.strength);
    p.notes = String(p.notes == null ? '' : p.notes);
    /* 自定义分组（groupId 对应分组列表里的 name）与自定义属性（[{label, value}]，作家助手式自由字段） */
    p.groupId = String(p.groupId == null ? '' : p.groupId).trim();
    p.customFields = Array.isArray(p.customFields)
        ? p.customFields.map(f => ({
            label: String((f && f.label) || '').trim(),
            value: String((f && f.value) || '')
        })).filter(f => f.label)
        : [];
    p.milestones = Array.isArray(p.milestones)
        ? p.milestones.map(m => ({
            chapter: String((m && m.chapter) || '').trim(),
            title: String((m && m.title) || '').trim(),
            date: String((m && m.date) || '').trim(),
            note: String((m && m.note) || '').trim()
        })).filter(m => m.title || m.chapter || m.date)
        : [];
    return p;
}

VowmonData.ready(['characters', 'individuals'], { fresh: true }).then(function () {

const app = createApp({
    setup() {
        const config = ref({ token: '', owner: '', dataRepos: 'vowmon_data', imgRepos: 'vowmon_imgs', imgCdnBase: '' });

        const characters = ref([]);
        const individuals = ref([]);
        const isSyncing = ref(false);

        /* --------------------------------- 势力 / 分组（存在 characters-data.json 里，随人物一起同步） */
        const factions = ref(normalizeOrgList(null, DEFT_FACTIONS));
        const groups = ref(normalizeOrgList(null, DEFT_GROUPS));

        const showModal = ref(false);
        const isEdit = ref(false);
        const editIndex = ref(-1);
        const deleteTargetIndex = ref(-1);
        const showVowModal = ref(false);
        const vowSearchInput = ref('');

        const defaultForm = () => ({
            id: '', name: '', title: '', faction: '', birthplace: '', position: '', leagueNo: '', intlNo: '', money: 0,
            inventory: [], vowIds: [], links: [],
            bio: '', background: '', personality: '', relations: '', appearance: '', strength: '',
            avatar: '', notes: '', milestones: [], groupId: '', customFields: []
        });
        const form = ref(defaultForm());

        /* ------------------------------------------------------- 图片工具 */
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

        /* ------------------------------------------------- 人物立绘上传 */
        const avatarUploading = ref(false);
        const avatarInput = ref(null);
        const triggerAvatarUpload = () => {
            if (!config.value.token || !config.value.owner || !config.value.imgRepos) {
                VowmonDialog.alert('请先在「精灵管理 → 同步配置」里填写 Token、用户名和图片仓库名。', {
                    type: 'warning', title: '还没配置好'
                });
                return;
            }
            if (avatarInput.value) avatarInput.value.click();
        };
        const handleAvatarUpload = async (event) => {
            const file = event.target.files && event.target.files[0];
            if (!file) return;
            avatarUploading.value = true;
            try {
                if (!window.ImageUtils) throw new Error('图片处理模块未加载，请强制刷新页面（Ctrl + F5）后重试');
                const img = await ImageUtils.compressToPng(file, 1024);
                const repo = String(config.value.imgRepos || '').split(',')[0].trim();
                if (!repo) throw new Error('请先在【同步配置】中填写图片仓库名');
                const id = String(form.value.id || '').trim() || ('char-' + Date.now());
                const path = 'characters/' + id + '.png';
                await GitHubSync.uploadFile(
                    config.value.token, config.value.owner, repo,
                    path, img.base64, 'Upload character portrait: ' + path, true
                );
                form.value.avatar = path;
                VowmonDialog.toast('立绘已上传：' + path + '\n已压缩为 ' + img.canvasSize + '×' + img.canvasSize + '（' + ImageUtils.formatBytes(img.bytes) + '）', 'success', { duration: 3600 });
            } catch (err) {
                VowmonDialog.alert('立绘上传失败，请检查 Token 权限 / 图片仓库名。', {
                    type: 'danger', title: '上传失败',
                    detail: err && err.message ? err.message : String(err)
                });
            } finally {
                avatarUploading.value = false;
                event.target.value = '';
            }
        };
        const clearAvatar = () => { form.value.avatar = ''; };

        /* ------------------------------------------------------------- 工具 */
        const indById = computed(() => {
            const m = new Map();
            (individuals.value || []).forEach(p => m.set(String(p.id), p));
            return m;
        });
        const vowMap = computed(() => {
            const m = new Map();
            (typeof allVowsData !== 'undefined' && Array.isArray(allVowsData) ? allVowsData : [])
                .forEach(p => m.set(String(p.id), p));
            return m;
        });
        const speciesLabel = (id) => {
            const s = vowMap.value.get(String(id));
            return s ? (s.name + ' #' + s.id) : (id ? '#' + id : '未关联种族');
        };
        const speciesImageOf = (p) => {
            const s = vowMap.value.get(String(p && p.speciesId));
            return s && s.image ? getImgUrl(s.image) : '';
        };
        /* 昵称选填：没起昵称就直接叫种族名 */
        const indLabel = (p) => {
            const nick = p && p.nickname && String(p.nickname).trim();
            if (nick) return nick + (p.speciesId ? '（' + speciesLabel(p.speciesId) + '）' : '');
            return p.speciesId ? speciesLabel(p.speciesId) : '未命名精灵';
        };
        const pickedVows = computed(() => form.value.vowIds.map(id => indById.value.get(String(id))).filter(Boolean));
        const vowsOf = (c) => (c.vowIds || []).map(id => indById.value.get(String(id))).filter(Boolean);

        /* 势力配色：优先用「势力管理」里配置的颜色，没配置的势力按名字取稳定色 */
        const factionColor = (f) => {
            const hit = factions.value.find(o => o.name === f);
            if (hit) return hit.color;
            return f ? orgAutoColor(f) : '#d69e2e';
        };
        /* 分组配色 / 名称 */
        const groupInfo = (id) => groups.value.find(o => o.name === id) || null;
        const groupColor = (id) => {
            const g = groupInfo(id);
            return g ? g.color : (id ? orgAutoColor(id) : '#a0aec0');
        };

        /* ------------------------------------ 势力管理 / 分组管理 弹窗 */
        const showOrgModal = ref('');   // '' | 'faction' | 'group'
        const orgDraft = ref({ name: '', color: ORG_PALETTE[5] });
        const openOrgModal = (kind) => {
            showOrgModal.value = kind;
            orgDraft.value = { name: '', color: ORG_PALETTE[(factions.value.length + groups.value.length) % ORG_PALETTE.length] };
        };
        const orgListOf = (kind) => (kind === 'faction' ? factions : groups);
        const addOrg = (kind) => {
            const name = String(orgDraft.value.name || '').trim();
            if (!name) { VowmonDialog.toast('请先填写名称', 'warning'); return; }
            const list = orgListOf(kind).value;
            if (list.some(o => o.name === name)) { VowmonDialog.toast('已有同名' + (kind === 'faction' ? '势力' : '分组'), 'warning'); return; }
            list.push({ name: name, color: orgDraft.value.color || orgAutoColor(name) });
            orgDraft.value = { name: '', color: ORG_PALETTE[list.length % ORG_PALETTE.length] };
            saveOrgs();
        };
        const delOrg = (kind, name) => {
            const list = orgListOf(kind).value;
            const i = list.findIndex(o => o.name === name);
            if (i < 0) return;
            const label = kind === 'faction' ? '势力' : '分组';
            VowmonDialog.confirm('删除「' + VowmonDialog.esc(name) + '」这个' + label + '？<br>人物档案里的' + label + '名字不会被改动，只是不再有专属颜色。', {
                type: 'danger', title: '删除' + label, okText: '删除', html: true
            }).then((ok) => {
                if (ok) { list.splice(i, 1); saveOrgs(); }
            });
        };
        const setOrgColor = (kind, name, color) => {
            const hit = orgListOf(kind).value.find(o => o.name === name);
            if (hit) { hit.color = color; saveOrgs(); }
        };
        const renameOrg = (kind, oldName, newName) => {
            const name = String(newName || '').trim();
            if (!name || name === oldName) return;
            const list = orgListOf(kind).value;
            if (list.some(o => o.name === name && o.name !== oldName)) { VowmonDialog.toast('已有同名' + (kind === 'faction' ? '势力' : '分组'), 'warning'); return; }
            const hit = list.find(o => o.name === oldName);
            if (!hit) return;
            hit.name = name;
            /* 同步改所有引用这个势力/分组的人物 */
            if (kind === 'faction') {
                characters.value.forEach(c => { if (c.faction === oldName) c.faction = name; });
            } else {
                characters.value.forEach(c => { if (c.groupId === oldName) c.groupId = name; });
            }
            saveOrgs();
        };
        /* 表单下拉选项：vow-select creatable 模式，可直接输入新名称（保存时自动建档） */
        const factionOptions = computed(() => factions.value.map(o => ({ value: o.name, label: o.name })));
        const groupOptions = computed(() => groups.value.map(o => ({ value: o.name, label: o.name })));
        /* 保存时把新输入的势力/分组自动登记进列表 */
        const ensureOrg = (kind, name) => {
            const n = String(name || '').trim();
            if (!n) return;
            const list = orgListOf(kind).value;
            if (!list.some(o => o.name === n)) {
                list.push({ name: n, color: orgAutoColor(n) });
            }
        };

        /* ------------------------------------ 列表视图：平铺 / 按势力 / 按分组 */
        const viewMode = ref('flat');
        const orgSections = (kind) => {
            const list = orgListOf(kind).value;
            return list.map(o => ({
                key: kind + '-' + o.name,
                title: o.name,
                color: o.color,
                items: filteredList.value.filter(c => (kind === 'faction' ? c.faction : c.groupId) === o.name)
            })).filter(s => s.items.length)
              .concat([{
                  key: kind + '-none',
                  title: '未设置' + (kind === 'faction' ? '势力' : '分组'),
                  color: '#a0aec0',
                  items: filteredList.value.filter(c => !(kind === 'faction' ? c.faction : c.groupId))
              }]).filter(s => s.items.length);
        };
        const displaySections = computed(() => {
            if (viewMode.value === 'faction') return orgSections('faction');
            if (viewMode.value === 'group') return orgSections('group');
            return [{ key: 'flat', title: '', color: '', items: filteredList.value }];
        });
        const avatarChar = (name) => (String(name || '').trim().charAt(0) || '？');
        const avatarColor = (name) => {
            let h = 0;
            const s = String(name || '');
            for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
            return AVATAR_COLORS[h % AVATAR_COLORS.length];
        };

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
                VowmonStore.save('characters', { characters: characters.value, factions: factions.value, groups: groups.value });
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

        /* ------------------------------------------------------------ 统计 */
        const vowTotal = computed(() =>
            characters.value.reduce((a, c) => a + (c.vowIds || []).length, 0)
        );
        const totalMoney = computed(() =>
            characters.value.reduce((a, c) => a + (Number(c.money) || 0), 0)
        );

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
            showVowModal.value = false;
            showModal.value = true;
        };

        const addInventory = () => { form.value.inventory.push({ name: '', note: '' }); };
        const addMilestone = () => { form.value.milestones.push({ chapter: '', title: '', date: '', note: '' }); };

        /* ------------------------------------ 自定义属性（作家助手式自由字段） */
        const addCustomField = (label) => {
            form.value.customFields.push({ label: String(label || '').trim(), value: '' });
        };
        const removeCustomField = (i) => { form.value.customFields.splice(i, 1); };
        /* 全档案出现过的自定义字段名，作为快捷键点一下就加一行 */
        const knownFieldLabels = computed(() => {
            const set = new Set();
            characters.value.forEach(c => (c.customFields || []).forEach(f => { if (f.label) set.add(f.label); }));
            if (form.value.id) {
                /* 排除当前人物已加的，避免重复 */
                const mine = new Set((form.value.customFields || []).map(f => f.label));
                return [...set].filter(l => !mine.has(l));
            }
            return [...set];
        });

        const saveItem = () => {
            if (!form.value.name || !String(form.value.name).trim()) {
                VowmonDialog.toast('请填写姓名', 'warning');
                return;
            }
            /* 新输入的势力 / 分组自动登记（作家助手式：直接打字就建档） */
            ensureOrg('faction', form.value.faction);
            ensureOrg('group', form.value.groupId);
            const item = normalizeCharacter(form.value);
            if (isEdit.value && editIndex.value > -1) {
                characters.value.splice(editIndex.value, 1, item);
            } else {
                characters.value.push(item);
            }
            syncReverseLinks(item);
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

        /* --------------------------------------------------------- 人物关系 */
        const showLinkModal = ref(false);
        const linkSearch = ref('');
        const activeRelIndex = ref(-1);
        const relInput = ref('');

        const linkChar = (id) => characters.value.find(c => String(c.id) === String(id)) || null;
        const linkName = (id) => {
            const c = linkChar(id);
            return c ? (c.name || '未命名') : '（已删除的人物）';
        };
        const linkTitle = (id) => {
            const c = linkChar(id);
            if (!c) return '';
            return [c.faction, c.title].filter(Boolean).join(' · ');
        };
        /* 可关联的人：排除自己，也排除已经连过的人 */
        const linkCandidates = computed(() => {
            const kw = linkSearch.value.trim().toLowerCase();
            const used = new Set((form.value.links || []).map(l => String(l.id)));
            return characters.value.filter(c => {
                if (String(c.id) === String(form.value.id)) return false;
                if (used.has(String(c.id))) return false;
                if (!kw) return true;
                return [c.name, c.faction, c.title, c.position].join(' ').toLowerCase().includes(kw);
            });
        });
        const openLinkModal = () => {
            linkSearch.value = '';
            showLinkModal.value = true;
        };
        const addLink = (c) => {
            if (!c) return;
            if ((form.value.links || []).some(l => String(l.id) === String(c.id))) {
                showLinkModal.value = false;
                return;
            }
            form.value.links.push({ id: String(c.id), rel: '', note: '' });
            activeRelIndex.value = form.value.links.length - 1;
            showLinkModal.value = false;
        };
        const removeLink = (i) => {
            form.value.links.splice(i, 1);
            if (activeRelIndex.value === i) activeRelIndex.value = -1;
            else if (activeRelIndex.value > i) activeRelIndex.value -= 1;
        };
        const toggleRelPicker = (i) => {
            activeRelIndex.value = activeRelIndex.value === i ? -1 : i;
            relInput.value = '';
        };
        const setRel = (i, name) => {
            if (!form.value.links[i]) return;
            form.value.links[i].rel = String(name || '').trim();
            activeRelIndex.value = -1;
            relInput.value = '';
        };
        const applyCustomRel = (i) => {
            const name = relInput.value.trim();
            if (!name) return;
            setRel(i, name);
        };
        const revOf = (rel) => {
            const hit = REL_PRESETS.find(p => p.name === rel);
            return hit ? (hit.rev || '') : '';
        };
        /* 保存时给对方补反向关系：A 写「师父·B」→ B 的档案里补「徒弟·A」 */
        const syncReverseLinks = (saved) => {
            (saved.links || []).forEach(link => {
                const target = linkChar(link.id);
                if (!target) return;
                const rev = revOf(link.rel);
                if (!rev) return;
                const links = Array.isArray(target.links) ? target.links.slice() : [];
                const exist = links.find(l => String(l.id) === String(saved.id));
                if (exist) {
                    if (!exist.rel) exist.rel = rev;
                } else {
                    links.push({ id: String(saved.id), rel: rev, note: '' });
                }
                const idx = characters.value.indexOf(target);
                const next = normalizeCharacter(Object.assign({}, target, { links }));
                if (idx > -1) characters.value.splice(idx, 1, next);
            });
        };

        /* --------------------------------------------------- 精灵关联（多选） */
        const filteredVows = computed(() => {
            const kw = vowSearchInput.value.trim().toLowerCase();
            const pool = individuals.value;
            if (!kw) return pool;
            return pool.filter(p =>
                [p.nickname, indLabel(p), speciesLabel(p.speciesId), String(p.id)].join(' ').toLowerCase().includes(kw)
            );
        });
        const toggleVow = (p) => {
            const id = String(p.id);
            const i = form.value.vowIds.indexOf(id);
            if (i > -1) form.value.vowIds.splice(i, 1);
            else form.value.vowIds.push(id);
        };
        const removeVow = (id) => {
            form.value.vowIds = form.value.vowIds.filter(x => x !== String(id));
        };
        const openVowModal = () => {
            vowSearchInput.value = '';
            showVowModal.value = true;
        };

        const closeModal = (target) => {
            if (target === 'edit') showModal.value = false;
            if (target === 'vow') showVowModal.value = false;
            if (target === 'link') showLinkModal.value = false;
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
                const content = JSON.stringify({ characters: characters.value, factions: factions.value, groups: groups.value }, null, 1) + '\n';
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
                factions.value = normalizeOrgList(bag.factions, DEFT_FACTIONS);
                groups.value = normalizeOrgList(bag.groups, DEFT_GROUPS);
                if (window.VowmonStore) VowmonStore.replace('characters', { characters: characters.value, factions: factions.value, groups: groups.value });
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

            try {
                const mirror = window.VowmonStore ? VowmonStore.getMirror('characters') : null;
                if (mirror && Array.isArray(mirror.characters)) {
                    characters.value = mirror.characters.map(normalizeCharacter);
                    factions.value = normalizeOrgList(mirror.factions, DEFT_FACTIONS);
                    groups.value = normalizeOrgList(mirror.groups, DEFT_GROUPS);
                } else {
                    characters.value = ((typeof allCharactersData !== 'undefined' && allCharactersData) || []).map(normalizeCharacter);
                    factions.value = normalizeOrgList(typeof allCharFactions !== 'undefined' ? allCharFactions : null, DEFT_FACTIONS);
                    groups.value = normalizeOrgList(typeof allCharGroups !== 'undefined' ? allCharGroups : null, DEFT_GROUPS);
                }
                individuals.value = ((typeof allIndividualsData !== 'undefined' && allIndividualsData) || []).map(p => Object.assign({}, p));
            } catch (err) {
                console.error('御兽人物档案初始化失败', err);
            }
        });

        return {
            config, characters, isSyncing,
            showModal, isEdit, form,
            searchName, filteredList, indexOfItem,
            vowTotal, totalMoney,
            fmtMoney, indLabel, pickedVows, vowsOf,
            speciesLabel, speciesImageOf,
            factionColor, avatarChar, avatarColor,
            /* 势力 / 分组 */
            factions, groups, groupInfo, groupColor, orgAutoColor,
            showOrgModal, orgDraft, openOrgModal, addOrg, delOrg, setOrgColor, renameOrg,
            factionOptions, groupOptions, ORG_PALETTE,
            viewMode, displaySections,
            /* 自定义属性 */
            addCustomField, removeCustomField, knownFieldLabels,
            openEditor, addInventory, addMilestone, saveItem, openDeleteConfirm, closeModal,
            /* 立绘 */
            avatarUploading, avatarInput, triggerAvatarUpload, handleAvatarUpload, clearAvatar, getImgUrl,
            showVowModal, vowSearchInput, filteredVows, toggleVow, removeVow, openVowModal,
            /* 人物关系 */
            showLinkModal, linkSearch, linkCandidates, linkChar, linkName, linkTitle,
            openLinkModal, addLink, removeLink,
            activeRelIndex, relInput, toggleRelPicker, setRel, applyCustomRel, REL_PRESETS,
            syncToGitHub, pullFromRepo
        };
    }
});
app.component('vow-textarea', window.VowTextarea);
app.component('vow-select', window.VowSelect);
app.mount('#app');
});
