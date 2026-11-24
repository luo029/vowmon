/* ==========================================================================
   Vowmon Wiki 后台 —— 技能管理逻辑
   --------------------------------------------------------------------------
   数据链路（与 admin.js 保持一致）：
     编辑 -> 写入 localStorage['vowmon_skills_data']
          -> 点「一键同步」把 skills-data.js 推到 GitHub 数据仓库
          -> 前台 skills.html 读取同源 skills-data.js 生效
   ========================================================================== */

const { createApp, ref, computed, onMounted, watch } = Vue;

// 技能分类只保留三类：物理 / 特殊 / 变化。
// 分类名取自 category-config.js（唯一来源），本文件不再写死。
// 兼容早期数据里的旧叫法，加载时统一映射成新分类。
const SKILL_CATEGORIES = categoryNames;
const CATEGORY_ALIAS = {
    '物攻': '物理', '物理': '物理',
    '魔攻': '特殊', '特殊': '特殊',
    '防御': '变化', '状态': '变化', '变化': '变化'
};
const normalizeCategory = (c) => CATEGORY_ALIAS[c] || SKILL_CATEGORIES[0];
VowmonData.ready(['skills','pets'], { fresh: true }).then(function () {

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
        const skills = ref([]);
        const isSyncing = ref(false);

        /* ---------------------------------------------------------------- 弹窗 */
        const showModal = ref(false);
        const isEdit = ref(false);
        const editIndex = ref(-1);
        const activeDropdown = ref('');

        const deleteTargetIndex = ref(-1);
        const deleteTargetName = ref('');

        const defaultForm = () => ({
            id: '',
            name: '',
            type: '一般',
            category: SKILL_CATEGORIES[0],
            cost: 0,
            power: 0,
            tags: [],
            learners: [],   // 可学会该技能的精灵名列表
            effect: ''
        });

        const form = ref(defaultForm());

        // 把一批技能规整：category 归一到三类、tags / learners 保证是合法字符串数组。
        // 注意：自定义标签不一定在内置 tagNames 里，这里不能再按 tagNames 过滤，
        // 否则用户新建的标签会在加载时被清掉。
        const normalizeSkills = (list) => (list || []).map(item => ({
            ...item,
            category: normalizeCategory(item.category),
            tags: Array.isArray(item.tags)
                ? item.tags.map(t => String(t)).filter(t => t && t.trim())
                : [],
            learners: Array.isArray(item.learners)
                ? item.learners.map(t => String(t)).filter(t => t && t.trim())
                : []
        }));

        /* ------------------------------------------------------------ 标签库 */
        // 完整标签库（内置 + 用户自定义/删除后的结果），持久化到 localStorage。
        const tagLibrary = ref(getTagLibrary());
        const tagQuery = ref('');
        const showTagDropdown = ref(false);

        // 候选标签：排除已选、按搜索词过滤
        const filteredTagOptions = computed(() => {
            const q = tagQuery.value.trim().toLowerCase();
            const selected = form.value.tags || [];
            return tagLibrary.value.filter(t =>
                !selected.includes(t.name) && (!q || t.name.toLowerCase().includes(q))
            );
        });
        // 搜索词对应的「新建标签」是否存在（库里没有且未选中）
        const canCreateTag = computed(() => {
            const q = tagQuery.value.trim();
            if (!q) return false;
            if (tagLibrary.value.some(t => t.name === q)) return false;
            return !(form.value.tags || []).includes(q);
        });

        const persistTagLibrary = () => {
            saveTagLibrary(tagLibrary.value);
        };

        // 从搜索词新建标签并加入当前技能
        const createTag = () => {
            const name = tagQuery.value.trim();
            if (!name) return;
            if (!tagLibrary.value.some(t => t.name === name)) {
                tagLibrary.value.push(makeCustomTag(name));
                persistTagLibrary();
            }
            toggleTag(name);
            tagQuery.value = '';
            showTagDropdown.value = true;
        };

        // 从标签库删除标签，并同步清理所有技能中已使用该标签的记录
        const deleteTag = (name) => {
            VowmonDialog.confirm(
                `确定删除标签「${VowmonDialog.esc(name)}」吗？<br>该标签会从标签库和所有已使用它的技能中移除。`,
                { type: 'danger', title: '删除标签', okText: '删除', html: true }
            ).then((ok) => {
                if (!ok) return;
                tagLibrary.value = tagLibrary.value.filter(t => t.name !== name);
                persistTagLibrary();
                skills.value.forEach(s => {
                    if (Array.isArray(s.tags)) s.tags = s.tags.filter(t => t !== name);
                });
                if (form.value.tags) form.value.tags = form.value.tags.filter(t => t !== name);
                saveLocal();
                VowmonDialog.toast('标签已删除', 'success');
            });
        };

        // 标签多选：点选切换
        const toggleTag = (name) => {
            const i = form.value.tags.indexOf(name);
            if (i > -1) form.value.tags.splice(i, 1);
            else form.value.tags.push(name);
        };

        /* ------------------------------------------------------------ 显示列 */
        const showColSettings = ref(false);
        const allColumns = {
            name: '技能名称', type: '属性', category: '分类',
            cost: '能耗', power: '威力', tags: '标签', learners: '可学精灵', effect: '效果'
        };
        // 显示列状态持久化：localStorage['vowmon_skills_visible_cols']
        // 未存过 -> 返回 null（用默认全选）；存过 -> 返回数组（可能是空数组，代表用户全取消）
        const COLS_KEY = 'vowmon_skills_visible_cols';
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

        const nextSkillId = () => {
            let max = 0;
            skills.value.forEach(item => {
                const num = parseInt(String(item.id || '').replace(/\D/g, ''), 10);
                if (!isNaN(num) && num > max) max = num;
            });
            return 's' + String(max + 1).padStart(3, '0');
        };

        const saveLocal = () => {
            localStorage.setItem('vowmon_skills_data', JSON.stringify(skills.value));
            // 写入本机镜像：前台（同一台电脑）立刻就能看到这次改动
            if (window.VowmonStore) VowmonStore.save('skills', { skills: skills.value });
        };

        /* ---------------------------------------------------- 可学会精灵选择 */
        // 精灵池（来自 vow-data.json），支持按属性筛选 + 勾选 + 全选/取消全选
        const pets = ref([]);
        const learnerFilter = ref('');   // '' = 全部属性；否则为属性名

        const learnerPool = computed(() => (pets.value || []).map(p => ({
            id: p.id,
            name: String(p.name || ''),
            types: Array.isArray(p.types) ? p.types : []
        })).filter(p => p.name));

        const filteredLearnerPets = computed(() => {
            if (!learnerFilter.value) return learnerPool.value;
            return learnerPool.value.filter(p => p.types.includes(learnerFilter.value));
        });

        const hasLearner = (name) => (form.value.learners || []).includes(name);

        const toggleLearner = (name) => {
            if (!Array.isArray(form.value.learners)) form.value.learners = [];
            const i = form.value.learners.indexOf(name);
            if (i > -1) form.value.learners.splice(i, 1);
            else form.value.learners.push(name);
        };

        // 全选：把当前筛选出的精灵全部加入
        const selectAllLearners = () => {
            if (!Array.isArray(form.value.learners)) form.value.learners = [];
            filteredLearnerPets.value.forEach(p => {
                if (!form.value.learners.includes(p.name)) form.value.learners.push(p.name);
            });
        };

        // 取消全选：把当前筛选出的精灵全部移除（只影响可见范围，不动其它属性已勾的）
        const clearLearners = () => {
            if (!Array.isArray(form.value.learners)) return;
            const names = new Set(filteredLearnerPets.value.map(p => p.name));
            form.value.learners = form.value.learners.filter(n => !names.has(n));
        };

        // 当前筛选范围内是否已全部勾选（控制全选/取消按钮提示）
        const allFilteredSelected = computed(() => {
            const list = filteredLearnerPets.value;
            if (!list.length) return false;
            return list.every(p => (form.value.learners || []).includes(p.name));
        });

        /* ---------------------------------------------------------------- 编辑 */
        const openEditor = (skill, index) => {
            if (skill && typeof index === 'number') {
                isEdit.value = true;
                editIndex.value = index;
                form.value = JSON.parse(JSON.stringify(skill));
                if (!Array.isArray(form.value.learners)) form.value.learners = [];
            } else {
                isEdit.value = false;
                editIndex.value = -1;
                form.value = defaultForm();
                form.value.id = nextSkillId();
            }
            learnerFilter.value = '';
            activeDropdown.value = '';
            tagQuery.value = '';
            showTagDropdown.value = false;
            showModal.value = true;
        };

        const saveSkill = () => {
            if (!form.value.name || !String(form.value.name).trim()) {
                VowmonDialog.toast('请填写技能名称', 'warning');
                return;
            }
            const item = JSON.parse(JSON.stringify(form.value));
            item.name = String(item.name).trim();
            item.cost = Number(item.cost) || 0;
            item.power = Number(item.power) || 0;
            item.category = normalizeCategory(item.category);
            item.tags = Array.isArray(item.tags)
                ? item.tags.map(t => String(t)).filter(t => t && t.trim())
                : [];
            item.learners = Array.isArray(item.learners)
                ? item.learners.map(t => String(t)).filter(t => t && t.trim())
                : [];
            if (!item.id) item.id = nextSkillId();

            if (isEdit.value && editIndex.value > -1) {
                skills.value.splice(editIndex.value, 1, item);
            } else {
                skills.value.unshift(item);
            }

            saveLocal();
            showModal.value = false;
        };

        /* ---------------------------------------------------------------- 删除 */
        const openDeleteConfirm = (index, name) => {
            deleteTargetIndex.value = index;
            deleteTargetName.value = name;
            VowmonDialog.confirm(
                `确定要删除技能 <strong>${VowmonDialog.esc(name)}</strong> 吗？`,
                { type: 'danger', title: '确认删除', okText: '确认删除', cancelText: '再想想', html: true }
            ).then((ok) => {
                if (ok) confirmDelete();
            });
        };

        const confirmDelete = () => {
            if (deleteTargetIndex.value > -1) {
                skills.value.splice(deleteTargetIndex.value, 1);
                saveLocal();
                VowmonDialog.toast('已删除', 'success');
            }
            deleteTargetIndex.value = -1;
        };

        // 弹窗关闭统一收口：遮罩点击 / Esc / 关闭按钮 都走这里（见 js/common-ui.js）
        const closeModal = (target) => {
            if (target === 'edit') showModal.value = false;
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

            isSyncing.value = true;
            const content = JSON.stringify({ skills: skills.value }, null, 4) + '\n';

            const repos = String(cfg.dataRepos || '')
                .split(/[\s,，]+/)
                .map(item => item.trim())
                .filter(Boolean);

            if (repos.length === 0) {
                isSyncing.value = false;
                VowmonDialog.toast('请先在「精灵管理 → 同步配置」里填写数据仓库名', 'warning', { duration: 3400 });
                return;
            }

            try {
                for (const repo of repos) {
                    await GitHubSync.uploadFile(
                        cfg.token, cfg.owner, repo, 'skills-data.json',
                        content, 'update skills data'
                    );
                }
                VowmonDialog.toast('技能数据同步成功，共 ' + repos.length + ' 个仓库', 'success');
            } catch (err) {
                VowmonDialog.alert('技能数据同步失败，请检查 Token 权限和仓库名。', {
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

            const savedData = localStorage.getItem('vowmon_skills_data');
            if (savedData) {
                try {
                    skills.value = normalizeSkills(JSON.parse(savedData));
                } catch (err) {
                    console.warn('本地技能数据解析失败，改用默认数据', err);
                    skills.value = normalizeSkills(allSkillsData);
                }
            } else {
                skills.value = normalizeSkills(allSkillsData);
            }

            // 精灵池：给「可学会精灵」选择器用（ready(['skills','pets']) 已保证 allPetsData 就绪）
            try {
                pets.value = JSON.parse(localStorage.getItem('vowmon_pets_data') || 'null')
                    || JSON.parse(JSON.stringify(allPetsData));
            } catch (err) {
                pets.value = JSON.parse(JSON.stringify(allPetsData));
            }

            // 点击「显示列」浮层/标签选择器以外的地方时收起对应面板。
            // 注意：这里用捕获阶段（true），是先于目标元素上的 @click.stop 执行的，
            // 所以必须自己判断点击是否落在面板内部——之前无条件 showColSettings=false，
            // 会导致在复选框上的每一次点击都被当成「外部点击」把面板收起，
            // 复选框的默认勾选/取消被中途打断，表现为「要点好几次才生效」。
            document.addEventListener('click', (e) => {
                const el = e.target && e.target.closest ? e.target : null;
                if (!(el && el.closest('.col-settings-wrap'))) showColSettings.value = false;
                // 点击标签选择器以外时收起候选下拉（捕获到 document，绕过 modal 的 @click.stop）
                if (!(el && el.closest('.tag-selector'))) showTagDropdown.value = false;
            }, true);

            // 其它自定义下拉的关闭统一由 js/common-ui.js 处理（VowmonDropdown）
        });

        // 从数据仓库拉取最新数据（数据仓库是唯一数据源，会覆盖本机草稿）
        const pullFromRepo = async () => {
            const cfg = config.value;
            const repo = String(cfg.dataRepos || '').split(/[\s,，]+/).map(s => s.trim()).filter(Boolean)[0];
            if (!cfg.token || !cfg.owner || !repo) {
                VowmonDialog.alert('请先在「精灵管理 → 同步配置」里填写 Token、用户名和数据仓库名', { type: 'warning', title: '还没配置好' });
                return;
            }
            const ok = await VowmonDialog.confirm(
                '将从「' + repo + '」读取 skills-data.json，并覆盖本机未同步的改动。继续？',
                { type: 'warning', title: '从数据仓库拉取', okText: '拉取' }
            );
            if (!ok) return;

            isSyncing.value = true;
            try {
                const bag = await GitHubSync.downloadJson(cfg.token, cfg.owner, repo, 'skills-data.json');
                if (!bag || !Array.isArray(bag.skills)) throw new Error('仓库里没有 skills-data.json，或字段不是 skills 数组');

                skills.value = normalizeSkills(bag.skills);
                localStorage.setItem('vowmon_skills_data', JSON.stringify(skills.value));
                if (window.VowmonStore) VowmonStore.replace('skills', { skills: skills.value });
                VowmonDialog.toast('已从 ' + repo + ' 拉取 ' + skills.value.length + ' 条技能', 'success', { duration: 3200 });
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
            skillCategories: SKILL_CATEGORIES,
            tagLibrary, tagQuery, showTagDropdown, filteredTagOptions, canCreateTag,
            createTag, deleteTag, toggleTag,
            getTypeIcon, getTypeColor,
            getCategoryIcon, getCategoryColor,
            getTagIcon, getTagColor,
            learnerFilter, filteredLearnerPets,
            hasLearner, toggleLearner, selectAllLearners, clearLearners, allFilteredSelected,
            showColSettings, allColumns, visibleCols,
            config,
            skills,
            isSyncing,
            showModal,
            isEdit,
            form,
            activeDropdown,
            deleteTargetName,
            closeModal,
            openEditor,
            saveSkill,
            openDeleteConfirm,
            confirmDelete,
            syncToGitHub,
            pullFromRepo
        };
    }
}).mount('#app');
});
