/* ==========================================================================
   Vowmon Wiki 后台 —— 图片管理
   --------------------------------------------------------------------------
   职责：
     1. 读取「同步配置」中的所有图片仓库（支持英文逗号分隔的多个仓库）；
     2. 扫描每个仓库的图片文件，展示缩略图 / 路径 / 所属仓库；
     3. 把仓库图片与精灵数据做关联（按路径 / 文件名匹配）；
     4. 支持上传图片到指定仓库、删除图片、把图片绑定到精灵。
   依赖：Vue3 / type-config.js / vow-data.js / github-api.js / common-ui.js
   ========================================================================== */
const { createApp, ref, reactive, computed, watch, onMounted } = Vue;
VowmonData.ready(['vows'], { fresh: true }).then(function () {

createApp({
    setup() {
        const IMAGE_EXT = /\.(png|jpe?g|gif|webp|svg|bmp|avif)$/i;

        const config = ref({ token: '', owner: '', dataRepos: '', imgRepos: '', imgCdnBase: '' });
        const vows = ref([]);

        const currentTab = ref('repo');
        const isLoading = ref(false);
        const loadError = ref('');
        const repoStatus = ref([]);   // [{ repo, ok, count, error }]
        const allImages = ref([]);    // [{ repo, path, name, sha, url, usedBy:[] }]

        const repoSearch = ref('');
        const repoFilter = ref('all');
        const usageFilter = ref('all');

        const vowSearch = ref('');
        const vowStatusFilter = ref('all');

        // 上传
        const showUploadModal = ref(false);
        const uploadVow = ref(null);
        const uploadRepo = ref('');
        const uploadPath = ref('');
        const uploadPreview = ref('');
        const uploadFileInput = ref(null);
        const isUploading = ref(false);

        // 删除（确认弹窗由 VowmonDialog 负责显示）
        const deleteTarget = ref(null);
        const isDeleting = ref(false);

        // 绑定精灵
        const showBindModal = ref(false);
        const bindImage = ref(null);
        const bindSearch = ref('');
        // 绑到哪个位置：image = 主图（替换原图），shiny = 异色图（追加，不动主图）
        const bindMode = ref('image');

        // 上传时同样要选位置，避免把异色图当成主图覆盖掉
        const uploadMode = ref('image');

        // 文件名像异色的：001_s.png / 001_s2.png / 001_shiny.png（与后台命名规则一致）
        const looksShiny = (path) => /_s\d*\.(png|jpe?g|webp)$/i.test(String(path || '')) ||
            /_shiny\d*\./i.test(String(path || ''));

        // 提示：统一走 VowmonDialog 的轻提示（js/dialog.js），不再自己维护一份 toast
        const showToast = (msg, type = 'ok') => {
            VowmonDialog.toast(msg, type === 'err' ? 'danger' : 'success', { duration: 3200 });
        };

        /* ------------------------------ 配置 / 数据 ------------------------------ */
        const imgRepos = computed(() =>
            (config.value.imgRepos || '')
                .split(',')
                .map(s => s.trim())
                .filter(Boolean)
        );
        const hasConfig = computed(() =>
            !!(config.value.token && config.value.owner && imgRepos.value.length)
        );

        const loadConfigAndVows = () => {
            const storedConfig = localStorage.getItem('vowmon_sync_config');
            if (storedConfig) {
                try { Object.assign(config.value, JSON.parse(storedConfig)); } catch (e) { /* ignore */ }
            }
            const storedVows = localStorage.getItem('vowmon_vows_data') || localStorage.getItem('vowmon_pets_data');
            if (storedVows) {
                try { vows.value = JSON.parse(storedVows); } catch (e) { vows.value = []; }
            } else if (typeof allVowsData !== 'undefined') {
                vows.value = JSON.parse(JSON.stringify(allVowsData));
            }
        };

        const saveVows = () => {
            localStorage.setItem('vowmon_vows_data', JSON.stringify(vows.value));
            // 写入本机镜像：前台（同一台电脑）立刻就能看到这次改动
            if (window.VowmonStore) VowmonStore.save('vows', { vows: vows.value });
        };

        // 往精灵的异色列表里追加一张（去重），不动主图
        const addShinyToVow = (vow, path) => {
            if (!Array.isArray(vow.shiny)) vow.shiny = [];
            if (vow.shiny.indexOf(path) !== -1) return false;
            vow.shiny.push(path);
            return true;
        };

        // 按仓库生成 CDN 基础路径：
        //   - 支持 {repo} 占位符；
        //   - 若基础路径里出现了某个已配置仓库名，则把它替换成目标仓库（适配多仓库）；
        //   - 都没写则用 jsdelivr 默认规则。
        const buildCdnBase = (repo) => {
            let raw = (config.value.imgCdnBase || '').trim().replace(/\/+$/, '');
            // 后台没填就看仓库里的默认值，别一上来就掉到 jsDelivr
            if (!raw) raw = String((window.VOWMON_SITE_CONFIG || {}).imgCdnBase || '').trim().replace(/\/+$/, '');
            if (raw) {
                if (raw.indexOf('{repo}') !== -1) return raw.replace(/\{repo\}/g, repo);
                // 长的仓库名优先替换，避免 img1 先匹配到 img10 的前缀
                const sorted = imgRepos.value.slice().sort((a, b) => b.length - a.length);
                for (const r of sorted) {
                    if (r && raw.indexOf(r) !== -1) return raw.split(r).join(repo);
                }
                return raw;
            }
            return `https://cdn.jsdelivr.net/gh/${config.value.owner}/${repo}@main`;
        };

        const fileUrl = (repo, path) => buildCdnBase(repo) + '/' + String(path).replace(/^\/+/, '');

        /* ------------------------------ 扫描仓库 ------------------------------ */
        // 精灵图片实际存放在 sprites/ 目录（见 admin.js 的上传逻辑），同时兼容仓库根目录。
        const SCAN_DIRS = ['sprites', ''];

        const loadAll = async () => {
            if (!hasConfig.value) return;
            isLoading.value = true;
            loadError.value = '';
            allImages.value = [];
            repoStatus.value = [];

            const seen = new Set();
            const collected = [];

            // 多仓库 × 多目录并行读取（原来是一个个 await，仓库多时会明显慢）
            const tasks = [];
            imgRepos.value.forEach(repo => {
                SCAN_DIRS.forEach(dir => {
                    tasks.push(
                        GitHubSync.listDirectory(config.value.token, config.value.owner, repo, dir)
                            .then(files => ({ repo, files, error: '' }))
                            .catch(e => ({ repo, files: [], error: (e && e.message) || '读取失败' }))
                    );
                });
            });
            const results = await Promise.all(tasks);

            const statusMap = new Map();
            imgRepos.value.forEach(repo => statusMap.set(repo, { repo, ok: true, count: 0, error: '' }));

            results.forEach(r => {
                const st = statusMap.get(r.repo);
                if (!st) return;
                if (r.error) {
                    st.ok = false;
                    st.error = r.error;
                    return;
                }
                r.files.forEach(f => {
                    if (f.type !== 'file' || !IMAGE_EXT.test(f.name)) return;
                    const key = r.repo + '|' + f.path;
                    if (seen.has(key)) return;
                    seen.add(key);
                    collected.push({
                        repo: r.repo,
                        path: f.path,
                        name: f.name,
                        sha: f.sha,
                        size: f.size,
                        // 缩略图 URL 带上文件 sha 作缓存戳：同名替换上传后 sha 会变，
                        // 新 URL 必然绕开 CF/浏览器缓存，刷新仓库立刻就能看到新图
                        url: fileUrl(r.repo, f.path) + (f.sha ? '?v=' + String(f.sha).slice(0, 8) : ''),
                        usedBy: []
                    });
                    st.count++;
                });
            });

            repoStatus.value = imgRepos.value.map(repo => statusMap.get(repo));
            allImages.value = collected;

            // 建立图片 -> 精灵 的关联
            buildUsage();

            isLoading.value = false;
            const failed = repoStatus.value.filter(s => !s.ok);
            if (failed.length) {
                loadError.value = `${failed.length} 个仓库读取失败：${failed.map(s => s.repo).join('、')}。请检查 Token 权限与仓库名。`;
            }
        };

        // 索引：把「拿精灵图去图片堆里找」从 O(图片数) 降到 O(1)
        // 1000 只精灵（含异色约 2000 张图）用原来的双重遍历要跑几百万次字符串比较，
        // 主线程会卡好几秒，所以这里预建 path / 文件名两张表。只读 allImages，随它一起重算。
        const imageIndex = computed(() => {
            const byPath = new Map();
            const byName = new Map();
            allImages.value.forEach(img => {
                byPath.set(img.path, img);
                if (!byName.has(img.name)) byName.set(img.name, []);
                byName.get(img.name).push(img);
            });
            return { byPath, byName };
        });

        // 匹配规则：路径完全一致优先，否则按文件名命中（兼容外链 / 不同 CDN 前缀）
        const findImage = (vowImage) => {
            if (!vowImage) return null;
            const a = String(vowImage).replace(/\\/g, '');
            const exact = imageIndex.value.byPath.get(a);
            if (exact) return exact;
            const aName = a.split('/').pop().split('?')[0];
            const list = aName ? imageIndex.value.byName.get(aName) : null;
            return list && list.length ? list[0] : null;
        };

        // 全部命中（路径命中 + 同名命中，去重），用于统计「哪张图被谁用了」
        const matchImages = (vowImage) => {
            if (!vowImage) return [];
            const a = String(vowImage).replace(/\\/g, '');
            const aName = a.split('/').pop().split('?')[0];
            const out = [];
            const seen = new Set();
            const exact = imageIndex.value.byPath.get(a);
            if (exact) { out.push(exact); seen.add(exact); }
            const list = aName ? (imageIndex.value.byName.get(aName) || []) : [];
            list.forEach(img => { if (!seen.has(img)) { out.push(img); seen.add(img); } });
            return out;
        };

        const buildUsage = () => {
            allImages.value.forEach(img => { img.usedBy = []; });
            vows.value.forEach(p => {
                const label = p.name || p.id;
                const mark = (img, who) => { if (!img.usedBy.includes(who)) img.usedBy.push(who); };
                // 主图
                matchImages(p.image).forEach(img => mark(img, label));
                // 异色图（shiny 数组，可多张）——也要算"被使用"，否则会被误判成未使用图片
                (Array.isArray(p.shiny) ? p.shiny : []).forEach(sp => {
                    matchImages(sp).forEach(img => mark(img, label + '（异色）'));
                });
            });
        };

        /* ------------------------------ 派生数据 ------------------------------ */
        const filteredRepoImages = computed(() => {
            const kw = repoSearch.value.trim().toLowerCase();
            return allImages.value.filter(img => {
                if (repoFilter.value !== 'all' && img.repo !== repoFilter.value) return false;
                if (usageFilter.value === 'used' && !img.usedBy.length) return false;
                if (usageFilter.value === 'unused' && img.usedBy.length) return false;
                if (kw) {
                    const hay = (img.name + ' ' + img.path + ' ' + img.repo + ' ' + img.usedBy.join(' ')).toLowerCase();
                    if (hay.indexOf(kw) === -1) return false;
                }
                return true;
            });
        });

        // 精灵图片行：状态 ok / missing / empty / external
        const vowRows = computed(() => vows.value.map(p => {
            const image = p.image || '';
            if (!image) return { vow: p, status: 'empty', url: '', repo: '' };
            if (/^https?:\/\//i.test(image)) return { vow: p, status: 'external', url: image, repo: '' };
            const matched = findImage(image);
            if (matched) return { vow: p, status: 'ok', url: matched.url, repo: matched.repo };
            return { vow: p, status: 'missing', url: fileUrl(imgRepos.value[0] || '', image), repo: '' };
        }));

        const linkedCount = computed(() => vowRows.value.filter(r => r.status === 'ok').length);
        const missingVows = computed(() => vowRows.value.filter(r => r.status === 'missing' || r.status === 'empty'));

        const filteredVowRows = computed(() => {
            const kw = vowSearch.value.trim().toLowerCase();
            return vowRows.value.filter(r => {
                if (vowStatusFilter.value !== 'all' && r.status !== vowStatusFilter.value) return false;
                if (kw) {
                    const hay = ((r.vow.id || '') + ' ' + (r.vow.name || '') + ' ' + (r.vow.image || '')).toLowerCase();
                    if (hay.indexOf(kw) === -1) return false;
                }
                return true;
            });
        });

        /* ------------------------------ 分页 ------------------------------ */
        // 图片仓库可能上千张图，全部铺出来会同时生成上千个 <img> 并向 CDN 发请求，
        // 页面直接卡住甚至被 jsDelivr 限流，所以两个网格都按页渲染（每页 60）。
        const PAGE_SIZE = 60;
        const repoPage = ref(1);
        const vowPage = ref(1);

        const repoTotalPages = computed(() => Math.ceil(filteredRepoImages.value.length / PAGE_SIZE) || 1);
        const vowTotalPages = computed(() => Math.ceil(filteredVowRows.value.length / PAGE_SIZE) || 1);

        const paginatedRepoImages = computed(() => {
            const page = Math.min(Math.max(repoPage.value, 1), repoTotalPages.value);
            const start = (page - 1) * PAGE_SIZE;
            return filteredRepoImages.value.slice(start, start + PAGE_SIZE);
        });
        const paginatedVowRows = computed(() => {
            const page = Math.min(Math.max(vowPage.value, 1), vowTotalPages.value);
            const start = (page - 1) * PAGE_SIZE;
            return filteredVowRows.value.slice(start, start + PAGE_SIZE);
        });

        // 搜索结果或筛选条件一变就回到第 1 页，否则可能停在一个空页上
        watch([repoSearch, repoFilter, usageFilter], () => { repoPage.value = 1; });
        watch([vowSearch, vowStatusFilter], () => { vowPage.value = 1; });
        // 重新扫描后总页数可能变少，越界就纠正回来
        watch(repoTotalPages, (n) => { if (repoPage.value > n) repoPage.value = n; });
        watch(vowTotalPages, (n) => { if (vowPage.value > n) vowPage.value = n; });

        const statusText = (s) => ({ ok: '正常', missing: '缺失', empty: '未填写', external: '外链' }[s] || s);        // 异色图片张数（shiny 数组，可为空）
        const shinyCount = (p) => (p && Array.isArray(p.shiny) ? p.shiny.length : 0);
        const shortRepo = (r) => r.length > 16 ? r.slice(0, 14) + '…' : r;
        // 直接算，不再去 vowRows 里线性查找（模板里每行会调多次，千条时是 O(n²)）
        const getVowUrl = (p) => {
            const image = (p && p.image) || '';
            if (!image) return '';
            if (/^https?:\/\//i.test(image)) return image;
            const matched = findImage(image);
            return matched ? matched.url : fileUrl(imgRepos.value[0] || '', image);
        };

        const onImgError = (e) => {
            const el = e.target;
            el.style.visibility = 'hidden';
        };

        /* ------------------------------ 上传 ------------------------------ */
        // 切换位置时顺手把建议路径换掉（主图 ↔ 异色图），省得用户自己改文件名
        const setUploadMode = (mode) => {
            uploadMode.value = mode;
            const vow = uploadVow.value;
            if (!vow) return;
            const id = vow.id;
            const p = String(uploadPath.value || '');
            if (mode === 'shiny' && new RegExp('sprites/' + id + '\\.png$').test(p)) {
                uploadPath.value = `sprites/${id}_s.png`;
            } else if (mode === 'image' && looksShiny(p)) {
                uploadPath.value = `sprites/${id}.png`;
            }
        };

        const openUpload = (vow) => {
            if (!hasConfig.value) {
                showToast('请先在「同步配置」中填写仓库信息', 'err');
                return;
            }
            uploadVow.value = vow || null;
            uploadRepo.value = imgRepos.value[0] || '';
            uploadMode.value = 'image';
            if (vow && vow.image && !/^https?:\/\//i.test(vow.image)) {
                uploadPath.value = vow.image;
            } else if (vow) {
                uploadPath.value = `sprites/${vow.id}.png`;
            } else {
                uploadPath.value = 'sprites/';
            }
            uploadPreview.value = '';
            showUploadModal.value = true;
        };

        const handleUpload = async (event) => {
            const file = event.target.files && event.target.files[0];
            if (!file || !uploadRepo.value) return;

            isUploading.value = true;
            try {
                if (!window.ImageUtils) throw new Error('图片处理模块未加载，请强制刷新页面（Ctrl + F5）后重试');
                // 先压缩：等比缩放到配置尺寸以内，统一输出 PNG（保留透明背景）
                const img = await ImageUtils.compressToPng(file, config.value.imgSize || 512);

                let path = (uploadPath.value || '').trim().replace(/^\/+/, '');
                // 路径是目录（以 / 结尾或空）时，自动补全文件名
                if (!path || /\/$/.test(path)) {
                    const baseName = uploadVow.value
                        ? `${uploadVow.value.id}.png`
                        : (file.name.replace(/\.[^.]+$/, '') || 'image') + '.png';
                    path = path + baseName;
                }
                // 统一改为 .png 后缀，与压缩后的实际格式一致
                path = path.replace(/\.[^./]+$/, '') + '.png';
                // 没有目录前缀时补上 sprites/
                if (path.indexOf('/') === -1) path = 'sprites/' + path;

                await GitHubSync.uploadFile(
                    config.value.token, config.value.owner, uploadRepo.value,
                    path, img.base64, `Upload image: ${path}`, true
                );
                if (uploadVow.value) {
                    if (uploadMode.value === 'shiny') {
                        const added = addShinyToVow(uploadVow.value, path);
                        if (!added) showToast('这张图已经在该精灵的异色列表里了', 'err');
                    } else {
                        uploadVow.value.image = path;
                    }
                    saveVows();
                }
                uploadPreview.value = `data:image/png;base64,${img.base64}`;
                const target = uploadVow.value
                    ? (uploadMode.value === 'shiny' ? '已作为异色图追加到精灵' : '已上传并替换精灵主图')
                    : '图片上传成功';
                showToast(target + `（${img.canvasSize}×${img.canvasSize}，${ImageUtils.formatBytes(img.bytes)}）`);
                showUploadModal.value = false;
                await loadAll();
            } catch (err) {
                showToast('上传失败：' + err.message, 'err');
            } finally {
                isUploading.value = false;
                event.target.value = '';
            }
        };

        /* ------------------------------ 删除 ------------------------------ */
        const openDelete = (img) => {
            if (!img) return;
            const usedBy = Array.isArray(img.usedBy) ? img.usedBy : [];
            const extra = usedBy.length
                ? `<br><span class="vdlg-mark">该图片正被精灵「${VowmonDialog.esc(usedBy.join('、'))}」使用，删除后这些精灵的图片将失效。</span>`
                : '';
            VowmonDialog.confirm(
                `确定要从仓库 <strong>${VowmonDialog.esc(img.repo)}</strong> 永久删除图片 <strong>${VowmonDialog.esc(img.name)}</strong> 吗？此操作不可撤销。${extra}`,
                { type: 'danger', title: '确认删除图片', okText: '确认删除', cancelText: '取消', html: true }
            ).then((ok) => {
                if (!ok) return;
                deleteTarget.value = img;
                confirmDelete();
            });
        };

        const confirmDelete = async () => {
            const img = deleteTarget.value;
            if (!img) return;
            isDeleting.value = true;
            try {
                await GitHubSync.deleteFile(
                    config.value.token, config.value.owner, img.repo,
                    img.path, img.sha, `Delete image: ${img.path}`
                );
                showToast('图片已删除');
                deleteTarget.value = null;
                await loadAll();
            } catch (err) {
                showToast('删除失败：' + err.message, 'err');
            } finally {
                isDeleting.value = false;
            }
        };

        /* ------------------------------ 绑定精灵 ------------------------------ */
        const replaceVowWith = (img) => {
            bindImage.value = img;
            bindSearch.value = '';
            // 文件名像异色图就默认选「异色」，避免一按就把主图覆盖掉
            bindMode.value = looksShiny(img && img.path) ? 'shiny' : 'image';
            showBindModal.value = true;
        };

        const filteredBindVows = computed(() => {
            const kw = bindSearch.value.trim().toLowerCase();
            if (!kw) return vows.value;
            return vows.value.filter(p =>
                ((p.id || '') + ' ' + (p.name || '')).toLowerCase().indexOf(kw) !== -1
            );
        });

        const confirmBind = (vow) => {
            if (!bindImage.value) return;
            const path = bindImage.value.path;
            if (bindMode.value === 'shiny') {
                const added = addShinyToVow(vow, path);
                saveVows();
                showToast(added
                    ? `已把这张图作为异色图加到「${vow.name || vow.id}」（主图不变）`
                    : `「${vow.name || vow.id}」的异色列表里已经有这张图了`);
                if (!added) return;
            } else {
                vow.image = path;
                saveVows();
                showToast(`已将图片绑定到「${vow.name || vow.id}」的主图`);
            }
            showBindModal.value = false;
            bindImage.value = null;
            buildUsage();
        };

        /* ------------------------------ 工具 ------------------------------ */
        const copyPath = async (path) => {
            try {
                await navigator.clipboard.writeText(path);
                showToast('路径已复制');
            } catch (e) {
                const ta = document.createElement('textarea');
                ta.value = path;
                document.body.appendChild(ta);
                ta.select();
                try { document.execCommand('copy'); showToast('路径已复制'); }
                catch (err) { showToast('复制失败，请手动复制', 'err'); }
                document.body.removeChild(ta);
            }
        };

        onMounted(() => {
            loadConfigAndVows();
            if (hasConfig.value) loadAll();
        });

        return {
            config, vows, imgRepos, hasConfig, currentTab,
            isLoading, loadError, repoStatus, allImages, loadAll,
            repoSearch, repoFilter, usageFilter, filteredRepoImages,
            vowSearch, vowStatusFilter, filteredVowRows, linkedCount, missingVows,
            repoPage, vowPage, repoTotalPages, vowTotalPages,
            paginatedRepoImages, paginatedVowRows, PAGE_SIZE,
            showUploadModal, uploadVow, uploadRepo, uploadPath, uploadPreview,
            uploadFileInput, isUploading, openUpload, handleUpload, uploadMode, setUploadMode,
            deleteTarget, isDeleting, openDelete, confirmDelete,
            showBindModal, bindImage, bindSearch, filteredBindVows, replaceVowWith, confirmBind,
            bindMode, looksShiny,
            getVowUrl, statusText, shortRepo, onImgError, copyPath, shinyCount,
            window
        };
    }
}).mount('#app');
});
