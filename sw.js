/* ==========================================================================
   Vowmon Wiki Service Worker —— 离线缓存 / 二次访问秒开
   --------------------------------------------------------------------------
   策略：
   - 静态资源（css/js）：stale-while-revalidate
   - 图片 /img/*：cache-first（内容按编号命名 + ?v= 版本号，天然不可变）
   - 数据 /data/*：network-first，失败回缓存（保证后台改动能进来，断网也能看）
   - 页面 HTML：network-first，失败回缓存
   注意：后台 admin/ 不注册 SW，避免缓存住后台草稿造成混乱。
   ========================================================================== */
const VERSION = 'vowmon-v20261128';
const SHELL = VERSION + '-shell';
const IMGS = VERSION + '-imgs';
const DATA = VERSION + '-data';
const PAGES = VERSION + '-pages';

self.addEventListener('install', function (e) {
    self.skipWaiting();
    e.waitUntil(caches.open(SHELL).then(function (c) {
        return c.addAll([
            './', './index.html', './404.html',
            './css/style.css', './css/navbar.css', './css/responsive.css', './css/dialog.css', './css/diff-modal.css',
            './js/navbar.js', './js/site-config.js', './js/data-loader.js', './js/type-config.js',
            './js/type-chart.js', './js/vowmon-utils.js', './js/dialog.js', './js/global-search.js',
            './css/global-search.css', './js/authority-config.js', './js/stage-config.js'
        ]).catch(function () { /* 个别文件 404 不阻断安装 */ });
    }));
});

self.addEventListener('activate', function (e) {
    e.waitUntil(Promise.all([
        caches.keys().then(function (keys) {
            return Promise.all(keys.filter(function (k) { return k.indexOf(VERSION + '-') !== 0; }).map(function (k) { return caches.delete(k); }));
        }),
        self.clients.claim()
    ]));
});

self.addEventListener('fetch', function (e) {
    var req = e.request;
    if (req.method !== 'GET') return;
    var url = new URL(req.url);
    if (url.origin !== self.location.origin) return;

    if (url.pathname.indexOf('/img/') === 0) {
        e.respondWith(caches.open(IMGS).then(function (c) {
            return c.match(req).then(function (hit) {
                return hit || fetch(req).then(function (res) {
                    if (res && res.ok) c.put(req, res.clone());
                    return res;
                }).catch(function () { return caches.match('./favicon.ico'); });
            });
        }));
        return;
    }
    if (url.pathname.indexOf('/data/') === 0) {
        e.respondWith(fetch(req).then(function (res) {
            if (res && res.ok) caches.open(DATA).then(function (c) { c.put(req, res.clone()); });
            return res;
        }).catch(function () { return caches.open(DATA).then(function (c) { return c.match(req); }); }));
        return;
    }
    if (/\.(css|js|ico|woff2?)(\?|$)/.test(url.pathname)) {
        e.respondWith(caches.open(SHELL).then(function (c) {
            return c.match(req).then(function (hit) {
                var net = fetch(req).then(function (res) {
                    if (res && res.ok) c.put(req, res.clone());
                    return res;
                }).catch(function () { return hit; });
                return hit || net;
            });
        }));
        return;
    }
    if (req.mode === 'navigate') {
        e.respondWith(fetch(req).then(function (res) {
            if (res && res.ok) caches.open(PAGES).then(function (c) { c.put(req, res.clone()); });
            return res;
        }).catch(function () {
            return caches.open(PAGES).then(function (c) { return c.match(req); }).then(function (hit) {
                return hit || caches.match('./index.html');
            });
        }));
    }
});
