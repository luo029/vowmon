/* ==========================================================================
   Vowmon 自定义弹窗 —— 唯一来源（替代系统 alert / confirm / prompt）
   --------------------------------------------------------------------------
   为什么要有这个文件：
       后台原来到处是 alert('❌ 上传失败：...')、confirm('确定删除？')，
       系统原生弹窗样式丑陋、无法统一、在移动端还会被浏览器拦截或显示域名。
       本文件用纯 DOM 实现一套跟站点风格一致的弹窗，样式见 css/dialog.css。

   用法（Promise 化，不需要写回调）：
       await VowmonDialog.alert('已保存');                       // 纯提示
       await VowmonDialog.alert('同步失败', { type: 'danger', detail: err.message });

       if (!(await VowmonDialog.confirm('确定删除「火球术」？'))) return;
       await VowmonDialog.confirm('确定删除？', { type: 'danger', title: '确认删除', okText: '删除' });

       const name = await VowmonDialog.prompt('新建类型名称', { placeholder: '如：消耗品' });
       if (name === null) return; // 取消

       VowmonDialog.toast('已同步到 2 个仓库');                   // 轻提示，不打断
       VowmonDialog.toast('请先填写物品名称', 'warning');

   约定：
       - type: info | success | warning | danger（默认 info；danger 用于删除等破坏性确认）
       - 消息里带 ✅ / ❌ / ⚠️ 前缀时会自动识别类型并去掉 emoji，老代码直接搬过来也能看
       - opts.html = true 时才解析 HTML（用于强调物品名 <strong>），默认按纯文本处理
       - Esc 取消、Enter 确认；破坏性确认默认把焦点放在「取消」上，防手滑
       - 遵循全局动画开关 vowmon_anim_on = 'false'
       - 遮罩与键盘逻辑自管，不复用 .modal-overlay，因此不会和 js/common-ui.js 打架
   ========================================================================== */
(function () {
    'use strict';
    if (window.VowmonDialog) return;

    /* ------------------------------------------------------------ 常量 */

    var ICONS = {
        info: 'fa-solid fa-circle-info',
        success: 'fa-solid fa-circle-check',
        warning: 'fa-solid fa-triangle-exclamation',
        danger: 'fa-solid fa-trash-can'
    };

    var TITLES = {
        info: '提示',
        success: '已完成',
        warning: '注意',
        danger: '请确认'
    };

    // 老代码里的 emoji 前缀 → 类型
    var EMOJI_RULES = [
        { re: /^\s*\u2705\s*/, type: 'success' },   // ✅
        { re: /^\s*\u274C\s*/, type: 'danger' },    // ❌
        { re: /^\s*\u26A0\uFE0F?\s*/, type: 'warning' }, // ⚠️ / ⚠
        { re: /^\s*\u2139\uFE0F?\s*/, type: 'info' }     // ℹ️
    ];

    function animOn() {
        try {
            return localStorage.getItem('vowmon_anim_on') !== 'false';
        } catch (e) {
            return true;
        }
    }

    function el(tag, cls, text) {
        var node = document.createElement(tag);
        if (cls) node.className = cls;
        if (text != null) node.textContent = text;
        return node;
    }

    // 拼 html:true 消息时用：VowmonDialog.esc(名字) 防止特殊字符破坏结构
    var ESC_MAP = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
    function escapeHtml(str) {
        return String(str == null ? '' : str).replace(/[&<>"']/g, function (c) { return ESC_MAP[c]; });
    }

    // 把「✅ 上传成功」这类老消息拆成 类型 + 纯文本
    function parseMessage(raw) {
        var msg = String(raw == null ? '' : raw);
        var type = null;
        for (var i = 0; i < EMOJI_RULES.length; i++) {
            if (EMOJI_RULES[i].re.test(msg)) {
                type = EMOJI_RULES[i].type;
                msg = msg.replace(EMOJI_RULES[i].re, '');
                break;
            }
        }
        return { message: msg.trim(), type: type };
    }

    /* ------------------------------------------------------------ 状态 */

    var current = null;   // 正在显示的那个 { root, card, okBtn, input, opts, resolve }
    var queue = [];       // 排队等待显示的
    var scrollLocks = 0;
    var prevOverflow = '';
    var toastHost = null;

    function lockScroll() {
        if (scrollLocks === 0) {
            prevOverflow = document.body.style.overflow;
            document.body.style.overflow = 'hidden';
        }
        scrollLocks++;
    }

    function unlockScroll() {
        scrollLocks = Math.max(0, scrollLocks - 1);
        if (scrollLocks === 0) document.body.style.overflow = prevOverflow;
    }

    /* -------------------------------------------------------- 构建弹窗 */

    function buildNode(opts) {
        var root = el('div', 'vdlg-root' + (animOn() ? '' : ' is-static'));
        var mask = el('div', 'vdlg-mask');
        var card = el('div', 'vdlg-card');
        card.dataset.type = opts.type;
        card.setAttribute('role', 'dialog');
        card.setAttribute('aria-modal', 'true');
        card.setAttribute('aria-label', opts.title || TITLES[opts.type] || '提示');

        if (opts.icon !== false) {
            var icon = el('div', 'vdlg-icon');
            var i = document.createElement('i');
            i.className = opts.icon || ICONS[opts.type] || ICONS.info;
            icon.appendChild(i);
            card.appendChild(icon);
        }

        card.appendChild(el('div', 'vdlg-title', opts.title || TITLES[opts.type] || '提示'));

        var msg = el('div', 'vdlg-message');
        if (opts.html) msg.innerHTML = opts.message;
        else msg.textContent = opts.message;
        card.appendChild(msg);

        if (opts.detail) {
            card.appendChild(el('div', 'vdlg-detail', String(opts.detail)));
        }

        var input = null;
        if (opts.mode === 'prompt') {
            input = document.createElement('input');
            input.className = 'vdlg-input';
            input.type = 'text';
            input.value = opts.value || '';
            input.placeholder = opts.placeholder || '';
            card.appendChild(input);
        }

        var actions = el('div', 'vdlg-actions');

        function makeBtn(kind, text) {
            var btn = el('button', 'vdlg-btn vdlg-btn-' + kind, text);
            btn.type = 'button';
            return btn;
        }

        if (opts.mode !== 'alert') {
            var cancelBtn = makeBtn('cancel', opts.cancelText || '取消');
            cancelBtn.addEventListener('click', function () {
                close(opts.mode === 'prompt' ? null : false);
            });
            actions.appendChild(cancelBtn);
        }

        var okBtn = makeBtn('ok', opts.okText || (opts.mode === 'alert' ? '知道了' : '确定'));
        if (opts.okDisabled) okBtn.disabled = true;
        okBtn.addEventListener('click', submit);
        actions.appendChild(okBtn);

        card.appendChild(actions);
        root.appendChild(mask);
        root.appendChild(card);

        // 点遮罩：confirm / prompt 等同取消；纯提示直接关
        mask.addEventListener('click', function () {
            if (opts.maskClosable === false) return;
            close(opts.mode === 'alert' ? undefined : (opts.mode === 'prompt' ? null : false));
        });

        return { root: root, card: card, okBtn: okBtn, input: input };
    }

    function submit() {
        if (!current) return;
        var opts = current.opts;
        if (opts.mode === 'confirm') return close(true);
        if (opts.mode === 'prompt') return close(String(current.input ? current.input.value : ''));
        close();
    }

    function show(job) {
        var opts = job.opts;
        var built = buildNode(opts);

        current = {
            root: built.root,
            card: built.card,
            okBtn: built.okBtn,
            input: built.input,
            opts: opts,
            resolve: job.resolve
        };

        document.body.appendChild(built.root);
        lockScroll();

        // 强制一次布局，保证进场过渡生效
        void built.root.offsetWidth;
        built.root.classList.add('is-show');

        setTimeout(function () {
            if (!current || current.root !== built.root) return;
            var focusTarget = built.input || (opts.type === 'danger' ? built.card.querySelector('.vdlg-btn-cancel') : built.okBtn);
            if (focusTarget) {
                try { focusTarget.focus({ preventScroll: true }); } catch (e) { focusTarget.focus(); }
                if (built.input) built.input.select();
            }
        }, 40);
    }

    function close(result) {
        if (!current) return;
        var job = current;
        current = null;

        var root = job.root;
        root.classList.remove('is-show');
        unlockScroll();

        var wait = animOn() ? 200 : 0;
        setTimeout(function () {
            if (root.parentNode) root.parentNode.removeChild(root);
        }, wait + 20);

        try { job.resolve(result); } catch (e) { console.error(e); }

        if (queue.length) {
            var next = queue.shift();
            setTimeout(function () { show(next); }, wait ? 60 : 0);
        }
    }

    function request(opts) {
        return new Promise(function (resolve) {
            // 先入队再决定，避免并发调用时两个弹窗重叠
            if (current) queue.push({ opts: opts, resolve: resolve });
            else show({ opts: opts, resolve: resolve });
        });
    }

    /* ------------------------------------------------------ 键盘 / 焦点 */

    document.addEventListener(
        'keydown',
        function (e) {
            if (!current) return;

            if (e.key === 'Escape' || e.key === 'Esc') {
                e.preventDefault();
                // 捕获阶段拦下并阻止继续传播：后台表单弹窗（.modal-overlay）不会被一起关掉
                e.stopPropagation();
                var opts = current.opts;
                close(opts.mode === 'alert' ? undefined : (opts.mode === 'prompt' ? null : false));
                return;
            }

            if (e.key === 'Enter') {
                var t = e.target;
                if (t && (t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
                e.preventDefault();
                e.stopPropagation();
                submit();
                return;
            }

            if (e.key === 'Tab') {
                var nodes = current.card.querySelectorAll('.vdlg-btn:not([disabled]), .vdlg-input');
                if (!nodes.length) return;
                var first = nodes[0];
                var last = nodes[nodes.length - 1];
                if (e.shiftKey && document.activeElement === first) {
                    e.preventDefault();
                    last.focus();
                } else if (!e.shiftKey && document.activeElement === last) {
                    e.preventDefault();
                    first.focus();
                }
            }
        },
        true
    );

    /* ---------------------------------------------------------- 轻提示 */

    function ensureToastHost() {
        if (toastHost && toastHost.parentNode) return toastHost;
        toastHost = el('div', 'vdlg-toasts');
        document.body.appendChild(toastHost);
        return toastHost;
    }

    function toast(raw, typeOrOpts, maybeOpts) {
        var parsed = parseMessage(raw);
        var type = parsed.type || 'info';
        var opts = {};

        if (typeof typeOrOpts === 'string') {
            type = typeOrOpts;
            opts = maybeOpts || {};
        } else if (typeOrOpts && typeof typeOrOpts === 'object') {
            opts = typeOrOpts;
            if (opts.type) type = opts.type;
        }

        var host = ensureToastHost();
        var node = el('div', 'vdlg-toast' + (animOn() ? '' : ' is-static'));
        node.dataset.type = type;

        var ic = el('div', 'vdlg-toast-icon');
        var i = document.createElement('i');
        i.className = opts.icon || ICONS[type] || ICONS.info;
        ic.appendChild(i);

        node.appendChild(ic);
        node.appendChild(el('div', 'vdlg-toast-text', opts.html ? '' : parsed.message));
        if (opts.html) node.lastChild.innerHTML = parsed.message;

        host.appendChild(node);
        void node.offsetWidth;
        node.classList.add('is-show');

        var life = opts.duration || (type === 'danger' ? 3600 : 2800);
        var timer = setTimeout(hide, life);

        function hide() {
            clearTimeout(timer);
            node.classList.remove('is-show');
            setTimeout(function () {
                if (node.parentNode) node.parentNode.removeChild(node);
            }, animOn() ? 240 : 20);
        }

        node.addEventListener('click', hide);
        return hide;
    }

    /* ------------------------------------------------------- 对外接口 */

    function alertDialog(raw, opts) {
        opts = opts || {};
        var parsed = parseMessage(raw);
        return request({
            mode: 'alert',
            type: opts.type || parsed.type || 'info',
            title: opts.title || (opts.type === 'success' || parsed.type === 'success' ? '已完成' : null),
            message: opts.html ? String(raw) : parsed.message,
            html: !!opts.html,
            detail: opts.detail || '',
            icon: opts.icon,
            okText: opts.okText,
            maskClosable: opts.maskClosable
        });
    }

    function confirmDialog(raw, opts) {
        opts = opts || {};
        var parsed = parseMessage(raw);
        return request({
            mode: 'confirm',
            type: opts.type || parsed.type || 'info',
            title: opts.title || null,
            message: opts.html ? String(raw) : parsed.message,
            html: !!opts.html,
            detail: opts.detail || '',
            icon: opts.icon,
            okText: opts.okText,
            cancelText: opts.cancelText,
            maskClosable: opts.maskClosable
        });
    }

    function promptDialog(raw, opts) {
        opts = opts || {};
        var parsed = parseMessage(raw);
        return request({
            mode: 'prompt',
            type: opts.type || parsed.type || 'info',
            title: opts.title || null,
            message: parsed.message,
            detail: opts.detail || '',
            icon: opts.icon,
            value: opts.value || '',
            placeholder: opts.placeholder || '',
            okText: opts.okText,
            cancelText: opts.cancelText
        });
    }

    window.VowmonDialog = {
        alert: alertDialog,
        confirm: confirmDialog,
        prompt: promptDialog,
        toast: toast,
        success: function (msg, opts) { return toast(msg, 'success', opts); },
        error: function (msg, opts) { return toast(msg, 'danger', opts); },
        warn: function (msg, opts) { return toast(msg, 'warning', opts); },
        esc: escapeHtml,
        // 供极少数同步场景用：无弹窗时也要能拿到状态
        isOpen: function () { return !!current; }
    };
})();
