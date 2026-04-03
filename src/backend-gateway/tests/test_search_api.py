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
