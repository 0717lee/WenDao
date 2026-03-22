# -*- coding: utf-8 -*-
"""
OCR Entity Linking Tests
Tests for entity extraction integration in the document processing SSE pipeline.
Verifies that stream_process extracts entities, emits SSE events, persists entity_ids,
and handles failures gracefully.
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


async def _collect_sse_events(gen):
    """Collect all SSE events from an async generator into a list of (event_type, data) tuples."""
    events = []
    async for event_str in gen:
        for line in event_str.strip().split("\n"):
            if line.startswith("event: "):
                event_type = line[len("event: "):]
            elif line.startswith("data: "):
                data = json.loads(line[len("data: "):])
                events.append((event_type, data))
    return events


class TestStreamProcessExtractsEntities:
    """stream_process extracts entities after translation and emits SSE 'entities' event."""

    @pytest.mark.asyncio
    async def test_entities_event_emitted_with_ids(self):
        from routers.document import stream_process

        mock_cm_fetch, _ = _make_mock_connection(
            fetchrow_return={"original_text": "论语学而篇孔子曰学而时习之不亦说乎"}
        )
        mock_cm_update, mock_conn_update = _make_mock_connection()

        call_count = [0]

        def conn_factory():
            call_count[0] += 1
            if call_count[0] == 1:
                return mock_cm_fetch
            return mock_cm_update

        with patch("routers.document.get_connection", side_effect=conn_factory), \
             patch("routers.document.translator_agent") as mock_translator, \
             patch("routers.document.entity_extractor") as mock_extractor:

            mock_translator.punctuate_and_translate = AsyncMock(
                return_value={"punctuated": "论语，学而篇。", "translated": "The Analerta, Learning chapter."}
            )
            mock_extractor.extract_entities.return_value = ["kongzi", "lunyu"]

            events = await _collect_sse_events(stream_process("test-doc-id"))

        # Check that an "entities" SSE event was emitted with entity_ids
        entity_events = [e for e in events if e[0] == "entities"]
        assert len(entity_events) == 1
        assert entity_events[0][1]["entity_ids"] == ["kongzi", "lunyu"]
        assert entity_events[0][1]["count"] == 2


class TestEntityIdsPersisted:
    """entity_ids are persisted to documents table via UPDATE query."""

    @pytest.mark.asyncio
    async def test_entity_ids_written_to_db(self):
        from routers.document import stream_process

        mock_cm_fetch, _ = _make_mock_connection(
            fetchrow_return={"original_text": "论语学而篇孔子曰学而时习之"}
        )
        mock_cm_update, mock_conn_update = _make_mock_connection()
        mock_cm_entity, mock_conn_entity = _make_mock_connection()

        call_count = [0]

        def conn_factory():
            call_count[0] += 1
            if call_count[0] == 1:
                return mock_cm_fetch
            elif call_count[0] == 2:
                return mock_cm_update
            return mock_cm_entity

        with patch("routers.document.get_connection", side_effect=conn_factory), \
             patch("routers.document.translator_agent") as mock_translator, \
             patch("routers.document.entity_extractor") as mock_extractor:

            mock_translator.punctuate_and_translate = AsyncMock(
                return_value={"punctuated": "论语，学而篇。", "translated": "Translation."}
            )
            mock_extractor.extract_entities.return_value = ["kongzi", "lunyu"]

            events = await _collect_sse_events(stream_process("test-doc-id"))

        # Verify entity_ids UPDATE was called (third connection)
        entity_update_call = mock_conn_entity.execute.call_args
        assert entity_update_call is not None
        sql_arg = entity_update_call[0][0]
        assert "entity_ids" in sql_arg
        assert "UPDATE" in sql_arg


class TestShortTextSkipsExtraction:
    """Empty or short text (<10 chars) skips entity extraction."""

    @pytest.mark.asyncio
    async def test_short_text_no_extraction(self):
        from routers.document import stream_process

        mock_cm_fetch, _ = _make_mock_connection(
            fetchrow_return={"original_text": "abc"}  # very short text
        )
        mock_cm_update, _ = _make_mock_connection()

        call_count = [0]

        def conn_factory():
            call_count[0] += 1
            if call_count[0] == 1:
                return mock_cm_fetch
            return mock_cm_update

        with patch("routers.document.get_connection", side_effect=conn_factory), \
             patch("routers.document.translator_agent") as mock_translator, \
             patch("routers.document.entity_extractor") as mock_extractor:

            mock_translator.punctuate_and_translate = AsyncMock(
                return_value={"punctuated": "a", "translated": "a"}
            )
            mock_extractor.extract_entities.return_value = []

            events = await _collect_sse_events(stream_process("test-doc-id"))

        # Entity extractor should NOT have been called for short combined text
        mock_extractor.extract_entities.assert_not_called()
        # No entities event
        entity_events = [e for e in events if e[0] == "entities"]
        assert len(entity_events) == 0


class TestExtractionFailureNonFatal:
    """Entity extraction failure does not break the processing pipeline."""

    @pytest.mark.asyncio
    async def test_extraction_error_still_yields_done(self):
        from routers.document import stream_process

        mock_cm_fetch, _ = _make_mock_connection(
            fetchrow_return={"original_text": "论语学而篇孔子曰学而时习之不亦说乎"}
        )
        mock_cm_update, _ = _make_mock_connection()

        call_count = [0]

        def conn_factory():
            call_count[0] += 1
            if call_count[0] == 1:
                return mock_cm_fetch
            return mock_cm_update

        with patch("routers.document.get_connection", side_effect=conn_factory), \
             patch("routers.document.translator_agent") as mock_translator, \
             patch("routers.document.entity_extractor") as mock_extractor:

            mock_translator.punctuate_and_translate = AsyncMock(
                return_value={"punctuated": "论语，学而篇。", "translated": "Translation here."}
            )
            # Entity extraction raises an exception
            mock_extractor.extract_entities.side_effect = RuntimeError("API timeout")

            events = await _collect_sse_events(stream_process("test-doc-id"))

        # Pipeline should still complete with a "done" event
        done_events = [e for e in events if e[0] == "done"]
        assert len(done_events) == 1
        # No entities event should be emitted
        entity_events = [e for e in events if e[0] == "entities"]
        assert len(entity_events) == 0


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
