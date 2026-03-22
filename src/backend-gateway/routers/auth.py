# -*- coding: utf-8 -*-
"""
认证路由 — 用户注册/登录
"""
import logging
from fastapi import APIRouter, HTTPException, status
from models.schemas import UserRegister, UserLogin, TokenResponse
from core.auth import hash_password, verify_password, create_token
from core.pg_database import get_connection, pool

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/v1/auth", tags=["auth"])

# In-memory fallback when PostgreSQL is unavailable (demo/dev mode)
_memory_users: dict[str, dict] = {}


async def _register_pg(username: str, password: str) -> str:
    """Register user in PostgreSQL, return user id."""
    async with get_connection() as conn:
        existing = await conn.fetchrow("SELECT id FROM users WHERE username = $1", username)
        if existing:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="用户名已存在")
        row = await conn.fetchrow(
            "INSERT INTO users (username, hashed_password) VALUES ($1, $2) RETURNING id",
            username, hash_password(password),
        )
        return str(row["id"])


async def _login_pg(username: str, password: str) -> tuple[str, str]:
    """Login via PostgreSQL, return (user_id, username)."""
    async with get_connection() as conn:
        row = await conn.fetchrow(
            "SELECT id, username, hashed_password FROM users WHERE username = $1",
            username,
        )
        if not row or not verify_password(password, row["hashed_password"]):
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="用户名或密码错误")
        return str(row["id"]), row["username"]


def _register_memory(username: str, password: str) -> str:
    """Fallback: register in memory dict."""
    if username in _memory_users:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="用户名已存在")
    user_id = f"mem-{len(_memory_users) + 1}"
    _memory_users[username] = {"id": user_id, "hashed_password": hash_password(password)}
    return user_id


def _login_memory(username: str, password: str) -> tuple[str, str]:
    """Fallback: login from memory dict."""
    user = _memory_users.get(username)
    if not user or not verify_password(password, user["hashed_password"]):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="用户名或密码错误")
    return user["id"], username


@router.post("/register", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
async def register(body: UserRegister):
    """用户注册"""
    if pool:
        user_id = await _register_pg(body.username, body.password)
    else:
        user_id = _register_memory(body.username, body.password)
    token = create_token(user_id, body.username)
    return TokenResponse(token=token, username=body.username)


@router.post("/login", response_model=TokenResponse)
async def login(body: UserLogin):
    """用户登录"""
    if pool:
        user_id, username = await _login_pg(body.username, body.password)
    else:
        user_id, username = _login_memory(body.username, body.password)
    token = create_token(user_id, username)
    return TokenResponse(token=token, username=username)
