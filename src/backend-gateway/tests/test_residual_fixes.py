# -*- coding: utf-8 -*-
"""Regression tests for the residual security and storage fixes."""

import os
import logging
import sys
from unittest.mock import AsyncMock, MagicMock, patch

import aiosqlite
import asyncpg
import pytest
from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient
from starlette.requests import Request

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))


def _request(headers: dict[str, str] | None = None) -> Request:
    raw_headers = [
        (key.lower().encode("latin-1"), value.encode("latin-1"))
        for key, value in (headers or {}).items()
    ]
    return Request(
        {
            "type": "http",
            "http_version": "1.1",
            "method": "GET",
            "scheme": "https",
            "path": "/api/v1/documents/process/doc-1",
            "raw_path": b"/api/v1/documents/process/doc-1",
            "query_string": b"",
            "headers": raw_headers,
            "client": ("127.0.0.1", 50000),
            "server": ("api.example.com", 443),
        }
    )


class _Context:
    def __init__(self, value=None, error: Exception | None = None):
        self.value = value
        self.error = error

    async def __aenter__(self):
        if self.error:
            raise self.error
        return self.value

    async def __aexit__(self, *args):
        return False


@pytest.mark.asyncio
async def test_cookie_authenticated_state_change_requires_origin():
    from core.auth import verify_origin

    with pytest.raises(HTTPException) as exc_info:
        verify_origin(_request({"cookie": "wendao_token=valid-token"}))

    assert exc_info.value.status_code == 403


def test_chat_route_requires_authentication():
    from routers.chat import router

    async def fake_stream(*args, **kwargs):
        yield "event: done\ndata: {}\n\n"

    app = FastAPI()
    app.include_router(router)
    with patch("routers.chat.stream_chat_response", fake_stream):
        response = TestClient(app).post("/api/v1/chat", json={"message": "hello"})

    assert response.status_code == 401


async def _build_learning_db():
    db = await aiosqlite.connect(":memory:")
    db.row_factory = aiosqlite.Row
    await db.executescript(
        """
        CREATE TABLE documents (
            id TEXT PRIMARY KEY,
            title TEXT NOT NULL,
            source_type TEXT NOT NULL,
            owner_user_id TEXT
        );
        CREATE TABLE user_reading_history (
            user_id TEXT,
            document_id TEXT,
            current_paragraph INTEGER,
            total_paragraphs INTEGER,
            last_read_at TEXT
        );
        CREATE TABLE user_favorites (
            user_id TEXT,
            document_id TEXT,
            folder_id TEXT,
            created_at TEXT
        );
        INSERT INTO documents VALUES
            ('public-doc', 'Public', 'corpus', NULL),
            ('private-doc', 'Private', 'user', 'victim');
        INSERT INTO user_reading_history VALUES
            ('user-1', 'public-doc', 1, 2, '2026-01-02'),
            ('user-1', 'private-doc', 1, 2, '2026-01-01');
        INSERT INTO user_favorites VALUES
            ('user-1', 'public-doc', 'folder-1', '2026-01-02'),
            ('user-1', 'private-doc', 'folder-1', '2026-01-01');
        """
    )
    await db.commit()
    return db


@pytest.mark.asyncio
async def test_reader_lists_only_public_or_owned_documents():
    from routers import reader

    db = await _build_learning_db()
    with patch.object(reader, "get_connection", return_value=_Context(error=RuntimeError("pg unavailable"))), \
         patch.object(reader, "get_db", return_value=_Context(db)):
        history = await reader._list_reading_history("user-1")
        favorites = await reader.get_favorites("folder-1", {"sub": "user-1"})

    assert [row["id"] for row in history] == ["public-doc"]
    assert [row["id"] for row in favorites] == ["public-doc"]
    await db.close()


@pytest.mark.asyncio
async def test_history_reads_sqlite_when_postgres_recovers_without_row():
    from routers import reader

    db = await _build_learning_db()
    pg_conn = AsyncMock()
    pg_conn.fetch = AsyncMock(return_value=[])

    with patch.object(reader, "get_connection", return_value=_Context(pg_conn)), \
         patch.object(reader, "get_db", return_value=_Context(db)):
        history = await reader._list_reading_history("user-1")

    assert [row["id"] for row in history] == ["public-doc"]
    await db.close()


@pytest.mark.asyncio
async def test_study_progress_falls_back_on_asyncpg_disconnect():
    from core import user_learning_repository as repository

    cursor = AsyncMock()
    cursor.fetchone = AsyncMock(
        return_value={
            "sessions_count": 1,
            "completed_cards": 2,
            "mastered_cards": 1,
            "review_again_cards": 1,
            "last_reviewed_at": "2026-01-01",
        }
    )
    sqlite_db = AsyncMock()
    sqlite_db.execute = AsyncMock(return_value=cursor)

    with patch.object(
        repository,
        "get_connection",
        return_value=_Context(error=asyncpg.ConnectionDoesNotExistError("connection lost")),
    ), patch.object(repository, "get_db", return_value=_Context(sqlite_db)):
        result = await repository.get_study_progress("doc-1", "user-1")

    assert result["sessions_count"] == 1
    assert result["mastered_cards"] == 1


@pytest.mark.asyncio
async def test_study_progress_prefers_sqlite_when_postgres_has_no_sessions():
    from core import user_learning_repository as repository

    pg_cursor = AsyncMock()
    pg_cursor.fetchone = AsyncMock(
        return_value={
            "sessions_count": 0,
            "completed_cards": 0,
            "mastered_cards": 0,
            "review_again_cards": 0,
            "last_reviewed_at": None,
        }
    )
    pg_conn = AsyncMock()
    pg_conn.fetchrow = AsyncMock(return_value=pg_cursor.fetchone.return_value)
    sqlite_cursor = AsyncMock()
    sqlite_cursor.fetchone = AsyncMock(
        return_value={
            "sessions_count": 1,
            "completed_cards": 2,
            "mastered_cards": 1,
            "review_again_cards": 1,
            "last_reviewed_at": "2026-01-01",
        }
    )
    sqlite_db = AsyncMock()
    sqlite_db.execute = AsyncMock(return_value=sqlite_cursor)

    with patch.object(repository, "get_connection", return_value=_Context(pg_conn)), patch.object(repository, "get_db", return_value=_Context(sqlite_db)):
        result = await repository.get_study_progress("doc-1", "user-1")

    assert result["sessions_count"] == 1
    assert result["completed_cards"] == 2



def test_rate_limit_key_is_stable_across_tokens_for_same_user():
    from core.rate_limit import get_rate_limit_key

    with patch("core.auth.decode_token", return_value={"sub": "user-1"}):
        first = get_rate_limit_key(_request({"cookie": "wendao_token=token-a"}))
        second = get_rate_limit_key(_request({"cookie": "wendao_token=token-b"}))

    assert first == second
    assert first.startswith("user:")


def test_rate_limit_uses_authenticated_bearer_subject():
    from core.rate_limit import get_rate_limit_key

    with patch("core.auth.decode_token", return_value={"sub": "user-1"}):
        first = get_rate_limit_key(_request({"authorization": "Bearer token-a"}))
        second = get_rate_limit_key(_request({"authorization": "Bearer token-b"}))

    assert first == second
    assert first.startswith("user:")


def test_bearer_auth_ignores_stale_cookie_for_origin_check():
    from core.auth import verify_origin

    verify_origin(_request({
        "authorization": "Bearer valid-token",
        "cookie": "wendao_token=stale-token",
    }))


def test_root_dockerignore_excludes_secrets_and_local_dependencies():
    root = os.path.abspath(
        os.path.join(os.path.dirname(__file__), "..", "..", "..")
    )
    dockerignore_path = os.path.join(root, ".dockerignore")

    assert os.path.exists(dockerignore_path)
    with open(dockerignore_path, encoding="utf-8") as handle:
        patterns = {
            line.strip()
            for line in handle
            if line.strip() and not line.lstrip().startswith("#")
        }

    assert {".git", "**/.env", "**/.venv", "**/node_modules"}.issubset(patterns)


@pytest.mark.asyncio
async def test_pdf_export_does_not_silently_fall_back_to_text():
    from routers.document import _generate_pdf

    row = {
        "title": "中文导出",
        "original_text": "学而时习之",
        "punctuated_text": "学而时习之。",
        "translated_text": "学习并时常温习。",
    }
    import fpdf  # noqa: F401 - import before patching os.path.exists

    with patch("os.path.exists", return_value=False):
        with pytest.raises(HTTPException) as exc_info:
            await _generate_pdf(row)

    assert exc_info.value.status_code == 503


@pytest.mark.asyncio
async def test_search_logs_postgres_fallback(caplog):
    from routers import search

    row = {
        "id": "doc-1",
        "repo_id": None,
        "title": "Public",
        "source_name": "Corpus",
        "author": "",
        "dynasty": "",
        "category": "",
        "original_text": "text",
        "punctuated_text": "text",
        "translated_text": "",
        "segments": [],
        "source_type": "corpus",
        "owner_user_id": None,
    }
    cursor = AsyncMock()
    cursor.fetchall = AsyncMock(return_value=[row])
    sqlite_db = AsyncMock()
    sqlite_db.execute = AsyncMock(return_value=cursor)

    with patch.object(search, "get_connection", return_value=_Context(error=ConnectionError("postgres unavailable"))), \
         patch.object(search, "get_db", return_value=_Context(sqlite_db)), \
         caplog.at_level(logging.WARNING, logger="routers.search"):
        result = await search._load_document_candidates(limit=10, user_id="user-1")

    assert result
    assert "PostgreSQL" in caplog.text
    assert "postgres unavailable" in caplog.text


@pytest.mark.asyncio
async def test_creative_provider_clients_have_bounded_retries_and_close():
    from routers import creative

    response = MagicMock()
    response.choices = [MagicMock(message=MagicMock(content="poem"))]
    poem_client = MagicMock()
    poem_client.chat.completions.create.return_value = response
    image_agent = MagicMock()
    image_agent.generate.return_value = "https://example.com/image.png"

    with patch.object(creative, "get_zhipu_api_key", return_value="test-key"), \
         patch("zhipuai.ZhipuAI", return_value=poem_client) as poem_client_class:
        poem = await creative._generate_poem("spring")

    with patch("agents.image_gen.ImageGenAgent", return_value=image_agent) as image_agent_class:
        image_url = await creative._generate_image("spring")

    assert poem == "poem"
    assert image_url == "https://example.com/image.png"
    poem_client_class.assert_called_once_with(
        api_key="test-key",
        timeout=creative.POEM_PROVIDER_TIMEOUT,
        max_retries=0,
    )
    image_agent_class.assert_called_once_with(
        timeout=creative.MEDIA_ENHANCEMENT_TIMEOUT,
        max_retries=0,
    )
    poem_client.close.assert_called_once_with()
    image_agent.close.assert_called_once_with()


def test_speech_websocket_has_a_total_timeout():
    import importlib.util
    import threading
    import time

    speech_path = os.path.join(os.path.dirname(__file__), "..", "agents", "speech.py")
    spec = importlib.util.spec_from_file_location("speech_timeout_under_test", speech_path)
    assert spec is not None and spec.loader is not None
    speech_module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(speech_module)
    run_websocket_app = speech_module._run_websocket_app

    closed = threading.Event()
    websocket_app = MagicMock()
    websocket_app.run_forever.side_effect = lambda: closed.wait(1)
    websocket_app.close.side_effect = closed.set

    started_at = time.monotonic()
    run_websocket_app(websocket_app, timeout_seconds=0.02)
    elapsed = time.monotonic() - started_at

    assert elapsed < 0.5
    websocket_app.close.assert_called()
