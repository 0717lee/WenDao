# -*- coding: utf-8 -*-
"""
聊天API测试
测试SSE流式聊天API和错误处理
"""
import os
import sys
import pytest
import json
from unittest.mock import Mock, patch, AsyncMock, MagicMock

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

# Mock agents before importing routers
sys.modules['agents.router'] = MagicMock()
sys.modules['agents.speech'] = MagicMock()


class TestChatRouterFunctions:
    """测试聊天路由功能"""

    @pytest.mark.asyncio
    @patch.dict(os.environ, {"MOONSHOT_API_KEY": "test_key"})
    @patch("agents.rag.OpenAI")
    async def test_stream_chat_response_generates_events(self, mock_openai):
        """测试1: stream_chat_response生成SSE事件"""
        from routers.chat import stream_chat_response, rag_agent

        # Mock RAG agent response
        rag_agent.query_ancient_text = Mock(return_value={
            "answer": "测试回答",
            "citations": [{"title": "《营造法式》", "source": "卷三"}]
        })

        events = []
        async for event in stream_chat_response("测试问题", rag_agent):
            events.append(event)

        # 验证事件序列
        all_events = "".join(events)
        assert "event: progress" in all_events
        assert "检索古籍" in all_events
        assert "data:" in all_events
        assert "event: citations" in all_events
        assert "event: done" in all_events


    @pytest.mark.asyncio
    @patch.dict(os.environ, {"MOONSHOT_API_KEY": "test_key"})
    @patch("agents.rag.OpenAI")
    async def test_stream_chat_response_error_handling(self, mock_openai):
        """测试2: 错误处理返回error事件"""
        from routers.chat import stream_chat_response, rag_agent

        rag_agent.query_ancient_text = Mock(side_effect=Exception("测试错误"))

        events = []
        async for event in stream_chat_response("测试问题", rag_agent):
            events.append(event)

        all_events = "".join(events)
        assert "event: error" in all_events
        assert "抱歉" in all_events
        assert "测试错误" not in all_events


class TestChatRequestValidation:
    """测试3: ChatRequest模型验证"""

    def test_valid_request(self):
        from models.schemas import ChatRequest

        req = ChatRequest(message="测试问题")
        assert req.message == "测试问题"

    def test_empty_message_fails(self):
        from models.schemas import ChatRequest

        with pytest.raises(Exception):
            ChatRequest(message="")


class TestChatResponseModel:
    """测试4: ChatResponse模型结构"""

    def test_response_with_citations(self):
        from models.schemas import ChatResponse, Citation

        citations = [Citation(title="《营造法式》", source="卷三")]
        resp = ChatResponse(answer="测试回答", citations=citations)

        assert resp.answer == "测试回答"
        assert len(resp.citations) == 1
        assert resp.citations[0].title == "《营造法式》"


class TestSSEEventFormat:
    """测试5: SSE事件格式"""

    @pytest.mark.asyncio
    @patch.dict(os.environ, {"MOONSHOT_API_KEY": "test_key"})
    @patch("agents.rag.OpenAI")
    async def test_sse_event_format(self, mock_openai):
        """验证SSE事件格式符合规范"""
        from routers.chat import stream_chat_response, rag_agent

        rag_agent.query_ancient_text = Mock(return_value={
            "answer": "测试",
            "citations": []
        })

        events = []
        async for event in stream_chat_response("测试", rag_agent):
            events.append(event)

        # 验证SSE格式：每个事件以\n\n结尾
        for event in events:
            assert event.endswith("\n\n")


class TestAnswerContext:
    def test_answer_context_omits_locate_source_when_no_citation(self):
        from routers.chat import _build_answer_context

        payload = _build_answer_context("测试问题", citations=[], related_entities=[])

        assert all(action["id"] != "open-primary" for action in payload["suggestedActions"])


class TestChatRouteErrors:
    @pytest.mark.asyncio
    async def test_chat_route_redacts_streaming_response_errors(self):
        from fastapi import HTTPException
        from models.schemas import ChatRequest
        from routers.chat import chat

        request = MagicMock()
        with patch("routers.chat.StreamingResponse", side_effect=RuntimeError("sensitive failure")):
            with pytest.raises(HTTPException) as exc_info:
                await chat(request, ChatRequest(message="测试"))

        assert exc_info.value.status_code == 500
        assert exc_info.value.detail == "服务器错误，请稍后重试"


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
