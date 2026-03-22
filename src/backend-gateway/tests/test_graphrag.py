# -*- coding: utf-8 -*-
"""
GraphRAG integration tests.
Tests RAG agent related_entities and SSE entities event.
"""
import json
import os
import sys
import pytest
from unittest.mock import Mock, patch, AsyncMock

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))


class TestRAGAgentRelatedEntities:
    """Test that query_ancient_text returns related_entities."""

    @patch.dict(os.environ, {"MOONSHOT_API_KEY": "test_key"})
    @patch("agents.rag.RAGAgent._init_vectorstore")
    @patch("agents.rag.OpenAI")
    def test_returns_related_entities_key(self, mock_openai, mock_init_vs):
        from agents.rag import RAGAgent

        agent = RAGAgent()
        agent.vectorstore = None

        mock_response = Mock()
        mock_response.choices = [Mock()]
        mock_response.choices[0].message.content = "test answer"
        mock_openai.return_value.chat.completions.create.return_value = mock_response

        result = agent.query_ancient_text("test query")

        assert "related_entities" in result
        assert isinstance(result["related_entities"], list)

    @patch.dict(os.environ, {"MOONSHOT_API_KEY": "test_key"})
    @patch("agents.rag.RAGAgent._init_vectorstore")
    @patch("agents.rag.OpenAI")
    def test_related_entities_from_docs_and_query(self, mock_openai, mock_init_vs):
        from agents.rag import RAGAgent

        agent = RAGAgent()

        # Mock vectorstore with docs mentioning entities
        mock_doc = Mock()
        mock_doc.page_content = "孔子编撰了论语"
        mock_doc.metadata = {"title": "test", "source": "test"}
        agent.vectorstore = Mock()
        agent.vectorstore.similarity_search.return_value = [mock_doc]

        # Mock entity extractor to return predictable results
        mock_extractor = Mock()
        mock_extractor.extract_entities = Mock(
            side_effect=lambda text: ["kongzi", "lunyu"] if "孔子" in text else ["mengzi"] if "孟子" in text else []
        )
        agent._entity_extractor = mock_extractor

        mock_response = Mock()
        mock_response.choices = [Mock()]
        mock_response.choices[0].message.content = "test answer"
        mock_openai.return_value.chat.completions.create.return_value = mock_response

        result = agent.query_ancient_text("孟子的思想")

        entities = result["related_entities"]
        # From doc: kongzi, lunyu; from query: mengzi
        assert "kongzi" in entities
        assert "lunyu" in entities
        assert "mengzi" in entities

    @patch.dict(os.environ, {"MOONSHOT_API_KEY": "test_key"})
    @patch("agents.rag.RAGAgent._init_vectorstore")
    @patch("agents.rag.OpenAI")
    def test_error_returns_empty_related_entities(self, mock_openai, mock_init_vs):
        from agents.rag import RAGAgent

        agent = RAGAgent()
        agent.vectorstore = None

        # Make API call fail
        mock_openai.return_value.chat.completions.create.side_effect = Exception("API Error")

        result = agent.query_ancient_text("test")

        assert result["related_entities"] == []

    @patch.dict(os.environ, {"MOONSHOT_API_KEY": "test_key"})
    @patch("agents.rag.RAGAgent._init_vectorstore")
    @patch("agents.rag.OpenAI")
    def test_related_entities_are_valid_ids(self, mock_openai, mock_init_vs):
        """related_entities must be a subset of known entity IDs."""
        from agents.rag import RAGAgent

        agent = RAGAgent()
        agent.vectorstore = None

        # Mock extractor that only returns known IDs
        mock_extractor = Mock()
        mock_extractor.extract_entities = Mock(return_value=["kongzi", "lunyu"])
        agent._entity_extractor = mock_extractor

        mock_response = Mock()
        mock_response.choices = [Mock()]
        mock_response.choices[0].message.content = "answer"
        mock_openai.return_value.chat.completions.create.return_value = mock_response

        result = agent.query_ancient_text("test")

        # All returned IDs should be strings
        for eid in result["related_entities"]:
            assert isinstance(eid, str)


class TestSSEEntitiesEvent:
    """Test that SSE stream includes entities event."""

    @pytest.mark.asyncio
    @patch.dict(os.environ, {"MOONSHOT_API_KEY": "test_key", "ZHIPUAI_API_KEY": "test_key"})
    async def test_sse_includes_entities_event(self):
        # Patch module-level agent constructors before importing chat module
        with patch("agents.router.IntentRouter.__init__", return_value=None), \
             patch("agents.rag.RAGAgent.__init__", return_value=None), \
             patch("agents.speech.SpeechAgent.__init__", return_value=None):
            # Force reimport to avoid cached module with failed init
            if "routers.chat" in sys.modules:
                del sys.modules["routers.chat"]
            from routers.chat import stream_chat_response

        mock_rag = Mock()
        mock_rag.query_ancient_text.return_value = {
            "answer": "test",
            "citations": [],
            "related_entities": ["kongzi", "lunyu"],
        }

        events = []
        with patch("routers.chat.get_db") as mock_get_db:
            mock_ctx = AsyncMock()
            mock_get_db.return_value = mock_ctx
            mock_ctx.__aenter__ = AsyncMock(return_value=AsyncMock())
            mock_ctx.__aexit__ = AsyncMock(return_value=False)

            async for event in stream_chat_response("test", mock_rag):
                events.append(event)

        # Find entities event
        entities_events = [e for e in events if e.startswith("event: entities")]
        assert len(entities_events) == 1

        # Parse the data
        data_line = entities_events[0].split("\n")[1]
        data = json.loads(data_line.replace("data: ", ""))
        assert "entity_ids" in data
        assert "kongzi" in data["entity_ids"]
        assert "lunyu" in data["entity_ids"]

    @pytest.mark.asyncio
    @patch.dict(os.environ, {"MOONSHOT_API_KEY": "test_key", "ZHIPUAI_API_KEY": "test_key"})
    async def test_sse_omits_entities_when_empty(self):
        with patch("agents.router.IntentRouter.__init__", return_value=None), \
             patch("agents.rag.RAGAgent.__init__", return_value=None), \
             patch("agents.speech.SpeechAgent.__init__", return_value=None):
            if "routers.chat" in sys.modules:
                del sys.modules["routers.chat"]
            from routers.chat import stream_chat_response

        mock_rag = Mock()
        mock_rag.query_ancient_text.return_value = {
            "answer": "test",
            "citations": [],
            "related_entities": [],
        }

        events = []
        with patch("routers.chat.get_db") as mock_get_db:
            mock_ctx = AsyncMock()
            mock_get_db.return_value = mock_ctx
            mock_ctx.__aenter__ = AsyncMock(return_value=AsyncMock())
            mock_ctx.__aexit__ = AsyncMock(return_value=False)

            async for event in stream_chat_response("test", mock_rag):
                events.append(event)

        entities_events = [e for e in events if e.startswith("event: entities")]
        assert len(entities_events) == 0

    @pytest.mark.asyncio
    @patch.dict(os.environ, {"MOONSHOT_API_KEY": "test_key", "ZHIPUAI_API_KEY": "test_key"})
    async def test_sse_entities_before_done(self):
        """entities event should appear before done event."""
        with patch("agents.router.IntentRouter.__init__", return_value=None), \
             patch("agents.rag.RAGAgent.__init__", return_value=None), \
             patch("agents.speech.SpeechAgent.__init__", return_value=None):
            if "routers.chat" in sys.modules:
                del sys.modules["routers.chat"]
            from routers.chat import stream_chat_response

        mock_rag = Mock()
        mock_rag.query_ancient_text.return_value = {
            "answer": "t",
            "citations": [{"title": "t", "source": "s"}],
            "related_entities": ["kongzi"],
        }

        events = []
        with patch("routers.chat.get_db") as mock_get_db:
            mock_ctx = AsyncMock()
            mock_get_db.return_value = mock_ctx
            mock_ctx.__aenter__ = AsyncMock(return_value=AsyncMock())
            mock_ctx.__aexit__ = AsyncMock(return_value=False)

            async for event in stream_chat_response("test", mock_rag):
                events.append(event)

        event_types = []
        for e in events:
            if e.startswith("event: "):
                event_types.append(e.split("\n")[0].replace("event: ", ""))

        assert "entities" in event_types
        assert "done" in event_types
        entities_idx = event_types.index("entities")
        done_idx = event_types.index("done")
        assert entities_idx < done_idx


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
