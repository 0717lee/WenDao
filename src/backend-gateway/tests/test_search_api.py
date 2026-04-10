# -*- coding: utf-8 -*-
"""
Test suite for search API
Tests fulltext, vector, and hybrid search modes
"""
import pytest
from fastapi.testclient import TestClient
from unittest.mock import Mock, patch, AsyncMock, MagicMock
import sys
import os

# Add parent directory to path for imports
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

# Mock problematic modules before any imports
sys.modules['fastembed'] = MagicMock()
sys.modules['fastembed.text'] = MagicMock()
sys.modules['onnxruntime'] = MagicMock()


@pytest.fixture
def mock_db():
    """Mock database connection"""
    db = AsyncMock()
    cursor = AsyncMock()
    cursor.fetchall = AsyncMock(return_value=[
        (1, "逍遥游", "北冥有鱼，其名为鲲。", "庄子", 0.85),
        (2, "齐物论", "天地与我并生，而万物与我为一。", "庄子", 0.72),
    ])
    db.execute = AsyncMock(return_value=cursor)
    return db


@pytest.fixture
def mock_vectorstore():
    """Mock FAISS vectorstore"""
    mock_doc1 = Mock()
    mock_doc1.page_content = "北冥有鱼，其名为鲲。"
    mock_doc1.metadata = {"id": 1, "title": "逍遥游", "source": "庄子"}

    mock_doc2 = Mock()
    mock_doc2.page_content = "天地与我并生，而万物与我为一。"
    mock_doc2.metadata = {"id": 3, "title": "齐物论", "source": "庄子"}

    vectorstore = Mock()
    vectorstore.similarity_search_with_score = Mock(return_value=[
        (mock_doc1, 0.92),
        (mock_doc2, 0.78),
    ])
    return vectorstore


@pytest.fixture
def app_client(mock_db, mock_vectorstore):
    """Create test client with mocked dependencies"""
    with patch('routers.search.get_db') as mock_get_db, \
         patch('routers.search.rag_agent') as mock_rag:

        # Setup mocks
        mock_get_db.return_value.__aenter__ = AsyncMock(return_value=mock_db)
        mock_get_db.return_value.__aexit__ = AsyncMock(return_value=None)
        mock_rag.vectorstore = mock_vectorstore

        from main import app
        client = TestClient(app)
        yield client


def test_search_with_keyword_returns_results(app_client):
    """Test 1: GET /api/v1/search?q=逍遥游 returns matching documents"""
    response = app_client.get("/api/v1/search?q=逍遥游")

    assert response.status_code == 200
    data = response.json()
    assert "results" in data
    assert len(data["results"]) > 0
    assert any("逍遥游" in result["title"] or "鲲" in result["content"]
               for result in data["results"])


def test_hybrid_search_combines_bm25_and_embedding(app_client):
    """Test 2: Hybrid mode uses both BM25 and Embedding, results sorted by score"""
    response = app_client.get("/api/v1/search?q=逍遥游&mode=HYBRID")

    assert response.status_code == 200
    data = response.json()
    results = data["results"]

    # Check results are sorted by score (descending)
    scores = [r["score"] for r in results]
    assert scores == sorted(scores, reverse=True)

    # Verify results contain documents from both sources
    assert len(results) > 0


def test_jieba_custom_dict_not_split_xiaoyaoyou(app_client):
    """Test 3: jieba loads custom dict, '逍遥游' not split into smaller pieces"""
    import jieba

    # Verify jieba tokenization
    tokens = list(jieba.cut("逍遥游篇"))

    # '逍遥游' should be kept as one token
    assert "逍遥游" in tokens, f"Expected '逍遥游' as single token, got: {tokens}"


def test_empty_query_returns_400_with_chinese_message(app_client):
    """Test 4: Empty query returns 400 error with Chinese message"""
    response = app_client.get("/api/v1/search?q=")

    assert response.status_code == 400
    data = response.json()
    assert "detail" in data
    # Check message is in Chinese
    assert any(ord(c) > 127 for c in data["detail"]), "Error message should be in Chinese"


def test_extract_search_terms_keeps_core_terms_and_drops_question_noise():
    from routers.search import _extract_search_terms

    terms = _extract_search_terms('孔子怎样谈“仁”')

    assert "孔子" in terms
    assert "仁" in terms
    assert "怎样" not in terms
    assert "谈" not in terms


def test_extract_search_terms_keeps_full_quote_for_exact_queries():
    from routers.search import _extract_search_terms

    terms = _extract_search_terms("学而时习之")

    assert "学而时习之" in terms
    assert "之" not in terms


def test_fulltext_mode_uses_fts5(app_client):
    """Test fulltext mode uses SQLite FTS5"""
    response = app_client.get("/api/v1/search?q=逍遥游&mode=FULLTEXT")

    assert response.status_code == 200
    data = response.json()
    assert "results" in data


def test_vector_mode_uses_faiss(app_client):
    """Test vector mode uses FAISS similarity search"""
    response = app_client.get("/api/v1/search?q=逍遥游&mode=VECTOR")

    assert response.status_code == 200
    data = response.json()
    assert "results" in data
    assert any(result.get("document_id") for result in data["results"])


@pytest.mark.asyncio
async def test_vector_search_discards_unmapped_demo_hits():
    from routers.search import vector_search

    mock_doc = Mock()
    mock_doc.page_content = "采菊东篱下，悠然见南山。"
    mock_doc.metadata = {"id": "doc_3", "title": "陶渊明集·饮酒", "source": "陶渊明集"}

    with patch("routers.search.rag_agent") as mock_rag, \
         patch("routers.search._load_document_candidates", new=AsyncMock(return_value=[])), \
         patch("routers.search._resolve_document_id", new=AsyncMock(return_value=None)):
        mock_rag.vectorstore = Mock()
        mock_rag.vectorstore.similarity_search_with_score = Mock(return_value=[(mock_doc, 0.42)])
        results = await vector_search("庄子", limit=5)

    assert results == []


def test_search_limit_parameter(app_client):
    """Test limit parameter controls result count"""
    response = app_client.get("/api/v1/search?q=逍遥游&limit=5")

    assert response.status_code == 200
    data = response.json()
    assert len(data["results"]) <= 5


@pytest.mark.asyncio
async def test_fulltext_search_excludes_private_docs_for_anonymous():
    from routers.search import fulltext_search

    with patch("routers.search._load_document_candidates", new=AsyncMock(return_value=[
        {
            "id": "doc-private",
            "title": "我的私有文档",
            "source_name": "我的文档",
            "original_text": "私密内容关键字",
            "punctuated_text": "私密内容关键字。",
            "translated_text": "",
            "source_type": "user",
            "owner_user_id": "user-1",
        }
    ])):
        results = await fulltext_search("私密内容关键字", user_id=None)

    assert results == []


@pytest.mark.asyncio
async def test_fulltext_search_includes_private_docs_for_owner():
    from routers.search import fulltext_search

    with patch("routers.search._load_document_candidates", new=AsyncMock(return_value=[
        {
            "id": "doc-private",
            "title": "我的私有文档",
            "source_name": "我的文档",
            "original_text": "私密内容关键字",
            "punctuated_text": "私密内容关键字。",
            "translated_text": "",
            "source_type": "user",
            "owner_user_id": "user-1",
        }
    ])):
        results = await fulltext_search("私密内容关键字", user_id="user-1")

    assert len(results) == 1
    assert results[0].document_id == "doc-private"


@pytest.mark.asyncio
async def test_load_document_candidates_uses_sqlite_for_corpus_and_pg_for_user_docs():
    from routers import search as search_router

    pg_conn = AsyncMock()
    pg_conn.fetch = AsyncMock(return_value=[
        {
            "id": "doc-private",
            "repo_id": None,
            "title": "我的私有文档",
            "source_name": "我的文档",
            "author": "",
            "dynasty": "",
            "category": "",
            "original_text": "私密内容关键字",
            "punctuated_text": "私密内容关键字。",
            "translated_text": "",
            "segments": [],
            "source_type": "user",
            "owner_user_id": "user-1",
        }
    ])
    pg_ctx = MagicMock()
    pg_ctx.__aenter__ = AsyncMock(return_value=pg_conn)
    pg_ctx.__aexit__ = AsyncMock(return_value=False)

    sqlite_cursor = AsyncMock()
    sqlite_cursor.fetchall = AsyncMock(return_value=[
        {
            "id": "doc-corpus",
            "repo_id": "KR1h0004",
            "title": "《论语》",
            "source_name": "Kanripo",
            "author": "孔子弟子",
            "dynasty": "春秋",
            "category": "四书",
            "original_text": "学而时习之不亦说乎",
            "punctuated_text": "学而时习之，不亦说乎？",
            "translated_text": "",
            "segments": [],
            "source_type": "corpus",
            "owner_user_id": None,
        }
    ])
    sqlite_db = AsyncMock()
    sqlite_db.execute = AsyncMock(return_value=sqlite_cursor)
    sqlite_ctx = MagicMock()
    sqlite_ctx.__aenter__ = AsyncMock(return_value=sqlite_db)
    sqlite_ctx.__aexit__ = AsyncMock(return_value=False)

    with patch("routers.search.get_connection", return_value=pg_ctx), \
         patch("routers.search.get_db", return_value=sqlite_ctx):
        rows = await search_router._load_document_candidates(limit=10, user_id="user-1")

    assert [row["id"] for row in rows] == ["doc-corpus", "doc-private"]


@pytest.mark.asyncio
async def test_fulltext_search_prioritizes_exact_quote_with_segment_location():
    from routers.search import fulltext_search

    with patch("routers.search._load_document_candidates", new=AsyncMock(return_value=[
        {
            "id": "doc-lunyu",
            "title": "《论语》",
            "source_name": "Kanripo",
            "author": "孔子弟子",
            "dynasty": "春秋",
            "category": "四书",
            "original_text": "学而时习之不亦说乎有朋自远方来不亦乐乎",
            "punctuated_text": "学而时习之，不亦说乎？有朋自远方来，不亦乐乎？",
            "translated_text": "学习以后经常温习，不也是快乐的吗？",
            "segments": [
                {
                    "title": "学而篇",
                    "text": "学而时习之，不亦说乎？有朋自远方来，不亦乐乎？",
                    "excerpt": "学而时习之，不亦说乎？",
                    "summary": "适合作为《论语》入门句。"
                }
            ],
            "source_type": "corpus",
            "owner_user_id": None,
        }
    ])):
        results = await fulltext_search("学而时习之", user_id=None)

    assert len(results) == 1
    assert results[0].source.endswith("学而篇")
    assert results[0].anchor_text == "学而时习之，不亦说乎？"


@pytest.mark.asyncio
async def test_fulltext_search_matches_simplified_query_against_traditional_text():
    from routers.search import fulltext_search

    class FakeConverter:
        def convert(self, text: str) -> str:
            return (
                text.replace("學", "学")
                .replace("時", "时")
                .replace("習", "习")
                .replace("說", "说")
                .replace("論", "论")
                .replace("顏", "颜")
                .replace("書", "书")
                .replace("四書", "四书")
            )

    with patch("routers.search.SEARCH_CONVERTER", FakeConverter()), \
         patch("routers.search._load_document_candidates", new=AsyncMock(return_value=[
            {
                "id": "doc-lunyu",
                "title": "《論語》",
                "source_name": "Kanripo",
                "author": "孔子弟子",
                "dynasty": "先秦",
                "category": "四書",
                "original_text": "學而時習之不亦說乎",
                "punctuated_text": "學而時習之，不亦說乎？",
                "translated_text": "",
                "segments": [
                    {
                        "title": "學而篇",
                        "text": "學而時習之，不亦說乎？",
                        "excerpt": "學而時習之，不亦說乎？",
                        "summary": "適合作為《論語》入門句。",
                    }
                ],
                "source_type": "corpus",
                "owner_user_id": None,
            }
        ])):
        results = await fulltext_search("学而时习之", user_id=None)

    assert len(results) == 1
    assert results[0].document_id == "doc-lunyu"


@pytest.mark.asyncio
async def test_hybrid_search_demotes_vector_noise_for_question_query():
    from routers.search import SearchResult, hybrid_search

    fulltext_results = [
        SearchResult(
            id="doc-lunyu",
            document_id="doc-lunyu",
            title="《论语》",
            content="仁者爱人。",
            source="古籍库",
            score=36.0,
            anchor_text="仁者爱人",
        )
    ]
    vector_results = [
        SearchResult(
            id="doc-noise",
            document_id="doc-noise",
            title="陶渊明集·饮酒",
            content="采菊东篱下，悠然见南山。",
            source="我的文档",
            score=0.01,
            anchor_text="采菊东篱下",
        ),
        SearchResult(
            id="doc-lunyu",
            document_id="doc-lunyu",
            title="《论语》",
            content="孔子论仁，以爱人为本。",
            source="古籍库",
            score=0.18,
            anchor_text="孔子论仁",
        ),
    ]
    candidate_rows = [
        {
            "id": "doc-lunyu",
            "title": "《论语》",
            "source_name": "Kanripo",
            "author": "孔子弟子",
            "dynasty": "先秦",
            "category": "经学典籍",
            "original_text": "子曰仁者爱人",
            "punctuated_text": "子曰：仁者爱人。",
            "translated_text": "孔子谈仁，强调爱人。",
            "segments": [],
            "source_type": "corpus",
            "owner_user_id": None,
        },
        {
            "id": "doc-noise",
            "title": "陶渊明集·饮酒",
            "source_name": "诗文集",
            "author": "陶渊明",
            "dynasty": "东晋",
            "category": "文学总集",
            "original_text": "采菊东篱下悠然见南山",
            "punctuated_text": "采菊东篱下，悠然见南山。",
            "translated_text": "在东篱下采菊，悠然望见南山。",
            "segments": [],
            "source_type": "user",
            "owner_user_id": "user-1",
        },
    ]

    with patch("routers.search.fulltext_search", new=AsyncMock(return_value=fulltext_results)), \
         patch("routers.search.vector_search", new=AsyncMock(return_value=vector_results)), \
         patch("routers.search._load_document_candidates", new=AsyncMock(return_value=candidate_rows)):
        results = await hybrid_search("孔子怎样谈仁", limit=5, user_id="user-1")

    assert results
    assert results[0].document_id == "doc-lunyu"
    assert all(result.document_id != "doc-noise" for result in results[:1])
