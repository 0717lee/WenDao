# -*- coding: utf-8 -*-
"""
邮件发送工具。

当前用于“忘记密码”场景，通过 SMTP 发送带重置链接的邮件。
"""
import asyncio
import os
import smtplib
from email.message import EmailMessage
from email.utils import formataddr


def _env_flag(name: str, default: bool) -> bool:
    value = os.getenv(name)
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


def is_smtp_configured() -> bool:
    required = [
        os.getenv("SMTP_HOST"),
        os.getenv("SMTP_USERNAME"),
        os.getenv("SMTP_PASSWORD"),
        os.getenv("SMTP_FROM_EMAIL"),
    ]
    return all(required)


def _build_reset_email(username: str | None, to_email: str, reset_link: str) -> EmailMessage:
    from_email = os.getenv("SMTP_FROM_EMAIL", "")
    from_name = os.getenv("SMTP_FROM_NAME", "古籍智解")
    subject = "古籍智解 - 重置密码"

    greeting = f"{username}，您好：" if username else "您好："
    text_body = (
        f"{greeting}\n\n"
        "我们收到了您的密码重置请求。\n"
        "请点击下面的链接，在 30 分钟内完成密码重置：\n\n"
        f"{reset_link}\n\n"
        "如果这不是您本人的操作，请忽略此邮件。\n\n"
        "古籍智解团队"
    )
    html_body = f"""
    <html>
      <body style="font-family: 'Microsoft YaHei', Arial, sans-serif; color: #1a1e23; line-height: 1.7;">
        <p>{greeting}</p>
        <p>我们收到了您的密码重置请求。</p>
        <p>请点击下面的按钮，在 30 分钟内完成密码重置：</p>
        <p style="margin: 24px 0;">
          <a href="{reset_link}" style="display: inline-block; padding: 12px 24px; background: #ab1f22; color: #ffffff; text-decoration: none; border-radius: 8px;">
            重置密码
          </a>
        </p>
        <p>如果按钮无法点击，也可以复制下面的链接到浏览器打开：</p>
        <p style="word-break: break-all;">{reset_link}</p>
        <p>如果这不是您本人的操作，请忽略此邮件。</p>
        <p>古籍智解团队</p>
      </body>
    </html>
    """

    message = EmailMessage()
    message["Subject"] = subject
    message["From"] = formataddr((from_name, from_email))
    message["To"] = to_email
    message.set_content(text_body)
    message.add_alternative(html_body, subtype="html")
    return message


def _send_email_sync(message: EmailMessage) -> None:
    host = os.getenv("SMTP_HOST", "")
    port = int(os.getenv("SMTP_PORT", "587"))
    username = os.getenv("SMTP_USERNAME", "")
    password = os.getenv("SMTP_PASSWORD", "")
    use_ssl = _env_flag("SMTP_USE_SSL", False)
    use_tls = _env_flag("SMTP_USE_TLS", not use_ssl)
    timeout = int(os.getenv("SMTP_TIMEOUT_SECONDS", "20"))

    if use_ssl:
        with smtplib.SMTP_SSL(host, port, timeout=timeout) as server:
            server.login(username, password)
            server.send_message(message)
        return

    with smtplib.SMTP(host, port, timeout=timeout) as server:
        if use_tls:
            server.starttls()
        server.login(username, password)
        server.send_message(message)


async def send_password_reset_email(to_email: str, reset_link: str, username: str | None = None) -> None:
    """Asynchronously send a password reset email."""
    message = _build_reset_email(username=username, to_email=to_email, reset_link=reset_link)
    await asyncio.to_thread(_send_email_sync, message)
