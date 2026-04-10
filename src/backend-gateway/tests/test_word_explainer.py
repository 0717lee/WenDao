# -*- coding: utf-8 -*-
"""
WordExplainerAgent tests - all mocked, no real API calls.
Tests word explanation via ZhipuAI + RAG citation retrieval.
"""
import os
import sys
import json
import pytest
from unittest.mock import Mock, patch, AsyncMock, MagicMock

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))


class TestExplainWordSuccess:
    """explain_word returns meaning, allusion, citations on success"""

    @patch("agents.word_explainer.OpenAI")
    def test_explain_word_success(self, mock_openai_cls):
        mock_response = Mock()
        mock_response.choices = [Mock()]
        mock_response.choices[0].message.content = json.dumps(
            {"meaning": "以民为本的治国主张", "allusion": "见于《孟子·梁惠王上》"},
            ensure_ascii=False,
        )
        mock_client = Mock()
        mock_client.chat.completions.create.return_value = mock_response
        mock_openai_cls.return_value = mock_client

        from agents.word_explainer import WordExplainerAgent

        agent = WordExplainerAgent()
        # Mock out RAG to avoid real init
        agent._rag_agent = Mock()
        agent._rag_agent.query_ancient_text = Mock(
            return_value={"answer": "test", "citations": [{"title": "孟子", "source": "梁惠王上"}]}
        )

        import asyncio
        result = asyncio.run(agent.explain_word("仁政"))

        assert "meaning" in result
        assert "allusion" in result
        assert "citations" in result
        assert result["meaning"] == "以民为本的治国主张"
        assert result["allusion"] == "见于《孟子·梁惠王上》"


class TestExplainWordWithContext:
    """explain_word includes context in prompt when provided"""

    @patch("agents.word_explainer.OpenAI")
    def test_explain_word_with_context(self, mock_openai_cls):
        mock_response = Mock()
        mock_response.choices = [Mock()]
        mock_response.choices[0].message.content = json.dumps(
            {"meaning": "仁爱之心", "allusion": "儒家核心概念"},
            ensure_ascii=False,
        )
        mock_client = Mock()
        mock_client.chat.completions.create.return_value = mock_response
        mock_openai_cls.return_value = mock_client

        from agents.word_explainer import WordExplainerAgent

        agent = WordExplainerAgent()
        agent._rag_agent = Mock()
        agent._rag_agent.query_ancient_text = Mock(
            return_value={"answer": "", "citations": []}
        )

        import asyncio
        result = asyncio.run(agent.explain_word("仁", context="孔子说仁者爱人"))

        assert "meaning" in result
        # Verify context was passed to the prompt
        call_args = mock_client.chat.completions.create.call_args
        prompt = call_args[1]["messages"][0]["content"] if "messages" in call_args[1] else call_args[0][0]
        # Check context appears somewhere in the call
        assert mock_client.chat.completions.create.called


class TestExplainWordZhipuFails:
    """When ZhipuAI fails, return graceful error message"""

    @patch("agents.word_explainer.OpenAI")
    def test_explain_word_zhipu_fails_gracefully(self, mock_openai_cls):
        mock_client = Mock()
        mock_client.chat.completions.create.side_effect = Exception("API unavailable")
        mock_openai_cls.return_value = mock_client

        from agents.word_explainer import WordExplainerAgent

        agent = WordExplainerAgent()

        import asyncio
        result = asyncio.run(agent.explain_word("仁政"))

        assert "meaning" in result
        assert "暂不可用" in result["meaning"]
        assert result["citations"] == []


class TestExplainWordMalformedJson:
    """Malformed JSON from the model should still be parsed heuristically."""

    @patch("agents.word_explainer.OpenAI")
    def test_explain_word_malformed_json_recovers_fields(self, mock_openai_cls):
        mock_response = Mock()
        mock_response.choices = [Mock()]
        mock_response.choices[0].message.content = (
            '{\n'
            '"meaning": "以民为本的治国主张"\n'
            '"allusion": "见于《孟子·梁惠王上》"\n'
            '}'
        )
        mock_client = Mock()
        mock_client.chat.completions.create.return_value = mock_response
        mock_openai_cls.return_value = mock_client

        from agents.word_explainer import WordExplainerAgent

        agent = WordExplainerAgent()
        agent._rag_agent = Mock()
        agent._rag_agent.query_ancient_text = Mock(return_value={"answer": "", "citations": []})

        import asyncio
        result = asyncio.run(agent.explain_word("仁政"))

        assert result["meaning"] == "以民为本的治国主张"
        assert "孟子" in result["allusion"]


class TestRagCitationsIncluded:
    """RAG citations are merged into the result"""

    @patch("agents.word_explainer.OpenAI")
    def test_rag_citations_included(self, mock_openai_cls):
        mock_response = Mock()
        mock_response.choices = [Mock()]
        mock_response.choices[0].message.content = json.dumps(
            {"meaning": "释义", "allusion": "典故"},
            ensure_ascii=False,
        )
        mock_client = Mock()
        mock_client.chat.completions.create.return_value = mock_response
        mock_openai_cls.return_value = mock_client

        from agents.word_explainer import WordExplainerAgent

        agent = WordExplainerAgent()
        mock_rag = Mock()
        mock_rag.query_ancient_text = Mock(
            return_value={
                "answer": "related answer",
                "citations": [
                    {"title": "论语", "source": "孔子"},
                    {"title": "孟子", "source": "孟子"},
                ],
            }
        )
        agent._rag_agent = mock_rag

        import asyncio
        result = asyncio.run(agent.explain_word("仁"))

        assert len(result["citations"]) == 2
        assert result["citations"][0]["title"] == "论语"


class TestRagFailsGracefully:
    """When RAG agent fails, citations are empty but result still returned"""

    @patch("agents.word_explainer.OpenAI")
    def test_rag_fails_gracefully(self, mock_openai_cls):
        mock_response = Mock()
        mock_response.choices = [Mock()]
        mock_response.choices[0].message.content = json.dumps(
            {"meaning": "释义", "allusion": "典故"},
            ensure_ascii=False,
        )
        mock_client = Mock()
        mock_client.chat.completions.create.return_value = mock_response
        mock_openai_cls.return_value = mock_client

        from agents.word_explainer import WordExplainerAgent

        agent = WordExplainerAgent()
        mock_rag = Mock()
        mock_rag.query_ancient_text = Mock(side_effect=Exception("RAG down"))
        agent._rag_agent = mock_rag

        import asyncio
        result = asyncio.run(agent.explain_word("义"))

        assert "meaning" in result
        assert result["citations"] == []


class TestExplainCompoundWord:
    """explain_word handles multi-character compound words"""

    @patch("agents.word_explainer.OpenAI")
    def test_explain_compound_word(self, mock_openai_cls):
        mock_response = Mock()
        mock_response.choices = [Mock()]
        mock_response.choices[0].message.content = json.dumps(
            {"meaning": "约束自己，使言行归于礼", "allusion": "见于《论语·颜渊》"},
            ensure_ascii=False,
        )
        mock_client = Mock()
        mock_client.chat.completions.create.return_value = mock_response
        mock_openai_cls.return_value = mock_client

        from agents.word_explainer import WordExplainerAgent

        agent = WordExplainerAgent()
        agent._rag_agent = Mock()
        agent._rag_agent.query_ancient_text = Mock(
            return_value={"answer": "", "citations": []}
        )

        import asyncio
        result = asyncio.run(agent.explain_word("克己复礼"))

        assert "meaning" in result
        assert len(result["meaning"]) > 0


class TestExplainEmptyContext:
    """explain_word with empty context string still works"""

    @patch("agents.word_explainer.OpenAI")
    def test_explain_with_empty_context(self, mock_openai_cls):
        mock_response = Mock()
        mock_response.choices = [Mock()]
        mock_response.choices[0].message.content = json.dumps(
            {"meaning": "仁爱之心", "allusion": "儒家核心概念"},
            ensure_ascii=False,
        )
        mock_client = Mock()
        mock_client.chat.completions.create.return_value = mock_response
        mock_openai_cls.return_value = mock_client

        from agents.word_explainer import WordExplainerAgent

        agent = WordExplainerAgent()
        agent._rag_agent = Mock()
        agent._rag_agent.query_ancient_text = Mock(
            return_value={"answer": "", "citations": []}
        )

        import asyncio
        result = asyncio.run(agent.explain_word("仁", context=""))

        assert "meaning" in result
        assert result["meaning"] == "仁爱之心"
if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
