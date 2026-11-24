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
const { createApp, ref, reactive, computed, onMounted } = Vue;

createApp({
    setup() {
        const IMAGE_EXT = /\.(png|jpe?g|gif|webp|svg|bmp|avif)$/i;

        const config = ref({ token: '', owner: '', dataRepos: '', imgRepos: '', imgCdnBase: '' });
        const pets = ref([]);

        const currentTab = ref('repo');
        const isLoading = ref(false);
        const loadError = ref('');
        const repoStatus = ref([]);   // [{ repo, ok, count, error }]
        const allImages = ref([]);    // [{ repo, path, name, sha, url, usedBy:[] }]

        const repoSearch = ref('');
        const repoFilter = ref('all');
        const usageFilter = ref('all');

        const petSearch = ref('');
        const petStatusFilter = ref('all');

        // 上传
        const showUploadModal = ref(false);
        const uploadPet = ref(null);
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

        const loadConfigAndPets = () => {
            const storedConfig = localStorage.getItem('vowmon_sync_config');
            if (storedConfig) {
                try { Object.assign(config.value, JSON.parse(storedConfig)); } catch (e) { /* ignore */ }
            }
            const storedPets = localStorage.getItem('vowmon_pets_data');
            if (storedPets) {
                try { pets.value = JSON.parse(storedPets); } catch (e) { pets.value = []; }
            } else if (typeof allPetsData !== 'undefined') {
                pets.value = JSON.parse(JSON.stringify(allPetsData));
            }
        };

        const savePets = () => {
            localStorage.setItem('vowmon_pets_data', JSON.stringify(pets.value));
        };

        // 按仓库生成 CDN 基础路径：
        //   - 支持 {repo} 占位符；
        //   - 若基础路径里出现了某个已配置仓库名，则把它替换成目标仓库（适配多仓库）；
        //   - 都没写则用 jsdelivr 默认规则。
        const buildCdnBase = (repo) => {
            const raw = (config.value.imgCdnBase || '').trim().replace(/\/+$/, '');
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
            const statuses = [];

            for (const repo of imgRepos.value) {
                let repoCount = 0;
                let repoErr = '';
                for (const dir of SCAN_DIRS) {
                    try {
                        const files = await GitHubSync.listDirectory(
                            config.value.token, config.value.owner, repo, dir
                        );
                        files.forEach(f => {
                            if (f.type !== 'file' || !IMAGE_EXT.test(f.name)) return;
                            const key = repo + '|' + f.path;
                            if (seen.has(key)) return;
                            seen.add(key);
                            collected.push({
                                repo: repo,
                                path: f.path,
                                name: f.name,
                                sha: f.sha,
                                size: f.size,
                                url: fileUrl(repo, f.path),
                                usedBy: []
                            });
                            repoCount++;
                        });
                    } catch (e) {
                        repoErr = e.message || '读取失败';
                    }
                }
                statuses.push({ repo, ok: !repoErr, count: repoCount, error: repoErr });
            }

            repoStatus.value = statuses;
            allImages.value = collected;

            // 建立图片 -> 精灵 的关联
            buildUsage();

            isLoading.value = false;
            const failed = statuses.filter(s => !s.ok);
            if (failed.length) {
                loadError.value = `${failed.length} 个仓库读取失败：${failed.map(s => s.repo).join('、')}。请检查 Token 权限与仓库名。`;
            }
        };

        // 匹配规则：路径完全一致，或以同样的文件名结尾（兼容外链 / 不同 CDN 前缀）
        const pathMatches = (petImage, img) => {
            if (!petImage) return false;
            const a = String(petImage).replace(/\\/g, '');
            const b = img.path;
            if (a === b) return true;
            const aName = a.split('/').pop().split('?')[0];
            return !!aName && aName === img.name;
        };

        const buildUsage = () => {
            allImages.value.forEach(img => { img.usedBy = []; });
            pets.value.forEach(p => {
                const label = p.name || p.id;
                const mark = (img, who) => { if (!img.usedBy.includes(who)) img.usedBy.push(who); };
                // 主图
                if (p.image) {
                    allImages.value.forEach(img => {
                        if (pathMatches(p.image, img)) mark(img, label);
                    });
                }
                // 异色图（shiny 数组，可多张）——也要算"被使用"，否则会被误判成未使用图片
                (Array.isArray(p.shiny) ? p.shiny : []).forEach(sp => {
                    allImages.value.forEach(img => {
                        if (pathMatches(sp, img)) mark(img, label + '（异色）');
                    });
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
        const petRows = computed(() => pets.value.map(p => {
            const image = p.image || '';
            if (!image) return { pet: p, status: 'empty', url: '', repo: '' };
            if (/^https?:\/\//i.test(image)) return { pet: p, status: 'external', url: image, repo: '' };
            const matched = allImages.value.find(img => pathMatches(image, img));
            if (matched) return { pet: p, status: 'ok', url: matched.url, repo: matched.repo };
            return { pet: p, status: 'missing', url: fileUrl(imgRepos.value[0] || '', image), repo: '' };
        }));

        const linkedCount = computed(() => petRows.value.filter(r => r.status === 'ok').length);
        const missingPets = computed(() => petRows.value.filter(r => r.status === 'missing' || r.status === 'empty'));

        const filteredPetRows = computed(() => {
            const kw = petSearch.value.trim().toLowerCase();
            return petRows.value.filter(r => {
                if (petStatusFilter.value !== 'all' && r.status !== petStatusFilter.value) return false;
                if (kw) {
                    const hay = ((r.pet.id || '') + ' ' + (r.pet.name || '') + ' ' + (r.pet.image || '')).toLowerCase();
                    if (hay.indexOf(kw) === -1) return false;
                }
                return true;
            });
        });

        const statusText = (s) => ({ ok: '正常', missing: '缺失', empty: '未填写', external: '外链' }[s] || s);
        // 异色图片张数（shiny 数组，可为空）
        const shinyCount = (p) => (p && Array.isArray(p.shiny) ? p.shiny.length : 0);
        const shortRepo = (r) => r.length > 16 ? r.slice(0, 14) + '…' : r;
        const getPetUrl = (p) => {
            const row = petRows.value.find(r => r.pet === p);
            return row ? row.url : '';
        };

        const onImgError = (e) => {
            const el = e.target;
            el.style.visibility = 'hidden';
        };

        /* ------------------------------ 上传 ------------------------------ */
        const openUpload = (pet) => {
            if (!hasConfig.value) {
                showToast('请先在「同步配置」中填写仓库信息', 'err');
                return;
            }
            uploadPet.value = pet || null;
            uploadRepo.value = imgRepos.value[0] || '';
            if (pet && pet.image && !/^https?:\/\//i.test(pet.image)) {
                uploadPath.value = pet.image;
            } else if (pet) {
                uploadPath.value = `sprites/${pet.id}.png`;
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
                    const baseName = uploadPet.value
                        ? `${uploadPet.value.id}.png`
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
                if (uploadPet.value) {
                    uploadPet.value.image = path;
                    savePets();
                }
                uploadPreview.value = `data:image/png;base64,${img.base64}`;
                showToast((uploadPet.value ? '图片已上传并绑定到精灵' : '图片上传成功')
                    + `（${img.canvasSize}×${img.canvasSize}，${ImageUtils.formatBytes(img.bytes)}）`);
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
        const replacePetWith = (img) => {
            bindImage.value = img;
            bindSearch.value = '';
            showBindModal.value = true;
        };

        const filteredBindPets = computed(() => {
            const kw = bindSearch.value.trim().toLowerCase();
            if (!kw) return pets.value;
            return pets.value.filter(p =>
                ((p.id || '') + ' ' + (p.name || '')).toLowerCase().indexOf(kw) !== -1
            );
        });

        const confirmBind = (pet) => {
            if (!bindImage.value) return;
            pet.image = bindImage.value.path;
            savePets();
            showToast(`已将图片绑定到「${pet.name || pet.id}」`);
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
            loadConfigAndPets();
            if (hasConfig.value) loadAll();
        });

        return {
            config, pets, imgRepos, hasConfig, currentTab,
            isLoading, loadError, repoStatus, allImages, loadAll,
            repoSearch, repoFilter, usageFilter, filteredRepoImages,
            petSearch, petStatusFilter, filteredPetRows, linkedCount, missingPets,
            showUploadModal, uploadPet, uploadRepo, uploadPath, uploadPreview,
            uploadFileInput, isUploading, openUpload, handleUpload,
            deleteTarget, isDeleting, openDelete, confirmDelete,
            showBindModal, bindImage, bindSearch, filteredBindPets, replacePetWith, confirmBind,
            getPetUrl, statusText, shortRepo, onImgError, copyPath, shinyCount,
            window
        };
    }
}).mount('#app');
