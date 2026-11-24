class GitHubSync {
    static async getFileSha(token, owner, repo, path) {
        const url = `https://api.github.com/repos/${owner}/${repo}/contents/${path}`;
        try {
            const res = await fetch(url, {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Accept': 'application/vnd.github.v3+json'
                }
            });
            if (res.ok) {
                const data = await res.json();
                return data.sha;
            }
            if (res.status === 404) return null;
            throw new Error('获取文件状态失败，请检查 Token 权限或仓库名');
        } catch (e) {
            throw e;
        }
    }

    static async uploadFile(token, owner, repo, path, content, message = 'Sync', isBase64 = false) {
        const sha = await this.getFileSha(token, owner, repo, path);
        const url = `https://api.github.com/repos/${owner}/${repo}/contents/${path}`;
        
        let base64Content = content;
        if (!isBase64) {
            base64Content = btoa(unescape(encodeURIComponent(content)));
        }
        
        const body = { message, content: base64Content };
        if (sha) body.sha = sha;

        const res = await fetch(url, {
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Accept': 'application/vnd.github.v3+json',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(body)
        });

        if (!res.ok) {
            const err = await res.json();
            if (res.status === 403 || res.status === 401) {
                throw new Error('没有权限。请检查 Fine-grained Token 是否授权了该仓库的 Contents (Read & Write) 权限。');
            }
            throw new Error(err.message || '上传失败');
        }
        return true;
    }

    // 列出某个仓库目录下所有文件（用于图片管理，遍历多仓库）
    // 返回一个数组：[{ name, path, sha, size, download_url, type }]
    // 目录不存在时返回 []，其它错误抛出
    //
    // ⚠️ GitHub Contents API 对单个目录最多只返回 1000 个条目，超出部分会被**静默截断**
    //（不报错，只是后面的文件在列表里凭空消失）。图片仓库很容易破千：500 只精灵
    //  就是 500 张基础图 + 500 张异色图 = 1000 张。所以这里一旦发现「返回满 1000 条」，
    //  自动改用 Git Trees API 取全量，调用方无需关心。
    static async listDirectory(token, owner, repo, path) {
        const cleanPath = (path || '').replace(/^\/+|\/+$/g, '');
        const url = `https://api.github.com/repos/${owner}/${repo}/contents/${cleanPath}`;
        const res = await fetch(url, {
            headers: {
                'Authorization': `Bearer ${token}`,
                'Accept': 'application/vnd.github.v3+json'
            }
        });
        if (res.status === 404) return []; // 目录/仓库不存在，视为空
        if (res.status === 403 || res.status === 401) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err.message || '没有权限读取该仓库，请检查 Token 是否授权了 Contents 读权限。');
        }
        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err.message || '读取仓库目录失败');
        }
        const data = await res.json();
        // 目录返回数组；若路径指向单个文件则包成数组
        const list = Array.isArray(data) ? data : (data && data.path ? [data] : []);

        // 命中 1000 条上限 → 改用 Trees API 拿全量（拿不到就退回原本的结果）
        if (list.length >= 1000) {
            try {
                const full = await this.listDirectoryByTree(token, owner, repo, cleanPath);
                if (full.length >= list.length) return full;
            } catch (e) {
                console.warn('[GitHubSync] 大目录改用 Trees API 失败，退回前 1000 条：', e);
            }
        }
        return list;
    }

    // 用 Git Trees API 取目录下的全部文件，绕过 Contents API 的 1000 条上限
    // 返回结构与 listDirectory 一致：[{ name, path, sha, size, type: 'file' }]
    static async listDirectoryByTree(token, owner, repo, cleanPath) {
        const headers = {
            'Authorization': `Bearer ${token}`,
            'Accept': 'application/vnd.github.v3+json'
        };

        // 1. 取默认分支（main / master 不固定）
        const repoRes = await fetch(`https://api.github.com/repos/${owner}/${repo}`, { headers });
        if (!repoRes.ok) throw new Error('读取仓库信息失败，请检查 Token 权限或仓库名');
        const branch = (await repoRes.json()).default_branch || 'main';

        // 2. 取整棵文件树（recursive=1，一次请求即可，远大于 1000 条）
        const treeRes = await fetch(
            `https://api.github.com/repos/${owner}/${repo}/git/trees/${encodeURIComponent(branch)}?recursive=1`,
            { headers }
        );
        if (!treeRes.ok) {
            const err = await treeRes.json().catch(() => ({}));
            throw new Error(err.message || '读取仓库文件树失败');
        }
        const payload = await treeRes.json();
        const tree = payload.tree || [];

        // 3. 只保留该目录下的「直接子文件」（不含子目录里的文件）
        const prefix = cleanPath ? cleanPath + '/' : '';
        return tree
            .filter(node => node.type === 'blob' && node.path.indexOf(prefix) === 0)
            .map(node => ({ rel: node.path.slice(prefix.length), node }))
            .filter(item => item.rel && item.rel.indexOf('/') === -1)
            .map(item => ({
                name: item.rel,
                path: item.node.path,
                sha: item.node.sha,        // 与 Contents API 返回的是同一个 blob sha，可直接用于删除
                size: item.node.size || 0,
                type: 'file'
            }));
    }

    // 删除仓库中的某个文件（需要文件 sha）
    static async deleteFile(token, owner, repo, path, sha, message = 'Delete image') {
        const url = `https://api.github.com/repos/${owner}/${repo}/contents/${path}`;
        const res = await fetch(url, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Accept': 'application/vnd.github.v3+json',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ message, sha })
        });
        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            if (res.status === 403 || res.status === 401) {
                throw new Error('没有权限删除文件，请检查 Token 是否授权了该仓库 Contents 读写权限。');
            }
            throw new Error(err.message || '删除文件失败');
        }
        return true;
    }

    // 新增：创建 Issue
    static async createIssue(token, owner, repo, title, body) {
        const url = `https://api.github.com/repos/${owner}/${repo}/issues`;
        const res = await fetch(url, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Accept': 'application/vnd.github.v3+json',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ title, body })
        });
        if (!res.ok) {
            const err = await res.json();
            throw new Error(err.message || '提交 Issue 失败');
        }
        return await res.json();
    }
}