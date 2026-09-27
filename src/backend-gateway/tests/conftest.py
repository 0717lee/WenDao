"""
共享pytest fixtures
提供mock对象和测试数据，用于隔离外部依赖
"""
import pytest
from unittest.mock import AsyncMock, MagicMock


@pytest.fixture(autouse=True)
def _default_test_env(monkeypatch):
    """默认把测试环境标记为 test，使 SQLite 降级守卫不触发。

    需要验证生产行为的测试可显式 monkeypatch.setenv("APP_ENV", "production")
    或 monkeypatch.delenv("APP_ENV", raising=False) 来覆盖此默认。
    """
    monkeypatch.setenv("APP_ENV", "test")


@pytest.fixture
def mock_asyncpg_pool():
    """
    Mock asyncpg connection pool.
    pool.acquire() in asyncpg returns a sync object that implements
    __aenter__/__aexit__ (not a coroutine). We replicate that pattern.
    """
    mock_conn = AsyncMock()
    mock_conn.execute = AsyncMock(return_value="CREATE TABLE")
    mock_conn.executemany = AsyncMock(return_value=None)
    mock_conn.fetchrow = AsyncMock(return_value={"id": "test-uuid", "title": "test"})
    mock_conn.fetchval = AsyncMock(return_value=1)
    mock_conn.fetch = AsyncMock(return_value=[])

    # Build an async context manager that acquire() returns synchronously
    acm = MagicMock()
    acm.__aenter__ = AsyncMock(return_value=mock_conn)
    acm.__aexit__ = AsyncMock(return_value=False)

    mock_pool = MagicMock()
    mock_pool.acquire = MagicMock(return_value=acm)
    mock_pool.close = AsyncMock()

    return mock_pool
