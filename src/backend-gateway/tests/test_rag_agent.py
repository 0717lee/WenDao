# -*- coding: utf-8 -*-
"""
RAG Agent测试
测试古籍RAG查询逻辑和降级处理
"""
import os
import sys
import pytest
from unittest.mock import Mock, patch

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import agents.rag as rag_module
from agents.rag import RAGAgent


class TestRAGAgentQueryAncientText:
    """测试1: query_ancient_text()返回包含answer和citations的字典"""

    @patch.dict(os.environ, {"MOONSHOT_API_KEY": "test_key"})
    @patch("agents.rag.RAGAgent._init_vectorstore")
    @patch("agents.rag.OpenAI")
    def test_query_returns_dict_with_answer_and_citations(self, mock_openai, mock_init_vs):
        # Mock FAISS检索结果
        mock_doc1 = Mock()
        mock_doc1.page_content = "仁政是孟子政治思想的重要概念，强调以民为本。"
        mock_doc1.metadata = {"title": "《孟子》", "source": "梁惠王上"}

        mock_doc2 = Mock()
        mock_doc2.page_content = "民为贵，社稷次之，君为轻。"
        mock_doc2.metadata = {"title": "《孟子》", "source": "尽心下"}

        agent = RAGAgent()
        agent.vectorstore = Mock()
        agent.vectorstore.similarity_search.return_value = [mock_doc1, mock_doc2]

        # Mock Kimi API响应
        mock_response = Mock()
        mock_response.choices = [Mock()]
        mock_response.choices[0].message.content = "仁政是孟子提出的治国理念，核心是先安百姓，再谈国家治理。"
        mock_openai.return_value.chat.completions.create.return_value = mock_response

        result = agent.query_ancient_text("什么是仁政？")

        assert isinstance(result, dict)
        assert "answer" in result
        assert "citations" in result
        assert isinstance(result["answer"], str)
        assert isinstance(result["citations"], list)


class TestRAGAgentProviderSelection:
    """RAG LLM provider can be switched away from Moonshot"""

    @patch.dict(
        os.environ,
        {
            "RAG_PROVIDER": "deepseek",
            "DEEPSEEK_API_KEY": "deepseek-key",
            "MOONSHOT_API_KEY": "moonshot-key",
        },
    )
    @patch("agents.rag.RAGAgent._init_vectorstore")
    @patch("agents.rag.OpenAI")
    def test_deepseek_provider_uses_deepseek_client_and_model(self, mock_openai, mock_init_vs):
        mock_response = Mock()
        mock_response.choices = [Mock()]
        mock_response.choices[0].message.content = "DeepSeek回答"
        mock_openai.return_value.chat.completions.create.return_value = mock_response

        agent = RAGAgent()
        agent.vectorstore = None
        result = agent.query_ancient_text("仁政是什么？", include_related_entities=False)

        assert result["answer"] == "DeepSeek回答"
        mock_openai.assert_called_once_with(
            api_key="deepseek-key",
            base_url="https://api.deepseek.com",
        )
        mock_openai.return_value.chat.completions.create.assert_called_once()
        assert mock_openai.return_value.chat.completions.create.call_args.kwargs["model"] == "deepseek-chat"

    @patch.dict(
        os.environ,
        {
            "RAG_PROVIDER": "zhipu",
            "ZHIPUAI_API_KEY": "zhipu-key",
            "MOONSHOT_API_KEY": "moonshot-key",
        },
    )
    @patch("agents.rag.RAGAgent._init_vectorstore")
    @patch("agents.rag.OpenAI")
    def test_zhipu_provider_uses_zhipu_client_and_model(self, mock_openai, mock_init_vs):
        mock_response = Mock()
        mock_response.choices = [Mock()]
        mock_response.choices[0].message.content = "智谱回答"
        mock_openai.return_value.chat.completions.create.return_value = mock_response

        agent = RAGAgent()
        agent.vectorstore = None
        result = agent.query_ancient_text("仁政是什么？", include_related_entities=False)

        assert result["answer"] == "智谱回答"
        mock_openai.assert_called_once_with(
            api_key="zhipu-key",
            base_url="https://open.bigmodel.cn/api/paas/v4",
        )
        assert mock_openai.return_value.chat.completions.create.call_args.kwargs["model"] == "glm-4-flash"

class TestRAGAgentCitations:
    """测试2: citations列表包含title和source字段"""

    @patch.dict(os.environ, {"MOONSHOT_API_KEY": "test_key"})
    @patch("agents.rag.RAGAgent._init_vectorstore")
    @patch("agents.rag.OpenAI")
    def test_citations_have_title_and_source(self, mock_openai, mock_init_vs):
        mock_doc = Mock()
        mock_doc.page_content = "仁政是以民为本的政治主张。"
        mock_doc.metadata = {"title": "《孟子》", "source": "梁惠王上"}

        agent = RAGAgent()
        agent.vectorstore = Mock()
        agent.vectorstore.similarity_search.return_value = [mock_doc]

        mock_response = Mock()
        mock_response.choices = [Mock()]
        mock_response.choices[0].message.content = "测试回答"
        mock_openai.return_value.chat.completions.create.return_value = mock_response

        result = agent.query_ancient_text("仁政是什么")

        assert len(result["citations"]) > 0
        citation = result["citations"][0]
        assert "title" in citation
        assert "source" in citation
        assert citation["title"] == "《孟子》"
        assert citation["source"] == "梁惠王上"


class TestRAGAgentFallback:
    """测试3: 当FAISS索引不存在时降级到纯LLM模式"""

    @patch.dict(os.environ, {"MOONSHOT_API_KEY": "test_key"})
    @patch("agents.rag.RAGAgent._init_vectorstore")
    @patch("agents.rag.OpenAI")
    def test_fallback_to_llm_when_no_faiss(self, mock_openai, mock_init_vs):
        agent = RAGAgent()
        agent.vectorstore = None  # 模拟FAISS不存在

        mock_response = Mock()
        mock_response.choices = [Mock()]
        mock_response.choices[0].message.content = "基于自身知识的回答"
        mock_openai.return_value.chat.completions.create.return_value = mock_response

        result = agent.query_ancient_text("什么是仁政？")

        # 应该返回有效结果，即使没有检索到文档
        assert result["answer"] == "基于自身知识的回答"
        assert result["citations"] == []  # 无检索结果时citations为空


class TestRAGAgentSystemPrompt:
    """测试4: 系统prompt包含"古籍智解"和"通俗易懂"关键词"""

    @patch.dict(os.environ, {"MOONSHOT_API_KEY": "test_key"})
    @patch("agents.rag.RAGAgent._init_vectorstore")
    def test_system_prompt_keywords(self, mock_init_vs):
        from agents.rag import SYSTEM_PROMPT

        assert "古籍智解" in SYSTEM_PROMPT
        assert "通俗易懂" in SYSTEM_PROMPT
        assert "150" in SYSTEM_PROMPT and "字" in SYSTEM_PROMPT


class TestRAGAgentGrounding:
    @patch.dict(os.environ, {"MOONSHOT_API_KEY": "test_key"})
    @patch("agents.rag.RAGAgent._init_vectorstore")
    @patch("agents.rag.OpenAI")
    def test_query_drops_irrelevant_retrieval_context(self, mock_openai, mock_init_vs):
        mock_doc = Mock()
        mock_doc.page_content = "采菊东篱下，悠然见南山。"
        mock_doc.metadata = {"title": "《陶渊明集》", "source": "饮酒"}

        agent = RAGAgent()
        agent.vectorstore = Mock()
        agent.vectorstore.similarity_search.return_value = [mock_doc]

        mock_response = Mock()
        mock_response.choices = [Mock()]
        mock_response.choices[0].message.content = "你好，我可以帮你读懂古文。"
        mock_openai.return_value.chat.completions.create.return_value = mock_response

        result = agent.query_ancient_text("你好")

        assert result["answer"] == "你好，我可以帮你读懂古文。"
        assert result["citations"] == []


class TestRAGAgentErrorHandling:
    """测试5: 错误处理返回中文消息"""

    @patch.dict(os.environ, {"MOONSHOT_API_KEY": "test_key"})
    @patch("agents.rag.RAGAgent._init_vectorstore")
    @patch("agents.rag.OpenAI")
    def test_error_returns_chinese_message(self, mock_openai, mock_init_vs):
        agent = RAGAgent()
        agent.vectorstore = None

        # Mock API调用失败
        mock_openai.return_value.chat.completions.create.side_effect = Exception("API Error")

        result = agent.query_ancient_text("测试问题")

        # 应该返回中文错误消息
        assert "抱歉" in result["answer"] or "暂时不可用" in result["answer"]


class TestFaissStartupProbe:
    def test_inspect_faiss_index_compatibility_uses_lightweight_backend_probe(self, monkeypatch, tmp_path):
        (tmp_path / "index.faiss").write_bytes(b"faiss")
        (tmp_path / "index.pkl").write_bytes(b"pickle")

        mock_probe = Mock(return_value=(True, None))
        monkeypatch.setattr(rag_module.os.path, "abspath", lambda _path: str(tmp_path))
        monkeypatch.setattr(
            rag_module,
            "_load_index_metadata",
            lambda _db_path: {"embedding_backend": "fastembed"},
        )
        monkeypatch.setattr("core.embeddings.embedding_backend_available", mock_probe)

        result = rag_module.inspect_faiss_index_compatibility()

        assert result["status"] == "ok"
        assert result["active_backend"] == "fastembed"
        mock_probe.assert_called_once_with("fastembed")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
