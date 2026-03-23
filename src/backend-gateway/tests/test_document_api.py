# -*- coding: utf-8 -*-
"""
Document API Tests
Tests for upload, process (SSE), and schema validation.
All external dependencies (OCR, Translator, DB) are mocked.
Avoids importing main.py to prevent ONNX Runtime DLL crash on Windows.
"""
import os
import sys
import re
import json
import pytest
from unittest.mock import AsyncMock, patch, MagicMock

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

# Mock heavy agent modules before imports
sys.modules['agents.router'] = MagicMock()
sys.modules['agents.speech'] = MagicMock()


# ---- Upload Tests ----

class TestUploadDocumentSuccess:
    """Test successful document upload with OCR."""

    @pytest.mark.asyncio
    async def test_upload_document_success(self):
        """Upload a valid JPEG, mock OCR returns text + confidence."""
        from routers.document import upload_document, ocr_agent

        # Mock OCR agent
        ocr_agent.recognize = AsyncMock(return_value={
            "text": "斗拱之制，出一跳曰华拱",
            "confidence": 0.95,
        })

        # Mock UploadFile
        mock_file = MagicMock()
        mock_file.content_type = "image/jpeg"
        mock_file.filename = "ancient_text.jpg"
        mock_file.read = AsyncMock(return_value=b"fake_image_bytes")

        with patch("routers.document._create_document", new_callable=AsyncMock) as mock_create:
            result = await upload_document(file=mock_file)

        assert result["text"] == "斗拱之制，出一跳曰华拱"
        assert result["confidence"] == 0.95
        assert "document_id" in result
        assert result["image_url"].startswith("data:image/jpeg;base64,")
        ocr_agent.recognize.assert_awaited_once()
        mock_create.assert_awaited_once()


class TestUploadInvalidFormat:
    """Test upload rejection for unsupported file types."""

    @pytest.mark.asyncio
    async def test_upload_invalid_format(self):
        """Uploading a PDF should raise HTTPException 400."""
        from fastapi import HTTPException
        from routers.document import upload_document

        mock_file = MagicMock()
        mock_file.content_type = "application/pdf"
        mock_file.filename = "doc.pdf"

        with pytest.raises(HTTPException) as exc_info:
            await upload_document(file=mock_file)

        assert exc_info.value.status_code == 400
        assert "JPG/PNG/TIFF" in str(exc_info.value.detail)


class TestUploadReturnsDocumentId:
    """Test that upload returns a valid UUID document_id."""

    @pytest.mark.asyncio
    async def test_upload_returns_valid_uuid(self):
        """document_id should be a valid UUID4."""
        from routers.document import upload_document, ocr_agent

        ocr_agent.recognize = AsyncMock(return_value={
            "text": "测试文字",
            "confidence": 0.88,
        })

        mock_file = MagicMock()
        mock_file.content_type = "image/png"
        mock_file.filename = "test.png"
        mock_file.read = AsyncMock(return_value=b"fake_image")

        with patch("routers.document._create_document", new_callable=AsyncMock):
            result = await upload_document(file=mock_file)

        uuid_pattern = re.compile(
            r"^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$"
        )
        assert uuid_pattern.match(result["document_id"]), \
            f"document_id is not a valid UUID4: {result['document_id']}"


# ---- SSE Process Tests ----

class TestProcessDocumentSSE:
    """Test SSE streaming for document processing."""

    @pytest.mark.asyncio
    async def test_process_returns_sse_events(self):
        """Process endpoint generates progress + done SSE events."""
        from routers.document import entity_extractor, stream_process, translator_agent

        translator_agent.punctuate_and_translate = AsyncMock(return_value={
            "punctuated": "斗拱之制，出一跳曰华拱。",
            "translated": "斗拱的构造规制，伸出一跳称为华拱。",
        })
        entity_extractor.extract_entities = MagicMock(return_value=["dougong"])

        mock_document = {
            "id": "test-doc-id",
            "title": "测试文档",
            "original_text": "斗拱之制出一跳曰华拱"
        }

        with patch("routers.document._get_document", new=AsyncMock(return_value=mock_document)), \
             patch("routers.document._update_document_results", new=AsyncMock()):
            events = []
            async for event in stream_process("test-doc-id"):
                events.append(event)

        all_events = "".join(events)
        assert "event: progress" in all_events
        assert "event: done" in all_events
        assert "斗拱之制，出一跳曰华拱。" in all_events
        assert "斗拱的构造规制" in all_events

    @pytest.mark.asyncio
    async def test_process_document_not_found(self):
        """Process with unknown doc_id returns error event."""
        from routers.document import stream_process

        with patch("routers.document._get_document", new=AsyncMock(return_value=None)):
            events = []
            async for event in stream_process("nonexistent-id"):
                events.append(event)

        all_events = "".join(events)
        assert "event: error" in all_events
        assert "文档不存在" in all_events

    @pytest.mark.asyncio
    async def test_process_handles_translator_error(self):
        """Process returns error event when translator fails."""
        from routers.document import stream_process, translator_agent

        translator_agent.punctuate_and_translate = AsyncMock(
            side_effect=RuntimeError("API timeout")
        )

        mock_document = {
            "id": "test-doc-id",
            "title": "测试文档",
            "original_text": "测试文本"
        }

        with patch("routers.document._get_document", new=AsyncMock(return_value=mock_document)):
            events = []
            async for event in stream_process("test-doc-id"):
                events.append(event)

        all_events = "".join(events)
        assert "event: error" in all_events
        assert "处理失败" in all_events


# ---- Schema Tests ----

class TestDocumentSchemas:
    """Test Pydantic schema validation."""

    def test_document_upload_response(self):
        from models.schemas import DocumentUploadResponse
        resp = DocumentUploadResponse(
            document_id="abc-123", text="测试文字", confidence=0.95, image_url="data:image/png;base64,ZmFrZQ=="
        )
        assert resp.document_id == "abc-123"
        assert resp.image_url is not None

    def test_document_process_response(self):
        from models.schemas import DocumentProcessResponse
        resp = DocumentProcessResponse(
            punctuated="标点文本。", translated="翻译文本。"
        )
        assert resp.punctuated == "标点文本。"

    def test_word_explain_request_defaults(self):
        from models.schemas import WordExplainRequest
        req = WordExplainRequest(word="仁")
        assert req.word == "仁"
        assert req.context == ""

    def test_word_explain_response(self):
        from models.schemas import WordExplainResponse
        resp = WordExplainResponse(
            meaning="爱人", allusion="克己复礼为仁", citations=[]
        )
        assert resp.meaning == "爱人"


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
