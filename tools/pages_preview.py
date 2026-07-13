from __future__ import annotations

import http.server
import os
import socketserver
import threading
import webbrowser
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PREFIX = "/chokin-neko-app/"
PORT = int(os.environ.get("CHOKIN_PAGES_PORT", "8001"))


class PagesHandler(http.server.SimpleHTTPRequestHandler):
    def do_GET(self):
        if self.path == "/":
            self.send_response(302)
            self.send_header("Location", PREFIX)
            self.end_headers()
            return
        if not self.path.startswith(PREFIX):
            self.send_error(404)
            return
        original = self.path
        self.path = "/" + self.path[len(PREFIX):]
        try:
            super().do_GET()
        finally:
            self.path = original

    def do_HEAD(self):
        if self.path == "/":
            self.send_response(302)
            self.send_header("Location", PREFIX)
            self.end_headers()
            return
        if not self.path.startswith(PREFIX):
            self.send_error(404)
            return
        original = self.path
        self.path = "/" + self.path[len(PREFIX):]
        try:
            super().do_HEAD()
        finally:
            self.path = original


def main() -> None:
    url = f"http://localhost:{PORT}{PREFIX}"
    handler = lambda *args, **kwargs: PagesHandler(*args, directory=str(ROOT), **kwargs)
    try:
        with socketserver.ThreadingTCPServer(("0.0.0.0", PORT), handler) as server:
            server.daemon_threads = True
            threading.Timer(0.8, lambda: webbrowser.open(url)).start()
            print("GitHub Pages サブディレクトリ確認サーバー")
            print(url)
            print("終了するには、この画面で Ctrl+C を押すかターミナルを閉じてください。")
            server.serve_forever()
    except OSError as error:
        print(f"ポート {PORT} を使用できません: {error}")
        print("別のプログラムが8001番ポートを使用していないか確認してください。")
    except KeyboardInterrupt:
        print("\nサーバーを終了しました。")


if __name__ == "__main__":
    main()
