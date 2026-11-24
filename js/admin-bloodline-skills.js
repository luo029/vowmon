/* ==========================================================================
   Vowmon Wiki 后台 —— 血脉技能管理
   数据源：vowmon_data/bloodline-skills-data.json  { skills: [{id,name,type,note}] }
   编辑 → VowmonStore.save('bloodlineSkills')  → 一键同步推仓库
   ========================================================================== */
const { createApp, ref, computed, onMounted } = Vue;

function normalizeSkill(s) {
    const o = Object.assign({}, s || {});
    o.id = String(o.id == null ? '' : o.id);
    o.name = String(o.name == null ? '' : o.name).trim();
    o.type = String(o.type == null ? '' : o.type).trim();
    o.note = String(o.note == null ? '' : o.note);
    return o;
}

VowmonData.ready(['bloodlineSkills', 'individuals']).then(function () {

const app = createApp({
    setup() {
        const config = ref({ token: '', owner: '', dataRepos: 'vowmon_data' });
        const skills = ref([]);
        const individuals = ref([]);
        const families = ref({});
        const familyOptions = computed(() => Object.keys(families.value));
        const activeFamily = ref('');
        const familyForm = ref({ name: '', zun: '', skills: {} });
        const loadFamily = (name) => {
            activeFamily.value = name;
            const f = families.value[name] || { zun: '', skills: {} };
            const picks = {};
            typeOptions.forEach(t => { picks[t] = (f.skills || {})[t] || ''; });
            familyForm.value = { name: name || '', zun: f.zun || '', skills: picks };
        };
        const saveFamily = () => {
            const name = String(familyForm.value.name || '').trim();
            if (!name) { VowmonDialog.toast('请填写科名', 'warning'); return; }
            const picks = {};
            typeOptions.forEach(t => { picks[t] = String((familyForm.value.skills || {})[t] || '').trim(); });
            families.value = Object.assign({}, families.value, { [name]: {
                zun: String(familyForm.value.zun || '').trim(),
                skills: picks
            } });
            activeFamily.value = name;
            saveLocal();
            VowmonDialog.toast('已保存「' + name + '」的族尊技能包；记得一键同步', 'success');
        };
        const deleteFamily = () => {
            const name = activeFamily.value;
            if (!name) return;
            VowmonDialog.confirm('确定删除「' + VowmonDialog.esc(name) + '」的技能包吗？', { type: 'danger', html: true, okText: '删除' }).then(ok => {
                if (!ok) return;
                const next = Object.assign({}, families.value);
                delete next[name];
                families.value = next;
                loadFamily('');
                saveLocal();
                VowmonDialog.toast('已删除', 'success');
            });
        };
        const search = ref('');
        const isSyncing = ref(false);
        const showModal = ref(false);
        const isEdit = ref(false);
        const editIndex = ref(-1);
        const form = ref({ id: '', name: '', type: '', note: '' });

        const typeOptions = (typeof typeData !== 'undefined' && Array.isArray(typeData))
            ? typeData.map(t => t.name) : [];
        /* 族尊从御兽精灵档案里选（也可直接输入新名字） */
        const zunOptions = computed(() => (individuals.value || [])
            .map(p => String((p.nickname && String(p.nickname).trim()) || (p.speciesId ? '#' + p.speciesId : '')).trim())
            .filter(Boolean));
        const typeIcon = (name) => {
            const t = (typeof typeData !== 'undefined' && Array.isArray(typeData) ? typeData : []).find(x => x.name === name);
            return (t && t.icon) || 'fa-solid fa-circle';
        };
        const typeColor = (name) => {
            const t = (typeof typeData !== 'undefined' && Array.isArray(typeData) ? typeData : []).find(x => x.name === name);
            return (t && t.color) || '#a0aec0';
        };
        const filtered = computed(() => {
            const kw = search.value.trim().toLowerCase();
            if (!kw) return skills.value;
            return skills.value.filter(s => [s.name, s.type, s.note].join(' ').toLowerCase().includes(kw));
        });

        const nextId = () => {
            let max = 0;
            skills.value.forEach(s => {
                const n = parseInt(String(s.id || '').replace(/\D/g, ''), 10);
                if (!isNaN(n) && n > max) max = n;
            });
            return 'bs' + String(max + 1).padStart(3, '0');
        };

        const saveLocal = () => {
            if (window.VowmonStore) VowmonStore.save('bloodlineSkills', { skills: skills.value, families: families.value });
        };

        const openAdd = () => {
            isEdit.value = false;
            editIndex.value = -1;
            form.value = { id: nextId(), name: '', type: '', note: '' };
            showModal.value = true;
        };
        const openEdit = (s, i) => {
            isEdit.value = true;
            editIndex.value = i;
            form.value = normalizeSkill(s);
            showModal.value = true;
        };
        const save = () => {
            const item = normalizeSkill(form.value);
            if (!item.name) { VowmonDialog.toast('请填写技能名', 'warning'); return; }
            if (!item.type) { VowmonDialog.toast('请选择所属属性', 'warning'); return; }
            if (isEdit.value && editIndex.value > -1) skills.value.splice(editIndex.value, 1, item);
            else skills.value.push(item);
            saveLocal();
            showModal.value = false;
            VowmonDialog.toast('已保存到本机；改完记得点「一键同步」', 'success');
        };
        const askDelete = (i, name) => {
            VowmonDialog.confirm('确定删除血脉技能 <strong>' + VowmonDialog.esc(name) + '</strong> 吗？', {
                type: 'danger', title: '确认删除', html: true, okText: '删除', cancelText: '再想想'
            }).then(ok => {
                if (!ok) return;
                skills.value.splice(i, 1);
                saveLocal();
                VowmonDialog.toast('已删除', 'success');
            });
        };
        const closeModal = () => { showModal.value = false; };

        const targetRepos = () => String(config.value.dataRepos || '')
            .split(/[\s,，]+/).map(s => s.trim()).filter(Boolean);

        const syncToGitHub = async () => {
            if (!config.value.token || !config.value.owner || !targetRepos().length) {
                VowmonDialog.alert('请先在「精灵管理 → 同步配置」里填写 Token、用户名和数据仓库名', { type: 'warning', title: '还没配置好' });
                return;
            }
            isSyncing.value = true;
            try {
                const content = JSON.stringify({ skills: skills.value, families: families.value }, null, 1) + '\n';
                for (const repo of targetRepos()) {
                    await GitHubSync.uploadFile(config.value.token, config.value.owner, repo, 'bloodline-skills-data.json', content, 'update bloodline skills data');
                }
                if (window.VowmonStore) VowmonStore.markSynced('bloodlineSkills');
                VowmonDialog.toast('血脉技能已同步，前台一两分钟后更新', 'success');
            } catch (err) {
                VowmonDialog.alert('同步失败，请检查 Token 权限和仓库名。', { type: 'danger', title: '同步失败', detail: err && err.message ? err.message : String(err) });
            } finally { isSyncing.value = false; }
        };

        const pullFromRepo = async () => {
            const repo = targetRepos()[0];
            if (!config.value.token || !config.value.owner || !repo) {
                VowmonDialog.alert('请先在「精灵管理 → 同步配置」里填写 Token、用户名和数据仓库名', { type: 'warning', title: '还没配置好' });
                return;
            }
            const ok = await VowmonDialog.confirm('将从「' + repo + '」读取 bloodline-skills-data.json，并覆盖本机未同步的改动。继续？', { type: 'warning', title: '从数据仓库拉取', okText: '拉取' });
            if (!ok) return;
            isSyncing.value = true;
            try {
                const bag = await GitHubSync.downloadJson(config.value.token, config.value.owner, repo, 'bloodline-skills-data.json');
                if (!bag || !Array.isArray(bag.skills)) throw new Error('仓库里没有 bloodline-skills-data.json 或字段不是 skills 数组');
                skills.value = bag.skills.map(normalizeSkill);
                families.value = (bag.families && typeof bag.families === 'object') ? bag.families : {};
                loadFamily(Object.keys(families.value)[0] || '');
                if (window.VowmonStore) VowmonStore.replace('bloodlineSkills', { skills: skills.value, families: families.value });
                VowmonDialog.toast('已从仓库拉取 ' + skills.value.length + ' 个血脉技能', 'success');
            } catch (err) {
                VowmonDialog.alert('拉取失败，请检查 Token 权限和仓库名。', { type: 'danger', title: '拉取失败', detail: err && err.message ? err.message : String(err) });
            } finally { isSyncing.value = false; }
        };

        onMounted(() => {
            try {
                const savedConfig = localStorage.getItem('vowmon_sync_config');
                if (savedConfig) config.value = Object.assign({}, config.value, JSON.parse(savedConfig));
            } catch (e) { console.warn('同步配置解析失败', e); }
            try {
                const mirror = window.VowmonStore ? VowmonStore.getMirror('bloodlineSkills') : null;
                const bag = mirror || (typeof allBloodlineSkillsData !== 'undefined' && allBloodlineSkillsData) || { skills: [] };
                skills.value = (bag.skills || []).map(normalizeSkill);
                individuals.value = (typeof allIndividualsData !== 'undefined' && Array.isArray(allIndividualsData)) ? allIndividualsData : [];
                families.value = (bag.families && typeof bag.families === 'object') ? bag.families : {};
                loadFamily(Object.keys(families.value)[0] || '');
            } catch (e) { console.error('血脉技能初始化失败', e); }
        });

        return {
            config, skills, families, familyOptions, activeFamily, familyForm, typeIcon, zunOptions,
            individuals, loadFamily, saveFamily, deleteFamily,
            search, filtered, isSyncing,
            showModal, isEdit, form, typeOptions, typeColor,
            openAdd, openEdit, save, askDelete, closeModal,
            syncToGitHub, pullFromRepo
        };
    }
});
app.component('vow-select', window.VowSelect);
app.component('vow-textarea', window.VowTextarea);
app.mount('#app');
});
