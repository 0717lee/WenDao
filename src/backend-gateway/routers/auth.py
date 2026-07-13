# -*- coding: utf-8 -*-
"""
认证路由 — 用户注册/登录。
"""
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status

from core import pg_database
from core.auth import AUTH_COOKIE_NAME, clear_auth_cookie, create_token, hash_password, require_auth, set_auth_cookie, verify_password
from core.database import get_db
from core.pg_database import prevent_sqlite_fallback_in_production
from core.rate_limit import limiter
from models.schemas import AuthMeResponse, TokenResponse, UserLogin, UserRegister

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
    prevent_sqlite_fallback_in_production()
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
    prevent_sqlite_fallback_in_production()
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
@limiter.limit("5/minute")
async def register(request: Request, body: UserRegister, response: Response):
    """用户注册。"""
    if pg_database.pool:
        user_id = await _register_pg(body.username, body.email, body.password)
    else:
        user_id = await _register_sqlite(body.username, body.email, body.password)
    token = create_token(user_id, body.username)
    if response is not None:
        set_auth_cookie(response, token, request)
    return TokenResponse(token=token, username=body.username)


@router.post("/login", response_model=TokenResponse)
@limiter.limit("5/minute")
async def login(request: Request, body: UserLogin, response: Response):
    """用户登录。"""
    if pg_database.pool:
        user_id, username = await _login_pg(body.username, body.password)
    else:
        user_id, username = await _login_sqlite(body.username, body.password)
    token = create_token(user_id, username)
    if response is not None:
        set_auth_cookie(response, token, request)
    return TokenResponse(token=token, username=username)


@router.post("/logout")
async def logout(request: Request, response: Response):
    clear_auth_cookie(response, request)
    return {"status": "ok", "cookie": AUTH_COOKIE_NAME}


@router.get("/me", response_model=AuthMeResponse)
async def get_current_user(user: dict = Depends(require_auth)):
    """Validate the current JWT token and return lightweight identity info."""
    return AuthMeResponse(user_id=str(user["sub"]), username=user["username"])
