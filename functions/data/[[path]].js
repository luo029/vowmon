/**
 * 数据 CDN 代理（Cloudflare Pages Functions）
 *
 *   站点地址 /data/vow-data.json
 *     -> 源站 raw.githubusercontent.com/luo029/vowmon_data/main/vow-data.json
 *     -> 失败时回退 cdn.jsdelivr.net/gh/luo029/vowmon_data@main/vow-data.json
 *
 * 为什么需要它：
 *  1. 站点仓库不再保存数据，数据只在 vowmon_data 里；前台从这里读，走 CF 边缘缓存，
 *     不再每个访客都去 GitHub 回源。
 *  2. 缓存只 60 秒 —— 后台同步完一分钟内就能看到新数据，不用等 jsDelivr 那套长缓存。
 *  3. 换数据仓库 / 换分支只改这里一处。
 */
const UPSTREAMS = [
    'https://raw.githubusercontent.com/luo029/vowmon_data/main',
    'https://cdn.jsdelivr.net/gh/luo029/vowmon_data@main',
];

const CACHE_TTL = 60; // 秒
const ALLOWED = /^[A-Za-z0-9._-]+\.json$/; // 只放行仓库根目录下的 json 文件

function fail(msg, status = 404) {
    return new Response(msg, {
        status,
        headers: {
            'content-type': 'text/plain; charset=utf-8',
            'cache-control': 'public, max-age=10',
            'access-control-allow-origin': '*',
        },
    });
}

export async function onRequestGet(context) {
    const { params, request } = context;

    let path;
    try {
        const raw = Array.isArray(params.path) ? params.path.join('/') : (params.path || '');
        path = decodeURIComponent(raw || '');
    } catch {
        return fail('Bad path', 400);
    }

    if (!path || !ALLOWED.test(path)) return fail('Not Found');

    // 后台带 ?_=时间戳 回源时，缓存键跟着变，保证拿到最新；前台无 query 时共享同一份缓存
    const search = new URL(request.url).search;
    const cache = caches.default;
    const cacheKey = new Request(new URL('/__data/' + path + search, request.url).toString(), { method: 'GET' });

    const cached = await cache.match(cacheKey);
    if (cached) return cached;

    for (const base of UPSTREAMS) {
        let upstream;
        try {
            upstream = await fetch(`${base}/${path}`, { cf: { cacheEverything: true, cacheTtl: CACHE_TTL } });
        } catch {
            continue;
        }
        if (!upstream.ok || !upstream.body) continue;

        const res = new Response(upstream.body, {
            status: 200,
            headers: {
                'content-type': 'application/json; charset=utf-8',
                'cache-control': `public, max-age=${CACHE_TTL}`,
                'access-control-allow-origin': '*',
                'x-data-source': base.includes('jsdelivr') ? 'jsdelivr' : 'github',
            },
        });

        context.waitUntil(cache.put(cacheKey, res.clone()));
        return res;
    }

    return fail('Data not found');
}
