/* ==========================================================================
   Vowmon Wiki 后台 —— 阶段境界管理（等级 → 境界名 / 区间 / 颜色）
   --------------------------------------------------------------------------
   数据链路（与其它后台页一致）：
     编辑 -> VowmonStore.save('stages', { stages }) 写本机镜像（前台立刻生效）
          -> 点「一键同步」把 stages-data.json 推到 GitHub 数据仓库
   读取方：js/stage-config.js（StageConfig.bands / stageName / stageColor），
     admin-individuals、records/individuals、records/characters 全走它，
     改这里一处，前台三处自动跟着变。
   字段：{ name 境界名, min 起始等级, max 结束等级（null = 不封顶）, color 颜色 }
   注意：模板里用到的每个方法/状态都必须在 setup 的 return 里
         （undefined 引用会让生产版渲染静默失效，表现为弹窗打不开/白屏）。
   ========================================================================== */

const { createApp, ref, computed, onMounted } = Vue;

VowmonData.ready(['stages'], { fresh: true }).then(function () {

const app = createApp({
    setup() {
        /* ------------------------------------------------------------ 同步配置 */
        const config = ref({ token: '', owner: '', dataRepos: 'vowmon_data', imgRepos: 'vowmon_imgs', imgCdnBase: '' });
        const isSyncing = ref(false);

        /* ---------------------------------------------------------------- 数据 */
        const normalizeStage = (s) => {
            const min = Math.max(0, Math.floor(Number(s && s.min) || 0));
            let max = (s && s.max == null) ? null : Math.floor(Number(s.max) || 0);
            if (max != null && max < min) max = min;
            return {
                name: String((s && s.name) || '').trim(),
                min: min,
                max: max,
                color: String((s && s.color) || '').trim() || '#718096'
            };
        };
        const stages = ref([]);

        /* ------------------------------------------------------------- 增删改 */
        const addStage = () => {
            /* 新境界插到最后：起始等级 = 上一条上限 + 1，不封顶 */
            const last = stages.value[stages.value.length - 1];
            const min = last ? (last.max == null ? (last.min + 1) : (last.max + 1)) : 1;
            stages.value.push({ name: '', min: min, max: null, color: '#718096' });
        };
        const removeStage = (i) => { stages.value.splice(i, 1); };
        const moveStage = (i, dir) => {
            const j = i + dir;
            if (j < 0 || j >= stages.value.length) return;
            const arr = stages.value;
            const t = arr[i]; arr[i] = arr[j]; arr[j] = t;
        };
        const toggleInf = (i) => {
            const s = stages.value[i];
            if (!s) return;
            s.max = (s.max == null) ? (s.min + 10) : null;
        };
        const restoreDefault = () => {
            VowmonDialog.confirm(
                '恢复为默认八阶（初灵 1-15 / 升灵 16-35 / 族尊 36-50 / 基座 51-60 / 灵相 61-70 / 律冠 71-89 / 元灵 90-99 / 元 100 起）？当前自定义内容会被覆盖。',
                { type: 'warning', title: '恢复默认', okText: '恢复' }
            ).then((ok) => {
                if (!ok) return;
                stages.value = StageConfig.DEFAULT_STAGES.map(normalizeStage);
                saveLocal();
                VowmonDialog.toast('已恢复默认八阶（本机生效，改完记得同步）', 'success');
            });
        };

        /* ------------------------------------------------------------- 校验 */
        const issues = computed(() => {
            const list = [];
            const arr = stages.value;
            if (!arr.length) { list.push('至少要有一个境界。'); return list; }
            arr.forEach((s, i) => {
                if (!s.name) list.push('第 ' + (i + 1) + ' 行：境界名不能为空。');
                if (s.max != null && s.max < s.min) list.push('「' + (s.name || '第' + (i + 1) + '行') + '」：上限不能小于下限。');
            });
            const names = arr.map(s => s.name).filter(Boolean);
            const dup = names.find((n, i) => names.indexOf(n) !== i);
            if (dup) list.push('境界名「' + dup + '」重复了。');
            /* 相邻区间检查（按 min 排序后的展示顺序） */
            for (let i = 1; i < arr.length; i++) {
                const prev = arr[i - 1], cur = arr[i];
                if (prev.max == null) list.push('「' + (prev.name || '上一行') + '」不封顶，后面的「' + (cur.name || '') + '」永远不会被匹配到，请把它移到最后或设置上限。');
                else if (cur.min <= prev.max) list.push('「' + (cur.name || '第' + (i + 1) + '行') + '」（' + cur.min + ' 起）与「' + (prev.name || '') + '」（到 ' + prev.max + '）区间重叠。');
                else if (cur.min > prev.max + 1) list.push('等级 ' + (prev.max + 1) + '-' + (cur.min - 1) + ' 没有归属任何境界（「' + (prev.name || '') + '」和「' + (cur.name || '') + '」之间有空洞）。');
            }
            return list;
        });

        /* ------------------------------------------------------------- 预览 */
        const previewChips = computed(() =>
            stages.value
                .slice()
                .sort((a, b) => a.min - b.min)
                .map(s => ({
                    name: s.name || '（未命名）',
                    text: s.min + '-' + (s.max == null ? '∞' : s.max),
                    color: s.color
                }))
        );
        const previewLv = computed(() => {
            const arr = stages.value.slice().sort((a, b) => a.min - b.min);
            const samples = [1, 15, 16, 35, 36, 50, 51, 60, 61, 70, 71, 89, 90, 99, 100, 120];
            return samples.map(lv => {
                const hit = arr.find(s => lv >= s.min && (s.max == null || lv <= s.max) && s.name);
                return { lv: lv, name: hit ? hit.name : '未记录', color: hit ? hit.color : '#718096' };
            });
        });

        /* ------------------------------------------------------------- 保存 */
        const saveLocal = () => {
            if (!window.VowmonStore) return;
            stages.value = stages.value.map(normalizeStage);
            VowmonStore.save('stages', { stages: stages.value });
        };
        const saveItem = () => {
            if (issues.value.length) {
                VowmonDialog.alert('有 ' + issues.value.length + ' 个问题需要先解决：<br>· ' + issues.value.join('<br>· '), {
                    type: 'warning', title: '暂时不能保存', html: true
                });
                return;
            }
            stages.value = stages.value.slice().sort((a, b) => a.min - b.min);
            saveLocal();
            VowmonDialog.toast('已保存到本机，前台已生效。改完记得点「一键同步」推到仓库', 'success', { duration: 3600 });
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
                // 先取云端当前版本做差异预览（文件不存在 = 首次同步，视为空）
                const remoteBag = await GitHubSync.downloadJson(config.value.token, config.value.owner, targetRepos()[0], 'stages-data.json');
                const res = await VowmonDiff.review({
                    mode: 'push',
                    sourceLabel: '本机草稿',
                    targetLabel: '云端仓库（' + targetRepos()[0] + '）',
                    sections: [{
                        label: '阶段境界',
                        local: stages.value.map(normalizeStage),
                        remote: remoteBag && Array.isArray(remoteBag.stages) ? remoteBag.stages : [],
                        key: s => s.name,
                        name: s => s.name
                    }]
                });
                if (!res.ok) {
                    if (res.empty) VowmonDialog.toast('本机与云端内容一致，无需同步', 'info', { duration: 2600 });
                    return;
                }

                const content = JSON.stringify({ stages: res.sections[0].merged }, null, 1) + '\n';
                for (const repo of targetRepos()) {
                    await GitHubSync.uploadFile(config.value.token, config.value.owner, repo, 'stages-data.json', content, 'update stages data');
                }
                // 全选（完整同步）才清「未同步」标记
                if (res.all && window.VowmonStore) VowmonStore.markSynced('stages');
                VowmonDialog.toast('已上传 ' + res.count + ' 处修改，前台一两分钟后更新', 'success');
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
            isSyncing.value = true;
            try {
                const bag = await GitHubSync.downloadJson(cfg.token, cfg.owner, repo, 'stages-data.json');
                if (!bag || !Array.isArray(bag.stages)) throw new Error('仓库里没有 stages-data.json，或字段不是 stages 数组');

                // 弹出差异预览：每条修改可单独勾选是否覆盖本机
                const res = await VowmonDiff.review({
                    mode: 'pull',
                    sourceLabel: '云端仓库（' + repo + '）',
                    targetLabel: '本机草稿',
                    sections: [{
                        label: '阶段境界',
                        local: stages.value.map(normalizeStage),
                        remote: bag.stages,
                        key: s => s.name,
                        name: s => s.name
                    }]
                });
                if (!res.ok) {
                    if (res.empty) VowmonDialog.toast('云端与本机内容一致，无需拉取', 'info', { duration: 2600 });
                    return;
                }

                stages.value = res.sections[0].merged.map(normalizeStage);
                if (res.all && window.VowmonStore) VowmonStore.replace('stages', { stages: stages.value });
                else if (window.VowmonStore) VowmonStore.save('stages', { stages: stages.value });
                VowmonDialog.toast('已拉取 ' + res.count + ' 处修改（共 ' + stages.value.length + ' 个境界）', 'success', { duration: 3200 });
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

            /* 本机草稿优先，其次云端数据，最后内置默认表 */
            const mirror = window.VowmonStore ? VowmonStore.getMirror('stages') : null;
            const src = (mirror && Array.isArray(mirror.stages) && mirror.stages.length)
                ? mirror.stages
                : ((typeof allStagesData !== 'undefined' && Array.isArray(allStagesData) && allStagesData.length) ? allStagesData : StageConfig.DEFAULT_STAGES);
            stages.value = src.map(normalizeStage);
        });

        return {
            config, isSyncing, stages,
            issues, previewChips, previewLv,
            addStage, removeStage, moveStage, toggleInf, restoreDefault,
            saveItem, syncToGitHub, pullFromRepo
        };
    }
});
app.mount('#app');
});
