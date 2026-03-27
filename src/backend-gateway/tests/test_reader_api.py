# -*- coding: utf-8 -*-
"""
Reader API Tests
Tests for reading history, progress tracking, folders, and favorites.
All DB calls are mocked to avoid requiring a running PostgreSQL instance.
"""
import os
import sys
import pytest
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
            result = await get_reading_history()

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
            result = await get_reading_history()

        assert len(result) == 1
        assert result[0]["title"] == "Test Doc"
        assert result[0]["current_paragraph"] == 3


class TestUpdateProgress:
    """Progress update performs upsert correctly."""

    @pytest.mark.asyncio
    async def test_update_progress_existing(self):
        from routers.reader import update_progress, ProgressUpdate

        mock_cm, mock_conn = _make_mock_connection(execute_return="UPDATE 1")
        with patch("routers.reader.pg_database.pool", object()), \
             patch("routers.reader.pg_database.get_connection", return_value=mock_cm):
            body = ProgressUpdate(document_id="uuid-1", current_paragraph=5, total_paragraphs=10)
            result = await update_progress(body)

        assert result["status"] == "ok"
        mock_conn.execute.assert_awaited_once()

    @pytest.mark.asyncio
    async def test_update_progress_insert_new(self):
        from routers.reader import update_progress, ProgressUpdate

        mock_cm, mock_conn = _make_mock_connection(execute_return="UPDATE 0")
        with patch("routers.reader.pg_database.pool", object()), \
             patch("routers.reader.pg_database.get_connection", return_value=mock_cm):
            body = ProgressUpdate(document_id="uuid-new", current_paragraph=1, total_paragraphs=20)
            result = await update_progress(body)

        assert result["status"] == "ok"
        assert mock_conn.execute.await_count == 2  # UPDATE + INSERT


class TestCreateFolder:
    """Folder creation returns folder_id and name."""

    @pytest.mark.asyncio
    async def test_create_folder(self):
        from routers.reader import create_folder, FolderCreate

        mock_cm, _ = _make_mock_connection(fetchrow_return={"id": "folder-uuid-1"})
        with patch("routers.reader.pg_database.pool", object()), \
             patch("routers.reader.pg_database.get_connection", return_value=mock_cm):
            body = FolderCreate(name="My Favorites")
            result = await create_folder(body)

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
                await create_folder(body)
            assert exc_info.value.status_code == 500


class TestAddFavorite:
    """Adding a favorite uses ON CONFLICT DO NOTHING."""

    @pytest.mark.asyncio
    async def test_add_favorite(self):
        from routers.reader import add_favorite, FavoriteAdd

        mock_cm, mock_conn = _make_mock_connection()
        with patch("routers.reader.pg_database.pool", object()), \
             patch("routers.reader.pg_database.get_connection", return_value=mock_cm):
            body = FavoriteAdd(document_id="doc-uuid", folder_id="folder-uuid")
            result = await add_favorite(body)

        assert result["status"] == "ok"
        mock_conn.execute.assert_awaited_once()


class TestGetFavorites:
    """Get favorites for a folder returns document list."""

    @pytest.mark.asyncio
    async def test_get_favorites_empty(self):
        from routers.reader import get_favorites

        mock_cm, _ = _make_mock_connection(fetch_return=[])
        with patch("routers.reader.pg_database.pool", object()), \
             patch("routers.reader.pg_database.get_connection", return_value=mock_cm):
            result = await get_favorites("folder-uuid")

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
            result = await get_favorites("folder-uuid")

        assert len(result) == 1
        assert result[0]["title"] == "Ancient Text"


class TestGetFolders:
    """Get folders returns folder list."""

    @pytest.mark.asyncio
    async def test_get_folders_empty(self):
        from routers.reader import get_folders

        mock_cm, _ = _make_mock_connection(fetch_return=[])
        with patch("routers.reader.pg_database.pool", object()), \
             patch("routers.reader.pg_database.get_connection", return_value=mock_cm):
            result = await get_folders()

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


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
