"""
Error Handling Tests
Coverage: UX-03 (Chinese error messages)
"""
from fastapi.testclient import TestClient

from main import app


client = TestClient(app, raise_server_exceptions=False)


def test_chinese_errors():
    """错误响应应使用中文文案，并保持统一结构。"""
    response = client.get("/api/v1/search?q=")
    data = response.json()

    assert response.status_code == 400
    assert data["error"] == "搜索关键词不能为空"
    assert data["message"] == "搜索关键词不能为空"
    assert data["status_code"] == 400
    assert any(ord(char) > 127 for char in data["message"])


def test_empty_query_returns_400():
    """空搜索词会返回 400，且 detail/message 同步。"""
    response = client.get("/api/v1/search?q=   ")
    data = response.json()

    assert response.status_code == 400
    assert data["detail"] == "搜索关键词不能为空"
    assert data["message"] == "搜索关键词不能为空"
