"""
Error Handling Tests
Coverage: UX-03 (Chinese error messages)
"""
import pytest


@pytest.mark.asyncio
async def test_chinese_errors():
    """
    Test Chinese error messages
    Verify: error responses are in Chinese
    TODO:
    1. Trigger various error conditions
    2. Assert error messages are in Chinese
    3. Assert error format: {"error": "错误消息", "code": "ERROR_CODE"}
    """
    pass


@pytest.mark.asyncio
async def test_empty_query_returns_400():
    """
    Test empty query returns 400 error
    Verify: empty queries are rejected with proper error
    TODO:
    1. Send empty query to chat endpoint
    2. Assert status code is 400
    3. Assert error message is in Chinese
    4. Assert error message mentions "查询不能为空"
    """
    pass
