#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
本地开发服务器：完整模拟 Cloudflare Pages 的路由行为。
用法：python _tools/dev-server.py [端口，默认 8000]

模拟的能力（与线上 vowmon.pages.dev 一致）：
1. _redirects 规则（301 跳转，保留 query）——旧地址/带 .html 旧地址自动跳新位置
2. 自动去扩展名：/dex/vowdex → dex/vowdex.html
3. 目录默认页：/admin → admin/index.html
4. 未匹配路由 → 404.html（状态码 404，内置旧名映射自动跳转）
"""
import http.server
import os
import posixpath
import sys
import urllib.parse

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8000

REDIRECTS = {}
_rules = os.path.join(ROOT, '_redirects')
if os.path.exists(_rules):
    with open(_rules, encoding='utf-8') as fh:
        for line in fh:
            parts = line.split()
            if len(parts) >= 2 and parts[0].startswith('/'):
                REDIRECTS[parts[0]] = parts[1]


def safe_join(url_path):
    """把 URL 路径映射到仓库内文件（防目录穿越），返回绝对路径或 None"""
    path = urllib.parse.unquote(url_path)
    try:
        full = os.path.realpath(os.path.join(ROOT, path.lstrip('/')))
        if not full.startswith(os.path.realpath(ROOT)):
            return None
    except Exception:
        return None
    return full if os.path.isfile(full) else None


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **kw):
        super().__init__(*a, directory=ROOT, **kw)

    def _send_file(self, full, code=200):
        ctype = self.guess_type(full)
        try:
            with open(full, 'rb') as fh:
                body = fh.read()
        except OSError:
            self.send_error(404)
            return
        self.send_response(code)
        self.send_header('Content-Type', ctype)
        self.send_header('Content-Length', str(len(body)))
        self.send_header('Cache-Control', 'no-store')
        self.end_headers()
        self.wfile.write(body)

    def _redirect(self, dest):
        self.send_response(301)
        self.send_header('Location', dest)
        self.send_header('Content-Length', '0')
        self.end_headers()

    def _not_found(self):
        nf = os.path.join(ROOT, '404.html')
        if os.path.isfile(nf):
            self._send_file(nf, code=404)
        else:
            self.send_error(404, 'File not found')

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path
        query = '?' + parsed.query if parsed.query else ''

        # 1) _redirects 精确规则（保留 query）
        if path in REDIRECTS:
            self._redirect(REDIRECTS[path] + query)
            return

        # 2) 精确文件
        full = safe_join(path)
        if full:
            self._send_file(full)
            return

        # 3) 自动去扩展名：/dex/vowdex → dex/vowdex.html
        if not path.endswith('/'):
            cand = safe_join(path + '.html')
            if cand:
                self._send_file(cand)
                return

        # 4) 根路径直接给 index.html（不能重定向，否则 301 到自身形成死循环）
        if path in ('', '/'):
            idx = safe_join('/index.html')
            if idx:
                self._send_file(idx)
                return

        # 5) 目录：无尾斜杠 → 301 补斜杠；有尾斜杠 → 直接返回该目录 index.html
        if not path.endswith('/'):
            cand = safe_join(posixpath.join(path, 'index.html'))
            if cand:
                self._redirect(path + '/' + query)
                return
        else:
            idx = safe_join(posixpath.join(path, 'index.html'))
            if idx:
                self._send_file(idx)
                return

        # 6) 兜底 → 404.html（内含旧名映射 JS，会自动跳转已知旧地址）
        self._not_found()

    def log_message(self, fmt, *args):
        sys.stdout.write('[dev] %s\n' % (fmt % args))


if __name__ == '__main__':
    print('本地开发服务器（模拟 CF Pages 路由）: http://localhost:%d/' % PORT)
    print('旧地址如 /vowdex.html 会自动 301 跳到 /dex/vowdex，与线上一致。Ctrl+C 停止。')
    http.server.ThreadingHTTPServer(('127.0.0.1', PORT), Handler).serve_forever()
