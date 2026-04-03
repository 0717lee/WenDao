import hashlib

from fastapi import Request
from fastapi.responses import JSONResponse

try:
    from slowapi import Limiter
    from slowapi.errors import RateLimitExceeded
except ModuleNotFoundError:  # pragma: no cover - exercised indirectly in tests
    class RateLimitExceeded(Exception):
        pass

    class Limiter:  # type: ignore[override]
        def __init__(self, *args, **kwargs):
            pass

        def limit(self, *args, **kwargs):
            def decorator(func):
                return func
            return decorator


def _hash_token(raw_value: str) -> str:
    return hashlib.sha256(raw_value.encode("utf-8")).hexdigest()


def get_rate_limit_key(request: Request) -> str:
    auth_header = request.headers.get("authorization", "")
    if auth_header.startswith("Bearer "):
        return f"bearer:{_hash_token(auth_header[7:])}"

    cookie_token = request.cookies.get("wendao_token")
    if cookie_token:
        return f"cookie:{_hash_token(cookie_token)}"

    client = getattr(request, "client", None)
    return getattr(client, "host", "127.0.0.1")


async def rate_limit_exceeded_handler(request: Request, exc: Exception):
    return JSONResponse(
        status_code=429,
        content={"error": "请求过于频繁", "message": "请求过于频繁，请稍后再试"},
    )


limiter = Limiter(key_func=get_rate_limit_key)
