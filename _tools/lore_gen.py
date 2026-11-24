# -*- coding: utf-8 -*-
"""给世界观四页注入 data-lore 标记（偏移插入，保留原文件格式），并生成 lore-data.json"""
import json, io, os
from bs4 import BeautifulSoup

ROOT = r"D:/novels/vowmon"
OUT = os.path.join(ROOT, "_lore-data.json")

PAGES = [
    {"id": "ranks",      "title": "等级体系",   "file": "ranks.html"},
    {"id": "bloodlines", "title": "血脉图鉴",   "file": "bloodlines.html"},
    {"id": "trainers",   "title": "御兽师图鉴", "file": "trainers.html"},
    {"id": "lore",       "title": "元域演化史", "file": "lore.html"},
]

BASE_TAGS = {"h1", "h2", "h3", "h4", "p", "li", "td", "th"}
CLASS_ALLOW = {
    "*": {"banner-sub", "combo-title"},
    "ranks": {"taxon-tag", "trainer-tag", "tier-lv", "step-name", "step-desc",
              "tier-row", "perm-yes", "perm-no", "iron-txt"},
    "bloodlines": {"blood-alias", "blood-stone", "blood-desc", "blood-tag",
                   "proto-chip", "motto-txt", "motto-sub", "origin-foot"},
    "trainers": {"tr-lv", "pet-tag", "rule-txt", "table-note",
                 "talent-txt", "method-name"},
    "lore": {"hero-tag", "hero-sub", "hero-desc", "quote", "finale-sign", "hidden-hint"},
}
CLASS_DENY = {"sec-no", "sec-en", "sec-rule", "step-no", "rule-ico", "law-icon",
              "blood-icon", "method-icon", "talent-icon", "dim-icon", "tier-badge",
              "dot", "gold-rule", "sky", "chapter-no", "banner-tag", "hidden-btn"}
EXCLUDE_PARENT_TAGS = {"button", "a", "script", "style", "nav", "footer"}

def line_offsets(text):
    offs, pos = [], 0
    for line in text.split("\n"):
        offs.append(pos)
        pos += len(line) + 1
    return offs

def tag_start_offset(text, offs, el):
    """html.parser 的 sourcepos 有偏差，用 行号+列 计算真实偏移"""
    line = el.sourceline - 1          # sourceline 从 1 开始
    if line < 0 or line >= len(offs):
        return None
    off = offs[line] + (el.sourcepos or 0)
    # 校验：<tagname
    m = "<" + el.name
    if text[off:off + len(m)].lower() != m.lower():
        return None
    return off

def start_tag_end(text, off):
    """返回起始标签 '>' 的下一位（尊重双引号）"""
    i = off
    inq = False
    while i < len(text):
        c = text[i]
        if c == '"':
            inq = not inq
        elif c == '>' and not inq:
            return i
        i += 1
    return None

def in_excluded(el):
    p = el.parent
    while p is not None and p.name is not None:
        if p.name in EXCLUDE_PARENT_TAGS:
            return True
        cls = p.get("class") or []
        if "site-navbar" in cls:
            return True
        p = p.parent
    return False

def visible_text(el):
    return "".join(str(s) for s in el.strings).strip()

def build():
    pages_meta, blocks = [], {}
    for cfg in PAGES:
        path = os.path.join(ROOT, cfg["file"])
        with io.open(path, encoding="utf-8") as f:
            src = f.read()
        soup = BeautifulSoup(src, "html.parser")
        root = soup.find("div", class_="page")
        if root is None:
            raise SystemExit("找不到 div.page：" + cfg["file"])

        offs = line_offsets(src)
        allow = CLASS_ALLOW.get("*", set()) | CLASS_ALLOW.get(cfg["id"], set())

        # 按文档顺序收集候选与标题
        seq = []
        seen = set()
        for el in root.descendants:
            if id(el) in seen or not getattr(el, "name", None):
                continue
            seen.add(id(el))
            name = el.name
            cls = set(el.get("class") or [])
            is_cand = (name in BASE_TAGS and not (cls & CLASS_DENY)) or \
                      (name in ("div", "span", "b") and (cls & allow) and not (cls & CLASS_DENY))
            if name in ("h1", "h2", "h3", "h4"):
                seq.append(("h", el))
            elif is_cand and not in_excluded(el) and len(el.get_text(" ", strip=True)) >= 2 \
                    and not el.find(list(BASE_TAGS)):
                seq.append(("c", el))

        edits = []   # (offset, key)
        ctx, cnt, n = "开头", 0, 0
        for kind, el in seq:
            if kind == "h":
                ctx = visible_text(el)[:16] or "标题"
                cnt = 0
                continue
            off = tag_start_offset(src, offs, el)
            if off is None:
                print("  ! 跳过定位失败：%s %s" % (cfg["id"], el.get("class")))
                continue
            cnt += 1
            n += 1
            key = "%s.c%d" % (cfg["id"], n)
            label = "%s · %s #%d" % (ctx, el.name, cnt)
            edits.append((off, key))
            blocks[key] = {"label": label, "html": el.decode_contents()}

        # 从后往前插入属性（偏移不受影响）
        for off, key in sorted(edits, key=lambda t: -t[0]):
            end = start_tag_end(src, off)
            if end is None:
                raise SystemExit("找不到标签结尾：" + key)
            src = src[:end] + ' data-lore="%s"' % key + src[end:]

        with io.open(path, "w", encoding="utf-8", newline="") as f:
            f.write(src)
        pages_meta.append({"id": cfg["id"], "title": cfg["title"], "file": cfg["file"], "count": n})
        print("%-12s 注入 %d 块" % (cfg["id"], n))

    with io.open(OUT, "w", encoding="utf-8", newline="\n") as f:
        json.dump({"pages": pages_meta, "blocks": blocks}, f, ensure_ascii=False, indent=1)
    print("共 %d 块 → %s" % (len(blocks), OUT))

build()
