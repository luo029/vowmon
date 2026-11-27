import os, re

ROOT = os.path.abspath('.')
nav_src = open('js/navbar.js', encoding='utf-8').read()
hrefs = re.findall("href: '([^']+)'", nav_src)
pages = []
for dp, dn, fn in os.walk(ROOT):
    if '.git' in dp or '_tools' in dp:
        continue
    for f in fn:
        if f.endswith('.html'):
            pages.append(os.path.relpath(os.path.join(dp, f), ROOT).replace('\\', '/'))

bad = []
for page in sorted(pages):
    if page == '404.html':
        continue
    url = '/' + page
    root_prefix = '../' if re.search(r'/(admin|dex|reference|world|records|battle|tools)/', url) else ''
    curdir = '/' + os.path.dirname(page)
    for h in hrefs:
        joined = root_prefix + h
        target = os.path.normpath(os.path.join(curdir, joined)).replace('\\', '/').lstrip('/')
        ok = os.path.isdir(os.path.join(ROOT, target)) if h.endswith('/') else os.path.isfile(os.path.join(ROOT, target))
        if not ok:
            bad.append((page, h, target))

print("导航 href 数:", len(hrefs))
if bad:
    print("== 导航解析失败 %d 处 ==" % len(bad))
    seen = set()
    for b in bad:
        k = (b[0], b[1])
        if k in seen:
            continue
        seen.add(k)
        print("  %-34s href=%-30s -> %s" % b)
else:
    print("OK: 所有页面 x 所有导航项解析正确")
