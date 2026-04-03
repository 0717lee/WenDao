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
from fastapi import FastAPI
from fastapi.testclient import TestClient
from unittest.mock import AsyncMock, patch, MagicMock

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

# Mock heavy agent modules before imports
sys.modules['agents.router'] = MagicMock()
sys.modules['agents.speech'] = MagicMock()


# ---- Upload Tests ----

class TestProtectedDocumentRoutes:
    def test_upload_and_processing_routes_require_auth(self):
        from routers.document import router

        app = FastAPI()
        app.include_router(router)
        client = TestClient(app)

        upload_response = client.post(
            "/api/v1/documents/upload",
            files=[("file", ("test.jpg", b"fake", "image/jpeg"))],
        )
        text_response = client.put(
            "/api/v1/documents/doc-1/text",
            json={"text": "修订原文"},
        )
        process_response = client.post("/api/v1/documents/process/doc-1")

        assert upload_response.status_code == 401
        assert text_response.status_code == 401
        assert process_response.status_code == 401

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
            result = await upload_document(request=MagicMock(), file=mock_file, _user={"sub": "user-1"})

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
            await upload_document(request=MagicMock(), file=mock_file, _user={"sub": "user-1"})

        assert exc_info.value.status_code == 400
        assert "JPG/PNG/TIFF" in str(exc_info.value.detail)

    @pytest.mark.asyncio
    async def test_upload_rejects_oversized_image(self):
        from fastapi import HTTPException
        from routers.document import upload_document

        mock_file = MagicMock()
        mock_file.content_type = "image/jpeg"
        mock_file.filename = "big.jpg"
        mock_file.read = AsyncMock(return_value=b"x" * (5 * 1024 * 1024 + 1))

        with pytest.raises(HTTPException) as exc_info:
            await upload_document(request=MagicMock(), file=mock_file, _user={"sub": "user-1"})

        assert exc_info.value.status_code == 413


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
            result = await upload_document(request=MagicMock(), file=mock_file, _user={"sub": "user-1"})

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


class TestBookshelfEndpoints:
    """Bookshelf document listing/detail endpoints."""

    @pytest.mark.asyncio
    async def test_list_documents_returns_bookshelf_payload(self):
        from routers.document import list_documents

        with patch("routers.document._list_documents", new=AsyncMock(return_value=[
            {"id": "doc-1", "title": "论语节选", "status": "done", "preview": "学而时习之"},
        ])):
            result = await list_documents(limit=10, _user={"sub": "user-1"})

        assert result["total"] == 1
        assert result["documents"][0]["title"] == "论语节选"

    @pytest.mark.asyncio
    async def test_get_document_returns_detail(self):
        from routers.document import get_document

        with patch("routers.document._get_document", new=AsyncMock(return_value={
            "id": "doc-1",
            "title": "论语节选",
            "original_text": "学而时习之",
            "source_type": "corpus",
        })):
            result = await get_document("doc-1", {"sub": "user-1"})

        assert result["id"] == "doc-1"
        assert result["title"] == "论语节选"

    @pytest.mark.asyncio
    async def test_get_document_not_found_raises_404(self):
        from fastapi import HTTPException
        from routers.document import get_document

        with patch("routers.document._get_document", new=AsyncMock(return_value=None)):
            with pytest.raises(HTTPException) as exc_info:
                await get_document("missing", {"sub": "user-1"})

        assert exc_info.value.status_code == 404

    @pytest.mark.asyncio
    async def test_get_document_hides_private_doc_from_other_user(self):
        from fastapi import HTTPException
        from routers.document import get_document

        with patch("routers.document._get_document", new=AsyncMock(return_value={
            "id": "doc-private",
            "title": "我的私有文档",
            "source_type": "user",
            "owner_user_id": "owner-1",
            "original_text": "私有内容",
        })):
            with pytest.raises(HTTPException) as exc_info:
                await get_document("doc-private", {"sub": "other-user"})

        assert exc_info.value.status_code == 404


class TestDocumentNotes:
    """Document note fetch/save endpoints."""

    @pytest.mark.asyncio
    async def test_get_document_note_returns_saved_note(self):
        from routers.document import get_document_note

        with patch("routers.document._get_document", new=AsyncMock(return_value={"id": "doc-1", "source_type": "corpus"})), \
             patch("routers.document._get_document_note", new=AsyncMock(return_value={
                 "document_id": "doc-1",
                 "note_text": "这里在讲学习与实践。",
                 "updated_at": "2026-03-27T08:00:00",
             })):
            result = await get_document_note("doc-1", {"sub": "user-1"})

        assert result["note_text"] == "这里在讲学习与实践。"

    @pytest.mark.asyncio
    async def test_save_document_note_uses_upsert(self):
        from routers.document import DocumentNoteUpdateRequest, save_document_note

        with patch("routers.document._get_document", new=AsyncMock(return_value={"id": "doc-1", "source_type": "corpus"})), \
             patch("routers.document._save_document_note", new=AsyncMock(return_value={
                 "document_id": "doc-1",
                 "note_text": "课堂讲义重点",
                 "updated_at": "2026-03-27T08:00:00",
             })):
            result = await save_document_note(
                "doc-1",
                DocumentNoteUpdateRequest(note_text="课堂讲义重点"),
                {"sub": "user-1"},
            )

        assert result["document_id"] == "doc-1"
        assert result["note_text"] == "课堂讲义重点"


class TestStudyCards:
    """Study cards endpoint."""

    @pytest.mark.asyncio
    async def test_study_cards_returns_cards_and_quiz(self):
        from routers.document import get_study_cards

        with patch("routers.document._get_document", new=AsyncMock(return_value={
            "id": "doc-1",
            "original_text": "学而时习之，不亦说乎。知之为知之，不知为不知。",
            "punctuated_text": "学而时习之，不亦说乎。知之为知之，不知为不知。",
            "translated_text": "学习后经常复习，是很快乐的。知道就是知道，不知道就是不知道。",
            "source_type": "corpus",
        })):
            result = await get_study_cards("doc-1", {"sub": "user-1"})

        assert len(result["cards"]) >= 1
        assert len(result["quiz"]) >= 1
        assert result["cards"][0]["front"]


class TestStudyProgress:
    """Study progress endpoints."""

    @pytest.mark.asyncio
    async def test_get_study_progress_returns_summary(self):
        from routers.document import get_study_progress

        with patch("routers.document._get_document", new=AsyncMock(return_value={"id": "doc-1", "source_type": "corpus"})), \
             patch("routers.document._get_study_progress", new=AsyncMock(return_value={
                 "document_id": "doc-1",
                 "sessions_count": 2,
                 "mastery_rate": 0.75,
                 "last_reviewed_at": "2026-03-27T10:00:00",
             })):
            result = await get_study_progress("doc-1", {"sub": "user-1"})

        assert result["sessions_count"] == 2
        assert result["mastery_rate"] == 0.75

    @pytest.mark.asyncio
    async def test_save_study_progress_persists_session(self):
        from routers.document import StudyProgressUpdateRequest, save_study_progress

        with patch("routers.document._get_document", new=AsyncMock(return_value={"id": "doc-1", "source_type": "corpus"})), \
             patch("routers.document._save_study_session", new=AsyncMock(return_value={
                 "document_id": "doc-1",
                 "completed_cards": 5,
                 "total_cards": 5,
                 "mastered_cards": 4,
                 "review_again_cards": 1,
             })):
            result = await save_study_progress(
                "doc-1",
                StudyProgressUpdateRequest(
                    completed_cards=5,
                    total_cards=5,
                    mastered_cards=4,
                    review_again_cards=1,
                ),
                {"sub": "user-1"},
            )

        assert result["mastered_cards"] == 4


class TestCitationResolution:
    """Citation resolution/recommendation endpoints."""

    @pytest.mark.asyncio
    async def test_resolve_citation_returns_match(self):
        from routers.document import resolve_citation

        with patch("routers.document._resolve_citation_reference", new=AsyncMock(return_value={
            "document_id": "doc-1",
            "title": "论语节选",
            "anchor_text": "学而时习之",
            "match_score": 42,
        })):
            result = await resolve_citation(title="论语", source="学而篇", excerpt="学而时习之")

        assert result["match"]["document_id"] == "doc-1"
        assert result["match"]["anchor_text"] == "学而时习之"

    @pytest.mark.asyncio
    async def test_recommendations_returns_documents(self):
        from routers.document import get_recommendations

        with patch("routers.document._get_recommendations", new=AsyncMock(return_value=[
            {"id": "doc-2", "title": "孟子节选", "recommendation_score": 9, "reasons": ["与你的阅读记录有关"]},
        ])):
            result = await get_recommendations(document_id="doc-1", limit=5, _user={"sub": "user-1"})

        assert result["total"] == 1
        assert result["documents"][0]["title"] == "孟子节选"


class TestCatalogEndpoints:
    """Full-source catalog browsing/import endpoints."""

    @pytest.mark.asyncio
    async def test_list_catalog_returns_entries(self):
        from routers.document import list_catalog

        with patch("routers.document._list_catalog_entries", new=AsyncMock(return_value={
            "entries": [
                {"repo_id": "KR1h0004", "title": "《论语》", "imported": True, "imported_document_id": "doc-1"},
            ],
            "total": 1,
        })):
            result = await list_catalog(limit=20, _user={"sub": "user-1"})

        assert result["total"] == 1
        assert result["entries"][0]["repo_id"] == "KR1h0004"

    @pytest.mark.asyncio
    async def test_import_catalog_document_returns_existing_doc(self):
        from routers.document import import_catalog_document

        with patch("routers.document._get_document_by_repo_id", new=AsyncMock(return_value={"id": "doc-1", "title": "《论语》"})):
            result = await import_catalog_document("KR1h0004", {"sub": "user-1"})

        assert result["imported"] is False
        assert result["document"]["id"] == "doc-1"

    @pytest.mark.asyncio
    async def test_import_catalog_document_supports_wikisource_repo_id(self):
        from routers.document import import_catalog_document

        with patch("routers.document._get_document_by_repo_id", new=AsyncMock(side_effect=[None, {"id": "ws-doc-1", "title": "《古文观止》"}])), \
             patch("routers.document.build_wikisource_record", return_value={"id": "ws-doc-1", "repo_id": "WS:古文觀止", "title": "《古文观止》"}), \
             patch("routers.document._upsert_document_record", new=AsyncMock()):
            result = await import_catalog_document("WS:古文觀止", {"sub": "user-1"})

        assert result["imported"] is True
        assert result["document"]["id"] == "ws-doc-1"


class TestTranslationCacheEndpoint:
    """Corpus translation-cache endpoint."""

    @pytest.mark.asyncio
    async def test_generate_translation_cache_returns_existing_cache(self):
        from routers.document import TranslationCacheRequest, generate_translation_cache

        existing_document = {
            "id": "doc-1",
            "source_type": "corpus",
            "segments": [{"index": 0, "title": "学而", "text": "学而时习之"}],
            "translated_text": "学习之后，要经常温习。",
            "translation_status": "full",
            "translation_cache": [{"segment_index": 0, "title": "学而", "translated": "学习之后，要经常温习。"}],
        }

        with patch("routers.document._get_document", new=AsyncMock(return_value=existing_document)):
            result = await generate_translation_cache(MagicMock(), "doc-1", TranslationCacheRequest(max_segments=2), {"sub": "user-1"})

        assert result["generated"] is False
        assert result["document"]["translation_cache"][0]["title"] == "学而"

    @pytest.mark.asyncio
    async def test_generate_translation_cache_returns_progress_payload(self):
        from routers.document import TranslationCacheRequest, generate_translation_cache

        document = {
            "id": "doc-1",
            "source_type": "corpus",
            "segments": [{"index": 0, "title": "学而第一", "text": "学而时习之"}],
            "translation_cache": [],
        }
        updated_document = {
            "id": "doc-1",
            "source_type": "corpus",
            "translation_cache": [{"segment_index": 0, "title": "学而第一", "translated": "学习后要反复练习。"}],
            "translation_status": "full",
            "translated_text": "学习后要反复练习。",
        }

        with patch("routers.document._get_document", new=AsyncMock(return_value=document)), \
             patch("routers.document._translate_document_segments", new=AsyncMock(return_value=(updated_document, 1, {"translated_segments": 1, "total_segments": 1, "is_complete": True}))):
            result = await generate_translation_cache(
                MagicMock(),
                "doc-1",
                TranslationCacheRequest(strategy="next", max_segments=2),
                {"sub": "user-1"},
            )

        assert result["generated"] is True
        assert result["generated_segments"] == 1
        assert result["progress"]["is_complete"] is True
        assert result["document"]["translation_status"] == "full"


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
