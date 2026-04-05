# -*- coding: utf-8 -*-
"""
JWT 认证工具模块
提供 token 生成、验证和 FastAPI 依赖注入
"""
import os
import jwt
import bcrypt
import logging
from datetime import datetime, timedelta, timezone
from fastapi import Depends, HTTPException, Request, Response, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials

logger = logging.getLogger(__name__)

DEFAULT_JWT_SECRET = "wendao-dev-secret-change-in-production"
JWT_ALGORITHM = "HS256"
JWT_EXPIRE_HOURS = int(os.getenv("JWT_EXPIRE_HOURS", "24"))
AUTH_COOKIE_NAME = "wendao_token"

security = HTTPBearer(auto_error=False)


def _allows_insecure_dev_secret() -> bool:
    env = (
        os.getenv("APP_ENV")
        or os.getenv("WENDAO_ENV")
        or os.getenv("ENVIRONMENT")
        or ""
    ).strip().lower()
    if env in {"dev", "development", "local", "test"}:
        return True

    explicit_opt_in = os.getenv("ALLOW_INSECURE_DEV_AUTH", "").strip().lower()
    if explicit_opt_in in {"1", "true", "yes", "on"}:
        return True

    # pytest imports this module before app startup; keep tests deterministic.
    if "PYTEST_CURRENT_TEST" in os.environ:
        return True

    return False


def get_jwt_secret() -> str:
    secret = os.getenv("JWT_SECRET", "").strip()
    if secret:
        return secret

    if _allows_insecure_dev_secret():
        return DEFAULT_JWT_SECRET

    raise RuntimeError("JWT_SECRET 未配置，拒绝以默认密钥启动")


def _is_cross_site(request: Request | None = None) -> bool:
    """Detect cross-site deployment (frontend and backend on different domains)."""
    if request is None:
        return False
    origin = request.headers.get("origin", "")
    if not origin:
        return False
    # If the Origin header's host differs from the request host, it's cross-site.
    try:
        from urllib.parse import urlparse
        origin_host = urlparse(origin).hostname or ""
        request_host = request.url.hostname or ""
        return origin_host != request_host
    except Exception:
        return False


def _cookie_secure(request: Request | None = None) -> bool:
    explicit = os.getenv("AUTH_COOKIE_SECURE", "").strip().lower()
    if explicit in {"1", "true", "yes", "on"}:
        return True
    if explicit in {"0", "false", "no", "off"}:
        return False

    if request is not None and request.url.hostname in {"localhost", "127.0.0.1", "0.0.0.0"}:
        return False

    env = (os.getenv("APP_ENV") or os.getenv("WENDAO_ENV") or os.getenv("ENVIRONMENT") or "").strip().lower()
    if env in {"dev", "development", "local", "test"}:
        return False
    return True


def _cookie_samesite(request: Request | None = None) -> str:
    """Return 'none' for cross-site deployments (e.g. pages.dev → railway.app),
    otherwise 'lax' for same-site / local development."""
    explicit = os.getenv("AUTH_COOKIE_SAMESITE", "").strip().lower()
    if explicit in {"none", "lax", "strict"}:
        return explicit
    if _is_cross_site(request):
        return "none"
    return "lax"


def set_auth_cookie(response: Response, token: str, request: Request | None = None) -> None:
    samesite = _cookie_samesite(request)
    secure = _cookie_secure(request)
    # SameSite=None requires Secure=True
    if samesite == "none":
        secure = True
    response.set_cookie(
        AUTH_COOKIE_NAME,
        token,
        httponly=True,
        samesite=samesite,
        secure=secure,
        max_age=JWT_EXPIRE_HOURS * 3600,
        path="/",
    )


def clear_auth_cookie(response: Response, request: Request | None = None) -> None:
    samesite = _cookie_samesite(request)
    secure = _cookie_secure(request)
    if samesite == "none":
        secure = True
    response.delete_cookie(
        AUTH_COOKIE_NAME,
        httponly=True,
        samesite=samesite,
        secure=secure,
        path="/",
    )


def _extract_request_token(request: Request, credentials: HTTPAuthorizationCredentials | None) -> str | None:
    if credentials is not None:
        return credentials.credentials
    return request.cookies.get(AUTH_COOKIE_NAME)


def hash_password(password: str) -> str:
    """Hash a password with bcrypt."""
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(password: str, hashed: str) -> bool:
    """Verify a password against its bcrypt hash."""
    return bcrypt.checkpw(password.encode("utf-8"), hashed.encode("utf-8"))


def create_token(user_id: str, username: str) -> str:
    """Create a JWT token."""
    payload = {
        "sub": user_id,
        "username": username,
        "exp": datetime.now(timezone.utc) + timedelta(hours=JWT_EXPIRE_HOURS),
        "iat": datetime.now(timezone.utc),
    }
    return jwt.encode(payload, get_jwt_secret(), algorithm=JWT_ALGORITHM)


def decode_token(token: str) -> dict:
    """Decode and validate a JWT token."""
    try:
        return jwt.decode(token, get_jwt_secret(), algorithms=[JWT_ALGORITHM])
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="令牌已过期")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="无效令牌")


async def require_auth(
    request: Request,
    credentials: HTTPAuthorizationCredentials | None = Depends(security),
) -> dict:
    """FastAPI dependency: require valid JWT token on protected endpoints."""
    token = _extract_request_token(request, credentials)
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="需要登录后操作",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return decode_token(token)


async def maybe_auth(
    request: Request,
    credentials: HTTPAuthorizationCredentials | None = Depends(security),
) -> dict | None:
    """FastAPI dependency: return JWT payload when present, otherwise None."""
    token = _extract_request_token(request, credentials)
    if not token:
        return None
    return decode_token(token)
