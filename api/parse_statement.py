from http.server import BaseHTTPRequestHandler
import json
from pathlib import Path
import subprocess
import sys

from api._statements.auth import require_finance
from api._statements.engine import MAX_FILE_BYTES, decode_payload
from api._statements.errors import StatementError
from api._statements.profiles import capabilities

MAX_BODY_BYTES = 4 * ((MAX_FILE_BYTES + 2) // 3) + 4096


def isolated_parse(content, code):
    try:
        process = subprocess.run([sys.executable, "-m", "api._statements.worker", code],
                                 input=content, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
                                 cwd=Path(__file__).resolve().parent.parent, timeout=20, check=True)
        result = json.loads(process.stdout)
        if result["status"] != 200:
            body = result["body"]
            raise StatementError(result["status"], body["code"], body["message"], **{key: value for key, value in body.items() if key not in ("ok", "code", "message")})
        return result["body"]
    except subprocess.TimeoutExpired:
        raise StatementError(422, "parse_timeout", "解析逾時，請拆分 PDF 後再試。") from None


class handler(BaseHTTPRequestHandler):
    def log_message(self, *_args):
        pass  # No request details / tokens / filenames in server logs.

    def _send(self, status, body):
        encoded = json.dumps(body, ensure_ascii=False, allow_nan=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(encoded)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.end_headers()
        self.wfile.write(encoded)

    def _run(self, post=False):
        try:
            require_finance(self.headers.get("Authorization"))
            if not post:
                self._send(200, capabilities())
                return
            if self.headers.get_content_type() != "application/json":
                raise StatementError(400, "invalid_content_type", "請使用 application/json。")
            try:
                length = int(self.headers.get("Content-Length", "0"))
            except ValueError:
                raise StatementError(400, "invalid_request", "請求長度無效。") from None
            if length > MAX_BODY_BYTES:
                raise StatementError(413, "file_too_large", "PDF 不可超過 3 MB。")
            if length <= 0 or self.headers.get("Transfer-Encoding"):
                raise StatementError(400, "invalid_request", "請提供有效的 JSON 請求。")
            try:
                payload = json.loads(self.rfile.read(length))
            except (ValueError, UnicodeError):
                raise StatementError(400, "invalid_json", "JSON 格式無效。") from None
            content, code = decode_payload(payload)
            self._send(200, isolated_parse(content, code))
        except StatementError as error:
            self._send(error.status, error.body)
        except Exception:
            self._send(500, {"ok": False, "code": "internal_error", "message": "銀行解析暫時失敗，請稍後再試。"})

    def do_GET(self):
        self._run()

    def do_POST(self):
        self._run(post=True)

    def do_OPTIONS(self):
        self._send(405, {"ok": False, "code": "method_not_allowed", "message": "僅支援 GET 與 POST。"})

    do_PUT = do_DELETE = do_PATCH = do_OPTIONS
