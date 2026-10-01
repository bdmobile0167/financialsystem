import json
import os
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from .errors import StatementError


def require_finance(authorization):
    parts = (authorization or "").split()
    if len(parts) != 2 or parts[0].lower() != "bearer":
        raise StatementError(401, "unauthorized", "請重新登入後解析對帳單。")
    base = os.environ.get("SUPABASE_URL", "").rstrip("/")
    key = os.environ.get("SUPABASE_ANON_KEY", "")
    if not base.startswith("https://") or not key:
        raise StatementError(500, "configuration_error", "銀行解析服務尚未設定完成。")
    headers = {"Authorization": f"Bearer {parts[1]}", "apikey": key, "Content-Type": "application/json"}

    def call(path, data=None):
        try:
            with urlopen(Request(base + path, data=data, headers=headers), timeout=5) as response:
                return json.load(response)
        except HTTPError as error:
            if error.code in (401, 403):
                raise StatementError(401, "unauthorized", "登入已失效，請重新登入。") from None
            raise StatementError(503, "auth_unavailable", "暫時無法驗證權限，請稍後再試。") from None
        except (URLError, TimeoutError, ValueError):
            raise StatementError(503, "auth_unavailable", "暫時無法驗證權限，請稍後再試。") from None

    user = call("/auth/v1/user")
    if not isinstance(user, dict) or not user.get("id"):
        raise StatementError(401, "unauthorized", "登入已失效，請重新登入。")
    # Existing RPC checks profiles.id = auth.uid() AND active = true.
    role = call("/rest/v1/rpc/get_my_role", b"{}")
    if role not in ("accounting", "admin", "super_admin"):
        raise StatementError(403, "forbidden", "僅會計與管理員可解析銀行對帳單。")
    return user["id"]
