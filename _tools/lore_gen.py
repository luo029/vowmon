# -*- coding: utf-8 -*-
"""给世界观四页注入 data-lore 标记（偏移插入，保留原文件格式），并生成 lore-data.json

两种模式：
  默认（extend）：与现有 lore-data.json 合并——已有 data-lore 的元素保持旧键不动
                  （内容以现有 JSON 为准，绝不重编号），只给「新出现的候选元素」
                  续号分配新键。日常改版 / 增删元素都用这个模式，键不会错位。
  --fresh       ：无视现有标记，按文档顺序全部重编号（会覆盖键，慎用）。

通用规则（两种模式一致）：
  * h1-h4 标题也是可编辑块；
  * 嵌套 protection：候选元素若处于另一个候选 / 已标记元素内部，跳过（内层优先原则的反面——
    只标记最内层文本容器，避免「内层块被外层块整体覆盖」导致编辑丢失）；
  * CLASS_DENY 里的装饰性元素（图标 / 序号章号等）永不标记。
"""
import json, io, os, sys
from bs4 import BeautifulSoup

ROOT = r"D:/novels/vowmon"
DATA_REPO = r"D:/novels/vowmon_data"
OUT = os.path.join(ROOT, "_lore-data.json")
FRESH = "--fresh" in sys.argv

PAGES = [
    {"id": "ranks",      "title": "等级体系",   "file": "ranks.html"},
    {"id": "bloodlines", "title": "血脉图鉴",   "file": "bloodlines.html"},
    {"id": "trainers",   "title": "御兽师图鉴", "file": "trainers.html"},
    {"id": "factions",   "title": "势力版图",   "file": "factions.html"},
    {"id": "lore",       "title": "元域演化史", "file": "lore.html"},
]

BASE_TAGS = {"h1", "h2", "h3", "h4", "p", "li", "td", "th"}
CLASS_ALLOW = {
    "*": {"banner-sub", "combo-title", "banner-tag"},
    "ranks": {"taxon-tag", "trainer-tag", "tier-lv", "step-name", "step-desc",
              "tier-row", "perm-yes", "perm-no", "iron-txt",
              "proto-note", "mech-txt", "step-no"},
    "bloodlines": {"blood-alias", "blood-stone", "blood-desc", "blood-tag",
                   "proto-chip", "motto-txt", "motto-sub", "origin-foot",
                   "rule-txt", "blood-row"},
    "trainers": {"tr-lv", "vow-tag", "rule-txt", "table-note",
                 "talent-txt", "method-name", "num", "method-tier"},
    "lore": {"hero-tag", "hero-sub", "hero-desc", "quote", "finale-sign", "hidden-hint",
             "seeds"},
}
CLASS_DENY = {"sec-no", "sec-en", "sec-rule", "rule-ico", "law-icon",
              "blood-icon", "method-icon", "talent-icon", "dim-icon", "tier-badge",
              "dot", "gold-rule", "sky", "chapter-no", "banner-tag-x", "hidden-btn"}
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

def load_existing():
    path = os.path.join(DATA_REPO, "lore-data.json")
    if FRESH or not os.path.exists(path):
        return {}, {}
    with io.open(path, encoding="utf-8") as f:
        bag = json.load(f)
    return bag.get("pages", []), bag.get("blocks", {})

def build():
    old_pages, old_blocks = load_existing()
    pages_meta, blocks = [], {}
    removed_nested = 0

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

        # ---- 1. 收集旧标记（保持旧键）+ 找出嵌套旧标记（先只记录，最后统一删） --
        old_keys_here = {}
        nested_remove = []
        for el in root.find_all(attrs={"data-lore": True}):
            key = el.get("data-lore")
            old_keys_here[key] = el
            p = el.parent
            while p is not None and p.name is not None:
                if p.has_attr("data-lore"):
                    nested_remove.append(key)
                    break
                p = p.parent
        for key in nested_remove:
            print("  - 移除嵌套标记 %s（内容由外层块承载）" % key)
            old_keys_here.pop(key, None)
            old_blocks.pop(key, None)
            el_tmp = soup.find(attrs={"data-lore": key})
            if el_tmp is not None:
                el_tmp.attrs.pop("data-lore", None)

        # ---- 2. 收集新候选（含标题；内层优先，跳过处于候选/已标记内部的） --
        seq = []
        cand_ids = set()
        seen = set()
        for el in root.descendants:
            if id(el) in seen or not getattr(el, "name", None):
                continue
            seen.add(id(el))
            if el.has_attr("data-lore"):
                continue                     # 旧标记元素不参与
            name = el.name
            cls = set(el.get("class") or [])
            is_cand = (name in BASE_TAGS and not (cls & CLASS_DENY)) or \
                      (name in ("div", "span", "b") and (cls & allow) and not (cls & CLASS_DENY))
            if not is_cand:
                continue
            if in_excluded(el) or len(el.get_text(" ", strip=True)) < 2:
                continue
            if el.find(list(BASE_TAGS)):
                continue
            seq.append(el)
            cand_ids.add(id(el))

        # 内层优先：处于另一个候选内部 → 跳过
        new_els = []
        for el in seq:
            p = el.parent
            skip = False
            while p is not None and p.name is not None:
                if id(p) in cand_ids or p.has_attr("data-lore"):
                    skip = True
                    break
                p = p.parent
            if not skip:
                new_els.append(el)

        # ---- 3. 给新元素续号分配键 ---------------------------------------
        maxn = 0
        for k in old_keys_here:
            try:
                maxn = max(maxn, int(k.rsplit("c", 1)[1]))
            except Exception:
                pass
        n = maxn
        edits = []
        ctx, cnt = "开头", 0
        for el in new_els:
            off = tag_start_offset(src, offs, el)
            if off is None:
                print("  ! 跳过定位失败：%s %s" % (cfg["id"], el.get("class")))
                continue
            n += 1
            key = "%s.c%d" % (cfg["id"], n)
            if el.name in ("h1", "h2", "h3", "h4"):
                ctx = visible_text(el)[:16] or "标题"
                cnt = 0
                label = "%s · 标题" % (visible_text(el)[:12] or "标题")
            else:
                cnt += 1
                label = "%s · %s #%d" % (ctx, el.name, cnt)
            edits.append((off, key))
            blocks[key] = {"label": label, "html": el.decode_contents()}

        # ---- 4. 旧键内容以现有 JSON 为准（HTML 内置文本仅兜底） -----------
        for key, el in old_keys_here.items():
            if key in old_blocks:
                blocks[key] = old_blocks[key]
            else:
                blocks[key] = {"label": key, "html": el.decode_contents()}

        # ---- 5. 从后往前插入属性（偏移不受影响），最后删除嵌套旧属性 -------
        for off, key in sorted(edits, key=lambda t: -t[0]):
            end = start_tag_end(src, off)
            if end is None:
                raise SystemExit("找不到标签结尾：" + key)
            src = src[:end] + ' data-lore="%s"' % key + src[end:]
        for key in nested_remove:
            src = src.replace(' data-lore="%s"' % key, "", 1)
        removed_nested += len(nested_remove)

        with io.open(path, "w", encoding="utf-8", newline="") as f:
            f.write(src)

        total = len(old_keys_here) + len(edits)
        pages_meta.append({"id": cfg["id"], "title": cfg["title"], "file": cfg["file"], "count": total})
        print("%-12s 新增 %d 块，共 %d 块" % (cfg["id"], len(edits), total))

    with io.open(OUT, "w", encoding="utf-8", newline="\n") as f:
        json.dump({"pages": pages_meta, "blocks": blocks}, f, ensure_ascii=False, indent=1)
    print("共 %d 块 → %s%s" % (len(blocks), OUT, "（--fresh 全量重编号）" if FRESH else "（extend 合并模式）"))
    if removed_nested:
        print("清理嵌套标记 %d 个" % removed_nested)

build()
