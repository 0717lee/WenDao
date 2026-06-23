# -*- coding: utf-8 -*-
from unittest.mock import AsyncMock, patch

import pytest


def _sample_corpus_record():
    return {
        "id": "11111111-1111-1111-1111-111111111111",
        "title": "《论语》",
        "repo_id": "KR1h0004",
        "author": "孔子弟子",
        "dynasty": "春秋",
        "category": "四书",
        "source_name": "Kanripo",
        "source_url": "https://example.com",
        "chapter_titles": ["学而"],
        "chapter_count": 1,
        "featured_excerpt": "学而时习之",
        "difficulty": "入门",
        "guide_summary": "先读名句。",
        "reading_tip": "边读边看注。",
        "recommended_chapters": ["学而"],
        "segment_guides": [],
        "segments": [{"index": 0, "title": "学而", "text": "学而时习之，不亦说乎？"}],
        "translation_cache": [],
        "translation_status": "none",
        "original_text": "学而时习之不亦说乎",
        "punctuated_text": "学而时习之，不亦说乎？",
        "translated_text": "",
        "entity_ids": [],
        "source_type": "corpus",
    }


@pytest.mark.asyncio
async def test_list_documents_uses_corpus_snapshot_when_sqlite_has_no_corpus():
    from routers import document as document_router

    record = _sample_corpus_record()

    with patch("routers.document.iter_corpus_document_batches", return_value=[[record]]), \
         patch("routers.document._list_documents_sqlite", new=AsyncMock(return_value=[])), \
         patch("routers.document._count_documents_sqlite", new=AsyncMock(return_value=0)), \
         patch("routers.document.get_connection", side_effect=RuntimeError("pg disabled")):
        documents = await document_router._list_documents(limit=10, source_type="corpus", user_id="user-1")
        total = await document_router._count_documents(source_type="corpus", user_id="user-1")

    assert total == 1
    assert documents[0]["id"] == record["id"]
    assert documents[0]["repo_id"] == "KR1h0004"
    assert documents[0]["preview"] == "学而时习之"
    assert documents[0]["has_processed"] is True


@pytest.mark.asyncio
async def test_get_document_by_repo_id_uses_corpus_snapshot_when_databases_miss():
    from routers import document as document_router

    record = _sample_corpus_record()

    with patch("routers.document.iter_corpus_document_batches", return_value=[[record]]), \
         patch("routers.document._get_sqlite_document_row", new=AsyncMock(return_value=None)), \
         patch("routers.document.get_connection", side_effect=RuntimeError("pg disabled")):
        document = await document_router._get_document_by_repo_id("KR1h0004")

    assert document is not None
    assert document["id"] == record["id"]
    assert document["segments"][0]["title"] == "学而"
    assert document["punctuated_text"] == "学而时习之，不亦说乎？"
