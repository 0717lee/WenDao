# -*- coding: utf-8 -*-
"""
Auth API tests for register / forgot-password / reset-password flow.
"""
import os
import sys
from unittest.mock import AsyncMock, patch

import pytest
from fastapi import HTTPException

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))


@pytest.mark.asyncio
async def test_forgot_password_returns_generic_message_for_unknown_email(monkeypatch):
    from routers.auth import forgot_password
    from models.schemas import ForgotPasswordRequest

    monkeypatch.setattr("routers.auth.pg_database.pool", None)
    with patch("routers.auth._get_user_by_email_sqlite", new=AsyncMock(return_value=None)):
        result = await forgot_password(ForgotPasswordRequest(email="ghost@example.com"))

    assert result.message == "如果该邮箱已注册，我们会向您发送重置密码指引。"


@pytest.mark.asyncio
async def test_forgot_password_requires_smtp_for_registered_user(monkeypatch):
    from routers.auth import forgot_password
    from models.schemas import ForgotPasswordRequest

    monkeypatch.setattr("routers.auth.pg_database.pool", None)
    with patch("routers.auth._get_user_by_email_sqlite", new=AsyncMock(return_value={"email": "user@example.com", "username": "tester"})), \
         patch("routers.auth.is_smtp_configured", return_value=False):
        with pytest.raises(HTTPException) as exc_info:
            await forgot_password(ForgotPasswordRequest(email="user@example.com"))

    assert exc_info.value.status_code == 503


@pytest.mark.asyncio
async def test_forgot_password_sends_email(monkeypatch):
    from routers.auth import forgot_password
    from models.schemas import ForgotPasswordRequest

    monkeypatch.setattr("routers.auth.pg_database.pool", None)
    monkeypatch.setenv("PASSWORD_RESET_BASE_URL", "https://texttwin.pages.dev/")

    send_mock = AsyncMock()
    with patch("routers.auth._get_user_by_email_sqlite", new=AsyncMock(return_value={"email": "user@example.com", "username": "tester"})), \
         patch("routers.auth.is_smtp_configured", return_value=True), \
         patch("routers.auth.send_password_reset_email", new=send_mock):
        result = await forgot_password(ForgotPasswordRequest(email="user@example.com"))

    assert result.message == "重置邮件已发送，请前往邮箱查收。"
    send_mock.assert_awaited_once()
    args = send_mock.await_args.args
    assert args[0] == "user@example.com"
    assert "reset_token=" in args[1]


def test_password_reset_token_round_trip(monkeypatch):
    from core.auth import create_password_reset_token, decode_password_reset_token

    monkeypatch.setenv("JWT_PASSWORD_RESET_EXPIRE_MINUTES", "30")
    token = create_password_reset_token("user@example.com")
    payload = decode_password_reset_token(token)

    assert payload["sub"] == "user@example.com"
    assert payload["purpose"] == "password_reset"


@pytest.mark.asyncio
async def test_reset_password_updates_password(monkeypatch):
    from routers.auth import reset_password
    from models.schemas import ResetPasswordRequest
    from core.auth import create_password_reset_token

    monkeypatch.setattr("routers.auth.pg_database.pool", None)
    token = create_password_reset_token("user@example.com")

    with patch("routers.auth._update_password_sqlite", new=AsyncMock(return_value=True)) as update_mock:
        result = await reset_password(ResetPasswordRequest(token=token, password="new-password-123"))

    assert result.message == "密码重置成功，请使用新密码登录。"
    update_mock.assert_awaited_once_with("user@example.com", "new-password-123")


@pytest.mark.asyncio
async def test_reset_password_rejects_invalid_token(monkeypatch):
    from routers.auth import reset_password
    from models.schemas import ResetPasswordRequest

    monkeypatch.setattr("routers.auth.pg_database.pool", None)

    with pytest.raises(HTTPException) as exc_info:
        await reset_password(ResetPasswordRequest(token="invalid-token-value-1234567890", password="new-password-123"))

    assert exc_info.value.status_code == 401
