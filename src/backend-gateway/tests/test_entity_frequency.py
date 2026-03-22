# -*- coding: utf-8 -*-
"""
Entity Frequency Aggregation Tests
Tests for GET /api/v1/reader/entity-frequency endpoint.
Verifies frequency aggregation from reading_history + documents join,
correct sorting, empty cases, and error handling.
"""
import os
import sys
import json
import pytest
from unittest.mock import AsyncMock, patch, MagicMock

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

# Mock heavy agent modules before imports
sys.modules['agents.router'] = MagicMock()
sys.modules['agents.speech'] = MagicMock()


def _make_mock_connection(fetch_return=None, fetchrow_return=None, execute_return="UPDATE 1", fetchval_return=None):
    """Helper: build a mock async context manager mimicking get_connection()."""
    mock_conn = AsyncMock()
    mock_conn.fetch = AsyncMock(return_value=fetch_return or [])
    mock_conn.fetchrow = AsyncMock(return_value=fetchrow_return)
    mock_conn.execute = AsyncMock(return_value=execute_return)
    mock_conn.fetchval = AsyncMock(return_value=fetchval_return)

    mock_cm = MagicMock()
    mock_cm.__aenter__ = AsyncMock(return_value=mock_conn)
    mock_cm.__aexit__ = AsyncMock(return_value=False)
    return mock_cm, mock_conn


class TestEntityFrequencySorted:
    """GET /api/v1/reader/entity-frequency returns sorted frequency list."""

    @pytest.mark.asyncio
    async def test_returns_sorted_frequencies(self):
        from routers.reader import get_entity_frequency

        # Simulated DB result: kongzi appears in 2 docs, lunyu and mengzi in 1 each
        fake_rows = [
            {"entity_id": "kongzi", "freq": 2},
            {"entity_id": "lunyu", "freq": 1},
            {"entity_id": "mengzi", "freq": 1},
        ]
        mock_cm, mock_conn = _make_mock_connection(fetch_return=fake_rows, fetchval_return=2)

        with patch("routers.reader.get_connection", return_value=mock_cm):
            result = await get_entity_frequency()

        assert result["total_documents"] == 2
        assert len(result["frequencies"]) == 3
        assert result["frequencies"][0]["entity_id"] == "kongzi"
        assert result["frequencies"][0]["count"] == 2
        assert result["frequencies"][1]["count"] == 1


class TestEntityFrequencyEmpty:
    """endpoint returns empty list when no documents have entity_ids."""

    @pytest.mark.asyncio
    async def test_returns_empty_when_no_entities(self):
        from routers.reader import get_entity_frequency

        mock_cm, _ = _make_mock_connection(fetch_return=[], fetchval_return=0)

        with patch("routers.reader.get_connection", return_value=mock_cm):
            result = await get_entity_frequency()

        assert result["frequencies"] == []
        assert result["total_documents"] == 0


class TestEntityFrequencyMultipleDocs:
    """frequency counts are correct when multiple documents share entities."""

    @pytest.mark.asyncio
    async def test_shared_entities_counted_correctly(self):
        from routers.reader import get_entity_frequency

        # kongzi in 3 docs, lunyu in 2, mengzi in 1
        fake_rows = [
            {"entity_id": "kongzi", "freq": 3},
            {"entity_id": "lunyu", "freq": 2},
            {"entity_id": "mengzi", "freq": 1},
        ]
        mock_cm, _ = _make_mock_connection(fetch_return=fake_rows, fetchval_return=3)

        with patch("routers.reader.get_connection", return_value=mock_cm):
            result = await get_entity_frequency()

        assert result["total_documents"] == 3
        freqs = {f["entity_id"]: f["count"] for f in result["frequencies"]}
        assert freqs["kongzi"] == 3
        assert freqs["lunyu"] == 2
        assert freqs["mengzi"] == 1


class TestEntityFrequencyDbError:
    """endpoint handles database errors gracefully (returns empty)."""

    @pytest.mark.asyncio
    async def test_db_error_returns_empty(self):
        from routers.reader import get_entity_frequency

        mock_cm = MagicMock()
        mock_cm.__aenter__ = AsyncMock(side_effect=RuntimeError("DB down"))
        mock_cm.__aexit__ = AsyncMock(return_value=False)

        with patch("routers.reader.get_connection", return_value=mock_cm):
            result = await get_entity_frequency()

        assert result["frequencies"] == []
        assert result["total_documents"] == 0


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
