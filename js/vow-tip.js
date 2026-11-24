/* ==========================================================================
   Vowmon 自定义字段提示 —— 即时显示，替代浏览器原生 title（延迟数秒）
   用法：<i class="tip" data-tip="这里是说明文字">?</i>
   鼠标移入 / 键盘聚焦立即出现，点击可固定；点击别处消失。
   ========================================================================== */
(function () {
    'use strict';
    if (window.VowTipInit) return;
    window.VowTipInit = true;

    var box = null;
    var pinned = false;

    function ensure() {
        if (box && box.parentNode) return box;
        box = document.createElement('div');
        box.className = 'vow-tip';
        document.body.appendChild(box);
        return box;
    }

    function place(el) {
        var r = el.getBoundingClientRect();
        var w = box.offsetWidth;
        var h = box.offsetHeight;
        var x = Math.max(8, Math.min(window.innerWidth - w - 8, r.left + r.width / 2 - w / 2));
        var y = r.bottom + 8;
        if (y + h > window.innerHeight - 8) y = Math.max(8, r.top - h - 8);
        box.style.left = x + 'px';
        box.style.top = y + 'px';
    }

    function show(el) {
        var text = el.getAttribute('data-tip');
        if (!text) return;
        var b = ensure();
        b.textContent = text;
        b.classList.add('is-show');
        place(el);
    }

    function hide() {
        if (pinned || !box) return;
        box.classList.remove('is-show');
    }

    document.addEventListener('mouseover', function (e) {
        var t = e.target && e.target.closest ? e.target.closest('.tip[data-tip]') : null;
        if (t) show(t);
        else if (!pinned) hide();
    });
    document.addEventListener('mouseout', function (e) {
        var t = e.target && e.target.closest ? e.target.closest('.tip[data-tip]') : null;
        if (t && (!e.relatedTarget || !t.contains(e.relatedTarget))) hide();
    });
    document.addEventListener('focusin', function (e) {
        var t = e.target && e.target.closest ? e.target.closest('.tip[data-tip]') : null;
        if (t) show(t);
    });
    document.addEventListener('focusout', hide);
    document.addEventListener('click', function (e) {
        var t = e.target && e.target.closest ? e.target.closest('.tip[data-tip]') : null;
        if (t) {
            e.stopPropagation();
            pinned = !pinned;
            box = ensure();
            box.classList.toggle('is-show', pinned);
            if (pinned) place(t);
        } else if (pinned) {
            pinned = false;
            hide();
        }
    }, true);
    window.addEventListener('scroll', hide, true);
    window.addEventListener('resize', hide);
})();
