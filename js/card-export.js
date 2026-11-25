/**
 * 卡片导出：把精灵 / 御兽精灵 / 御兽人物 / 物品渲染成一张 TCG 收藏卡（PNG）
 *
 * 版式：彩色卡框 + 卡名/HP + 半幅大图（属性底纹） + 整块说明区（特性 + 图鉴） + 页脚
 * 说明区是一整块纸面（不再切成两个盒子），更像真卡牌。
 */
(function () {
    const W = 780;
    const ART_TOP = 152;
    const FOOT_ZONE = 88;

    /* 正文用霞鹜文楷（有笔锋）；卡名用思源宋体特粗（端正醒目、和雅黑一眼能区分）；
       编号 / HP 数字用 Rajdhani（窄体数字，收得住）。全部按需加载，失败自动回退。 */
    const FALLBACK = "'MiSans','HarmonyOS Sans SC','Source Han Sans SC','Noto Sans SC','PingFang SC','Hiragino Sans GB','Microsoft YaHei',system-ui,sans-serif";
    const BODY_FONT = "'LXGW WenKai','LXGW WenKai Screen','LXGW WenKai GB'," + FALLBACK;
    const DISPLAY_FONT = "'Noto Serif SC','Source Han Serif SC','Songti SC','STSong'," + BODY_FONT;
    const NUM_FONT = "'Rajdhani','Bahnschrift','DIN Alternate','Arial Narrow'," + DISPLAY_FONT;
    const FA_FONT = "'Font Awesome 6 Free','Font Awesome 5 Free'";

    const FONT_CSS = [
        'https://cdn.jsdelivr.net/npm/@fontsource/noto-serif-sc@5/index.css',
        'https://cdn.jsdelivr.net/npm/@fontsource/rajdhani@5/700.css',
        'https://cdn.jsdelivr.net/npm/lxgw-wenkai-webfont@1.7.0/lxgwwenkai-bold.css'
    ];

    /* 属性图标直接用图鉴（type-config.js）里的同一套图标，卡面和网页保持一致 */
    const TYPE_ICON_FALLBACK = {
        '一般': 'fa-solid fa-star', '格斗': 'fa-solid fa-hand-fist', '飞行': 'fa-solid fa-feather',
        '毒': 'fa-solid fa-skull-crossbones', '地面': 'fa-solid fa-mountain-sun', '岩石': 'fa-solid fa-cubes',
        '虫': 'fa-solid fa-bug', '幽灵': 'fa-solid fa-ghost', '钢': 'fa-solid fa-gear',
        '火': 'fa-solid fa-fire', '水': 'fa-solid fa-droplet', '草': 'fa-solid fa-leaf',
        '电': 'fa-solid fa-bolt', '超能力': 'fa-solid fa-eye', '冰': 'fa-solid fa-snowflake',
        '龙': 'fa-solid fa-dragon', '恶': 'fa-solid fa-moon', '妖精': 'fa-solid fa-heart'
    };
    const TYPE_EMOJI = {
        '一般': '🐾', '格斗': '👊', '飞行': '🪶', '毒': '☠️', '地面': '⛰️', '岩石': '🪨',
        '虫': '🐛', '幽灵': '👻', '钢': '⚙️', '火': '🔥', '水': '💧', '草': '🍃',
        '电': '⚡', '超能力': '🔮', '冰': '❄️', '龙': '🐉', '恶': '🌙', '妖精': '✨'
    };
    const iconClassCache = {};
    function typeIconClass(name) {
        const key = String(name || '').trim();
        if (iconClassCache[key]) return iconClassCache[key];
        let cls = '';
        try {
            if (typeof typeData !== 'undefined' && Array.isArray(typeData)) {
                const hit = typeData.find(t => t && t.name === key);
                if (hit && hit.icon) cls = hit.icon;
            }
        } catch (e) {}
        if (!cls) cls = TYPE_ICON_FALLBACK[key] || '';
        iconClassCache[key] = cls;
        return cls;
    }
    function typeEmoji(name) {
        return TYPE_EMOJI[String(name || '').trim()] || '✦';
    }

    /* 从 FontAwesome 的 ::before 里取真实字形，保证和网页上的图标一模一样 */
    const glyphCache = {};
    function faGlyph(cls) {
        if (!cls) return '';
        if (glyphCache[cls] !== undefined) return glyphCache[cls];
        let ch = '';
        try {
            const el = document.createElement('i');
            el.className = cls;
            el.setAttribute('aria-hidden', 'true');
            el.style.cssText = 'position:absolute;left:-9999px;top:0;opacity:0;pointer-events:none;';
            document.body.appendChild(el);
            const content = window.getComputedStyle(el, '::before').content || '';
            document.body.removeChild(el);
            const m = /^["']([\s\S]+)["']$/.exec(content);
            if (m) ch = m[1];
        } catch (e) {}
        glyphCache[cls] = ch;
        return ch;
    }
    function typeGlyph(name) {
        return faGlyph(typeIconClass(name));
    }

    let cssInjected = false;
    function injectFontCss() {
        if (cssInjected) return;
        cssInjected = true;
        FONT_CSS.forEach(href => {
            const l = document.createElement('link');
            l.rel = 'stylesheet';
            l.href = href;
            l.crossOrigin = 'anonymous';
            document.head.appendChild(l);
        });
    }
    function waitFont(font, text, ms) {
        return new Promise(resolve => {
            if (!document.fonts || !document.fonts.load) return resolve();
            let done = false;
            const fin = () => { if (!done) { done = true; resolve(); } };
            const timer = setTimeout(fin, ms || 4000);
            document.fonts.load(font, text).then(() => { clearTimeout(timer); fin(); }).catch(() => { clearTimeout(timer); fin(); });
        });
    }

    function setFont(ctx, size, weight) {
        ctx.font = (weight || 700) + ' ' + size + 'px ' + BODY_FONT;
    }
    function setDisplayFont(ctx, size, weight) {
        ctx.font = (weight || 700) + ' ' + size + 'px ' + DISPLAY_FONT;
    }
    function setNumFont(ctx, size, weight) {
        ctx.font = (weight || 700) + ' ' + size + 'px ' + NUM_FONT;
    }
    function setIconFont(ctx, size) {
        ctx.font = '900 ' + size + 'px ' + FA_FONT + ',' + BODY_FONT;
    }

    function hexA(hex, a) {
        const h = String(hex || '#718096').replace('#', '');
        const s = h.length === 3 ? h.split('').map(c => c + c).join('') : h;
        const n = parseInt(s.slice(0, 6), 16) || 0;
        return 'rgba(' + ((n >> 16) & 255) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + a + ')';
    }

    function shade(hex, k) {
        const h = String(hex || '#718096').replace('#', '');
        const s = h.length === 3 ? h.split('').map(c => c + c).join('') : h;
        const n = parseInt(s.slice(0, 6), 16) || 0;
        return 'rgb(' + Math.min(255, Math.round(((n >> 16) & 255) * k)) + ',' +
            Math.min(255, Math.round(((n >> 8) & 255) * k)) + ',' +
            Math.min(255, Math.round((n & 255) * k)) + ')';
    }

    /* 往白色方向调亮，用于属性胶囊的浅色底 */
    function tint(hex, k) {
        const h = String(hex || '#718096').replace('#', '');
        const s = h.length === 3 ? h.split('').map(c => c + c).join('') : h;
        const n = parseInt(s.slice(0, 6), 16) || 0;
        const mix = c => Math.round(c + (255 - c) * k);
        return 'rgb(' + mix((n >> 16) & 255) + ',' + mix((n >> 8) & 255) + ',' + mix(n & 255) + ')';
    }

    function roundRect(ctx, x, y, w, h, r) {
        const rr = Math.min(r, w / 2, h / 2);
        ctx.beginPath();
        ctx.moveTo(x + rr, y);
        ctx.arcTo(x + w, y, x + w, y + h, rr);
        ctx.arcTo(x + w, y + h, x, y + h, rr);
        ctx.arcTo(x, y + h, x, y, rr);
        ctx.arcTo(x, y, x + w, y, rr);
        ctx.closePath();
    }

    function rnd(seed) {
        let s = seed || 1;
        return function () {
            s = (s * 1103515245 + 12345) & 0x7fffffff;
            return s / 0x7fffffff;
        };
    }

    function wrap(ctx, text, maxW) {
        const str = String(text == null ? '' : text).replace(/\r/g, '');
        const lines = [];
        str.split('\n').forEach(para => {
            let cur = '';
            Array.from(para).forEach(ch => {
                const test = cur + ch;
                if (cur && ctx.measureText(test).width > maxW) {
                    lines.push(cur);
                    cur = ch;
                } else {
                    cur = test;
                }
            });
            lines.push(cur);
        });
        return lines.length ? lines : [''];
    }

    function fitLines(ctx, text, maxW, maxLines) {
        const all = wrap(ctx, text, maxW);
        if (all.length <= maxLines) return all;
        const out = all.slice(0, maxLines);
        let last = out[maxLines - 1];
        while (last.length > 1 && ctx.measureText(last + '…').width > maxW) last = last.slice(0, -1);
        out[maxLines - 1] = last + '…';
        return out;
    }

    /* 均衡换行：最后一行只剩一两个字时，把整段重新均分到各行，避免出现孤行 */
    function fitLinesBalanced(ctx, text, maxW, maxLines) {
        const lines = fitLines(ctx, text, maxW, maxLines);
        const n = lines.length;
        if (n < 2) return lines;
        const lastLen = Array.from(lines[n - 1]).length;
        if (lastLen > 2) return lines;

        const total = Array.from(text).length;
        const base = Math.floor(total / n);
        const extra = total % n;
        const out = [];
        let idx = 0;
        let ok = true;
        for (let i = 0; i < n; i++) {
            const cnt = base + (i < extra ? 1 : 0);
            let seg = Array.from(text).slice(idx, idx + cnt).join('');
            idx += cnt;
            /* 标点悬行：下一行开头是标点时，把它并回上一行末尾 */
            while (i + 1 < n && /^[，。、！？；：…）》”’]/.test(Array.from(text).slice(idx, idx + 1).join(''))) {
                seg += Array.from(text).slice(idx, idx + 1).join('');
                idx += 1;
            }
            if (ctx.measureText(seg).width > maxW) { ok = false; break; }
            out.push(seg);
        }
        if (!ok || idx < total) return lines;
        return out;
    }

    function loadImage(url) {
        return new Promise(resolve => {
            if (!url) return resolve(null);
            const img = new Image();
            img.crossOrigin = 'anonymous';
            img.onload = () => resolve(img);
            img.onerror = () => resolve(null);
            img.src = url;
        });
    }

    function normalize(o) {
        const opt = Object.assign({}, o || {});
        opt.label = String(opt.label == null ? '' : opt.label);
        /* 名字允许为空（弹窗关闭名字开关时直接不显示，而不是“未命名”） */
        opt.name = opt.name === '' ? '' : String(opt.name || '未命名');
        opt.badgeLabel = String(opt.badgeLabel || '');
        opt.badgeValue = String(opt.badgeValue == null ? '' : opt.badgeValue);
        opt.variant = opt.variant || 'pet';
        opt.fit = opt.fit === 'cover' ? 'cover' : 'contain';
        opt.types = Array.isArray(opt.types) ? opt.types.filter(Boolean).map(t => ({
            name: String(t.name || ''),
            color: String(t.color || opt.accent || '#4299e1'),
            icon: String(t.icon || '')
        })).filter(t => t.name) : [];
        let ab = opt.ability;
        if (!ab && Array.isArray(opt.rows) && opt.rows.length) ab = opt.rows[0];
        const normAb = (x) => x ? {
            tag: String(x.tag || '特性'),
            name: String(x.name || ''),
            text: String(x.text || '')
        } : null;
        opt.ability = normAb(ab);
        if (opt.ability && !opt.ability.name && !opt.ability.text) opt.ability = null;
        /* 第二块（血脉技能等）：与 ability 同构、独立开关 */
        opt.ability2 = normAb(opt.ability2);
        if (opt.ability2 && !opt.ability2.name && !opt.ability2.text) opt.ability2 = null;
        opt.desc = String(opt.desc || '');
        opt.descLabel = String(opt.descLabel || '图鉴说明');
        /* 资料行：主人 / 性格等，逐行显示在特性之下 */
        opt.info = Array.isArray(opt.info) ? opt.info.filter(Boolean).map(x => ({
            icon: String(x.icon || ''),
            label: String(x.label || ''),
            value: String(x.value == null ? '' : x.value).trim()
        })).filter(x => x.label && x.value) : [];
        opt.footLeft = String(opt.footLeft || '');
        /* 页脚右侧默认为空：没有内容时连虚线一起隐藏，不会兜底显示 VOWMON */
        opt.footRight = String(opt.footRight == null ? '' : opt.footRight);
        /* 资料条（主人 / 性格 / 身高 / 体重等）：大图下方的一条长胶囊，内含彩色小胶囊 */
        opt.stats = Array.isArray(opt.stats) ? opt.stats.filter(Boolean).map(x => ({
            icon: String(x.icon || ''),
            label: String(x.label || ''),
            value: String(x.value == null ? '' : x.value).trim(),
            color: String(x.color || opt.accent || '#4299e1')
        })).filter(x => x.label && x.value) : [];
        /* 当前实力（位阶）与权柄：独立彩色胶囊，随资料条一起显示 */
        opt.rank = (opt.rank && opt.rank.value != null && String(opt.rank.value).trim())
            ? { value: String(opt.rank.value).trim(), color: String(opt.rank.color || '#d4a017') } : null;
        opt.quan = (opt.quan && opt.quan.value != null && String(opt.quan.value).trim())
            ? { value: String(opt.quan.value).trim(), color: String(opt.quan.color || '#c2410c') } : null;
        opt.dexNo = String(opt.dexNo || '');
        /* 编号只出现在卡名旁边，不再重复进页脚 */
        if (opt.dexNo && opt.footLeft.indexOf(opt.dexNo) >= 0) {
            opt.footLeft = opt.footLeft.replace(opt.dexNo, '').replace(/^[　\s]+|[　\s]+$/g, '');
        }
        opt.shiny = !!opt.shiny;
        /* 异色细节可独立开关：卡面星章 / 图上星光（默认跟随 shiny） */
        opt.shinyBadge = opt.shinyBadge === undefined ? opt.shiny : !!opt.shinyBadge;
        opt.shinySparks = opt.shinySparks === undefined ? opt.shiny : !!opt.shinySparks;
        /* 图像关闭时不画首字占位 */
        opt.noPlaceholder = !!opt.noPlaceholder;
        /* 底纹风格：ray 属性光效 / gradient 纯渐变 / plain 浅色纸面 */
        opt.bg = ['ray', 'gradient', 'plain'].indexOf(opt.bg) >= 0 ? opt.bg : 'ray';
        opt.accent = String(opt.accent || (opt.types[0] && opt.types[0].color) || '#4299e1');
        return opt;
    }

    /* ------------------------------------------------------- 底纹 */
    function drawSparkle(ctx, cx, cy, r, color, alpha) {
        ctx.save();
        ctx.translate(cx, cy);
        ctx.fillStyle = hexA(color, alpha);
        ctx.beginPath();
        ctx.moveTo(0, -r);
        ctx.quadraticCurveTo(r * 0.16, -r * 0.16, r, 0);
        ctx.quadraticCurveTo(r * 0.16, r * 0.16, 0, r);
        ctx.quadraticCurveTo(-r * 0.16, r * 0.16, -r, 0);
        ctx.quadraticCurveTo(-r * 0.16, -r * 0.16, 0, -r);
        ctx.fill();
        ctx.restore();
    }

    function artBackdrop(ctx, x, y, w, h, o) {
        const acc = o.accent;
        const cx = x + w / 2;
        const cy = y + h * 0.52;

        /* 背景风格：plain 浅色纸面 / gradient 纯渐变 / ray 属性光效（默认） */
        if (o.bg === 'plain') {
            ctx.fillStyle = hexA(acc, 0.14);
            ctx.fillRect(x, y, w, h);
            const cg = ctx.createRadialGradient(x + w * 0.12, y + h * 0.1, 4, x + w * 0.12, y + h * 0.1, w * 0.5);
            cg.addColorStop(0, 'rgba(255,255,255,0.5)');
            cg.addColorStop(1, 'rgba(255,255,255,0)');
            ctx.fillStyle = cg;
            ctx.fillRect(x, y, w, h);
            return;
        }

        const g = ctx.createRadialGradient(cx, cy, 20, cx, cy, Math.max(w, h) * 0.8);
        g.addColorStop(0, hexA(acc, 0.32));
        g.addColorStop(0.55, hexA(acc, 0.18));
        g.addColorStop(1, hexA(shade(acc, 0.58), 0.4));
        ctx.fillStyle = g;
        ctx.fillRect(x, y, w, h);

        if (o.bg === 'gradient') {
            const cg = ctx.createRadialGradient(x + w * 0.12, y + h * 0.1, 4, x + w * 0.12, y + h * 0.1, w * 0.5);
            cg.addColorStop(0, 'rgba(255,255,255,0.36)');
            cg.addColorStop(1, 'rgba(255,255,255,0)');
            ctx.fillStyle = cg;
            ctx.fillRect(x, y, w, h);
            return;
        }

        const rand = rnd(String(o.name).length * 977 + Math.round(w));

        if (o.variant === 'trainer') {
            ctx.save();
            ctx.translate(x, y);
            ctx.rotate(-0.34);
            ctx.fillStyle = 'rgba(255,255,255,0.16)';
            for (let i = -h; i < w * 1.6; i += 54) ctx.fillRect(i, -h, 22, h * 2.6);
            ctx.restore();
            for (let i = 0; i < 9; i++) {
                const bx = x + rand() * w;
                const by = y + rand() * h;
                const br = 26 + rand() * 90;
                const bg = ctx.createRadialGradient(bx, by, 1, bx, by, br);
                bg.addColorStop(0, 'rgba(255,255,255,0.42)');
                bg.addColorStop(1, 'rgba(255,255,255,0)');
                ctx.fillStyle = bg;
                ctx.beginPath();
                ctx.arc(bx, by, br, 0, Math.PI * 2);
                ctx.fill();
            }
        } else {
            ctx.save();
            ctx.translate(cx, cy);
            const rays = 26;
            for (let i = 0; i < rays; i++) {
                const a0 = (i / rays) * Math.PI * 2;
                const a1 = a0 + (Math.PI * 2 / rays) * 0.45;
                const R = Math.max(w, h) * 1.15;
                ctx.beginPath();
                ctx.moveTo(0, 0);
                ctx.lineTo(Math.cos(a0) * R, Math.sin(a0) * R);
                ctx.lineTo(Math.cos(a1) * R, Math.sin(a1) * R);
                ctx.closePath();
                ctx.fillStyle = i % 2 ? 'rgba(255,255,255,0.17)' : 'rgba(255,255,255,0.05)';
                ctx.fill();
            }
            for (let i = 1; i <= 3; i++) {
                ctx.beginPath();
                ctx.arc(0, 0, 58 + i * 48, 0, Math.PI * 2);
                ctx.strokeStyle = 'rgba(255,255,255,' + (0.26 - i * 0.06) + ')';
                ctx.lineWidth = 3;
                ctx.stroke();
            }
            ctx.restore();

            for (let i = 0; i < 16; i++) {
                drawSparkle(ctx, x + rand() * w, y + rand() * h, 6 + rand() * 14, '#ffffff', 0.35 + rand() * 0.4);
            }
        }

        const cg = ctx.createRadialGradient(x + w * 0.12, y + h * 0.1, 4, x + w * 0.12, y + h * 0.1, w * 0.5);
        cg.addColorStop(0, 'rgba(255,255,255,0.36)');
        cg.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = cg;
        ctx.fillRect(x, y, w, h);
    }

    /* ------------------------------------------------------- 布局 */
    function measure(o) {
        const ctx = document.createElement('canvas').getContext('2d');
        const innerW = W - 52;
        const textW = innerW - 56;

        /* 特性与图鉴说明统一版式：胶囊标题一行 + 缩进正文（26px/行距45） */
        const bodyW = innerW - 100;
        let abLines = [];
        if (o.ability && o.ability.text) {
            setFont(ctx, 26, 700);
            abLines = fitLinesBalanced(ctx, o.ability.text, bodyW, 4);
        }
        let ab2Lines = [];
        if (o.ability2 && o.ability2.text) {
            setFont(ctx, 26, 700);
            ab2Lines = fitLinesBalanced(ctx, o.ability2.text, bodyW, 4);
        }
        setFont(ctx, 26, 700);
        /* 图鉴正文左缩进加大后，换行宽度同步收窄；用均衡换行避免孤行 */
        const descLines = o.desc ? fitLinesBalanced(ctx, o.desc, bodyW, 5) : [];

        const abBlock = o.ability ? (abLines.length ? 96 + abLines.length * 45 : 60) : 0;
        const ab2Block = o.ability2 ? (ab2Lines.length ? 96 + ab2Lines.length * 45 : 60) : 0;
        /* 资料行（主人/性格等）：每行一条，单行截断。
           只截“值”，且截断宽度按真实起点（图标 + 标签 + 分隔线）计算，保证不超出右边框 */
        const infoLines = o.info.map(r => {
            setFont(ctx, 19, 900);
            const labW = ctx.measureText(r.label).width;
            const iconW = r.icon ? 30 : 0;
            const startX = 26 + 26 + iconW + labW + 14 + 12;   /* 与 paint 的绘制起点一致 */
            const avail = W - 26 - startX - 10;
            setFont(ctx, 21, 700);
            let s = String(r.value == null ? '' : r.value).trim();
            while (s.length > 1 && ctx.measureText(s).width > avail) s = s.slice(0, -1);
            if (s !== String(r.value || '').trim()) s += '…';
            return s;
        });
        const infoBlock = o.info.length ? o.info.length * 46 + 6 : 0;

        /* 资料条：长胶囊里排彩色小胶囊（主人 / 性格 / 身高 / 体重 / 当前实力 / 权柄），
           放在大图与特性之间；放不下的胶囊自动换行，值过长时单颗截断 */
        const chips = [];
        const addChip = (label, value, color, icon) => {
            const v = String(value == null ? '' : value).trim();
            if (!label || !v) return;
            chips.push({ label: String(label), value: v, color: color || o.accent, icon: String(icon || '') });
        };
        (o.stats || []).forEach(r => addChip(r.label, r.value, r.color, r.icon));
        if (o.rank) addChip('当前实力', o.rank.value, o.rank.color);
        if (o.quan) addChip('权柄', o.quan.value, o.quan.color);

        const chipH = 42, chipGap = 10, rowGap = 10, bandPad = 16;
        const availRow = innerW - bandPad * 2;
        chips.forEach(c => {
            const g = c.icon ? faGlyph(c.icon.indexOf(' ') < 0 ? 'fa-solid ' + c.icon : c.icon) : '';
            c.iconW = g ? 30 : 0;
            setFont(ctx, 18, 900);
            c.labW = ctx.measureText(c.label).width;
            setFont(ctx, 20, 700);
            const maxVw = Math.max(60, availRow - 24 - c.iconW - c.labW - 8 - 24);
            let v = c.value;
            while (v.length > 1 && ctx.measureText(v).width > maxVw) v = v.slice(0, -1);
            if (v !== c.value) v += '…';
            c.value = v;
            c.w = 24 + c.iconW + c.labW + 8 + ctx.measureText(v).width + 24;
        });
        const chipRows = [];
        let curRow = [], curW = 0;
        chips.forEach(c => {
            const add = curRow.length ? chipGap : 0;
            if (curRow.length && curW + add + c.w > availRow) { chipRows.push(curRow); curRow = [c]; curW = c.w; }
            else { curRow.push(c); curW += add + c.w; }
        });
        if (curRow.length) chipRows.push(curRow);
        const statsBandH = chips.length ? chipRows.length * chipH + (chipRows.length - 1) * rowGap + 24 : 0;
        const statsBlock = chips.length ? statsBandH + 14 : 0;
        const descBlock = descLines.length ? 96 + descLines.length * 45 : 0;
        const gap = ((abBlock || ab2Block || infoBlock) && descBlock) ? 30 : 0;
        /* 说明区上下留白加大一点，纸面更舒展 */
        const bodyPad = 32;
        const bodyH = bodyPad + abBlock + ab2Block + infoBlock + gap + descBlock + bodyPad;
        /* 页脚没有任何文字时，不画虚线也不留页脚高度 */
        const hasFoot = !!(o.footLeft || o.footRight);
        const footZone = hasFoot ? FOOT_ZONE : 26;

        /* 没有小标签时，卡名一行直接顶上去，大图随之上移 */
        const artTop = o.label ? 154 : 146;

        /* 文字多时让大图略收，文字少时让大图撑满；整张卡始终保持竖长方形（约 1:1.42） */
        const base = artTop + 16 + statsBlock + bodyH + footZone;
        const minH = Math.round(W * 1.42);
        let artH = 470;
        if (base + artH < minH) artH = Math.min(minH - base, 840);
        const H = base + artH;

        return { abLines, ab2Lines, descLines, infoLines, abBlock, ab2Block, descBlock, infoBlock, gap, bodyH, artTop, artH, H, footZone, hasFoot,
            chips, chipRows, chipH, chipGap, rowGap, bandPad, statsBandH, statsBlock };
    }

    /* 属性胶囊：浅色渐变底 + 属性色描边 + 渐变圆章，图标与图鉴一致 */
    function drawCap(ctx, cx, cy, ph, t) {
        const glyph = (t.icon ? faGlyph(t.icon) : '') || typeGlyph(t.name);
        setFont(ctx, 21, 900);
        const tw = ctx.measureText(t.name).width;
        const pw = tw + 72;

        ctx.save();
        ctx.shadowColor = 'rgba(0,0,0,0.22)';
        ctx.shadowBlur = 12;
        ctx.shadowOffsetY = 4;
        roundRect(ctx, cx, cy, pw, ph, ph / 2);
        const pg = ctx.createLinearGradient(cx, cy, cx, cy + ph);
        pg.addColorStop(0, tint(t.color, 0.86));
        pg.addColorStop(1, tint(t.color, 0.58));
        ctx.fillStyle = pg;
        ctx.fill();
        ctx.restore();
        ctx.strokeStyle = t.color;
        ctx.lineWidth = 3;
        ctx.stroke();

        const ccx = cx + 9 + 15;
        const ccy = cy + ph / 2;
        ctx.beginPath();
        ctx.arc(ccx, ccy, 15, 0, Math.PI * 2);
        const cg = ctx.createLinearGradient(ccx - 15, ccy - 15, ccx + 15, ccy + 15);
        cg.addColorStop(0, shade(t.color, 1.12));
        cg.addColorStop(1, shade(t.color, 0.72));
        ctx.fillStyle = cg;
        ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.95)';
        ctx.lineWidth = 3;
        ctx.stroke();

        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        if (glyph) {
            setIconFont(ctx, 16);
            ctx.fillStyle = '#fff';
            ctx.fillText(glyph, ccx, ccy + 1);
        } else {
            setFont(ctx, 15, 900);
            ctx.fillStyle = '#fff';
            ctx.fillText(typeEmoji(t.name), ccx, ccy + 1);
        }
        ctx.textAlign = 'left';
        ctx.textBaseline = 'alphabetic';

        setFont(ctx, 21, 900);
        ctx.fillStyle = shade(t.color, 0.52);
        ctx.fillText(t.name, cx + 9 + 34, cy + ph / 2 + 8);
        return pw;
    }

    /* 资料条小胶囊：浅色渐变底 + 主题色描边，图标圆章 + 标签 + 值 */
    function drawChip(ctx, x, y, h, c) {
        const col = c.color || '#4299e1';
        ctx.save();
        ctx.shadowColor = 'rgba(0,0,0,0.14)';
        ctx.shadowBlur = 8;
        ctx.shadowOffsetY = 3;
        roundRect(ctx, x, y, c.w, h, h / 2);
        const g = ctx.createLinearGradient(x, y, x, y + h);
        g.addColorStop(0, tint(col, 0.88));
        g.addColorStop(1, tint(col, 0.6));
        ctx.fillStyle = g;
        ctx.fill();
        ctx.restore();
        ctx.strokeStyle = hexA(col, 0.8);
        ctx.lineWidth = 2;
        ctx.stroke();

        const mid = y + h / 2;
        let ix = x + 20;
        const glyph = c.icon ? faGlyph(c.icon.indexOf(' ') < 0 ? 'fa-solid ' + c.icon : c.icon) : '';
        if (glyph) {
            ctx.beginPath();
            ctx.arc(ix + 11, mid, 12, 0, Math.PI * 2);
            const cg = ctx.createLinearGradient(ix - 1, mid - 12, ix + 23, mid + 12);
            cg.addColorStop(0, shade(col, 1.1));
            cg.addColorStop(1, shade(col, 0.72));
            ctx.fillStyle = cg;
            ctx.fill();
            ctx.strokeStyle = 'rgba(255,255,255,0.9)';
            ctx.lineWidth = 2;
            ctx.stroke();
            setIconFont(ctx, 12);
            ctx.fillStyle = '#fff';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(glyph, ix + 11, mid + 1);
            ctx.textAlign = 'left';
            ctx.textBaseline = 'alphabetic';
            ix += 30;
        }
        setFont(ctx, 18, 900);
        ctx.fillStyle = shade(col, 0.48);
        ctx.fillText(c.label, ix, mid + 7);
        ix += c.labW + 8;
        setFont(ctx, 20, 700);
        ctx.fillStyle = '#2f3945';
        ctx.fillText(c.value, ix, mid + 7);
    }

    /* ------------------------------------------------------- 绘制 */
    function paint(o, img, L) {
        const H = L.H;
        const S = 2;                       /* 2 倍分辨率，放大也清晰 */
        const cv = document.createElement('canvas');
        cv.width = W * S;
        cv.height = H * S;
        const ctx = cv.getContext('2d');
        ctx.scale(S, S);

        const accent = o.accent;
        const M = 26;
        const innerW = W - M * 2;
        const left = M;

        /* 卡框 */
        const frame = ctx.createLinearGradient(0, 0, W, H);
        frame.addColorStop(0, shade(accent, 1.26));
        frame.addColorStop(0.4, accent);
        frame.addColorStop(0.75, shade(accent, 0.86));
        frame.addColorStop(1, shade(accent, 0.6));
        roundRect(ctx, 0, 0, W, H, 44);
        ctx.fillStyle = frame;
        ctx.fill();
        ctx.strokeStyle = 'rgba(0,0,0,0.18)';
        ctx.lineWidth = 2;
        ctx.stroke();

        ctx.save();
        roundRect(ctx, 0, 0, W, H, 44);
        ctx.clip();
        ctx.strokeStyle = 'rgba(255,255,255,0.26)';
        ctx.lineWidth = 2;
        for (let i = 0; i < 6; i++) {
            ctx.beginPath();
            ctx.moveTo(-40 + i * 14, H + 40);
            ctx.lineTo(W + 40 - i * 6, -40 + i * 10);
            ctx.stroke();
        }
        ctx.restore();

        /* 内芯 */
        const P = 16;
        roundRect(ctx, P, P, W - P * 2, H - P * 2, 30);
        const paper = ctx.createLinearGradient(0, P, 0, H - P);
        paper.addColorStop(0, '#fffdf6');
        paper.addColorStop(0.5, '#fffefb');
        paper.addColorStop(1, '#f9f2e2');
        ctx.fillStyle = paper;
        ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.8)';
        ctx.lineWidth = 2;
        ctx.stroke();

        /* 卡名 / HP */
        ctx.textAlign = 'left';
        ctx.textBaseline = 'alphabetic';

        /* 左上角：有标签就画小标签；没标签但有编号，则编号与卡名同行 */
        let nx = left + 16;
        const nameBase = o.label ? 122 : 110;
        if (o.label) {
            setFont(ctx, 16, 900);
            ctx.fillStyle = hexA(accent, 0.95);
            ctx.fillText(o.label.toUpperCase(), left + 18, 70);
        } else if (o.dexNo) {
            setNumFont(ctx, 30, 700);
            ctx.fillStyle = hexA(accent, 0.92);
            ctx.fillText(o.dexNo, nx, nameBase);
            nx += ctx.measureText(o.dexNo).width + 16;
        }

        /* 右上角信息组：异色星章 + 属性胶囊，对称并列、右对齐；
           竖直方向与精灵名字对齐（以名字行中心为轴），不是顶着卡边 */
        const CAP_H = 46;
        const capCy = nameBase - 26;
        const capY = capCy - CAP_H / 2;
        const rightEdge = W - M - 16;
        const capWs = o.types.slice(0, 3).map(t => {
            setFont(ctx, 21, 900);
            return ctx.measureText(t.name).width + 72;
        });
        const starD = 34;
        let grpW = capWs.reduce((a, b) => a + b, 0) + Math.max(0, capWs.length - 1) * 10;
        if (o.shinyBadge) grpW += starD + 12;

        /* 卡名让出右上角信息组的宽度 */
        setDisplayFont(ctx, 52, 900);
        ctx.fillStyle = '#171d24';
        if (o.name) {
            let name = o.name;
            const nameMax = Math.max(120, rightEdge - grpW - 26 - nx);
            while (name.length > 1 && ctx.measureText(name).width > nameMax) name = name.slice(0, -1);
            if (name !== o.name) name += '…';
            ctx.fillText(name, nx, nameBase);
        }

        /* 先画星章（在胶囊左侧），再从左到右画胶囊 */
        let gx = rightEdge - grpW;
        if (o.shinyBadge) {
            const ccx = gx + starD / 2;
            const star = faGlyph('fa-solid fa-star') || '★';
            ctx.save();
            ctx.beginPath();
            ctx.arc(ccx, capCy + 2, starD / 2, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(0,0,0,0.16)';
            ctx.fill();
            ctx.beginPath();
            ctx.arc(ccx, capCy, starD / 2, 0, Math.PI * 2);
            const gg = ctx.createLinearGradient(ccx - starD / 2, capCy - starD / 2, ccx + starD / 2, capCy + starD / 2);
            gg.addColorStop(0, '#fff6cf');
            gg.addColorStop(0.45, '#f8cd4c');
            gg.addColorStop(1, '#dfa000');
            ctx.fillStyle = gg;
            ctx.fill();
            ctx.strokeStyle = 'rgba(255,255,255,0.95)';
            ctx.lineWidth = 2.5;
            ctx.stroke();
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            if (star) {
                setIconFont(ctx, 15);
                ctx.fillStyle = '#7a4a00';
                ctx.fillText(star, ccx, capCy + 1);
            } else {
                setFont(ctx, 15, 900);
                ctx.fillStyle = '#7a4a00';
                ctx.fillText('★', ccx, capCy + 1);
            }
            ctx.textAlign = 'left';
            ctx.textBaseline = 'alphabetic';
            ctx.restore();
            gx += starD + 12;
        }
        o.types.slice(0, 3).forEach((t, i) => {
            drawCap(ctx, gx, capY, CAP_H, t);
            gx += capWs[i] + 10;
        });

        /* 大图 */
        const ax = left + 4;
        const ay = L.artTop;
        const aw = innerW - 8;
        const ah = L.artH;

        ctx.save();
        roundRect(ctx, ax, ay, aw, ah, 18);
        ctx.clip();
        artBackdrop(ctx, ax, ay, aw, ah, o);

        if (img && img.width && img.height) {
            const contain = o.fit !== 'cover';
            const s = contain
                ? Math.min((aw - 20) / img.width, (ah - 20) / img.height)
                : Math.max(aw / img.width, ah / img.height);
            const dw = img.width * s;
            const dh = img.height * s;
            ctx.drawImage(img, ax + (aw - dw) / 2, ay + (ah - dh) / 2, dw, dh);
        } else if (!o.noPlaceholder) {
            ctx.fillStyle = 'rgba(255,255,255,0.3)';
            ctx.beginPath();
            ctx.arc(ax + aw / 2, ay + ah / 2, Math.min(aw, ah) * 0.3, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = 'rgba(255,255,255,0.94)';
            setFont(ctx, Math.round(ah * 0.24), 900);
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(Array.from(o.name)[0] || '？', ax + aw / 2, ay + ah / 2 + 6);
            ctx.textAlign = 'left';
            ctx.textBaseline = 'alphabetic';
        }

        const fade = ctx.createLinearGradient(0, ay + ah - 150, 0, ay + ah);
        fade.addColorStop(0, 'rgba(0,0,0,0)');
        fade.addColorStop(1, 'rgba(0,0,0,0.36)');
        ctx.fillStyle = fade;
        ctx.fillRect(ax, ay + ah - 150, aw, 150);
        ctx.restore();

        roundRect(ctx, ax, ay, aw, ah, 18);
        ctx.strokeStyle = 'rgba(255,255,255,0.92)';
        ctx.lineWidth = 6;
        ctx.stroke();
        roundRect(ctx, ax - 3, ay - 3, aw + 6, ah + 6, 20);
        ctx.strokeStyle = hexA(accent, 0.6);
        ctx.lineWidth = 2;
        ctx.stroke();

        /* 异色 / 闪光：只在图上两粒小金星光，不盖住精灵 */
        if (o.shinySparks) {
            drawSparkle(ctx, ax + aw - 76, ay + 82, 16, '#ffd75e', 0.95);
            drawSparkle(ctx, ax + aw - 48, ay + 120, 10, '#ffe9a3', 0.9);
        }

        /* 资料条（主人 / 性格 / 身高 / 体重 / 当前实力 / 权柄）：
           一条长胶囊横在精灵大图与特性之间，里面的彩色小胶囊居中排布、自动换行 */
        let py = ay + ah + 16;
        if (L.chips.length) {
            const bandH = L.statsBandH;
            roundRect(ctx, left, py, innerW, bandH, Math.min(26, bandH / 2));
            const bg = ctx.createLinearGradient(left, py, left, py + bandH);
            bg.addColorStop(0, tint(accent, 0.93));
            bg.addColorStop(1, tint(accent, 0.78));
            ctx.fillStyle = bg;
            ctx.fill();
            ctx.strokeStyle = hexA(accent, 0.4);
            ctx.lineWidth = 2;
            ctx.stroke();

            let ry = py + 12;
            L.chipRows.forEach(row => {
                const rowW = row.reduce((a, c) => a + c.w, 0) + (row.length - 1) * L.chipGap;
                let cx = left + (innerW - rowW) / 2;
                row.forEach(c => { drawChip(ctx, cx, ry, L.chipH, c); cx += c.w + L.chipGap; });
                ry += L.chipH + L.rowGap;
            });
            py += bandH + 14;
        }

        /* 整块说明区（不再切成两个方盒） */
        roundRect(ctx, left, py, innerW, L.bodyH, 18);
        const bodyG = ctx.createLinearGradient(left, py, left + innerW, py + L.bodyH);
        bodyG.addColorStop(0, 'rgba(255,255,255,0.97)');
        bodyG.addColorStop(1, 'rgba(255,252,244,0.97)');
        ctx.fillStyle = bodyG;
        ctx.fill();
        ctx.strokeStyle = hexA(accent, 0.3);
        ctx.lineWidth = 2;
        ctx.stroke();

        /* 顶部色带 */
        ctx.save();
        roundRect(ctx, left, py, innerW, L.bodyH, 18);
        ctx.clip();
        const topBand = ctx.createLinearGradient(left, py, left + innerW, py);
        topBand.addColorStop(0, hexA(accent, 0.9));
        topBand.addColorStop(1, hexA(accent, 0.38));
        ctx.fillStyle = topBand;
        ctx.fillRect(left, py, innerW, 7);
        ctx.restore();

        let ty = py + 26;

        /* 特性 / 血脉技能块：与图鉴说明同版式（渐变胶囊标题 + 缩进正文），
           标题胶囊后跟加粗的名字，正文与图鉴说明同字号同缩进 */
        const drawAbBlock = (ab, lines, block) => {
            if (!ab) return;
            setDisplayFont(ctx, 23, 900);
            const tagW = ctx.measureText(ab.tag).width + 62;
            const tagX = left + 24;
            const tagY = ty + 4;
            roundRect(ctx, tagX, tagY, tagW, 42, 21);
            const tg = ctx.createLinearGradient(tagX, tagY, tagX + tagW, tagY + 42);
            tg.addColorStop(0, hexA(accent, 0.98));
            tg.addColorStop(1, shade(accent, 0.7));
            ctx.fillStyle = tg;
            ctx.fill();
            ctx.strokeStyle = 'rgba(255,255,255,0.9)';
            ctx.lineWidth = 2;
            ctx.stroke();

            const ico = ab.tag === '特性' ? (faGlyph('fa-solid fa-leaf') || '') : (faGlyph('fa-solid fa-fire-flame-curved') || '');
            ctx.textAlign = 'left';
            if (ico) {
                setIconFont(ctx, 16);
                ctx.fillStyle = 'rgba(255,255,255,0.95)';
                ctx.fillText(ico, tagX + 14, tagY + 29);
            }
            setDisplayFont(ctx, 23, 900);
            ctx.fillStyle = '#fff';
            ctx.fillText(ab.tag, tagX + (ico ? 38 : 16), tagY + 29);

            if (ab.name) {
                setDisplayFont(ctx, 30, 900);
                ctx.fillStyle = '#171d24';
                ctx.fillText(ab.name, tagX + tagW + 16, tagY + 30);
            }

            if (lines.length) {
                setFont(ctx, 26, 700);
                ctx.fillStyle = '#2f3945';
                lines.forEach((ln, i) => {
                    ctx.fillText(ln, left + 50, ty + 88 + i * 45);
                });
            }
            ty += block;
        };
        drawAbBlock(o.ability, L.abLines, L.abBlock);
        drawAbBlock(o.ability2, L.ab2Lines, L.ab2Block);

        /* 资料行（主人 / 性格等）：图标 + 标签 + 值，一行一条 */
        if (o.info.length) {
            o.info.forEach((r, i) => {
                const ry = ty + 34 + i * 46;
                let ix = left + 26;
                const ico = r.icon ? faGlyph(r.icon.indexOf('fa-') === 0 && r.icon.indexOf(' ') < 0 ? 'fa-solid ' + r.icon : r.icon) : '';
                if (ico) {
                    setIconFont(ctx, 19);
                    ctx.fillStyle = hexA(accent, 0.92);
                    ctx.fillText(ico, ix, ry + 3);
                    ix += 30;
                }
                setFont(ctx, 19, 900);
                ctx.fillStyle = shade(accent, 0.68);
                ctx.fillText(r.label, ix, ry + 3);
                ix += ctx.measureText(r.label).width + 14;
                ctx.strokeStyle = hexA(accent, 0.55);
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.moveTo(ix, ry - 4);
                ctx.lineTo(ix, ry + 9);
                ctx.stroke();
                ix += 12;
                setFont(ctx, 21, 700);
                ctx.fillStyle = '#2f3945';
                ctx.fillText(L.infoLines[i] || '', ix, ry + 3);
            });
            ty += L.infoBlock;
        }

        if (L.gap) {
            ctx.strokeStyle = hexA(accent, 0.3);
            ctx.lineWidth = 1.5;
            ctx.setLineDash([8, 6]);
            ctx.beginPath();
            ctx.moveTo(left + 24, ty + 8);
            ctx.lineTo(left + innerW - 24, ty + 8);
            ctx.stroke();
            ctx.setLineDash([]);
            ty += L.gap;
        }

        if (L.descLines.length) {
            /* 小标题做成属性色胶囊，字体换成思源宋体，和正文的霞鹜文楷区分开 */
            setDisplayFont(ctx, 23, 900);
            const tagW = ctx.measureText(o.descLabel).width + 62;
            const tagX = left + 24;
            const tagY = ty + 4;
            roundRect(ctx, tagX, tagY, tagW, 42, 21);
            const tg = ctx.createLinearGradient(tagX, tagY, tagX + tagW, tagY + 42);
            tg.addColorStop(0, hexA(accent, 0.98));
            tg.addColorStop(1, shade(accent, 0.7));
            ctx.fillStyle = tg;
            ctx.fill();
            ctx.strokeStyle = 'rgba(255,255,255,0.9)';
            ctx.lineWidth = 2;
            ctx.stroke();

            const book = faGlyph('fa-solid fa-book-open');
            ctx.textAlign = 'left';
            if (book) {
                setIconFont(ctx, 16);
                ctx.fillStyle = 'rgba(255,255,255,0.95)';
                ctx.fillText(book, tagX + 14, tagY + 29);
            }
            setDisplayFont(ctx, 23, 900);
            ctx.fillStyle = '#fff';
            ctx.fillText(o.descLabel, tagX + (book ? 38 : 16), tagY + 29);

            setFont(ctx, 26, 700);
            ctx.fillStyle = '#2f3945';
            /* 标题胶囊与正文留一段呼吸感，正文小幅缩进、与标题文字对齐 */
            L.descLines.forEach((ln, i) => {
                ctx.fillText(ln, left + 50, ty + 88 + i * 45);
            });
        }

        /* 属性水印（先画，避免盖住页脚文字） */
        if (o.types.length) {
            const mark = (o.types[0].icon ? faGlyph(o.types[0].icon) : '') || typeGlyph(o.types[0].name);
            ctx.save();
            ctx.globalAlpha = 0.16;
            ctx.textAlign = 'right';
            if (mark) {
                setIconFont(ctx, 74);
                ctx.fillStyle = shade(accent, 0.7);
                ctx.fillText(mark, W - left - 4, H - 26);
            } else {
                setFont(ctx, 74, 900);
                ctx.fillStyle = shade(accent, 0.7);
                ctx.fillText(typeEmoji(o.types[0].name), W - left - 4, H - 26);
            }
            ctx.restore();
        }

        /* 页脚：两侧都没有文字时，虚线和文字整体不画 */
        if (L.hasFoot) {
            const fy = H - 66;
            ctx.strokeStyle = 'rgba(0,0,0,0.14)';
            ctx.lineWidth = 1.5;
            ctx.setLineDash([7, 5]);
            ctx.beginPath();
            ctx.moveTo(left + 8, fy);
            ctx.lineTo(W - left - 8, fy);
            ctx.stroke();
            ctx.setLineDash([]);

            if (o.footLeft) {
                setFont(ctx, 17, 700);
                ctx.fillStyle = 'rgba(45,55,72,0.62)';
                ctx.fillText(o.footLeft, left + 8, fy + 33);
            }
            if (o.footRight) {
                ctx.textAlign = 'right';
                ctx.fillStyle = hexA(accent, 0.95);
                ctx.fillText(o.footRight, W - left - 8, fy + 33);
                ctx.textAlign = 'left';
            }
        }

        return cv;
    }

    function fileName(o) {
        const safe = String(o.name || 'card').replace(/[\\/:*?"<>|\s]+/g, '_').slice(0, 40);
        return safe + '_' + String(o.label || '契约精灵') + '卡.png';
    }

    function toast(msg, type) {
        if (window.VowmonDialog && window.VowmonDialog.toast) window.VowmonDialog.toast(msg, type || 'success');
        else console.log('[card]', msg);
    }

    async function render(opts) {
        const o = normalize(opts);
        const sample = [o.name, o.label, o.badgeValue, o.badgeLabel, o.desc, o.descLabel,
            o.footLeft, o.footRight, o.dexNo,
            o.ability ? (o.ability.tag + o.ability.name + o.ability.text) : '',
            o.info.map(r => r.label + r.value).join(' '),
            (o.stats || []).map(r => r.label + r.value).join(' '),
            (o.rank ? '当前实力' + o.rank.value : '') + (o.quan ? '权柄' + o.quan.value : ''),
            o.types.map(t => t.name).join('')].join(' ');

        injectFontCss();
        const imgP = loadImage(o.image);
        await Promise.all([
            waitFont('900 54px "Noto Serif SC"', sample, 4500),
            waitFont('700 36px "Rajdhani"', 'No.0123456789Lv.HP—' + o.badgeValue, 3500),
            waitFont('700 22px "LXGW WenKai"', sample, 4500),
            waitFont('900 22px "Font Awesome 6 Free"', '★异色No.0123456789', 3000)
        ]);
        /* 等中文字体就绪，避免回退成难看的默认字体 */
        try { if (document.fonts && document.fonts.ready) await document.fonts.ready; } catch (e) {}
        const img = await imgP;
        const layout = measure(o);
        return paint(o, img, layout);
    }

    function toBlobSafe(cv) {
        return new Promise(resolve => {
            try { cv.toBlob(b => resolve(b), 'image/png'); }
            catch (e) { resolve(null); }
        });
    }

    /* ------------------------------------------------------- 弹窗（选择内容 + 实时预览） */
    let modalEl = null;

    const MODAL_CSS = [
        '.vwc-mask{position:fixed;inset:0;z-index:9999;background:rgba(15,23,32,.55);display:flex;align-items:center;justify-content:center;padding:20px;backdrop-filter:blur(3px);}',
        '.vwc-panel{background:#fff;border-radius:20px;box-shadow:0 24px 64px rgba(15,23,32,.35);display:flex;gap:20px;padding:22px;max-width:920px;width:100%;max-height:92vh;overflow:auto;}',
        '.vwc-preview{flex:1.2;min-width:0;display:flex;align-items:flex-start;justify-content:center;background:#f2f0ea;border-radius:14px;padding:14px;}',
        '.vwc-preview canvas{max-width:100%;max-height:78vh;width:auto;height:auto;border-radius:14px;box-shadow:0 10px 28px rgba(15,23,32,.25);}',
        '.vwc-side{flex:1;min-width:190px;display:flex;flex-direction:column;gap:12px;}',
        '.vwc-title{font-size:17px;font-weight:900;color:#2d3748;display:flex;align-items:center;gap:8px;}',
        '.vwc-title i{color:#d69e2e;}',
        '.vwc-sec{display:flex;flex-direction:column;gap:8px;}',
        '.vwc-sec-t{font-size:12px;font-weight:900;color:#a0aec0;letter-spacing:.06em;}',
        '.vwc-sec-body{display:flex;flex-direction:column;gap:14px;}',
        '.vwc-scroll{max-height:56vh;overflow-y:auto;padding-right:4px;scrollbar-width:thin;}',
        '.vwc-stylerow{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:8px 12px;border:1.5px solid #e3eaf2;border-radius:12px;font-size:14px;font-weight:700;color:#2d3748;}',
        '.vwc-color{width:46px;height:30px;border:none;border-radius:8px;background:none;cursor:pointer;padding:0;}',
        '.vwc-select{height:32px;border:1.5px solid #e3eaf2;border-radius:9px;background:#fff;font-size:13px;font-weight:700;color:#2d3748;padding:0 8px;outline:none;cursor:pointer;}',
        '.vwc-dd{position:relative;width:116px;}',
        '.vwc-dd-btn{width:100%;height:32px;border:1.5px solid #e3eaf2;border-radius:9px;background:#fff;font-size:13px;font-weight:700;color:#2d3748;display:flex;align-items:center;justify-content:space-between;padding:0 10px;cursor:pointer;}',
        '.vwc-dd-btn i{font-size:10px;color:#a0aec0;}',
        '.vwc-dd-menu{position:absolute;right:0;top:38px;background:#fff;border-radius:10px;box-shadow:0 10px 28px rgba(15,23,32,.22);border:1px solid #eef1f5;min-width:116px;overflow:hidden;display:none;z-index:20;}',
        '.vwc-dd-menu.open{display:block;}',
        '.vwc-dd-opt{padding:9px 12px;font-size:13px;font-weight:700;color:#2d3748;cursor:pointer;white-space:nowrap;}',
        '.vwc-dd-opt:hover{background:#faf3e0;}',
        '.vwc-dd-opt.sel{color:#d69e2e;}',
        '.vwc-opt{display:flex;align-items:center;gap:10px;padding:10px 12px;border:1.5px solid #e3eaf2;border-radius:12px;cursor:pointer;user-select:none;transition:border-color .15s,background .15s;font-size:14px;font-weight:700;color:#2d3748;}',
        '.vwc-opt:hover{border-color:#d69e2e;}',
        '.vwc-opt.on{border-color:#d69e2e;background:#fffaf0;}',
        '.vwc-opt i{width:16px;text-align:center;color:#d69e2e;font-size:13px;}',
        '.vwc-opt.off i{color:#cbd5e0;}',
        '.vwc-btns{margin-top:auto;display:flex;flex-direction:column;gap:9px;}',
        '.vwc-btn{height:44px;border:none;border-radius:12px;font-size:15px;font-weight:900;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:8px;transition:filter .15s;}',
        '.vwc-btn.primary{background:linear-gradient(135deg,#f0b429,#d69e2e);color:#fff;box-shadow:0 6px 16px rgba(214,158,46,.4);}',
        '.vwc-btn.primary:hover{filter:brightness(1.06);}',
        '.vwc-btn.ghost{background:#f1f5f9;color:#4a5568;}',
        '.vwc-loading{color:#a0aec0;font-size:13px;font-weight:700;padding:30px 0;text-align:center;width:100%;}',
        '@media (max-width:640px){.vwc-panel{flex-direction:column;padding:16px;}.vwc-side{min-width:0;}}'
    ].join('');

    function buildModal(onDownload) {
        if (document.getElementById('vwc-style')) {
            document.getElementById('vwc-style').textContent = MODAL_CSS;
        } else {
            const st = document.createElement('style');
            st.id = 'vwc-style';
            st.textContent = MODAL_CSS;
            document.head.appendChild(st);
        }
        const mask = document.createElement('div');
        mask.className = 'vwc-mask';
        mask.innerHTML =
            '<div class="vwc-panel">' +
            '<div class="vwc-preview"><div class="vwc-loading"><i class="fa-solid fa-spinner fa-spin"></i> 正在生成预览…</div></div>' +
            '<div class="vwc-side">' +
            '<div class="vwc-title"><i class="fa-solid fa-id-card"></i> 生成卡片</div>' +
            '<div class="vwc-sec"><div class="vwc-sec-t">卡面内容</div><div class="vwc-sec-body"></div></div>' +
            '<div class="vwc-btns">' +
            '<button class="vwc-btn primary"><i class="fa-solid fa-download"></i> 下载卡片 PNG</button>' +
            '<button class="vwc-btn ghost"><i class="fa-solid fa-xmark"></i> 取消</button>' +
            '</div></div></div>';
        document.body.appendChild(mask);
        modalEl = mask;

        const close = () => { if (mask._cleanupDD) mask._cleanupDD(); if (mask.parentNode) mask.parentNode.removeChild(mask); if (modalEl === mask) modalEl = null; };
        mask.addEventListener('click', (e) => { if (e.target === mask) close(); });
        mask.querySelector('.vwc-btn.ghost').addEventListener('click', close);
        mask.querySelector('.vwc-btn.primary').addEventListener('click', async () => {
            const btn = mask.querySelector('.vwc-btn.primary');
            btn.disabled = true;
            btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> 正在生成…';
            try { await onDownload(); } finally { btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-download"></i> 下载卡片 PNG'; }
        });
        mask._close = close;
        return mask;
    }

    /* ------------------------------------------------------- 弹窗（全量自定义 + 实时预览） */
    async function open(opts) {
        if (modalEl && modalEl._close) modalEl._close();
        const o = normalize(opts);

        /* 内容区块：ability / ability2(技能) / stats(资料条) / rank(当前实力) / quan(权柄) / info / desc，页面可用 secLabels 自定文案 */
        const DEFT_LABEL = {
            ability: '特性', ability2: '技能',
            stats: '资料条（主人 · 性格 · 身高 · 体重）',
            rank: '当前实力（位阶）', quan: '权柄（掌权者）',
            info: '资料行（主人 · 性格等）', desc: o.descLabel || '图鉴说明'
        };
        const labels = opts.secLabels || {};
        const isEmpty = (key) =>
            key === 'ability' ? !o.ability :
            key === 'ability2' ? !o.ability2 :
            key === 'stats' ? !o.stats.length :
            key === 'rank' ? !o.rank :
            key === 'quan' ? !o.quan :
            key === 'info' ? !o.info.length : !o.desc;
        /* 特性/技能默认不勾选；资料条 / 当前实力 / 权柄 / 资料行 / 说明默认勾选 */
        const isOn = (key) => !isEmpty(key) && (key === 'desc' || key === 'info' || key === 'stats' || key === 'rank' || key === 'quan');
        const secs = (opts.sections || ['ability', 'info', 'desc']).map(key => ({
            key, label: labels[key] || DEFT_LABEL[key] || key, empty: isEmpty(key), on: isOn(key)
        }));

        /* 卡面元素开关（footRight 关掉后页脚整体消失；再打开恢复默认文案） */
        const els = [
            { key: 'image', label: '图像', on: !!o.image },
            { key: 'types', label: '属性', on: !!o.types.length },
            { key: 'dexNo', label: '编号', on: !!o.dexNo },
            { key: 'name', label: '名字', on: !!o.name },
            { key: 'footRight', label: '右下角 VOWMON WIKI', on: !!o.footRight, footText: String(o.footRight || 'VOWMON WIKI') }
        ];

        /* 异色细节（只有异色卡才出现） */
        const shinyEls = o.shiny ? [
            { key: 'shinyBadge', label: '右上角闪光星章', on: !!o.shinyBadge },
            { key: 'shinySparks', label: '图上金色星光', on: !!o.shinySparks }
        ] : [];

        const mask = buildModal(async () => { await save(mask._current()); });
        const prev = mask.querySelector('.vwc-preview');
        const bodySec = mask.querySelector('.vwc-sec-body');
        const styleState = { accent: o.accent, bg: o.bg || 'ray' };

        const buildOpts = () => {
            const cur = normalize(opts);
            secs.forEach(s => {
                if (s.on) return;
                if (s.key === 'ability') cur.ability = null;
                else if (s.key === 'ability2') cur.ability2 = null;
                else if (s.key === 'stats') cur.stats = [];
                else if (s.key === 'rank') cur.rank = null;
                else if (s.key === 'quan') cur.quan = null;
                else if (s.key === 'info') cur.info = [];
                else if (s.key === 'desc') cur.desc = '';
            });
            els.forEach(e => {
                if (e.key === 'image' && !e.on) { cur.image = ''; cur.noPlaceholder = true; }
                else if (e.key === 'types' && !e.on) cur.types = [];
                else if (e.key === 'dexNo' && !e.on) cur.dexNo = '';
                else if (e.key === 'name' && !e.on) cur.name = '';
                else if (e.key === 'footRight') cur.footRight = e.on ? (e.footText || 'VOWMON WIKI') : '';
            });
            shinyEls.forEach(e => {
                if (e.key === 'shinyBadge') cur.shinyBadge = e.on;
                else if (e.key === 'shinySparks') cur.shinySparks = e.on;
            });
            cur.accent = styleState.accent;
            cur.bg = styleState.bg;
            return cur;
        };
        mask._current = buildOpts;

        /* 预览防抖：连点开关时只重绘最后一次，保证流畅 */
        let renderSeq = 0;
        let timer = null;
        const refreshOpts = () => {
            const seq = ++renderSeq;
            if (timer) clearTimeout(timer);
            timer = setTimeout(async () => {
                const cur = buildOpts();
                let cv = null;
                try { cv = await render(cur); } catch (e) { cv = null; }
                if (!cv && cur.image) { try { cv = await render(Object.assign({}, cur, { image: '', noPlaceholder: false })); } catch (e2) { cv = null; } }
                if (seq !== renderSeq) return;   /* 已有更新的请求，丢弃旧结果 */
                prev.innerHTML = '';
                if (cv) prev.appendChild(cv);
                else prev.innerHTML = '<div class="vwc-loading">预览生成失败</div>';
            }, 140);
            prev.innerHTML = '<div class="vwc-loading"><i class="fa-solid fa-spinner fa-spin"></i> 刷新预览…</div>';
        };

        const makeToggle = (parent, item) => {
            const row = document.createElement('div');
            row.className = 'vwc-opt' + (item.on ? ' on' : ' off');
            row.innerHTML = '<i class="fa-solid ' + (item.on ? 'fa-square-check' : 'fa-square') + '"></i><span>' + item.label + '</span>';
            row.addEventListener('click', () => {
                item.on = !item.on;
                row.classList.toggle('on', item.on);
                row.classList.toggle('off', !item.on);
                row.querySelector('i').className = 'fa-solid ' + (item.on ? 'fa-square-check' : 'fa-square');
                refreshOpts();
            });
            parent.appendChild(row);
            return row;
        };
        const makeGroup = (title) => {
            const g = document.createElement('div');
            g.className = 'vwc-sec';
            g.innerHTML = '<div class="vwc-sec-t">' + title + '</div>';
            bodySec.appendChild(g);
            return g;
        };
        const makeStyleRow = (parent, label, ctrlHtml) => {
            const row = document.createElement('div');
            row.className = 'vwc-stylerow';
            row.innerHTML = '<span>' + label + '</span>' + ctrlHtml;
            parent.appendChild(row);
            return row;
        };

        /* —— 内容区块 —— */
        const g1 = makeGroup('内容区块');
        secs.forEach(s => {
            const row = makeToggle(g1, s);
            if (s.empty) { row.style.opacity = '.55'; row.style.cursor = 'default'; }
        });

        /* —— 卡面元素 —— */
        const g2 = makeGroup('卡面元素');
        els.forEach(e => {
            if (e.key === 'types' && !o.types.length) { const r = makeToggle(g2, e); r.style.opacity = '.55'; r.style.cursor = 'default'; return; }
            if (e.key === 'dexNo' && !o.dexNo) { const r = makeToggle(g2, e); r.style.opacity = '.55'; r.style.cursor = 'default'; return; }
            if (e.key === 'image' && !o.image) { const r = makeToggle(g2, e); r.style.opacity = '.55'; r.style.cursor = 'default'; return; }
            makeToggle(g2, e);
        });

        /* —— 异色细节 —— */
        let g3 = null;
        if (shinyEls.length) {
            g3 = makeGroup('异色（闪光）');
            shinyEls.forEach(e => makeToggle(g3, e));
        }

        /* —— 样式：边框颜色 / 背景（自定义下拉，不用系统菜单） —— */
        const g4 = makeGroup('样式');
        makeStyleRow(g4, '边框颜色', '<input type="color" class="vwc-color" value="' + (o.accent || '#4299e1') + '">');
        const bgRow = makeStyleRow(g4, '背景', '');
        const BG_OPTS = [['ray', '属性光效'], ['gradient', '纯渐变'], ['plain', '浅色纸面']];
        const dd = document.createElement('div');
        dd.className = 'vwc-dd';
        dd.innerHTML = '<button type="button" class="vwc-dd-btn"><span>' +
            (BG_OPTS.find(x => x[0] === styleState.bg) || BG_OPTS[0])[1] +
            '</span><i class="fa-solid fa-chevron-down"></i></button><div class="vwc-dd-menu"></div>';
        bgRow.appendChild(dd);
        const ddBtn = dd.querySelector('.vwc-dd-btn');
        const ddMenu = dd.querySelector('.vwc-dd-menu');
        const closeDD = () => ddMenu.classList.remove('open');
        BG_OPTS.forEach(([val, lab]) => {
            const optEl = document.createElement('div');
            optEl.className = 'vwc-dd-opt' + (val === styleState.bg ? ' sel' : '');
            optEl.textContent = lab;
            optEl.addEventListener('click', () => {
                styleState.bg = val;
                ddBtn.querySelector('span').textContent = lab;
                ddMenu.querySelectorAll('.vwc-dd-opt').forEach(el => el.classList.remove('sel'));
                optEl.classList.add('sel');
                closeDD();
                refreshOpts();
            });
            ddMenu.appendChild(optEl);
        });
        ddBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            ddMenu.classList.toggle('open');
        });
        document.addEventListener('click', closeDD);
        mask._cleanupDD = () => document.removeEventListener('click', closeDD);
        const colorInput = g4.querySelector('.vwc-color');
        colorInput.addEventListener('input', () => { styleState.accent = colorInput.value; refreshOpts(); });

        bodySec.classList.add('vwc-scroll');
        await refreshOpts();
    }

    async function save(opts) {
        const o = normalize(opts);
        let cv = null;
        try { cv = await render(o); } catch (e) { cv = null; }
        let blob = cv ? await toBlobSafe(cv) : null;
        if (!blob) {
            cv = await render(Object.assign({}, o, { image: '' }));
            blob = await toBlobSafe(cv);
        }
        if (!blob) { toast('生成失败：浏览器拦住了图片，请稍后再试', 'error'); return; }

        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName(o);
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 4000);

        if (/Android|iPhone|iPad|iPod/i.test(navigator.userAgent)) window.open(url, '_blank');
        toast('卡片已生成', 'success');
    }

    window.VowmonCard = { render, open, save };
})();
