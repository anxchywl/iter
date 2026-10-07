import hashlib
import hmac
import ipaddress
import json
import os
import re
import threading
import time
from collections.abc import Awaitable, Callable
from datetime import UTC, datetime, timedelta
from secrets import token_bytes
from typing import Annotated, Any
from urllib.parse import parse_qsl

from fastapi import Depends, HTTPException, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from starlette.responses import JSONResponse


def load_admin_credentials(raw: str | None) -> dict[str, str]:
    if not raw:
        raise RuntimeError("ADMIN_CREDENTIALS_JSON is required")
    try:
        credentials = json.loads(raw)
    except json.JSONDecodeError as exc:
        raise RuntimeError("ADMIN_CREDENTIALS_JSON is invalid") from exc
    if (
        not isinstance(credentials, dict)
        or not credentials
        or any(
            not isinstance(actor, str)
            or not actor
            or len(actor) > 80
            or not isinstance(secret, str)
            or len(secret) < 32
            for actor, secret in credentials.items()
        )
        or len(set(credentials.values())) != len(credentials)
    ):
        raise RuntimeError("admin credentials require distinct operators and long secrets")
    return credentials


TELEGRAM_ID_LIMIT = 2**52 - 1


def load_operator_telegram_ids(raw: str | None) -> frozenset[int]:
    if not raw or not raw.strip():
        return frozenset()
    ids = set()
    for part in raw.split(","):
        part = part.strip()
        if not part.isdigit() or not 0 < int(part) <= TELEGRAM_ID_LIMIT:
            raise RuntimeError("OPERATOR_TELEGRAM_IDS must list positive Telegram user IDs")
        ids.add(int(part))
    return frozenset(ids)


def load_telegram_bot_token(raw: str | None) -> str | None:
    if not raw:
        return None
    if not re.fullmatch(r"[0-9]{1,20}:[A-Za-z0-9_-]{30,64}", raw):
        raise RuntimeError("TELEGRAM_BOT_TOKEN is invalid")
    return raw


def telegram_user_id(init_data: str, bot_token: str, max_age: timedelta, now: datetime) -> int:
    if not init_data or len(init_data) > 4096:
        raise ValueError("invalid init data")
    pairs = parse_qsl(init_data, keep_blank_values=True, strict_parsing=True, max_num_fields=32)
    fields = dict(pairs)
    if len(fields) != len(pairs):
        raise ValueError("duplicate init data fields")
    received = fields.pop("hash", "")
    check = "\n".join(f"{key}={value}" for key, value in sorted(fields.items()))
    secret = hmac.new(b"WebAppData", bot_token.encode(), hashlib.sha256).digest()
    expected = hmac.new(secret, check.encode(), hashlib.sha256).hexdigest()
    if not hmac.compare_digest(expected, received):
        raise ValueError("invalid init data signature")
    auth_date = datetime.fromtimestamp(int(fields["auth_date"]), UTC)
    # a future auth date would otherwise never expire
    if not now - max_age <= auth_date <= now + timedelta(minutes=1):
        raise ValueError("expired init data")
    user = json.loads(fields["user"])
    user_id = user.get("id") if isinstance(user, dict) else None
    if type(user_id) is not int or not 0 < user_id <= TELEGRAM_ID_LIMIT:
        raise ValueError("invalid init data user")
    return user_id


bearer = HTTPBearer(auto_error=False)


def require_admin(
    request: Request,
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer)],
) -> str:
    if credentials is None or credentials.scheme.lower() != "bearer":
        raise HTTPException(status_code=401, detail="Unauthorized")
    given = hashlib.sha256(credentials.credentials.encode()).digest()
    for actor, secret in request.app.state.admin_credentials.items():
        if hmac.compare_digest(given, hashlib.sha256(secret.encode()).digest()):
            return actor
    raise HTTPException(status_code=401, detail="Unauthorized")


class WriteLimiter:
    def __init__(self) -> None:
        self._salt = token_bytes(32)
        self._lock = threading.Lock()
        self._hits: dict[tuple[str, str], tuple[float, int]] = {}
        self._next_prune = time.monotonic() + 60

    def allow(self, client: str, scope: str, limit: int, window_seconds: int) -> bool:
        digest = hmac.new(self._salt, client.encode(), hashlib.sha256).hexdigest()
        key = (scope, digest)
        now = time.monotonic()
        with self._lock:
            if now >= self._next_prune:
                self._hits = {item: value for item, value in self._hits.items() if value[0] > now}
                self._next_prune = now + 60
            if key not in self._hits and len(self._hits) >= 10_000:
                return False
            expiry, count = self._hits.get(key, (now + window_seconds, 0))
            if expiry <= now:
                expiry, count = now + window_seconds, 0
            if count >= limit:
                return False
            self._hits[key] = (expiry, count + 1)
            return True


class WriteGuard:
    def __init__(self, app: Callable[..., Awaitable[Any]], limiter: WriteLimiter) -> None:
        self.app = app
        self.limiter = limiter

    async def __call__(self, scope: dict, receive: Callable, send: Callable) -> None:
        if scope["type"] != "http" or scope["method"] not in {"POST", "PUT", "PATCH", "DELETE"}:
            await self.app(scope, receive, send)
            return
        headers = dict(scope.get("headers", []))
        try:
            declared = int(headers.get(b"content-length", b"0"))
        except ValueError:
            declared = 16_385
        if declared > 16_384:
            await JSONResponse({"detail": "Request too large"}, status_code=413)(
                scope, receive, send
            )
            return
        body = bytearray()
        while True:
            message = await receive()
            if message["type"] == "http.disconnect":
                return
            body.extend(message.get("body", b""))
            if len(body) > 16_384:
                await JSONResponse({"detail": "Request too large"}, status_code=413)(
                    scope, receive, send
                )
                return
            if not message.get("more_body", False):
                break
        path = scope.get("path", "")
        client = scope.get("client")
        address = client[0] if client else "unknown"
        if os.environ.get("TRUST_PROXY_CLIENT_IP") == "true":
            forwarded = headers.get(b"x-iter-client-ip", b"").decode(errors="ignore")
            try:
                address = str(ipaddress.ip_address(forwarded))
            except ValueError:
                address = "unknown"
        if path == "/api/v1/portal/sessions":
            group, limit = "portal_login", 10
        elif path == "/api/v1/reviews":
            group, limit = "reviews", 100
        elif path == "/api/v1/reports":
            group, limit = "reports", 30
        elif path.startswith("/api/v1/admin/"):
            group, limit = "admin", 60
        else:
            group, limit = "portal", 60
        if not self.limiter.allow(address, f"client:{group}", limit, 60):
            await JSONResponse({"detail": "Too many requests"}, status_code=429)(
                scope, receive, send
            )
            return
        credential = headers.get(b"x-portal-session") or headers.get(b"authorization")
        if credential and not self.limiter.allow(
            credential.decode(errors="ignore"), f"credential:{group}", limit, 60
        ):
            await JSONResponse({"detail": "Too many requests"}, status_code=429)(
                scope, receive, send
            )
            return
        sent = False

        async def replay() -> dict:
            nonlocal sent
            if sent:
                return {"type": "http.request", "body": b"", "more_body": False}
            sent = True
            return {"type": "http.request", "body": bytes(body), "more_body": False}

        await self.app(scope, replay, send)


def credentials_from_environment() -> dict[str, str]:
    return load_admin_credentials(os.environ.get("ADMIN_CREDENTIALS_JSON"))
