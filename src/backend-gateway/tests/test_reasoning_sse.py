"""
test_reasoning_sse.py - AI-03 Reasoning SSE Event Tests

Tests the SSE reasoning event emission in chat streaming pipeline.
Verifies event format, step ordering, status transitions, and error handling.
"""
import json
import sys
import pytest
from unittest.mock import patch, MagicMock, AsyncMock

# Mock heavy dependencies BEFORE importing routers.chat
# These modules fail without API keys at module level
_mock_intent = MagicMock()
_mock_rag = MagicMock()
_mock_speech = MagicMock()

sys.modules.setdefault("agents.router", MagicMock(IntentRouter=MagicMock(return_value=_mock_intent)))
sys.modules.setdefault("agents.rag", MagicMock(RAGAgent=MagicMock(return_value=_mock_rag)))
sys.modules.setdefault("agents.speech", MagicMock(SpeechAgent=MagicMock(return_value=_mock_speech)))

from routers.chat import sse_reasoning, stream_chat_response


class TestSseReasoningHelper:
    """Tests for the sse_reasoning() SSE event formatter."""

    def test_reasoning_event_format(self):
        """SSE reasoning event has correct format: event: reasoning + JSON data."""
        result = sse_reasoning("retrieval", "检索古籍知识库", "running")
        assert result.startswith("event: reasoning\n")
        assert "data: " in result
        assert result.endswith("\n\n")

    def test_reasoning_event_required_fields(self):
        """Reasoning event data contains step, label, status fields."""
        result = sse_reasoning("retrieval", "检索古籍知识库", "complete", 0.35)
        data_line = result.split("data: ")[1].strip()
        data = json.loads(data_line)
        assert data["step"] == "retrieval"
        assert data["label"] == "检索古籍知识库"
        assert data["status"] == "complete"
        assert data["duration"] == 0.35

    def test_reasoning_event_without_duration(self):
        """Reasoning event omits duration when not provided."""
        result = sse_reasoning("generation", "生成通俗解读", "running")
        data_line = result.split("data: ")[1].strip()
        data = json.loads(data_line)
        assert "duration" not in data

    def test_reasoning_event_duration_rounded(self):
        """Duration is rounded to 2 decimal places."""
        result = sse_reasoning("retrieval", "检索", "complete", 1.23456789)
        data_line = result.split("data: ")[1].strip()
        data = json.loads(data_line)
        assert data["duration"] == 1.23


class TestStreamChatResponse:
    """Tests for the stream_chat_response() SSE generator."""

    @pytest.mark.asyncio
    async def test_reasoning_steps_in_correct_order(self):
        """Reasoning steps emitted in order: retrieval -> entity_extraction -> knowledge_linking -> generation."""
        mock_rag = MagicMock()
        mock_rag.query_ancient_text.return_value = {
            "answer": "test",
            "citations": [],
            "related_entities": [],
        }

        with patch("routers.chat.get_db", side_effect=Exception("skip db")):
            steps_seen = []
            async for event in stream_chat_response("test query", mock_rag):
                if event.startswith("event: reasoning"):
                    data_line = event.split("data: ")[1].strip()
                    data = json.loads(data_line)
                    if data["status"] == "running":
                        steps_seen.append(data["step"])

            assert steps_seen == [
                "retrieval",
                "entity_extraction",
                "knowledge_linking",
                "generation",
            ]

    @pytest.mark.asyncio
    async def test_reasoning_status_transitions(self):
        """Each step transitions from running to complete."""
        mock_rag = MagicMock()
        mock_rag.query_ancient_text.return_value = {
            "answer": "x",
            "citations": [],
            "related_entities": [],
        }

        with patch("routers.chat.get_db", side_effect=Exception("skip db")):
            step_statuses = {}
            async for event in stream_chat_response("q", mock_rag):
                if event.startswith("event: reasoning"):
                    data = json.loads(event.split("data: ")[1].strip())
                    step = data["step"]
                    step_statuses.setdefault(step, []).append(data["status"])

            for step, statuses in step_statuses.items():
                assert statuses == ["running", "complete"], f"{step} had {statuses}"

    @pytest.mark.asyncio
    async def test_reasoning_interleaved_with_content(self):
        """Reasoning events are interleaved with content data events."""
        mock_rag = MagicMock()
        mock_rag.query_ancient_text.return_value = {
            "answer": "AB",
            "citations": [],
            "related_entities": [],
        }

        with patch("routers.chat.get_db", side_effect=Exception("skip db")):
            event_types = []
            async for event in stream_chat_response("q", mock_rag):
                if event.startswith("event: reasoning"):
                    event_types.append("reasoning")
                elif event.startswith("data: ") and "content" in event:
                    event_types.append("content")

            assert "reasoning" in event_types
            assert "content" in event_types
            # Content should come after some reasoning events
            first_content = event_types.index("content")
            assert first_content > 0

    @pytest.mark.asyncio
    async def test_error_emits_error_event(self):
        """Exception during processing emits SSE error event."""
        mock_rag = MagicMock()
        mock_rag.query_ancient_text.side_effect = RuntimeError("LLM unavailable")

        events = []
        async for event in stream_chat_response("q", mock_rag):
            events.append(event)

        error_events = [e for e in events if e.startswith("event: error")]
        assert len(error_events) >= 1
        data = json.loads(error_events[0].split("data: ")[1].strip())
        assert "message" in data

    @pytest.mark.asyncio
    async def test_empty_query_returns_reasoning_events(self):
        """Even an empty query triggers reasoning events before error or response."""
        mock_rag = MagicMock()
        mock_rag.query_ancient_text.return_value = {
            "answer": "",
            "citations": [],
            "related_entities": [],
        }

        with patch("routers.chat.get_db", side_effect=Exception("skip db")):
            reasoning_events = []
            async for event in stream_chat_response("", mock_rag):
                if event.startswith("event: reasoning"):
                    reasoning_events.append(event)

            # Should still emit reasoning events for the pipeline stages
            assert len(reasoning_events) >= 4  # at least 4 running events
