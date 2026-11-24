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
    static async listDirectory(token, owner, repo, path) {
        const cleanPath = (path || '').replace(/^\/+|\/+$/g, '');
        const url = `https://api.github.com/repos/${owner}/${repo}/contents/${cleanPath}`;
        try {
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
            return Array.isArray(data) ? data : (data && data.path ? [data] : []);
        } catch (e) {
            throw e;
        }
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