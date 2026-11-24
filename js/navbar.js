/* ==========================================================================
   Vowmon Wiki 全站导航 —— 内容与交互唯一来源
   --------------------------------------------------------------------------
   改导航（增删菜单、改链接、改文字）只改这个文件 + navbar.css，
   不需要再去每个 html 里改一遍。

   使用方式：
       <head> 里：
           <link rel="stylesheet" href="navbar.css">
           <script src="navbar.js" defer></script>
       <body> 里：
           <div id="site-navbar"></div>

   navbar.js 会自动：
     1. 渲染整条导航；
     2. 根据当前文件名高亮对应菜单；
     3. 绑定动效开关（localStorage: vowmon_anim_on）；
     4. 绑定搜索框（回车跳到 list.html?q=关键字）；
     5. 绑定移动端汉堡菜单与下拉展开。
   ========================================================================== */
(function () {
    'use strict';

    /* ---------------------------------------------------------------- 配置 */

    var SITE_NAME = 'Vowmon Wiki';

    // 站点根前缀：后台页面在 admin/ 子目录里，导航链接必须从站点根出发。
    // 页面只在两层：根目录（前缀空）与 /admin/（前缀 ../）。
    var ROOT = /\/admin\//.test(window.location.pathname) ? '../' : '';
    var HOME = ROOT + 'index.html';

    // 导航结构：改这里就能改全站（href 均相对站点根，渲染时统一加 ROOT 前缀）
    var NAV = [
        { key: 'home', label: '首页', href: 'index.html' },
        {
            key: 'records', label: '书内档案', href: 'individuals.html',
            columns: [
                {
                    title: '书中个体',
                    links: [
                        { label: '御兽精灵', href: 'individuals.html' },
                        { label: '御兽人物', href: 'characters.html' }
                    ]
                }
            ]
        },
        {
            key: 'dex', label: '图鉴', href: 'vowdex.html',
            columns: [
                {
                    title: '精灵资料',
                    links: [
                        { label: '精灵图鉴', href: 'vowdex.html' },
                        { label: '精灵列表', href: 'list.html' },
                        { label: '技能图鉴', href: 'skills.html' },
                        { label: '特性大全', href: 'traits.html' },
                        { label: '性格大全', href: 'natures.html' }
                    ]
                },
                {
                    title: '生态与物品',
                    links: [
                        { label: '物品图鉴', href: 'items.html' },
                        { label: '精灵果实', soon: true }
                    ]
                },
                {
                    title: '世界观',
                    links: [
                        { label: '等级体系', href: 'ranks.html' },
                        { label: '血脉图鉴', href: 'bloodlines.html' },
                        { label: '御兽师图鉴', href: 'trainers.html' },
                        { label: '势力版图', href: 'factions.html' },
                        { label: '十八生态界', soon: true },
                        { label: '元域演化史', href: 'lore.html' }
                    ]
                }
            ]
        },
        {
            key: 'tools', label: '工具', href: 'calculator.html',
            columns: [
                {
                    title: '查询与计算',
                    links: [
                        { label: '⚖️ 属性克制计算器', href: 'calculator.html' },
                        { label: '🎯 技能打击面计算器', href: 'coverage.html' }
                    ]
                },
                {
                    title: '管理',
                    links: [
                        { label: '🛠️ 管理者后台', href: 'admin/' }
                    ]
                }
            ]
        },
        { key: 'map', label: '地图', soon: true }
    ];

    // 文件名 -> 高亮哪个菜单
    var ACTIVE_MAP = {
        'index.html': 'home',
        'individuals.html': 'records',
        'characters.html': 'records',
        'vowdex.html': 'dex',
        'list.html': 'dex',
        'skills.html': 'dex',
        'traits.html': 'dex',
        'natures.html': 'dex',
        'lore.html': 'dex',
        'ranks.html': 'dex',
        'bloodlines.html': 'dex',
        'trainers.html': 'dex',
        'factions.html': 'dex',
        'items.html': 'dex',
        'calculator.html': 'tools',
        'coverage.html': 'tools',
        'admin.html': 'tools',
        'admin-items.html': 'tools',
        'admin-images.html': 'tools'
    };

    var LOGO_SVG =
        '<img class="logo-svg" src="favicon.ico" alt="" aria-hidden="true">';

    var SEARCH_SVG =
        '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ' +
        'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
        '<circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>';

    var MENU_SVG =
        '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ' +
        'stroke-linecap="round" aria-hidden="true">' +
        '<line x1="3" y1="6" x2="21" y2="6"></line><line x1="3" y1="12" x2="21" y2="12"></line>' +
        '<line x1="3" y1="18" x2="21" y2="18"></line></svg>';

    /* ---------------------------------------------------------------- 工具 */

    function esc(text) {
        return String(text == null ? '' : text)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function currentFile() {
        var path = window.location.pathname.toLowerCase();
        var parts = path.split('/');
        // /admin/ 或 /admin/index.html 一律按 admin.html 高亮「工具」菜单
        if (/\/admin\/(index\.html)?$/.test(path)) return 'admin.html';
        var file = parts[parts.length - 1] || parts[parts.length - 2] || 'index.html';
        return file;
    }

    function activeKey() {
        return ACTIVE_MAP[currentFile()] || '';
    }

    function isAnimOn() {
        return localStorage.getItem('vowmon_anim_on') !== 'false';
    }

    function applyAnim() {
        var on = isAnimOn();
        document.body.classList.toggle('no-anim', !on);
        var btn = document.getElementById('siteAnimToggle');
        if (btn) {
            btn.textContent = on ? '✨ 动效：开' : '🚫 动效：关';
            btn.setAttribute('aria-pressed', on ? 'true' : 'false');
        }
    }

    function toggleAnim() {
        localStorage.setItem('vowmon_anim_on', isAnimOn() ? 'false' : 'true');
        applyAnim();
        // 通知页面内自己的动效状态（list / vowdex 的 isAnimOn ref）跟着同步
        try {
            document.dispatchEvent(new CustomEvent('vowmon:anim-changed', { detail: { on: isAnimOn() } }));
        } catch (e) { /* 老浏览器不支持 CustomEvent 时忽略 */ }
    }

    function linkHtml(link, cls) {
        if (link.soon) {
            return '<a href="javascript:void(0)" class="' + (cls || '') + ' soon" aria-disabled="true">' +
                esc(link.label) + '<span class="soon-tag">敬请期待</span></a>';
        }
        return '<a href="' + esc(ROOT + link.href) + '" class="' + (cls || '') + '">' + esc(link.label) + '</a>';
    }

    function itemHtml(item, active) {
        var isActive = item.key === active;

        if (!item.columns) {
            if (item.soon) {
                return '<a href="javascript:void(0)" class="soon" aria-disabled="true">' +
                    esc(item.label) + '<span class="soon-tag">敬请期待</span></a>';
            }
            return '<a href="' + esc(ROOT + item.href) + '"' + (isActive ? ' class="active"' : '') + '>' +
                esc(item.label) + '</a>';
        }

        var cols = item.columns.map(function (col) {
            var links = col.links.map(function (l) { return linkHtml(l, ''); }).join('');
            return '<div class="dropdown-column"><h4>' + esc(col.title) + '</h4>' + links + '</div>';
        }).join('');

        return '<div class="nav-item has-dropdown">' +
            '<a href="' + esc(ROOT + item.href) + '"' + (isActive ? ' class="active"' : '') + '>' +
            esc(item.label) + '<span class="chev">▾</span></a>' +
            '<div class="dropdown-panel">' + cols + '</div>' +
            '</div>';
    }

    /* ---------------------------------------------------------------- 渲染 */

    function buildHtml(active) {
        var items = NAV.map(function (item) { return itemHtml(item, active); }).join('');

        return '' +
            '<header class="navbar">' +
            '<div class="nav-container">' +
            '<a class="logo" href="' + HOME + '" aria-label="' + esc(SITE_NAME) + ' 首页">' +
            LOGO_SVG + '<span>' + esc(SITE_NAME) + '</span></a>' +
            '<nav class="nav-links" id="siteNavLinks" aria-label="主导航">' + items + '</nav>' +
            '<div class="nav-actions">' +
            '<a href="javascript:void(0)" class="anim-toggle" id="siteAnimToggle" role="button" tabindex="0">✨ 动效：开</a>' +
            '<button type="button" class="search-icon" id="siteSearchBtn" aria-label="打开搜索">' + SEARCH_SVG + '</button>' +
            '<button type="button" class="nav-toggle" id="siteNavToggle" aria-label="打开菜单" aria-expanded="false">' + MENU_SVG + '</button>' +
            '</div>' +
            '</div>' +
            '<div class="nav-search" id="siteNavSearch">' +
            '<div class="nav-search-inner">' +
            '<input id="siteSearchInput" type="search" placeholder="搜索精灵名称或编号，回车直达精灵列表…" autocomplete="off">' +
            '<button type="button" id="siteSearchGo">搜索</button>' +
            '</div>' +
            '</div>' +
            '</header>';
    }

    function isMobile() {
        return window.matchMedia('(max-width: 900px)').matches;
    }

    function goSearch() {
        var input = document.getElementById('siteSearchInput');
        if (!input) return;
        var keyword = input.value.trim();
        if (!keyword) {
            input.focus();
            return;
        }
        window.location.href = ROOT + 'list.html?q=' + encodeURIComponent(keyword);
    }

    function bind() {
        var navLinks = document.getElementById('siteNavLinks');
        var navToggle = document.getElementById('siteNavToggle');
        var searchBtn = document.getElementById('siteSearchBtn');
        var searchBox = document.getElementById('siteNavSearch');
        var searchInput = document.getElementById('siteSearchInput');
        var searchGo = document.getElementById('siteSearchGo');
        var animBtn = document.getElementById('siteAnimToggle');

        if (animBtn) {
            animBtn.addEventListener('click', function (e) {
                e.preventDefault();
                toggleAnim();
            });
            animBtn.addEventListener('keydown', function (e) {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    toggleAnim();
                }
            });
        }

        if (navToggle && navLinks) {
            navToggle.addEventListener('click', function (e) {
                e.stopPropagation();
                var open = navLinks.classList.toggle('open');
                navToggle.setAttribute('aria-expanded', open ? 'true' : 'false');
                if (searchBox) searchBox.classList.remove('open');
            });
        }

        if (navLinks) {
            navLinks.addEventListener('click', function (e) {
                var link = e.target.closest ? e.target.closest('a') : null;
                if (!link) return;
                var item = link.parentElement;
                // 只有「图鉴 / 工具」这一级的父链接负责开合面板，面板里的子链接正常跳转
                var isParentLink = item && item.classList.contains('has-dropdown') &&
                    item.firstElementChild === link;
                if (!isParentLink) return;

                e.preventDefault();
                var willOpen = !item.classList.contains('open');
                var opened = navLinks.querySelectorAll('.has-dropdown.open');
                for (var i = 0; i < opened.length; i++) opened[i].classList.remove('open');
                if (willOpen) item.classList.add('open');
            });
        }

        document.addEventListener('keydown', function (e) {
            if (e.key !== 'Escape' || !navLinks) return;
            var opened = navLinks.querySelectorAll('.has-dropdown.open');
            for (var i = 0; i < opened.length; i++) opened[i].classList.remove('open');
            navLinks.classList.remove('open');
            if (searchBox) searchBox.classList.remove('open');
        });

        if (searchBtn && searchBox) {
            searchBtn.addEventListener('click', function (e) {
                e.stopPropagation();
                var open = searchBox.classList.toggle('open');
                if (navLinks) navLinks.classList.remove('open');
                if (open && searchInput) {
                    searchInput.focus();
                    searchInput.select();
                }
            });
        }

        if (searchInput) {
            searchInput.addEventListener('keydown', function (e) {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    goSearch();
                } else if (e.key === 'Escape') {
                    if (searchBox) searchBox.classList.remove('open');
                }
            });
        }

        if (searchGo) {
            searchGo.addEventListener('click', function (e) {
                e.preventDefault();
                goSearch();
            });
        }

        document.addEventListener('click', function (e) {
            var navbar = document.querySelector('.navbar');
            if (!navbar) return;
            if (navbar.contains(e.target)) return;
            if (navLinks) {
                navLinks.classList.remove('open');
                var opened = navLinks.querySelectorAll('.has-dropdown.open');
                for (var i = 0; i < opened.length; i++) opened[i].classList.remove('open');
            }
            if (searchBox) searchBox.classList.remove('open');
        });
    }

    function render() {
        var host = document.getElementById('site-navbar');
        if (!host) return;
        host.innerHTML = buildHtml(activeKey());
        bind();
        applyAnim();
    }

    window.VowmonNav = {
        render: render,
        applyAnim: applyAnim,
        toggleAnim: toggleAnim,
        config: NAV
    };

    applyAnim();

    // 页面内开关（list / vowdex 页面自己的动效按钮）改动后，同步导航按钮文字
    document.addEventListener('vowmon:anim-changed', function () { applyAnim(); });
    // 其他标签页切换开关时，本页立刻跟上（body class + 按钮文字）
    window.addEventListener('storage', function (e) {
        if (!e.key || e.key === 'vowmon_anim_on') applyAnim();
    });

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', render);
    } else {
        render();
    }
})();
