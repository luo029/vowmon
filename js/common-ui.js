/* ==========================================================================
   Vowmon Wiki 通用 UI 行为 —— 弹窗（modal）+ 下拉（dropdown）唯一来源
   --------------------------------------------------------------------------
   问题背景：
       以前每个后台页面都写 `@click.self="showModal = false"`，
       遮罩层有 padding、弹窗本体 @click.stop，只要点到内层元素，
       事件就到不了 .self，于是一堆「点外面关不掉」的 bug；
       Esc 关闭更是完全没实现（navbar.js 的 Esc 只管导航下拉）。

   本文件负责所有 .modal-overlay 的关闭：
       1. 点遮罩关闭 —— 只认「按下和松开都在遮罩本体」的点击，
          在弹窗内部按下再拖到外面松开不会误关；
       2. Esc 关闭 —— 关闭最上层（z-index 最大 / DOM 最后）的那个弹窗；
       3. 关闭时向该遮罩分发 'vowmon:modal-close' 事件，
          Vue 页面监听它把 showModal 等状态置 false，两边状态一致。

   约定：
       - 遮罩层统一类名 .modal-overlay
       - 弹窗本体统一类名 .modal / .delete-modal / .selection-modal
       - Vue 页面按需绑定：
             <div class="modal-overlay" :class="{ 'is-open': showXxx }"
                  @vowmon:modal-close="showXxx = false">
         （多加的 is-open 类不会影响布局，只是给 JS 做状态标记）
       - 页面不再需要自己写 @click.self 和 @click.stop，写了也不冲突。

   使用方式：
       <script src="js/common-ui.js"></script>
       放在页面自己的业务脚本之前、Vue 之后。
   ========================================================================== */
(function () {
    'use strict';
    if (window.VowmonModal) return;

    /* ------------------------------------------------------ 全局动效开关
       后台页不加载 navbar.js，所以在这里也同步一次「动效 开/关」：
       localStorage['vowmon_anim_on'] === 'false' → body 加 .no-anim，
       配合 css/responsive.css 的全局规则（transition/animation 全 none !important），
       以及弹窗入场动效的 body:not(.no-anim) 前置条件，实现「关掉就绝对无动画」。 */
    function applyAnimFlag() {
        var on = true;
        try { on = localStorage.getItem('vowmon_anim_on') !== 'false'; } catch (e) { on = true; }
        if (document.body) document.body.classList.toggle('no-anim', !on);
    }
    applyAnimFlag();
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', applyAnimFlag);
    }
    // 另一个标签页切换开关时，当前后台页立刻跟上
    window.addEventListener('storage', function (e) {
        if (!e.key || e.key === 'vowmon_anim_on' || e.key === null) applyAnimFlag();
    });

    var OVERLAY = '.modal-overlay';
    var PANEL = '.modal, .delete-modal, .selection-modal';
    var EVENT = 'vowmon:modal-close';

    /* ------------------------------------------------------------ 工具函数 */

    // 当前页面上所有可见的遮罩层，按层叠顺序从下到上
    function visibleOverlays() {
        var list = Array.prototype.slice.call(document.querySelectorAll(OVERLAY));
        return list.filter(function (el) {
            if (el.style.display === 'none' || el.hidden) return false;
            var rect = el.getBoundingClientRect();
            if (rect.width === 0 && rect.height === 0) return false;
            var cs = window.getComputedStyle(el);
            return cs.display !== 'none' && cs.visibility !== 'hidden' && cs.opacity !== '0';
        }).sort(function (a, b) {
            var za = parseInt(window.getComputedStyle(a).zIndex, 10) || 0;
            var zb = parseInt(window.getComputedStyle(b).zIndex, 10) || 0;
            if (za !== zb) return za - zb;
            // 同层级按 DOM 顺序，后面的在上
            return a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1;
        });
    }

    function topOverlay() {
        var list = visibleOverlays();
        return list.length ? list[list.length - 1] : null;
    }

    // 关闭一个遮罩：先通知页面更新 Vue 状态，再主动加一个关闭类兜底
    function closeOverlay(overlay) {
        if (!overlay) return false;
        var ev = new CustomEvent(EVENT, { bubbles: true, detail: { overlay: overlay } });
        overlay.dispatchEvent(ev);
        // 页面若没监听事件（例如纯静态写的弹窗），也保证视觉上能关掉
        overlay.classList.remove('is-open');
        // 双保险：按钮级关闭同样走这里时，让动画有机会播完再隐藏
        if (!overlay.__vowmonVueBound) {
            overlay.style.display = 'none';
        }
        return true;
    }

    /* --------------------------------------------------------- 遮罩点击关闭 */

    // 收起指定遮罩内部所有展开的下拉；返回是否真的收起了（有 -> true）
    function closeOpenSelectsInside(scope) {
        var open = scope.querySelectorAll('.custom-select.is-open');
        if (!open.length) return false;
        Array.prototype.forEach.call(open, function (el) {
            notifySelectClose(el);
        });
        return true;
    }

    // 记录按下点，只有按下 + 松开都在遮罩本体上才算「点击遮罩」
    var pointerDownOnOverlay = null;

    document.addEventListener(
        'pointerdown',
        function (e) {
            pointerDownOnOverlay = e.target;
        },
        true
    );

    document.addEventListener(
        'click',
        function (e) {
            var target = e.target;
            if (!target || target.nodeType !== 1) return;

            // 只处理点击落在遮罩本体上的情况
            if (!target.matches || !target.matches(OVERLAY)) return;

            // 按下点不在这个遮罩上（例如从弹窗里拖出来），忽略
            if (pointerDownOnOverlay && pointerDownOnOverlay !== target) return;

            // 弹窗内还有展开的下拉时，这一次点击只负责收起下拉，弹窗保持打开
            // （否则用户点“空白处”想关下拉，结果整个弹窗被一起关掉）
            if (closeOpenSelectsInside(target)) return;

            closeOverlay(target);
        },
        true
    );

    /* ------------------------------------------------------------ Esc 关闭 */

    document.addEventListener('keydown', function (e) {
        if (e.key !== 'Escape' && e.key !== 'Esc') return;
        if (e.defaultPrevented) return;

        var overlay = topOverlay();
        if (!overlay) return;

        e.preventDefault();
        e.stopPropagation();
        closeOverlay(overlay);
    });

    /* ------------------------------------------------------- 对外接口 */

    window.VowmonModal = {
        closeAll: function () {
            visibleOverlays()
                .slice()
                .reverse()
                .forEach(function (el) {
                    closeOverlay(el);
                });
        },
        closeTop: function () {
            return closeOverlay(topOverlay());
        },
        top: topOverlay,
        list: visibleOverlays,
        eventName: EVENT
    };

    /* ==========================================================================
       下拉菜单（.custom-select / .dropdown-options）
       --------------------------------------------------------------------------
       问题背景：
           admin-skills.js 里写了
               document.addEventListener('click', () => { activeDropdown.value = ''; })
           admin.html 的 #app 上绑了 @click="closeAllDropdowns"。
           两处都是「无条件清空」，于是点了 .custom-select（虽然 @click.stop）
           的同一个事件冒泡到 document 时又把状态清掉 —— 下拉刚开就关，
           表现为「弹窗闪一下就没了 / 点了没反应」。

       正确处理：
           下拉框自己写 `@click.stop="toggle('xxx')"`（阻止内部点击冒泡到外层），
           其余任何点击（document 级别）才关闭当前打开的下拉。
           本模块统一提供这套行为，页面不再各自绑 document 监听。

       约定：
           - 外层容器类名带 .custom-select
           - 选项面板类名带 .dropdown-options
           - 页面调用：
                 <div class="custom-select"
                      @click.stop="toggleDropdown('stage')"
                      :class="{ 'is-open': activeDropdown === 'stage' }">
           - is-open 类只作为状态标记给 JS 识别，实际显隐仍由 v-show 控制。
       ========================================================================== */
    var SELECT = '.custom-select';

    function isInsideOpenSelect(node) {
        while (node && node.nodeType === 1) {
            if (node.matches && node.matches(SELECT)) return true;
            node = node.parentNode;
        }
        return false;
    }

    // 点击下拉以外的地方 -> 通知页面关闭各下拉
    var pointerDownInSelect = false;

    // 通知页面收起某个下拉：用 Vue 能识别的自定义事件名（不带冒号，避免被当成命名空间）
    function notifySelectClose(el) {
        if (!el) return;
        el.classList.remove('is-open');
        el.dispatchEvent(new CustomEvent('vowmon-dropdown-close', { bubbles: true, detail: { select: el } }));
    }

    // 打开下拉时，自动关掉其它已打开的下拉（供页面调用）
    function closeOtherSelects(except) {
        var open = document.querySelectorAll(SELECT + '.is-open');
        Array.prototype.forEach.call(open, function (el) {
            if (el === except) return;
            notifySelectClose(el);
        });
    }

    document.addEventListener(
        'pointerdown',
        function (e) {
            pointerDownInSelect = isInsideOpenSelect(e.target);
        },
        true
    );

    // 必须用捕获阶段（true）：
    //   弹窗 .modal 上写了 @click.stop，弹窗内部的点击在冒泡到 document 之前就被拦截。
    //   若这里用冒泡阶段（false），点击弹窗内空白 / 其它表单项时事件根本到不了 document，
    //   下拉就不会收起（表现为「点了外面下拉还开着」）。
    //   捕获阶段先于 .modal 的 @click.stop 执行，能可靠收起下拉；
    //   这也与上方遮罩关闭监听使用捕获阶段的设计保持一致。
    document.addEventListener(
        'click',
        function (e) {
            // 页面内任意一次点击都会收起下拉，只有两种情况例外：
            //   1. 点的是「选项」本身 —— 交给页面处理选中 + 收起
            //   2. 点的是「触发器」本身 —— 交给页面做开/关切换
            // 其余任何位置（弹窗内空白、遮罩、页面其它地方）一律收起。
            var target = e.target;
            var open = document.querySelectorAll(SELECT + '.is-open');
            if (!open.length) return;

            if (target && target.nodeType === 1) {
                // 点选项：页面自己会收起，这里不插手
                if (target.closest && target.closest('.dropdown-item')) return;
                // 点触发器：页面自己会切换，这里不插手
                if (target.closest && target.closest('.select-display')) return;
                if (target.closest && target.closest('.custom-select') &&
                    !target.closest('.dropdown-options')) return;
            }

            Array.prototype.forEach.call(open, function (el) {
                notifySelectClose(el);
            });
        },
        true
    );

    window.VowmonDropdown = {
        closeAll: function () {
            var open = document.querySelectorAll(SELECT + '.is-open');
            Array.prototype.forEach.call(open, function (el) {
                notifySelectClose(el);
            });
        },
        closeOthers: closeOtherSelects,
        eventName: 'vowmon-dropdown-close'
    };
})();
