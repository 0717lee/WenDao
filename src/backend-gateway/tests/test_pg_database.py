# -*- coding: utf-8 -*-
"""
Tests for core.pg_database module.
Uses monkeypatch to mock asyncpg without requiring a real PostgreSQL instance.
"""
import pytest
from unittest.mock import AsyncMock, patch, MagicMock
from core import pg_database


@pytest.mark.asyncio
async def test_get_connection_returns_conn(mock_asyncpg_pool, monkeypatch):
    """get_connection() should yield a connection from the pool."""
    monkeypatch.setattr(pg_database, "pool", mock_asyncpg_pool)

    async with pg_database.get_connection() as conn:
        assert conn is not None
        # Verify acquire was called
        mock_asyncpg_pool.acquire.assert_called_once()


@pytest.mark.asyncio
async def test_get_connection_raises_without_pool(monkeypatch):
    """get_connection() should raise RuntimeError if pool is None."""
    monkeypatch.setattr(pg_database, "pool", None)

    with pytest.raises(RuntimeError, match="pool not initialized"):
        async with pg_database.get_connection() as conn:
            pass


@pytest.mark.asyncio
async def test_init_pg_database_creates_tables(mock_asyncpg_pool, monkeypatch):
    """init_pg_database() should execute CREATE/ALTER statements for documents, reader tables, and users."""
    monkeypatch.setattr(pg_database, "pool", mock_asyncpg_pool)

    await pg_database.init_pg_database()

    # Get the mock connection (acquire returns acm, __aenter__ yields mock_conn)
    acm = mock_asyncpg_pool.acquire.return_value
    mock_conn = acm.__aenter__.return_value

    # documents / reading_history / favorite_folders / favorites / wordbook_entries /
    # document_notes / study_sessions / users plus ALTER statements for entity_ids, image_data,
    # source_type, repo_id, author, dynasty, category, source_name, source_url,
    # chapter_titles, chapter_count, featured_excerpt, difficulty, guide_summary,
    # reading_tip, recommended_chapters, segment_guides, segments, translation_cache,
    # translation_status, email
    assert mock_conn.execute.call_count == 39
    assert mock_conn.executemany.call_count >= 1

    # Verify table names are in the SQL
    calls = [str(c) for c in mock_conn.execute.call_args_list]
    all_sql = " ".join(calls)
    assert "documents" in all_sql
    assert "reading_history" in all_sql
    assert "user_reading_history" in all_sql
    assert "favorite_folders" in all_sql
    assert "user_favorite_folders" in all_sql
    assert "favorites" in all_sql
    assert "user_favorites" in all_sql
    assert "wordbook_entries" in all_sql
    assert "user_wordbook_entries" in all_sql
    assert "document_notes" in all_sql
    assert "user_document_notes" in all_sql
    assert "study_sessions" in all_sql
    assert "user_study_sessions" in all_sql
    assert "users" in all_sql
    assert "image_data" in all_sql
    assert "source_type" in all_sql
    assert "repo_id" in all_sql
    assert "author" in all_sql
    assert "dynasty" in all_sql
    assert "category" in all_sql
    assert "source_name" in all_sql
    assert "source_url" in all_sql
    assert "chapter_titles" in all_sql
    assert "chapter_count" in all_sql
    assert "featured_excerpt" in all_sql
    assert "difficulty" in all_sql
    assert "guide_summary" in all_sql
    assert "reading_tip" in all_sql
    assert "recommended_chapters" in all_sql
    assert "segment_guides" in all_sql
    assert "segments" in all_sql
    assert "translation_cache" in all_sql
    assert "translation_status" in all_sql
    assert "owner_user_id" in all_sql
    assert "email" in all_sql
    assert all_sql.index("CREATE TABLE IF NOT EXISTS users") < all_sql.index("CREATE TABLE IF NOT EXISTS user_reading_history")


@pytest.mark.asyncio
async def test_init_pg_database_skips_when_no_pool(monkeypatch):
    """init_pg_database() should skip gracefully if pool is None."""
    monkeypatch.setattr(pg_database, "pool", None)

    # Should not raise
    await pg_database.init_pg_database()


@pytest.mark.asyncio
async def test_init_pg_database_uses_minimal_corpus_upsert_by_default(mock_asyncpg_pool, monkeypatch):
    """Default startup seeding should not overwrite heavy corpus text fields on conflict."""
    monkeypatch.setattr(pg_database, "pool", mock_asyncpg_pool)
    monkeypatch.delenv("PG_CORPUS_SEED_MODE", raising=False)

    await pg_database.init_pg_database()

    acm = mock_asyncpg_pool.acquire.return_value
    mock_conn = acm.__aenter__.return_value
    sql = mock_conn.executemany.call_args_list[0].args[0]

    assert "entity_ids = EXCLUDED.entity_ids" in sql
    assert "original_text = EXCLUDED.original_text" not in sql
    assert "segments = EXCLUDED.segments" not in sql


@pytest.mark.asyncio
async def test_lifespan_creates_and_closes_pool(monkeypatch):
    """pg_lifespan should create pool on enter and close on exit."""
    mock_pool = AsyncMock()
    mock_pool.close = AsyncMock()

    monkeypatch.setenv("DATABASE_URL", "postgresql://test:test@localhost/testdb")

    with patch("core.pg_database.asyncpg") as mock_asyncpg:
        mock_asyncpg.create_pool = AsyncMock(return_value=mock_pool)

        async with pg_database.pg_lifespan():
            # Pool should be set during lifespan
            assert pg_database.pool is mock_pool
            mock_asyncpg.create_pool.assert_called_once_with(
                "postgresql://test:test@localhost/testdb",
                min_size=2,
                max_size=10,
                command_timeout=300,
            )

        # Pool should be closed and cleared after exiting
        mock_pool.close.assert_called_once()
        assert pg_database.pool is None


@pytest.mark.asyncio
async def test_lifespan_without_database_url(monkeypatch):
    """pg_lifespan should yield without creating pool if DATABASE_URL not set."""
    monkeypatch.delenv("DATABASE_URL", raising=False)
    # Reset pool state
    monkeypatch.setattr(pg_database, "pool", None)

    async with pg_database.pg_lifespan():
        assert pg_database.pool is None


# --- SQLite fallback guard (production safety) ---

class TestPreventSqliteFallbackInProduction:
    """Verify the guard correctly blocks SQLite degradation in production."""

    def test_guard_raises_503_in_production(self, monkeypatch):
        from fastapi import HTTPException

        monkeypatch.setenv("APP_ENV", "production")
        with pytest.raises(HTTPException) as exc_info:
            pg_database.prevent_sqlite_fallback_in_production()
        assert exc_info.value.status_code == 503

    def test_guard_raises_503_when_env_missing(self, monkeypatch):
        """Empty environment must be treated as production (fail-safe)."""
        from fastapi import HTTPException

        monkeypatch.delenv("APP_ENV", raising=False)
        monkeypatch.delenv("WENDAO_ENV", raising=False)
        monkeypatch.delenv("ENVIRONMENT", raising=False)
        with pytest.raises(HTTPException) as exc_info:
            pg_database.prevent_sqlite_fallback_in_production()
        assert exc_info.value.status_code == 503

    def test_guard_noop_in_dev(self, monkeypatch):
        monkeypatch.setenv("APP_ENV", "dev")
        # Should not raise
        pg_database.prevent_sqlite_fallback_in_production()

    def test_guard_noop_in_test(self, monkeypatch):
        monkeypatch.setenv("APP_ENV", "test")
        pg_database.prevent_sqlite_fallback_in_production()

    def test_guard_noop_in_development(self, monkeypatch):
        monkeypatch.setenv("APP_ENV", "development")
        pg_database.prevent_sqlite_fallback_in_production()

    def test_guard_noop_in_local(self, monkeypatch):
        monkeypatch.setenv("APP_ENV", "local")
        pg_database.prevent_sqlite_fallback_in_production()

    def test_guard_raises_in_production_even_with_pytest_env(self, monkeypatch):
        """PYTEST_CURRENT_TEST must not bypass the guard when APP_ENV=production."""
        from fastapi import HTTPException

        monkeypatch.setenv("APP_ENV", "production")
        monkeypatch.setenv("PYTEST_CURRENT_TEST", "tests/test_pg_database.py::test_guard_raises_in_production_even_with_pytest_env")
        with pytest.raises(HTTPException) as exc_info:
            pg_database.prevent_sqlite_fallback_in_production()
        assert exc_info.value.status_code == 503

    def test_guard_raises_in_production_when_only_pytest_set(self, monkeypatch):
        """When APP_ENV is missing but PYTEST_CURRENT_TEST is set, guard must still
        raise because empty environment is treated as production."""
        from fastapi import HTTPException

        monkeypatch.delenv("APP_ENV", raising=False)
        monkeypatch.delenv("WENDAO_ENV", raising=False)
        monkeypatch.delenv("ENVIRONMENT", raising=False)
        monkeypatch.setenv("PYTEST_CURRENT_TEST", "tests/test_pg_database.py::test_dummy")
        with pytest.raises(HTTPException) as exc_info:
            pg_database.prevent_sqlite_fallback_in_production()
        assert exc_info.value.status_code == 503
