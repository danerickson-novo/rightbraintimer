#!/usr/bin/env python3
"""Static file server for development: same as `python3 -m http.server`, but tells the
browser never to cache, so edited .js/.css/.html files are always reloaded."""
import sys
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer


class NoCacheHandler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store, max-age=0')
        super().end_headers()


if __name__ == '__main__':
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
    directory = sys.argv[2] if len(sys.argv) > 2 else '.'
    handler = partial(NoCacheHandler, directory=directory)
    print(f'Serving {directory} on http://localhost:{port} (no caching)')
    ThreadingHTTPServer(('', port), handler).serve_forever()
