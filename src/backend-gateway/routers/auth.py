# -*- coding: utf-8 -*-
"""
认证路由 — 用户注册/登录。
"""
from uuid import uuid4

from fastapi import APIRouter, HTTPException, status

from core import pg_database
from core.auth import create_token, hash_password, verify_password
from core.database import get_db
from models.schemas import TokenResponse, UserLogin, UserRegister

router = APIRouter(prefix="/api/v1/auth", tags=["auth"])


def _username_or_email_conflict_message(existing_username: str | None, username: str, email: str) -> str:
    if existing_username == username:
        return "用户名已存在"
    return "邮箱已被注册"


async def _register_pg(username: str, email: str, password: str) -> str:
    """Register user in PostgreSQL and return user id."""
    async with pg_database.get_connection() as conn:
        existing = await conn.fetchrow(
            "SELECT username, email FROM users WHERE username = $1 OR email = $2",
            username,
            email,
        )
        if existing:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=_username_or_email_conflict_message(existing["username"], username, email),
            )
        row = await conn.fetchrow(
            "INSERT INTO users (username, email, hashed_password) VALUES ($1, $2, $3) RETURNING id",
            username,
            email,
            hash_password(password),
        )
        return str(row["id"])


async def _login_pg(username: str, password: str) -> tuple[str, str]:
    """Login via PostgreSQL, return (user_id, username)."""
    async with pg_database.get_connection() as conn:
        row = await conn.fetchrow(
            "SELECT id, username, hashed_password FROM users WHERE username = $1",
            username,
        )
        if not row or not verify_password(password, row["hashed_password"]):
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="用户名或密码错误")
        return str(row["id"]), row["username"]


async def _register_sqlite(username: str, email: str, password: str) -> str:
    """Fallback: register user in SQLite for local/demo environments."""
    async with get_db() as db:
        cursor = await db.execute(
            "SELECT username, email FROM users WHERE username = ? OR email = ?",
            (username, email),
        )
        existing = await cursor.fetchone()
        if existing:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=_username_or_email_conflict_message(existing["username"], username, email),
            )
        user_id = str(uuid4())
        await db.execute(
            "INSERT INTO users (id, username, email, hashed_password) VALUES (?, ?, ?, ?)",
            (user_id, username, email, hash_password(password)),
        )
        await db.commit()
        return user_id


async def _login_sqlite(username: str, password: str) -> tuple[str, str]:
    """Fallback: login from SQLite."""
    async with get_db() as db:
        cursor = await db.execute(
            "SELECT id, username, hashed_password FROM users WHERE username = ?",
            (username,),
        )
        row = await cursor.fetchone()
        if not row or not verify_password(password, row["hashed_password"]):
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="用户名或密码错误")
        return str(row["id"]), row["username"]


@router.post("/register", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
async def register(body: UserRegister):
    """用户注册。"""
    if pg_database.pool:
        user_id = await _register_pg(body.username, body.email, body.password)
    else:
        user_id = await _register_sqlite(body.username, body.email, body.password)
    token = create_token(user_id, body.username)
    return TokenResponse(token=token, username=body.username)


@router.post("/login", response_model=TokenResponse)
async def login(body: UserLogin):
    """用户登录。"""
    if pg_database.pool:
        user_id, username = await _login_pg(body.username, body.password)
    else:
        user_id, username = await _login_sqlite(body.username, body.password)
    token = create_token(user_id, username)
    return TokenResponse(token=token, username=username)
