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
    def test_public_document_routes_allow_anonymous_catalog_browsing(self):
        from routers.document import router

        app = FastAPI()
        app.include_router(router)
        client = TestClient(app)

        with patch("routers.document._list_documents", new=AsyncMock(return_value=[
            {
                "id": "corpus-1",
                "title": "《论语》",
                "source_type": "corpus",
                "preview": "学而时习之",
                "status": "done",
                "current_paragraph": 0,
                "total_paragraphs": 0,
                "has_processed": True,
                "has_note": False,
            }
        ])), patch("routers.document._count_documents", new=AsyncMock(return_value=1)), \
             patch("routers.document._list_catalog_entries", new=AsyncMock(return_value={
                 "entries": [{"repo_id": "KR1h0004", "title": "《论语》", "imported": True, "imported_document_id": "corpus-1"}],
                 "total": 1,
             })):
            documents = client.get("/api/v1/documents?limit=12&source_type=corpus")
            catalog = client.get("/api/v1/documents/catalog?limit=5&offset=0&primary_only=true")

        assert documents.status_code == 200
        assert documents.json()["total"] == 1
        assert documents.json()["documents"][0]["id"] == "corpus-1"

        assert catalog.status_code == 200
        assert catalog.json()["total"] == 1
        assert catalog.json()["entries"][0]["repo_id"] == "KR1h0004"

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

    @pytest.mark.asyncio
    async def test_get_document_falls_back_to_sqlite_when_pg_misses(self):
        from routers import document as document_router

        pg_conn = AsyncMock()
        pg_conn.fetchrow = AsyncMock(return_value=None)
        pg_ctx = MagicMock()
        pg_ctx.__aenter__ = AsyncMock(return_value=pg_conn)
        pg_ctx.__aexit__ = AsyncMock(return_value=False)

        sqlite_cursor = AsyncMock()
        sqlite_cursor.fetchone = AsyncMock(return_value={
            "id": "doc-corpus",
            "title": "《史记》",
            "repo_id": "KR2a0001",
            "author": "司马迁",
            "dynasty": "西汉",
            "category": "史书",
            "source_name": "Kanripo",
            "source_url": "https://example.com",
            "chapter_titles": "[]",
            "chapter_count": 14,
            "featured_excerpt": "太史公曰",
            "difficulty": "进阶",
            "guide_summary": "通过人物进入历史。",
            "reading_tip": "先读本纪和列传。",
            "recommended_chapters": "[]",
            "segment_guides": "[]",
            "segments": '[{"title":"项羽本纪","text":"太史公曰"}]',
            "translation_cache": "[]",
            "translation_status": "none",
            "original_text": "太史公曰",
            "punctuated_text": "太史公曰。",
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

        assert document["title"] == "《史记》"
        assert document["original_text"] == "太史公曰"

    @pytest.mark.asyncio
    async def test_list_documents_merges_sqlite_corpus_with_pg_user_docs(self):
        from routers import document as document_router

        pg_conn = AsyncMock()
        pg_conn.fetch = AsyncMock(return_value=[
            {
                "id": "user-doc-1",
                "title": "我的上传",
                "source_type": "user",
                "preview": "上传内容摘要",
                "status": "done",
                "current_paragraph": 0,
                "total_paragraphs": 0,
                "has_processed": True,
                "has_note": False,
            }
        ])
        pg_ctx = MagicMock()
        pg_ctx.__aenter__ = AsyncMock(return_value=pg_conn)
        pg_ctx.__aexit__ = AsyncMock(return_value=False)

        with patch("routers.document._list_documents_sqlite", new=AsyncMock(return_value=[
            {
                "id": "corpus-1",
                "title": "《论语》",
                "source_type": "corpus",
                "preview": "学而时习之",
                "status": "done",
                "current_paragraph": 0,
                "total_paragraphs": 0,
                "has_processed": True,
                "has_note": False,
            }
        ])), patch("routers.document.get_connection", return_value=pg_ctx):
            documents = await document_router._list_documents(limit=10, user_id="user-1")

        assert [doc["id"] for doc in documents] == ["corpus-1", "user-doc-1"]

    @pytest.mark.asyncio
    async def test_count_documents_includes_sqlite_corpus_when_pg_is_available(self):
        from routers import document as document_router

        pg_conn = AsyncMock()
        pg_conn.fetchval = AsyncMock(return_value=2)
        pg_ctx = MagicMock()
        pg_ctx.__aenter__ = AsyncMock(return_value=pg_conn)
        pg_ctx.__aexit__ = AsyncMock(return_value=False)

        async def fake_count_sqlite(source_type=None, user_id=None):
            return 100 if source_type == "corpus" else 0

        with patch("routers.document._count_documents_sqlite", new=AsyncMock(side_effect=fake_count_sqlite)), \
             patch("routers.document.get_connection", return_value=pg_ctx):
            total = await document_router._count_documents(user_id="user-1")

        assert total == 102

    @pytest.mark.asyncio
    async def test_list_catalog_entries_primary_only_uses_curated_works(self):
        from routers import document as document_router

        curated_entries = [
            {"repo_id": "KR1h0004", "title": "《论语》", "author": "孔子弟子", "dynasty": "春秋", "category": "四书"},
            {"repo_id": "KR2a0001", "title": "《史记》", "author": "司马迁", "dynasty": "西汉", "category": "史书"},
        ]

        with patch("routers.document.CURATED_WORKS", curated_entries), \
             patch("routers.document._list_documents", new=AsyncMock(return_value=[
                 {"id": "doc-1", "repo_id": "KR1h0004", "title": "《论语》", "author": "孔子弟子", "dynasty": "春秋", "category": "四书", "source_type": "corpus"},
                 {"id": "doc-2", "repo_id": "KR2a0001", "title": "《史记》", "author": "司马迁", "dynasty": "西汉", "category": "史书", "source_type": "corpus"},
             ])):
            result = await document_router._list_catalog_entries(primary_only=True, limit=20)

        assert result["total"] == 2
        assert result["entries"][0]["imported"] is True
        assert result["entries"][0]["imported_document_id"] in {"doc-1", "doc-2"}
        assert {entry["family"] for entry in result["entries"]} == {"经部", "史部"}

    @pytest.mark.asyncio
    async def test_get_document_by_repo_id_falls_back_to_sqlite_when_pg_misses(self):
        from routers import document as document_router

        pg_conn = AsyncMock()
        pg_conn.fetchrow = AsyncMock(return_value=None)
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
            "segments": '[{"title":"学而","text":"学而时习之"}]',
            "translation_cache": "[]",
            "translation_status": "none",
            "original_text": "学而时习之",
            "punctuated_text": "学而时习之。",
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
            document = await document_router._get_document_by_repo_id("KR1h0004")

        assert document["repo_id"] == "KR1h0004"
        assert document["title"] == "《论语》"
