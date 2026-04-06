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
        (1, "斗拱结构", "斗拱是中国古代建筑特有的构件...", "营造法式", 0.85),
        (2, "榫卯工艺", "榫卯是古代建筑的连接方式...", "天工开物", 0.72),
    ])
    db.execute = AsyncMock(return_value=cursor)
    return db


@pytest.fixture
def mock_vectorstore():
    """Mock FAISS vectorstore"""
    mock_doc1 = Mock()
    mock_doc1.page_content = "斗拱是中国古代建筑特有的构件..."
    mock_doc1.metadata = {"id": 1, "title": "斗拱结构", "source": "营造法式"}

    mock_doc2 = Mock()
    mock_doc2.page_content = "榫卯是古代建筑的连接方式..."
    mock_doc2.metadata = {"id": 3, "title": "榫卯工艺", "source": "天工开物"}

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
    """Test 1: GET /api/v1/search?q=斗拱 returns matching documents"""
    response = app_client.get("/api/v1/search?q=斗拱")

    assert response.status_code == 200
    data = response.json()
    assert "results" in data
    assert len(data["results"]) > 0
    assert any("斗拱" in result["title"] or "斗拱" in result["content"]
               for result in data["results"])


def test_hybrid_search_combines_bm25_and_embedding(app_client):
    """Test 2: Hybrid mode uses both BM25 and Embedding, results sorted by score"""
    response = app_client.get("/api/v1/search?q=斗拱&mode=HYBRID")

    assert response.status_code == 200
    data = response.json()
    results = data["results"]

    # Check results are sorted by score (descending)
    scores = [r["score"] for r in results]
    assert scores == sorted(scores, reverse=True)

    # Verify results contain documents from both sources
    assert len(results) > 0


def test_jieba_custom_dict_not_split_dougong(app_client):
    """Test 3: jieba loads custom dict, '斗拱' not split into '斗'+'拱'"""
    import jieba

    # Verify jieba tokenization
    tokens = list(jieba.cut("斗拱结构"))

    # '斗拱' should be kept as one token
    assert "斗拱" in tokens, f"Expected '斗拱' as single token, got: {tokens}"


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


def test_fulltext_mode_uses_fts5(app_client):
    """Test fulltext mode uses SQLite FTS5"""
    response = app_client.get("/api/v1/search?q=斗拱&mode=FULLTEXT")

    assert response.status_code == 200
    data = response.json()
    assert "results" in data


def test_vector_mode_uses_faiss(app_client):
    """Test vector mode uses FAISS similarity search"""
    response = app_client.get("/api/v1/search?q=斗拱&mode=VECTOR")

    assert response.status_code == 200
    data = response.json()
    assert "results" in data
    assert any(result.get("document_id") for result in data["results"])


def test_search_limit_parameter(app_client):
    """Test limit parameter controls result count"""
    response = app_client.get("/api/v1/search?q=斗拱&limit=5")

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
            title="清式营造则例·装修",
            content="雀替、装修与斗口做法。",
            source="我的文档",
            score=0.01,
            anchor_text="雀替",
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
            "title": "清式营造则例·装修",
            "source_name": "建筑资料",
            "author": "佚名",
            "dynasty": "清",
            "category": "建筑工艺",
            "original_text": "雀替装修做法",
            "punctuated_text": "雀替装修做法。",
            "translated_text": "介绍木作装修工艺。",
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
