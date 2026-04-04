# -*- coding: utf-8 -*-
"""Tests for reader sentence explanation SSE flow."""

import os
import sys
from unittest.mock import AsyncMock, patch

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))


class TestProtectedSentenceExplainRoute:
    def test_sentence_explain_route_requires_auth(self):
        from routers.document import router

        app = FastAPI()
        app.include_router(router)
        client = TestClient(app)

        response = client.post(
            "/api/v1/documents/doc-1/sentence-explain",
            json={"sentence": "学而时习之，不亦说乎？"},
        )

        assert response.status_code == 401


class TestSentenceExplainStream:
    @pytest.mark.asyncio
    async def test_stream_sentence_explanation_returns_ordered_sections(self):
        from routers.document import SentenceExplainRequest, sentence_explainer, stream_sentence_explanation

        sentence_explainer.generate_gloss = AsyncMock(return_value={
            "gloss": [{"token": "学", "explanation": "学习"}],
            "rhetoric": "反问句式，加强语气。",
            "follow_up": "为什么孔子把“习”放在“学”之后？",
        })
        sentence_explainer.translate_sentence = AsyncMock(return_value="学习之后经常温习，不也是快乐的吗？")
        sentence_explainer.retrieve_references = AsyncMock(return_value=[
            {"title": "《论语》", "source": "学而篇", "excerpt": "学而时习之，不亦说乎？"},
        ])

        request = SentenceExplainRequest(
            sentence="学而时习之，不亦说乎？",
            context="学而时习之，不亦说乎？有朋自远方来，不亦乐乎？",
            chapter_title="学而篇",
        )
        document = {"id": "doc-1", "title": "《论语》", "source_type": "corpus"}

        events = []
        async for event in stream_sentence_explanation(document, request):
            events.append(event)

        payload = "".join(events)

        assert "event: section" in payload
        assert '"section": "gloss"' in payload
        assert '"section": "translation"' in payload
        assert '"section": "references"' in payload
        assert '"section": "follow_up"' in payload
        assert "学习之后经常温习" in payload
        assert "学而篇" in payload
        assert "event: done" in payload

    @pytest.mark.asyncio
    async def test_stream_sentence_explanation_returns_error_for_empty_sentence(self):
        from routers.document import SentenceExplainRequest, stream_sentence_explanation

        request = SentenceExplainRequest(sentence="学", context="", chapter_title="")
        request.sentence = "   "
        events = []
        async for event in stream_sentence_explanation({"id": "doc-1", "title": "《论语》"}, request):
            events.append(event)

        payload = "".join(events)
        assert "event: error" in payload
        assert "句子不能为空" in payload
