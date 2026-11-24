/**
 * 图片 CDN 代理（Cloudflare Pages Functions）
 *
 *   站点地址 /img/sprites/001.png
 *     -> 源站 raw.githubusercontent.com/luo029/vowmon_imgs/main/sprites/001.png
 *     -> 失败时回退 cdn.jsdelivr.net/gh/luo029/vowmon_imgs@main/sprites/001.png
 *
 * 为什么这么做：
 *  1. 图片仓库里的原图走 Cloudflare 边缘节点回源，之后的访问全部命中 CF 缓存，
 *     不再每次都去 GitHub（对国内网络更稳、更快）。
 *  2. 换图片仓库 / 换分支只改下面 UPSTREAMS 一处，前台 imgCdnBase 不用动。
 *  3. 图片内容不可变（按编号命名），所以可以给 1 年强缓存。
 *
 * 注意：只有 /img/* 会走到这个函数（见 _routes.json），其余静态文件不消耗函数额度。
 */

const UPSTREAMS = [
    'https://raw.githubusercontent.com/luo029/vowmon_imgs/main',
    'https://cdn.jsdelivr.net/gh/luo029/vowmon_imgs@main',
];

// 只代理图片，避免被当成通用代理滥用
const ALLOWED_EXT = /\.(png|jpe?g|webp|gif|svg|avif|bmp|ico)$/i;

// 1 小时：既能让绝大多数访问命中边缘缓存，后台换了同名图片（覆盖上传）也能在一小时内生效。
// 想立刻看到新图：图片地址加一个 ?v=任意值，缓存键带 query，会直接回源。
const CACHE_TTL = 3600;

function notFound(msg, status = 404, maxAge = 60) {
    return new Response(msg, {
        status,
        headers: {
            'content-type': 'text/plain; charset=utf-8',
            'cache-control': `public, max-age=${maxAge}`,
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
        return notFound('Bad path', 400);
    }

    if (!path || path.includes('..') || !ALLOWED_EXT.test(path)) {
        return notFound('Not Found');
    }

    // 先查 CF 边缘缓存（命中时零回源）。缓存键带 query，方便用 ?v=xxx 手动破缓存。
    const cache = caches.default;
    const search = new URL(request.url).search;
    const cacheKey = new Request(new URL('/__img/' + path + search, request.url).toString(), { method: 'GET' });
    const cached = await cache.match(cacheKey);
    if (cached) return cached;

    for (const base of UPSTREAMS) {
        let upstream;
        try {
            upstream = await fetch(`${base}/${path}`, {
                cf: { cacheEverything: true, cacheTtl: CACHE_TTL },
            });
        } catch {
            continue;
        }
        if (!upstream.ok || !upstream.body) continue;

        const res = new Response(upstream.body, {
            status: 200,
            headers: {
                'content-type': upstream.headers.get('content-type') || 'image/png',
                'cache-control': `public, max-age=${CACHE_TTL}, immutable`,
                'access-control-allow-origin': '*',
                'x-img-source': base.includes('jsdelivr') ? 'jsdelivr' : 'github',
            },
        });

        context.waitUntil(cache.put(cacheKey, res.clone()));
        return res;
    }

    // 两边都挂了：短缓存 404，避免把失败结果长期钉在边缘
    return notFound('Image not found', 404, 60);
}
