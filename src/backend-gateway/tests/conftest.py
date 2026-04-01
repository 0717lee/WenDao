"""
共享pytest fixtures
提供mock对象和测试数据，用于隔离外部依赖
"""
import pytest
from unittest.mock import Mock, AsyncMock, MagicMock
from typing import List, Dict, Any


@pytest.fixture
def mock_faiss():
    """
    Mock FAISS向量存储
    模拟FAISS.load_local和similarity_search方法
    """
    mock = Mock()
    mock.load_local = Mock(return_value=mock)
    mock.similarity_search = Mock(return_value=[
        Mock(page_content="《论语·学而》：学而时习之，不亦说乎？", metadata={"source": "论语", "chapter": "学而"}),
        Mock(page_content="《孟子·梁惠王上》：王何必曰利？亦有仁义而已矣。", metadata={"source": "孟子", "chapter": "梁惠王上"}),
    ])
    mock.similarity_search_with_score = Mock(return_value=[
        (Mock(page_content="《论语·学而》：学而时习之，不亦说乎？", metadata={"source": "论语", "chapter": "学而"}), 0.85),
        (Mock(page_content="《孟子·梁惠王上》：王何必曰利？亦有仁义而已矣。", metadata={"source": "孟子", "chapter": "梁惠王上"}), 0.72),
    ])
    return mock


@pytest.fixture
def mock_kimi():
    """
    Mock Kimi API客户端
    模拟OpenAI兼容的chat.completions.create方法
    """
    mock = Mock()
    mock.chat = Mock()
    mock.chat.completions = Mock()

    # Mock同步调用
    mock_response = Mock()
    mock_response.choices = [Mock(message=Mock(content="这是一个测试回复"))]
    mock.chat.completions.create = Mock(return_value=mock_response)

    # Mock流式调用
    def mock_stream():
        yield Mock(choices=[Mock(delta=Mock(content="这是"))])
        yield Mock(choices=[Mock(delta=Mock(content="流式"))])
        yield Mock(choices=[Mock(delta=Mock(content="回复"))])

    mock.chat.completions.create_stream = Mock(return_value=mock_stream())

    return mock


@pytest.fixture
def mock_db():
    """
    Mock aiosqlite数据库连接
    模拟异步数据库操作
    """
    mock_conn = AsyncMock()
    mock_cursor = AsyncMock()

    # Mock查询结果
    mock_cursor.fetchall = AsyncMock(return_value=[
        (1, "user_123", "什么是仁？", "仁者爱人", "2026-03-17 10:00:00"),
        (2, "user_123", "什么是义？", "义者宜也", "2026-03-17 10:05:00"),
    ])
    mock_cursor.fetchone = AsyncMock(return_value=(1, "user_123", "什么是仁？", "仁者爱人", "2026-03-17 10:00:00"))

    mock_conn.cursor = AsyncMock(return_value=mock_cursor)
    mock_conn.execute = AsyncMock(return_value=mock_cursor)
    mock_conn.commit = AsyncMock()
    mock_conn.close = AsyncMock()

    return mock_conn


@pytest.fixture
def mock_embeddings():
    """
    Mock WenDaoEmbeddings
    模拟embed_query和embed_documents方法
    """
    mock = Mock()
    mock.embed_query = Mock(return_value=[0.1] * 768)  # 768维向量
    mock.embed_documents = Mock(return_value=[[0.1] * 768, [0.2] * 768])
    return mock


@pytest.fixture
def mock_vectorstore(mock_faiss, mock_embeddings):
    """
    Mock完整的向量存储（FAISS + Embeddings）
    """
    mock = Mock()
    mock.vectorstore = mock_faiss
    mock.embeddings = mock_embeddings
    return mock


@pytest.fixture
def test_documents() -> List[Dict[str, Any]]:
    """
    测试用古籍文档样本
    返回10条样本数据，覆盖四书五经
    """
    return [
        {
            "content": "《论语·学而》：学而时习之，不亦说乎？有朋自远方来，不亦乐乎？人不知而不愠，不亦君子乎？",
            "metadata": {"source": "论语", "chapter": "学而", "author": "孔子"},
        },
        {
            "content": "《孟子·梁惠王上》：王何必曰利？亦有仁义而已矣。",
            "metadata": {"source": "孟子", "chapter": "梁惠王上", "author": "孟子"},
        },
        {
            "content": "《大学》：大学之道，在明明德，在亲民，在止于至善。",
            "metadata": {"source": "大学", "chapter": "经一章", "author": "曾子"},
        },
        {
            "content": "《中庸》：天命之谓性，率性之谓道，修道之谓教。",
            "metadata": {"source": "中庸", "chapter": "第一章", "author": "子思"},
        },
        {
            "content": "《诗经·关雎》：关关雎鸠，在河之洲。窈窕淑女，君子好逑。",
            "metadata": {"source": "诗经", "chapter": "关雎", "author": "佚名"},
        },
        {
            "content": "《尚书·尧典》：曰若稽古帝尧，曰放勋，钦明文思安安，允恭克让，光被四表，格于上下。",
            "metadata": {"source": "尚书", "chapter": "尧典", "author": "佚名"},
        },
        {
            "content": "《礼记·曲礼上》：毋不敬，俨若思，安定辞。",
            "metadata": {"source": "礼记", "chapter": "曲礼上", "author": "戴圣"},
        },
        {
            "content": "《周易·乾卦》：天行健，君子以自强不息。",
            "metadata": {"source": "周易", "chapter": "乾卦", "author": "佚名"},
        },
        {
            "content": "《春秋左传·隐公元年》：郑伯克段于鄢。",
            "metadata": {"source": "春秋左传", "chapter": "隐公元年", "author": "左丘明"},
        },
        {
            "content": "《道德经·第一章》：道可道，非常道；名可名，非常名。",
            "metadata": {"source": "道德经", "chapter": "第一章", "author": "老子"},
        },
    ]


@pytest.fixture
def test_queries() -> List[str]:
    """
    测试用查询样本
    覆盖不同类型的古文查询场景
    """
    return [
        "什么是仁？",
        "君子的品德有哪些？",
        "如何修身养性？",
        "诗经中的爱情诗",
        "周易讲了什么？",
    ]


@pytest.fixture
def mock_asyncpg_pool():
    """
    Mock asyncpg connection pool.
    pool.acquire() in asyncpg returns a sync object that implements
    __aenter__/__aexit__ (not a coroutine). We replicate that pattern.
    """
    mock_conn = AsyncMock()
    mock_conn.execute = AsyncMock(return_value="CREATE TABLE")
    mock_conn.executemany = AsyncMock(return_value=None)
    mock_conn.fetchrow = AsyncMock(return_value={"id": "test-uuid", "title": "test"})
    mock_conn.fetchval = AsyncMock(return_value=1)
    mock_conn.fetch = AsyncMock(return_value=[])

    # Build an async context manager that acquire() returns synchronously
    acm = MagicMock()
    acm.__aenter__ = AsyncMock(return_value=mock_conn)
    acm.__aexit__ = AsyncMock(return_value=False)

    mock_pool = MagicMock()
    mock_pool.acquire = MagicMock(return_value=acm)
    mock_pool.close = AsyncMock()

    return mock_pool


@pytest.fixture
def mock_httpx_client():
    """
    Mock httpx.AsyncClient
    用于测试FastAPI端点
    """
    from httpx import AsyncClient
    return AsyncClient
