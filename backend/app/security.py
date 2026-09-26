import hashlib
import hmac
import json
import os
import threading
import time
from collections.abc import Awaitable, Callable
from secrets import token_bytes
from typing import Annotated, Any

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
        group = "reviews" if path == "/api/v1/reviews" else "admin"
        limit, window = (100, 60) if group == "reviews" else (60, 60)
        if not self.limiter.allow(address, group, limit, window):
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
