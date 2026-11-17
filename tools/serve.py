#!/usr/bin/env python3
"""静态服务器（多线程）。

单线程的 http.server 会被并发资源请求队头阻塞，页面加载到一半就
报 SG undefined，这里用 ThreadingMixIn 规避。
"""
import functools
import sys
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

ROOT = sys.argv[2] if len(sys.argv) > 2 else '.'
PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8124


class Handler(SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass


if __name__ == '__main__':
    handler = functools.partial(Handler, directory=ROOT)
    ThreadingHTTPServer.daemon_threads = True
    srv = ThreadingHTTPServer(('127.0.0.1', PORT), handler)
    print('serving %s at http://127.0.0.1:%d' % (ROOT, PORT))
    srv.serve_forever()
