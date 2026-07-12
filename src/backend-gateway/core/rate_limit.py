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
    # Validate the cookie token before using it as a rate-limit key.
    # A forged cookie would otherwise create a new bucket per random value.
    cookie_token = request.cookies.get("wendao_token")
    if cookie_token:
        try:
            from core.auth import decode_token

            decode_token(cookie_token)  # raises on invalid/expired token
            return f"cookie:{_hash_token(cookie_token)}"
        except Exception:
            pass  # Invalid/forged cookie — fall back to IP

    # Fall back to client IP for unauthenticated or invalid-token requests
    client = getattr(request, "client", None)
    return getattr(client, "host", "127.0.0.1")


async def rate_limit_exceeded_handler(request: Request, exc: Exception):
    return JSONResponse(
        status_code=429,
        content={"error": "请求过于频繁", "message": "请求过于频繁，请稍后再试"},
    )


limiter = Limiter(key_func=get_rate_limit_key)
