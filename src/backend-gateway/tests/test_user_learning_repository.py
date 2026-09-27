# -*- coding: utf-8 -*-
import os
import sys
import uuid
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))


def _make_context(value):
    ctx = MagicMock()
    ctx.__aenter__ = AsyncMock(return_value=value)
    ctx.__aexit__ = AsyncMock(return_value=False)
    return ctx


class TestDocumentNotesRepository:
    @pytest.mark.asyncio
    async def test_get_document_note_falls_back_to_sqlite_when_pg_has_no_row(self):
        from core.user_learning_repository import get_document_note

        pg_conn = AsyncMock()
        pg_conn.fetchrow = AsyncMock(return_value=None)
        sqlite_cursor = AsyncMock()
        sqlite_cursor.fetchone = AsyncMock(return_value={
            "document_id": "doc-1",
            "note_text": "SQLite 里的笔记",
            "updated_at": "2026-04-10T20:00:00",
        })
        sqlite_db = AsyncMock()
        sqlite_db.execute = AsyncMock(return_value=sqlite_cursor)

        with patch("core.user_learning_repository.get_connection", return_value=_make_context(pg_conn)), \
             patch("core.user_learning_repository.get_db", return_value=_make_context(sqlite_db)):
            result = await get_document_note("doc-1", "user-1")

        assert result["note_text"] == "SQLite 里的笔记"
        pg_conn.fetchrow.assert_awaited_once()
        sqlite_db.execute.assert_awaited_once()

    @pytest.mark.asyncio
    async def test_save_document_note_falls_back_to_sqlite_when_pg_write_fails(self):
        from core.user_learning_repository import save_document_note

        pg_conn = AsyncMock()
        pg_conn.fetchrow = AsyncMock(side_effect=Exception("foreign key missing"))
        sqlite_cursor = AsyncMock()
        sqlite_cursor.fetchone = AsyncMock(return_value={
            "document_id": "doc-1",
            "note_text": "课堂讲义重点",
            "updated_at": "2026-04-10T20:00:00",
        })
        sqlite_db = AsyncMock()
        sqlite_db.execute = AsyncMock(side_effect=[None, sqlite_cursor])

        with patch("core.user_learning_repository.get_connection", return_value=_make_context(pg_conn)), \
             patch("core.user_learning_repository.get_db", return_value=_make_context(sqlite_db)):
            result = await save_document_note("doc-1", "user-1", "课堂讲义重点")

        assert result["note_text"] == "课堂讲义重点"
        assert sqlite_db.execute.await_count == 2
        sqlite_db.commit.assert_awaited_once()

    @pytest.mark.asyncio
    async def test_get_document_note_returns_pg_empty_without_sqlite_fallback(self, monkeypatch):
        from core.user_learning_repository import get_document_note

        monkeypatch.setenv("APP_ENV", "production")
        pg_conn = AsyncMock()
        pg_conn.fetchrow = AsyncMock(return_value=None)
        sqlite_db = MagicMock()

        with patch("core.user_learning_repository.get_connection", return_value=_make_context(pg_conn)), \
             patch("core.user_learning_repository.get_db", sqlite_db):
            result = await get_document_note("doc-1", "user-1")

        assert result == {
            "document_id": "doc-1",
            "note_text": "",
            "updated_at": None,
        }
        sqlite_db.assert_not_called()


class TestStudyProgressGuardInProduction:
    """Production keeps PG empty progress authoritative without reading SQLite."""

    @pytest.mark.asyncio
    async def test_get_study_progress_returns_pg_empty_without_sqlite_fallback(self, monkeypatch):
        from core.user_learning_repository import get_study_progress

        monkeypatch.setenv("APP_ENV", "production")
        pg_conn = AsyncMock()
        pg_conn.fetchrow = AsyncMock(return_value={
            "sessions_count": 0,
            "completed_cards": 0,
            "mastered_cards": 0,
            "review_again_cards": 0,
            "last_reviewed_at": None,
        })
        sqlite_db = MagicMock()

        with patch("core.user_learning_repository.get_connection", return_value=_make_context(pg_conn)), \
             patch("core.user_learning_repository.get_db", sqlite_db):
            result = await get_study_progress("doc-1", "user-1")

        assert result["sessions_count"] == 0
        assert result["completed_cards"] == 0
        sqlite_db.assert_not_called()

    @pytest.mark.asyncio
    async def test_get_study_progress_raises_503_when_pg_query_fails(self, monkeypatch):
        from fastapi import HTTPException
        from core.user_learning_repository import get_study_progress

        monkeypatch.setenv("APP_ENV", "production")
        pg_conn = AsyncMock()
        pg_conn.fetchrow = AsyncMock(side_effect=Exception("pg down"))

        with patch("core.user_learning_repository.get_connection", return_value=_make_context(pg_conn)):
            with pytest.raises(HTTPException) as exc_info:
                await get_study_progress("doc-1", "user-1")

        assert exc_info.value.status_code == 503

    @pytest.mark.asyncio
    async def test_get_study_progress_falls_back_in_dev_when_pg_returns_empty(self, monkeypatch):
        """Sanity check: dev/test environment still allows SQLite fallback."""
        from core.user_learning_repository import get_study_progress

        monkeypatch.setenv("APP_ENV", "test")
        pg_conn = AsyncMock()
        pg_conn.fetchrow = AsyncMock(return_value={
            "sessions_count": 0,
            "completed_cards": 0,
            "mastered_cards": 0,
            "review_again_cards": 0,
            "last_reviewed_at": None,
        })
        sqlite_cursor = AsyncMock()
        sqlite_cursor.fetchone = AsyncMock(return_value={
            "sessions_count": 2,
            "completed_cards": 5,
            "mastered_cards": 3,
            "review_again_cards": 1,
            "last_reviewed_at": "2026-04-10T20:00:00",
        })
        sqlite_db = AsyncMock()
        sqlite_db.execute = AsyncMock(return_value=sqlite_cursor)

        with patch("core.user_learning_repository.get_connection", return_value=_make_context(pg_conn)), \
             patch("core.user_learning_repository.get_db", return_value=_make_context(sqlite_db)):
            result = await get_study_progress("doc-1", "user-1")

        assert result["sessions_count"] == 2
        assert result["completed_cards"] == 5


class TestStudySessionIdempotency:
    """Client supplied round ids make ambiguous writes safe to retry."""

    @pytest.mark.asyncio
    async def test_postgres_duplicate_round_returns_existing_session(self):
        from core.user_learning_repository import save_study_session

        session_id = str(uuid.uuid4())
        existing = {
            "document_id": "doc-1",
            "session_id": session_id,
            "completed_cards": 5,
            "total_cards": 5,
            "mastered_cards": 4,
            "review_again_cards": 1,
            "created_at": "2026-04-10T20:00:00",
        }
        pg_conn = AsyncMock()
        pg_conn.fetchrow = AsyncMock(side_effect=[None, existing])

        with patch("core.user_learning_repository.get_connection", return_value=_make_context(pg_conn)):
            result = await save_study_session(
                "doc-1",
                "user-1",
                completed_cards=5,
                total_cards=5,
                mastered_cards=4,
                review_again_cards=1,
                session_id=session_id,
            )

        assert result == existing
        insert_sql = pg_conn.fetchrow.await_args_list[0].args[0]
        assert "ON CONFLICT (user_id, document_id, session_id) DO NOTHING" in insert_sql
        assert pg_conn.fetchrow.await_args_list[1].args[0].count("user_id = $1::uuid") == 1

    @pytest.mark.asyncio
    async def test_sqlite_retry_and_scope_do_not_create_duplicate_rows(self, tmp_path, monkeypatch):
        import aiosqlite
        from core.database import get_db as open_db, init_database
        from core.user_learning_repository import save_study_session

        db_path = tmp_path / "study-idempotency.db"
        await init_database(str(db_path), seed_mode="none")
        async with aiosqlite.connect(str(db_path)) as db:
            await db.execute(
                "INSERT INTO documents (id, title, original_text, source_type) VALUES (?, ?, ?, ?)",
                ("doc-1", "测试文档", "学而时习之", "corpus"),
            )
            await db.commit()

        monkeypatch.setenv("APP_ENV", "test")
        pg_conn = AsyncMock()
        pg_conn.fetchrow = AsyncMock(side_effect=RuntimeError("postgres unavailable"))

        def open_test_db():
            return open_db(str(db_path))

        session_id = str(uuid.uuid4())
        with patch("core.user_learning_repository.get_connection", return_value=_make_context(pg_conn)), \
             patch("core.user_learning_repository.get_db", side_effect=open_test_db):
            first = await save_study_session(
                "doc-1", "user-1", 5, 5, 4, 1, session_id=session_id
            )
            retry = await save_study_session(
                "doc-1", "user-1", 5, 5, 0, 5, session_id=session_id
            )
            other_user = await save_study_session(
                "doc-1", "user-2", 5, 5, 5, 0, session_id=session_id
            )

        assert first["sessions_count"] == 1
        assert retry["sessions_count"] == 1
        assert retry["mastered_cards"] == 4
        assert other_user["sessions_count"] == 1

        async with aiosqlite.connect(str(db_path)) as db:
            cursor = await db.execute("SELECT COUNT(*) FROM user_study_sessions")
            assert (await cursor.fetchone())[0] == 2
