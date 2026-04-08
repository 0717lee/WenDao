# -*- coding: utf-8 -*-
"""
Document router path regression tests.
"""
import os
import sys
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from unittest.mock import AsyncMock, MagicMock, patch

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

# Mock heavy agent modules before imports
sys.modules['agents.router'] = MagicMock()
sys.modules['agents.speech'] = MagicMock()


class TestDocumentRouterPaths:
    def test_static_document_routes_are_not_shadowed_by_document_id(self):
        from routers.document import router
        from core.auth import require_auth

        app = FastAPI()
        app.include_router(router)
        app.dependency_overrides[require_auth] = lambda: {"sub": "user-1"}
        client = TestClient(app)

        with patch("routers.document._get_recommendations", new=AsyncMock(return_value=[])), \
             patch("routers.document._resolve_citation_reference", new=AsyncMock(return_value=None)):
            recommendations = client.get("/api/v1/documents/recommendations?limit=4")
            citation = client.get("/api/v1/documents/resolve-citation?title=%E8%AE%BA%E8%AF%AD&source=%E5%AD%A6%E8%80%8C%E7%AF%87")

        assert recommendations.status_code == 200
        assert recommendations.json()["documents"] == []
        assert citation.status_code == 200
        assert citation.json() == {"match": None}

    @pytest.mark.asyncio
    async def test_get_document_hydrates_public_corpus_from_sqlite_when_pg_only_has_metadata(self):
        from routers import document as document_router

        pg_conn = AsyncMock()
        pg_conn.fetchrow = AsyncMock(return_value={
            "id": "doc-corpus",
            "title": "《论语》",
            "repo_id": "KR1h0004",
            "author": "孔子弟子",
            "dynasty": "春秋",
            "category": "四书",
            "source_name": "Kanripo",
            "source_url": "https://example.com",
            "chapter_titles": "[]",
            "chapter_count": 20,
            "featured_excerpt": "学而时习之",
            "difficulty": "入门",
            "guide_summary": "先读名句。",
            "reading_tip": "边读边看注。",
            "recommended_chapters": "[]",
            "segment_guides": "[]",
            "segments": "[]",
            "translation_cache": "[]",
            "translation_status": "none",
            "original_text": "",
            "punctuated_text": "",
            "translated_text": "",
            "ocr_confidence": 1.0,
            "image_data": None,
            "entity_ids": "[]",
            "status": "done",
            "source_type": "corpus",
            "owner_user_id": None,
            "created_at": None,
            "updated_at": None,
        })
        pg_ctx = MagicMock()
        pg_ctx.__aenter__ = AsyncMock(return_value=pg_conn)
        pg_ctx.__aexit__ = AsyncMock(return_value=False)

        sqlite_cursor = AsyncMock()
        sqlite_cursor.fetchone = AsyncMock(return_value={
            "id": "doc-corpus",
            "title": "《论语》",
            "repo_id": "KR1h0004",
            "author": "孔子弟子",
            "dynasty": "春秋",
            "category": "四书",
            "source_name": "Kanripo",
            "source_url": "https://example.com",
            "chapter_titles": "[]",
            "chapter_count": 20,
            "featured_excerpt": "学而时习之",
            "difficulty": "入门",
            "guide_summary": "先读名句。",
            "reading_tip": "边读边看注。",
            "recommended_chapters": "[]",
            "segment_guides": "[]",
            "segments": '[{"title":"学而","text":"学而时习之，不亦说乎？"}]',
            "translation_cache": "[]",
            "translation_status": "none",
            "original_text": "学而时习之不亦说乎",
            "punctuated_text": "学而时习之，不亦说乎？",
            "translated_text": "",
            "ocr_confidence": 1.0,
            "image_data": None,
            "entity_ids": "[]",
            "status": "done",
            "source_type": "corpus",
            "owner_user_id": None,
            "created_at": None,
            "updated_at": None,
        })
        sqlite_db = AsyncMock()
        sqlite_db.execute = AsyncMock(return_value=sqlite_cursor)
        sqlite_ctx = MagicMock()
        sqlite_ctx.__aenter__ = AsyncMock(return_value=sqlite_db)
        sqlite_ctx.__aexit__ = AsyncMock(return_value=False)

        with patch("routers.document.get_connection", return_value=pg_ctx), \
             patch("routers.document.get_db", return_value=sqlite_ctx):
            document = await document_router._get_document("doc-corpus")

        assert document["original_text"] == "学而时习之不亦说乎"
        assert document["punctuated_text"] == "学而时习之，不亦说乎？"
        assert document["segments"][0]["title"] == "学而"
