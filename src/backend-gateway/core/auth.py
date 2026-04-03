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
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials

logger = logging.getLogger(__name__)

DEFAULT_JWT_SECRET = "wendao-dev-secret-change-in-production"
JWT_ALGORITHM = "HS256"
JWT_EXPIRE_HOURS = int(os.getenv("JWT_EXPIRE_HOURS", "24"))

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
    credentials: HTTPAuthorizationCredentials = Depends(security),
) -> dict:
    """FastAPI dependency: require valid JWT token on protected endpoints."""
    if credentials is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="需要登录后操作",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return decode_token(credentials.credentials)


async def maybe_auth(
    credentials: HTTPAuthorizationCredentials = Depends(security),
) -> dict | None:
    """FastAPI dependency: return JWT payload when present, otherwise None."""
    if credentials is None:
        return None
    return decode_token(credentials.credentials)
