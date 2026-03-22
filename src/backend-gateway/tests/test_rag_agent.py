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

from agents.rag import RAGAgent


class TestRAGAgentQueryAncientText:
    """测试1: query_ancient_text()返回包含answer和citations的字典"""

    @patch.dict(os.environ, {"MOONSHOT_API_KEY": "test_key"})
    @patch("agents.rag.RAGAgent._init_vectorstore")
    @patch("agents.rag.OpenAI")
    def test_query_returns_dict_with_answer_and_citations(self, mock_openai, mock_init_vs):
        # Mock FAISS检索结果
        mock_doc1 = Mock()
        mock_doc1.page_content = "斗拱是中国古建筑特有的构件..."
        mock_doc1.metadata = {"title": "《营造法式》", "source": "卷三"}

        mock_doc2 = Mock()
        mock_doc2.page_content = "斗拱位于柱与梁之间..."
        mock_doc2.metadata = {"title": "《天工开物》", "source": "第五章"}

        agent = RAGAgent()
        agent.vectorstore = Mock()
        agent.vectorstore.similarity_search.return_value = [mock_doc1, mock_doc2]

        # Mock Kimi API响应
        mock_response = Mock()
        mock_response.choices = [Mock()]
        mock_response.choices[0].message.content = "斗拱是中国古建筑的重要构件，起承重和装饰作用。"
        mock_openai.return_value.chat.completions.create.return_value = mock_response

        result = agent.query_ancient_text("什么是斗拱？")

        assert isinstance(result, dict)
        assert "answer" in result
        assert "citations" in result
        assert isinstance(result["answer"], str)
        assert isinstance(result["citations"], list)


class TestRAGAgentCitations:
    """测试2: citations列表包含title和source字段"""

    @patch.dict(os.environ, {"MOONSHOT_API_KEY": "test_key"})
    @patch("agents.rag.RAGAgent._init_vectorstore")
    @patch("agents.rag.OpenAI")
    def test_citations_have_title_and_source(self, mock_openai, mock_init_vs):
        mock_doc = Mock()
        mock_doc.page_content = "斗拱内容..."
        mock_doc.metadata = {"title": "《营造法式》", "source": "卷三"}

        agent = RAGAgent()
        agent.vectorstore = Mock()
        agent.vectorstore.similarity_search.return_value = [mock_doc]

        mock_response = Mock()
        mock_response.choices = [Mock()]
        mock_response.choices[0].message.content = "测试回答"
        mock_openai.return_value.chat.completions.create.return_value = mock_response

        result = agent.query_ancient_text("测试问题")

        assert len(result["citations"]) > 0
        citation = result["citations"][0]
        assert "title" in citation
        assert "source" in citation
        assert citation["title"] == "《营造法式》"
        assert citation["source"] == "卷三"


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

        result = agent.query_ancient_text("什么是斗拱？")

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


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
