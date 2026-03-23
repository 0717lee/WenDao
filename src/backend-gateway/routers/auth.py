# -*- coding: utf-8 -*-
"""
认证路由 — 用户注册/登录/找回密码。
"""
import logging
import os
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit
from uuid import uuid4

from fastapi import APIRouter, HTTPException, status

from core import pg_database
from core.auth import (
    create_password_reset_token,
    create_token,
    decode_password_reset_token,
    hash_password,
    verify_password,
)
from core.database import get_db
from core.mailer import is_smtp_configured, send_password_reset_email
from models.schemas import (
    ForgotPasswordRequest,
    ForgotPasswordResponse,
    ResetPasswordRequest,
    ResetPasswordResponse,
    TokenResponse,
    UserLogin,
    UserRegister,
)

logger = logging.getLogger(__name__)
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


async def _email_exists_pg(email: str) -> bool:
    async with pg_database.get_connection() as conn:
        row = await conn.fetchrow("SELECT id FROM users WHERE email = $1", email)
        return bool(row)


async def _email_exists_sqlite(email: str) -> bool:
    async with get_db() as db:
        cursor = await db.execute("SELECT id FROM users WHERE email = ?", (email,))
        row = await cursor.fetchone()
        return bool(row)


async def _get_user_by_email_pg(email: str) -> dict | None:
    async with pg_database.get_connection() as conn:
        row = await conn.fetchrow(
            "SELECT id, username, email FROM users WHERE email = $1",
            email,
        )
        return dict(row) if row else None


async def _get_user_by_email_sqlite(email: str) -> dict | None:
    async with get_db() as db:
        cursor = await db.execute(
            "SELECT id, username, email FROM users WHERE email = ?",
            (email,),
        )
        row = await cursor.fetchone()
        return dict(row) if row else None


async def _update_password_pg(email: str, password: str) -> bool:
    async with pg_database.get_connection() as conn:
        result = await conn.execute(
            "UPDATE users SET hashed_password = $2 WHERE email = $1",
            email,
            hash_password(password),
        )
        return result != "UPDATE 0"


async def _update_password_sqlite(email: str, password: str) -> bool:
    async with get_db() as db:
        cursor = await db.execute(
            "UPDATE users SET hashed_password = ? WHERE email = ?",
            (hash_password(password), email),
        )
        await db.commit()
        return cursor.rowcount > 0


def _build_reset_link(token: str) -> str:
    base_url = os.getenv("PASSWORD_RESET_BASE_URL") or os.getenv("FRONTEND_BASE_URL")
    if not base_url:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="密码重置链接地址未配置")

    parsed = urlsplit(base_url)
    query = dict(parse_qsl(parsed.query, keep_blank_values=True))
    query["reset_token"] = token
    return urlunsplit((parsed.scheme, parsed.netloc, parsed.path, urlencode(query), parsed.fragment))


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


@router.post("/forgot-password", response_model=ForgotPasswordResponse)
async def forgot_password(body: ForgotPasswordRequest):
    """
    发送密码重置邮件。
    """
    user = await (_get_user_by_email_pg(body.email) if pg_database.pool else _get_user_by_email_sqlite(body.email))
    if not user:
        logger.info("收到未注册邮箱的找回密码请求: %s", body.email)
        return ForgotPasswordResponse(message="如果该邮箱已注册，我们会向您发送重置密码指引。")

    if not is_smtp_configured():
        logger.error("SMTP 邮件服务未配置，无法发送重置邮件")
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="邮件服务未配置，暂时无法发送重置邮件")

    reset_token = create_password_reset_token(body.email)
    reset_link = _build_reset_link(reset_token)
    try:
        await send_password_reset_email(body.email, reset_link, user.get("username"))
    except Exception as exc:
        logger.exception("发送密码重置邮件失败: %s", exc)
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="邮件发送失败，请稍后重试")

    logger.info("已向 %s 发送密码重置邮件", body.email)
    return ForgotPasswordResponse(message="重置邮件已发送，请前往邮箱查收。")


@router.post("/reset-password", response_model=ResetPasswordResponse)
async def reset_password(body: ResetPasswordRequest):
    """使用邮件中的 token 重置密码。"""
    payload = decode_password_reset_token(body.token)
    email = payload.get("sub")
    if not email:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="无效的重置链接")

    updated = await (_update_password_pg(email, body.password) if pg_database.pool else _update_password_sqlite(email, body.password))
    if not updated:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="用户不存在")

    logger.info("用户 %s 已完成密码重置", email)
    return ResetPasswordResponse(message="密码重置成功，请使用新密码登录。")
