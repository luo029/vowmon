/* ============================================================
 * 后台侧边栏（唯一来源）
 * 所有后台页面共用：以后增删/改名导航，只改这个文件的 NAV 数组即可。
 * 页面里只需放一个空的 <div class="side-nav"></div> 容器，
 * 并在 </body> 前引入 <script src="sidebar.js?v=20261126z"></script>。
 * —— 精灵管理页(index.html)的三个 Tab 通过 admin:tab 事件无刷新切换。
 * ============================================================ */
(function () {
    'use strict';

    /* 导航定义：tab:true 表示精灵管理页内的 Tab（无刷新切换），否则是页面跳转 */
    var NAV = [
        { href: 'index.html', icon: 'fa-solid fa-book', label: '精灵管理', tab: 'sprites' },
        { href: 'index.html?tab=realm', icon: 'fa-solid fa-mountain-sun', label: '天地图鉴', tab: 'realm' },
        { href: 'admin-skills.html', icon: 'fa-solid fa-fire', label: '技能管理' },
        { href: 'admin-traits.html', icon: 'fa-solid fa-leaf', label: '特性管理' },
        { href: 'admin-bloodline-skills.html', icon: 'fa-solid fa-dna', label: '血脉技能' },
        { href: 'admin-items.html', icon: 'fa-solid fa-box-open', label: '物品管理' },
        { href: 'admin-images.html', icon: 'fa-solid fa-images', label: '图片管理' },
        { href: 'admin-lore.html', icon: 'fa-solid fa-file-pen', label: '页面内容' },
        { href: 'admin-individuals.html', icon: 'fa-solid fa-paw', label: '御兽精灵' },
        { href: 'admin-characters.html', icon: 'fa-solid fa-users', label: '御兽人物' },
        { href: 'admin-stages.html', icon: 'fa-solid fa-layer-group', label: '阶段境界' },
        { href: 'index.html?tab=settings', icon: 'fa-solid fa-gear', label: '同步配置', tab: 'settings' },
        { href: 'admin-audit.html', icon: 'fa-solid fa-clock-rotate-left', label: '操作审计' }
    ];

    // /admin（目录本身、无尾斜杠）也要当作 index 页：直接取 pop 会得到 'admin'，补成 '/' 再取
    var path = location.pathname;
    if (/\/admin$/.test(path)) path += '/';
    var page = (path.split('/').pop() || 'index.html').toLowerCase();
    // CF Pages 会把 /admin/xxx.html 308 成无扩展名的 /admin/xxx，
    // 这里补回 .html 再比对，否则所有非 index 页都丢失选中态
    if (page && page.indexOf('.') === -1) page += '.html';
    var onIndex = page === 'index.html' || page === '';
    var indexTab = new URLSearchParams(location.search).get('tab') || 'sprites';
    if (!onIndex) indexTab = null;

    function isActive(item) {
        if (item.tab) return onIndex && indexTab === item.tab;
        return page === item.href.toLowerCase();
    }

    var mount = document.querySelector('.side-nav');
    if (mount) {
        mount.innerHTML = NAV.map(function (item) {
            var active = isActive(item) ? ' class="active"' : '';
            return '<a href="' + item.href + '"' + active + ' data-tab="' + (item.tab || '') + '">' +
                '<i class="' + item.icon + '"></i> ' + item.label + '</a>';
        }).join('');

        /* 精灵管理页：Tab 项拦截点击，派发事件给 Vue（不刷新页面）。
           注意：只在 index 页上拦截；在其他后台页点击要放行，
           让浏览器正常跳转到 index.html?tab=xxx，否则永远跳不过去 */
        mount.addEventListener('click', function (e) {
            var a = e.target.closest('a[data-tab]');
            if (!a || !a.getAttribute('data-tab')) return;
            if (!onIndex) return;   // 非 index 页：放行默认跳转
            e.preventDefault();
            var tab = a.getAttribute('data-tab');
            setActive(tab);
            window.dispatchEvent(new CustomEvent('admin:tab', { detail: tab }));
        });
    }

    /* 供 admin.js 的 switchTab 同步高亮（程序内切换时调用） */
    function setActive(tab) {
        if (!mount) return;
        var links = mount.querySelectorAll('a[data-tab]');
        for (var i = 0; i < links.length; i++) {
            links[i].classList.toggle('active', !!tab && links[i].getAttribute('data-tab') === tab);
        }
    }

    window.AdminSidebar = { setActive: setActive };
})();
