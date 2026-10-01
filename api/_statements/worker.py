"""Isolated parse process: stdout is a private pipe, never a server log."""
import json
import sys

from .engine import parse_pdf
from .errors import StatementError

if __name__ == "__main__":
    try:
        result = {"status": 200, "body": parse_pdf(sys.stdin.buffer.read(), sys.argv[1])}
    except StatementError as error:
        result = {"status": error.status, "body": error.body}
    except Exception:
        result = {"status": 500, "body": {"ok": False, "code": "internal_error", "message": "銀行解析暫時失敗。"}}
    sys.stdout.buffer.write(json.dumps(result, ensure_ascii=True).encode("utf-8"))
