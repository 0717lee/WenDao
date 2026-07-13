# -*- coding: utf-8 -*-
"""
Reader API Tests
Tests for reading history, progress tracking, folders, and favorites.
All DB calls are mocked to avoid requiring a running PostgreSQL instance.
"""
import os
import sys
import pytest
from fastapi import HTTPException
from unittest.mock import AsyncMock, patch, MagicMock

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

# Mock heavy agent modules before imports
sys.modules['agents.router'] = MagicMock()
sys.modules['agents.speech'] = MagicMock()


def _make_mock_connection(fetch_return=None, fetchrow_return=None, execute_return="UPDATE 1"):
    """Helper: build a mock async context manager mimicking get_connection()."""
    mock_conn = AsyncMock()
    mock_conn.fetch = AsyncMock(return_value=fetch_return or [])
    mock_conn.fetchrow = AsyncMock(return_value=fetchrow_return)
    mock_conn.execute = AsyncMock(return_value=execute_return)

    mock_cm = MagicMock()
    mock_cm.__aenter__ = AsyncMock(return_value=mock_conn)
    mock_cm.__aexit__ = AsyncMock(return_value=False)
    return mock_cm, mock_conn


class TestGetHistoryEmpty:
    """Reading history returns empty list when no records exist."""

    @pytest.mark.asyncio
    async def test_get_history_empty(self):
        from routers.reader import get_reading_history

        mock_cm, _ = _make_mock_connection(fetch_return=[])
        with patch("routers.reader.pg_database.pool", object()), \
             patch("routers.reader.pg_database.get_connection", return_value=mock_cm):
            result = await get_reading_history({"sub": "user-1"})

        assert result == []


class TestGetHistoryWithRecords:
    """Reading history returns records sorted by last_read_at."""

    @pytest.mark.asyncio
    async def test_get_history_with_records(self):
        from routers.reader import get_reading_history

        fake_rows = [
            {"id": "uuid-1", "title": "Test Doc", "current_paragraph": 3,
             "total_paragraphs": 10, "last_read_at": "2026-03-19T10:00:00"},
        ]
        mock_cm, _ = _make_mock_connection(fetch_return=fake_rows)
        with patch("routers.reader.pg_database.pool", object()), \
             patch("routers.reader.pg_database.get_connection", return_value=mock_cm):
            result = await get_reading_history({"sub": "user-1"})

        assert len(result) == 1
        assert result[0]["title"] == "Test Doc"
        assert result[0]["current_paragraph"] == 3

    @pytest.mark.asyncio
    async def test_get_history_db_error_raises_500(self):
        from routers.reader import get_reading_history

        mock_cm = MagicMock()
        mock_cm.__aenter__ = AsyncMock(side_effect=Exception("DB down"))
        mock_cm.__aexit__ = AsyncMock(return_value=False)
        sqlite_ctx = MagicMock()
        sqlite_ctx.__aenter__ = AsyncMock(side_effect=Exception("sqlite down"))
        sqlite_ctx.__aexit__ = AsyncMock(return_value=False)

        with patch("routers.reader.pg_database.pool", object()), \
             patch("routers.reader.get_connection", return_value=mock_cm), \
             patch("routers.reader.get_db", return_value=sqlite_ctx):
            with pytest.raises(HTTPException) as exc_info:
                await get_reading_history({"sub": "user-1"})

        assert exc_info.value.status_code == 500
        assert exc_info.value.detail == "读取阅读记录失败"

    @pytest.mark.asyncio
    async def test_get_history_falls_back_to_sqlite_when_pg_query_fails(self):
        from routers.reader import get_reading_history

        mock_cm = MagicMock()
        mock_cm.__aenter__ = AsyncMock(side_effect=Exception("pg failed"))
        mock_cm.__aexit__ = AsyncMock(return_value=False)

        sqlite_cursor = AsyncMock()
        sqlite_cursor.fetchall = AsyncMock(return_value=[
            {"id": "doc-1", "title": "SQLite Doc", "current_paragraph": 1, "total_paragraphs": 8, "last_read_at": "2026-03-19T10:00:00"},
        ])
        sqlite_db = AsyncMock()
        sqlite_db.execute = AsyncMock(return_value=sqlite_cursor)
        sqlite_ctx = MagicMock()
        sqlite_ctx.__aenter__ = AsyncMock(return_value=sqlite_db)
        sqlite_ctx.__aexit__ = AsyncMock(return_value=False)

        with patch("routers.reader.pg_database.pool", object()), \
             patch("routers.reader.get_connection", return_value=mock_cm), \
             patch("routers.reader.get_db", return_value=sqlite_ctx):
            result = await get_reading_history({"sub": "user-1"})

        assert result[0]["title"] == "SQLite Doc"


class TestUpdateProgress:
    """Progress update performs upsert correctly."""

    @pytest.mark.asyncio
    async def test_update_progress_existing(self):
        from routers.reader import update_progress, ProgressUpdate

        mock_cm, mock_conn = _make_mock_connection(execute_return="UPDATE 1")
        with patch("routers.reader.pg_database.pool", object()), \
             patch("routers.reader.pg_database.get_connection", return_value=mock_cm), \
             patch("routers.reader._ensure_user_document_access", new_callable=AsyncMock):
            body = ProgressUpdate(document_id="uuid-1", current_paragraph=5, total_paragraphs=10)
            result = await update_progress(body)

        assert result["status"] == "ok"
        mock_conn.execute.assert_awaited_once()

    @pytest.mark.asyncio
    async def test_update_progress_insert_new(self):
        from routers.reader import update_progress, ProgressUpdate

        mock_cm, mock_conn = _make_mock_connection(execute_return="UPDATE 0")
        with patch("routers.reader.pg_database.pool", object()), \
              patch("routers.reader.pg_database.get_connection", return_value=mock_cm), \
              patch("routers.reader._ensure_user_document_access", new_callable=AsyncMock):
            body = ProgressUpdate(document_id="uuid-new", current_paragraph=1, total_paragraphs=20)
            result = await update_progress(body, {"sub": "user-1"})

        assert result["status"] == "ok"
        mock_conn.execute.assert_awaited_once()

    @pytest.mark.asyncio
    async def test_update_progress_db_error_raises_500(self):
        from routers.reader import update_progress, ProgressUpdate

        mock_cm = MagicMock()
        mock_cm.__aenter__ = AsyncMock(side_effect=Exception("DB down"))
        mock_cm.__aexit__ = AsyncMock(return_value=False)

        with patch("routers.reader.pg_database.pool", object()), \
             patch("routers.reader.get_connection", return_value=mock_cm), \
             patch("routers.reader._ensure_user_document_access", new_callable=AsyncMock):
            with pytest.raises(HTTPException) as exc_info:
                await update_progress(
                    ProgressUpdate(document_id="uuid-1", current_paragraph=1, total_paragraphs=10),
                    {"sub": "user-1"},
                )

        assert exc_info.value.status_code == 500
        assert exc_info.value.detail == "保存阅读进度失败"

    @pytest.mark.asyncio
    async def test_update_progress_falls_back_to_sqlite_when_pg_query_fails(self):
        from routers.reader import update_progress, ProgressUpdate

        mock_cm = MagicMock()
        mock_cm.__aenter__ = AsyncMock(side_effect=Exception("pg failed"))
        mock_cm.__aexit__ = AsyncMock(return_value=False)

        sqlite_db = AsyncMock()
        sqlite_ctx = MagicMock()
        sqlite_ctx.__aenter__ = AsyncMock(return_value=sqlite_db)
        sqlite_ctx.__aexit__ = AsyncMock(return_value=False)

        with patch("routers.reader.pg_database.pool", object()), \
             patch("routers.reader.get_connection", return_value=mock_cm), \
             patch("routers.reader.get_db", return_value=sqlite_ctx), \
             patch("routers.reader._ensure_user_document_access", new_callable=AsyncMock):
            result = await update_progress(
                ProgressUpdate(document_id="uuid-1", current_paragraph=1, total_paragraphs=10),
                {"sub": "user-1"},
            )

        assert result["status"] == "ok"
        sqlite_db.execute.assert_awaited_once()


class TestCreateFolder:
    """Folder creation returns folder_id and name."""

    @pytest.mark.asyncio
    async def test_create_folder(self):
        from routers.reader import create_folder, FolderCreate

        mock_cm, _ = _make_mock_connection(fetchrow_return={"id": "folder-uuid-1"})
        with patch("routers.reader.pg_database.pool", object()), \
              patch("routers.reader.pg_database.get_connection", return_value=mock_cm):
            body = FolderCreate(name="My Favorites")
            result = await create_folder(body, {"sub": "user-1"})

        assert result["folder_id"] == "folder-uuid-1"
        assert result["name"] == "My Favorites"

    @pytest.mark.asyncio
    async def test_create_folder_db_error(self):
        from fastapi import HTTPException
        from routers.reader import create_folder, FolderCreate

        mock_cm = MagicMock()
        mock_cm.__aenter__ = AsyncMock(side_effect=RuntimeError("DB down"))
        mock_cm.__aexit__ = AsyncMock(return_value=False)

        with patch("routers.reader.pg_database.pool", object()), \
              patch("routers.reader.pg_database.get_connection", return_value=mock_cm):
            with pytest.raises(HTTPException) as exc_info:
                body = FolderCreate(name="Broken")
                await create_folder(body, {"sub": "user-1"})
            assert exc_info.value.status_code == 500


class TestAddFavorite:
    """Adding a favorite uses ON CONFLICT DO NOTHING."""

    @pytest.mark.asyncio
    async def test_add_favorite(self):
        from routers.reader import add_favorite, FavoriteAdd

        mock_cm, mock_conn = _make_mock_connection(fetchrow_return={"id": "folder-uuid"})
        with patch("routers.reader.pg_database.pool", object()), \
              patch("routers.reader.pg_database.get_connection", return_value=mock_cm), \
              patch("routers.reader._ensure_user_document_access", new_callable=AsyncMock):
            body = FavoriteAdd(document_id="doc-uuid", folder_id="folder-uuid")
            result = await add_favorite(body, {"sub": "user-1"})

        assert result["status"] == "ok"
        assert mock_conn.fetchrow.await_count == 1
        assert mock_conn.execute.await_count == 1

    @pytest.mark.asyncio
    async def test_add_favorite_db_error_raises_500(self):
        from routers.reader import add_favorite, FavoriteAdd

        mock_cm = MagicMock()
        mock_cm.__aenter__ = AsyncMock(side_effect=Exception("DB down"))
        mock_cm.__aexit__ = AsyncMock(return_value=False)

        with patch("routers.reader.pg_database.pool", object()), \
             patch("routers.reader.get_connection", return_value=mock_cm), \
             patch("routers.reader._ensure_user_document_access", new_callable=AsyncMock):
            with pytest.raises(HTTPException) as exc_info:
                await add_favorite(
                    FavoriteAdd(document_id="doc-uuid", folder_id="folder-uuid"),
                    {"sub": "user-1"},
                )

        assert exc_info.value.status_code == 500
        assert exc_info.value.detail == "加入收藏失败"

    @pytest.mark.asyncio
    async def test_add_favorite_falls_back_to_sqlite_when_pg_insert_fails(self):
        from routers.reader import add_favorite, FavoriteAdd

        mock_conn = AsyncMock()
        mock_conn.fetchrow = AsyncMock(return_value={"id": "folder-uuid", "name": "默认收藏夹"})
        mock_conn.execute = AsyncMock(side_effect=Exception("fk failed"))
        mock_cm = MagicMock()
        mock_cm.__aenter__ = AsyncMock(return_value=mock_conn)
        mock_cm.__aexit__ = AsyncMock(return_value=False)

        sqlite_cursor = AsyncMock()
        sqlite_cursor.fetchone = AsyncMock(return_value=None)
        sqlite_db = AsyncMock()
        sqlite_db.execute = AsyncMock(side_effect=[sqlite_cursor, None, None])
        sqlite_ctx = MagicMock()
        sqlite_ctx.__aenter__ = AsyncMock(return_value=sqlite_db)
        sqlite_ctx.__aexit__ = AsyncMock(return_value=False)

        with patch("routers.reader.pg_database.pool", object()), \
             patch("routers.reader.get_connection", return_value=mock_cm), \
             patch("routers.reader.get_db", return_value=sqlite_ctx), \
             patch("routers.reader._ensure_user_document_access", new_callable=AsyncMock):
            result = await add_favorite(
                FavoriteAdd(document_id="doc-uuid", folder_id="folder-uuid"),
                {"sub": "user-1"},
            )

        assert result["status"] == "ok"
        assert sqlite_db.execute.await_count == 3
        sqlite_db.commit.assert_awaited_once()


class TestGetFavorites:
    """Get favorites for a folder returns document list."""

    @pytest.mark.asyncio
    async def test_get_favorites_empty(self):
        from routers.reader import get_favorites

        mock_cm, _ = _make_mock_connection(fetch_return=[])
        with patch("routers.reader.pg_database.pool", object()), \
             patch("routers.reader.pg_database.get_connection", return_value=mock_cm):
            result = await get_favorites("folder-uuid", {"sub": "user-1"})

        assert result == []

    @pytest.mark.asyncio
    async def test_get_favorites_with_docs(self):
        from routers.reader import get_favorites

        fake_rows = [
            {"id": "doc-1", "title": "Ancient Text", "created_at": "2026-03-19T10:00:00"},
        ]
        mock_cm, _ = _make_mock_connection(fetch_return=fake_rows)
        with patch("routers.reader.pg_database.pool", object()), \
             patch("routers.reader.pg_database.get_connection", return_value=mock_cm):
            result = await get_favorites("folder-uuid", {"sub": "user-1"})

        assert len(result) == 1
        assert result[0]["title"] == "Ancient Text"

    @pytest.mark.asyncio
    async def test_get_favorites_falls_back_to_sqlite_when_pg_returns_empty(self):
        from routers.reader import get_favorites

        mock_cm, _ = _make_mock_connection(fetch_return=[])
        sqlite_cursor = AsyncMock()
        sqlite_cursor.fetchall = AsyncMock(return_value=[
            {"id": "doc-1", "title": "SQLite Favorite", "created_at": "2026-03-19T10:00:00"},
        ])
        sqlite_db = AsyncMock()
        sqlite_db.execute = AsyncMock(return_value=sqlite_cursor)
        sqlite_ctx = MagicMock()
        sqlite_ctx.__aenter__ = AsyncMock(return_value=sqlite_db)
        sqlite_ctx.__aexit__ = AsyncMock(return_value=False)

        with patch("routers.reader.pg_database.pool", object()), \
             patch("routers.reader.pg_database.get_connection", return_value=mock_cm), \
             patch("routers.reader.get_db", return_value=sqlite_ctx):
            result = await get_favorites("folder-uuid", {"sub": "user-1"})

        assert len(result) == 1
        assert result[0]["title"] == "SQLite Favorite"


class TestGetFolders:
    """Get folders returns folder list."""

    @pytest.mark.asyncio
    async def test_get_folders_empty(self):
        from routers.reader import get_folders

        mock_cm, _ = _make_mock_connection(fetch_return=[])
        with patch("routers.reader.pg_database.pool", object()), \
             patch("routers.reader.pg_database.get_connection", return_value=mock_cm):
            result = await get_folders({"sub": "user-1"})

        assert result == []


class TestWordbook:
    """Wordbook CRUD endpoints."""

    @pytest.mark.asyncio
    async def test_get_wordbook_returns_entries(self):
        from routers.reader import get_wordbook

        with patch("routers.reader._list_wordbook_entries", new=AsyncMock(return_value=[
            {"id": "1", "word": "仁", "meaning": "爱人", "allusion": "克己复礼", "citations": []},
        ])):
            result = await get_wordbook(limit=20)

        assert result["total"] == 1
        assert result["entries"][0]["word"] == "仁"

    @pytest.mark.asyncio
    async def test_add_wordbook_entry_saves_content(self):
        from routers.reader import WordbookEntryCreate, add_wordbook_entry

        with patch("routers.reader._save_wordbook_entry", new=AsyncMock(return_value={
            "id": "1",
            "word": "仁",
            "meaning": "爱人",
            "allusion": "克己复礼",
            "citations": [],
        })):
            result = await add_wordbook_entry(
                WordbookEntryCreate(word="仁", meaning="爱人", allusion="克己复礼"),
                {"sub": "user-1"},
            )

        assert result["word"] == "仁"
        assert result["meaning"] == "爱人"

    @pytest.mark.asyncio
    async def test_delete_wordbook_entry_returns_ok(self):
        from routers.reader import delete_wordbook_entry

        with patch("routers.reader._delete_wordbook_entry", new=AsyncMock(return_value=True)):
            result = await delete_wordbook_entry("1", {"sub": "user-1"})

        assert result["status"] == "ok"


class TestStudyOverview:
    """Dashboard study overview endpoint."""

    @pytest.mark.asyncio
    async def test_get_study_overview_returns_summary(self):
        from routers.reader import get_study_overview

        with patch("routers.reader._get_study_overview", new=AsyncMock(return_value={
            "sessions_count": 3,
            "reviewed_documents_count": 2,
            "completed_cards": 12,
            "mastered_cards": 9,
            "review_again_cards": 3,
            "mastery_rate": 0.75,
            "last_reviewed_document": {"document_id": "doc-1", "title": "论语节选"},
        })):
            result = await get_study_overview()

        assert result["sessions_count"] == 3
        assert result["mastery_rate"] == 0.75
        assert result["last_reviewed_document"]["title"] == "论语节选"


class TestLearningFocus:
    """Dashboard learning focus endpoint."""

    @pytest.mark.asyncio
    async def test_get_learning_focus_returns_payload(self):
        from routers.reader import get_learning_focus

        with patch("routers.reader._build_learning_focus", new=AsyncMock(return_value={
            "streak_days": 4,
            "review_queue_count": 3,
            "today_review": {
                "title": "先复习《论语节选》",
                "description": "回到上次的学习卡片。",
                "action_label": "继续复习",
                "action_type": "study",
                "document_id": "doc-1",
                "query": "",
            },
            "reading_paths": [
                {"id": "path-classroom", "title": "课内古文快读", "description": "从熟悉篇目切入。", "action_type": "search", "query": "学而时习之", "badge": "入门"},
            ],
            "co_reading_prompts": [
                {"id": "co-read-1", "title": "一句原文开读", "description": "像老师陪读。", "action_type": "chat", "prompt": "请从一句原文开始带我读。"},
            ],
        })):
            result = await get_learning_focus({"sub": "user-1"})

        assert result["streak_days"] == 4
        assert result["today_review"]["action_type"] == "study"
        assert result["reading_paths"][0]["title"] == "课内古文快读"
        assert result["co_reading_prompts"][0]["action_type"] == "chat"

    def test_calculate_streak_days_resets_for_stale_activity(self):
        from routers.reader import _calculate_streak_days

        values = [
            "2026-03-28T08:00:00",
            "2026-03-27T08:00:00",
            "2026-03-26T08:00:00",
        ]
        assert _calculate_streak_days(values) == 0

    def test_calculate_streak_days_keeps_yesterday_streak(self):
        from routers.reader import _calculate_streak_days
        from datetime import datetime, timedelta

        yesterday = (datetime.now() - timedelta(days=1)).replace(hour=8, minute=0, second=0, microsecond=0)
        two_days_ago = yesterday - timedelta(days=1)
        values = [yesterday.isoformat(), two_days_ago.isoformat()]

        assert _calculate_streak_days(values) == 2


class TestSqliteFallbackGuardInProduction:
    """Production environment must reject SQLite degradation with HTTP 503.

    These tests set APP_ENV=production explicitly to override the default
    APP_ENV=test fixture in conftest.py, ensuring the guard fires and the
    resulting HTTPException(503) is propagated unchanged (not wrapped as 500).
    """

    @pytest.mark.asyncio
    async def test_get_history_raises_503_when_pg_returns_empty(self, monkeypatch):
        from routers.reader import get_reading_history

        monkeypatch.setenv("APP_ENV", "production")
        mock_cm, _ = _make_mock_connection(fetch_return=[])
        with patch("routers.reader.pg_database.pool", object()), \
             patch("routers.reader.pg_database.get_connection", return_value=mock_cm), \
             patch("routers.reader._list_reading_history_sqlite", new=AsyncMock(return_value=[])):
            with pytest.raises(HTTPException) as exc_info:
                await get_reading_history({"sub": "user-1"})

        assert exc_info.value.status_code == 503

    @pytest.mark.asyncio
    async def test_get_history_raises_503_when_pg_query_fails(self, monkeypatch):
        from routers.reader import get_reading_history

        monkeypatch.setenv("APP_ENV", "production")
        mock_cm = MagicMock()
        mock_cm.__aenter__ = AsyncMock(side_effect=Exception("pg down"))
        mock_cm.__aexit__ = AsyncMock(return_value=False)

        with patch("routers.reader.pg_database.pool", object()), \
             patch("routers.reader.get_connection", return_value=mock_cm):
            with pytest.raises(HTTPException) as exc_info:
                await get_reading_history({"sub": "user-1"})

        # 503 must propagate unchanged (not be wrapped as 500 by _raise_reader_error)
        assert exc_info.value.status_code == 503

    @pytest.mark.asyncio
    async def test_update_progress_raises_503_when_pg_fails(self, monkeypatch):
        from routers.reader import update_progress, ProgressUpdate

        monkeypatch.setenv("APP_ENV", "production")
        mock_cm = MagicMock()
        mock_cm.__aenter__ = AsyncMock(side_effect=Exception("pg down"))
        mock_cm.__aexit__ = AsyncMock(return_value=False)

        with patch("routers.reader.pg_database.pool", object()), \
             patch("routers.reader.get_connection", return_value=mock_cm), \
             patch("routers.reader._ensure_user_document_access", new_callable=AsyncMock):
            with pytest.raises(HTTPException) as exc_info:
                await update_progress(
                    ProgressUpdate(document_id="uuid-1", current_paragraph=1, total_paragraphs=10),
                    {"sub": "user-1"},
                )

        # 503 must propagate unchanged (not be wrapped as 500)
        assert exc_info.value.status_code == 503

    @pytest.mark.asyncio
    async def test_get_favorites_raises_503_when_pg_returns_empty(self, monkeypatch):
        from routers.reader import get_favorites

        monkeypatch.setenv("APP_ENV", "production")
        mock_cm, _ = _make_mock_connection(fetch_return=[])
        with patch("routers.reader.pg_database.pool", object()), \
             patch("routers.reader.pg_database.get_connection", return_value=mock_cm):
            with pytest.raises(HTTPException) as exc_info:
                await get_favorites("folder-uuid", {"sub": "user-1"})

        assert exc_info.value.status_code == 503

    @pytest.mark.asyncio
    async def test_get_favorites_raises_503_when_pg_query_fails(self, monkeypatch):
        from routers.reader import get_favorites

        monkeypatch.setenv("APP_ENV", "production")
        mock_cm = MagicMock()
        mock_cm.__aenter__ = AsyncMock(side_effect=Exception("pg down"))
        mock_cm.__aexit__ = AsyncMock(return_value=False)

        with patch("routers.reader.pg_database.pool", object()), \
             patch("routers.reader.get_connection", return_value=mock_cm):
            with pytest.raises(HTTPException) as exc_info:
                await get_favorites("folder-uuid", {"sub": "user-1"})

        assert exc_info.value.status_code == 503


class TestRaiseReaderErrorPreservesHttpException:
    """_raise_reader_error must re-raise HTTPException unchanged (no 503→500 wrapping)."""

    def test_http_exception_is_reraised_unchanged(self):
        from routers.reader import _raise_reader_error

        original = HTTPException(status_code=503, detail="数据库暂时不可用，请稍后重试")
        with pytest.raises(HTTPException) as exc_info:
            _raise_reader_error("读取阅读记录失败", original)

        assert exc_info.value is original
        assert exc_info.value.status_code == 503

    def test_non_http_exception_is_wrapped_as_500(self):
        from routers.reader import _raise_reader_error

        with pytest.raises(HTTPException) as exc_info:
            _raise_reader_error("读取阅读记录失败", RuntimeError("db down"))

        assert exc_info.value.status_code == 500
        assert exc_info.value.detail == "读取阅读记录失败"


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
