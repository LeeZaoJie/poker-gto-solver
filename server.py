#!/usr/bin/env python3
"""
Simple HTTP server for Poker GTO Solver
德州扑克GTO求解器简易HTTP服务器

Usage / 用法:
    python server.py
    # Then open http://localhost:8080 in your browser

Note: Browsers block ES6 module imports from file:// protocol.
This server allows proper module loading.
"""

import http.server
import socketserver
import os

PORT = 8080

class MyHTTPRequestHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate')
        super().end_headers()

    def log_message(self, format, *args):
        # Suppress default logging for cleaner output
        pass

if __name__ == '__main__':
    os.chdir(os.path.dirname(os.path.abspath(__file__)))

    with socketserver.TCPServer(("", PORT), MyHTTPRequestHandler) as httpd:
        print(f"=" * 50)
        print(f"Poker GTO Solver Server Started!")
        print(f"德州扑克GTO求解器服务器已启动！")
        print(f"=" * 50)
        print(f"URL: http://localhost:{PORT}")
        print(f"Press Ctrl+C to stop / 按Ctrl+C停止")
        print(f"=" * 50)
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nServer stopped. / 服务器已停止。")
