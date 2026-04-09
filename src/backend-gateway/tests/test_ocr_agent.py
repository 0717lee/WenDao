# -*- coding: utf-8 -*-
"""
OCR Agent 测试
测试百度OCR调用、access_token缓存、PaddleOCR降级
所有测试使用 unittest.mock，无真实API调用
"""
import os
import sys
import time
import pytest
from unittest.mock import Mock, AsyncMock, patch, MagicMock

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from agents.ocr import OCRAgent


class TestBaiduOCRSuccess:
    """测试百度OCR正常识别流程"""

    @pytest.mark.asyncio
    async def test_baidu_ocr_success(self):
        """百度OCR返回成功结果时，正确解析文字"""
        agent = OCRAgent()
        agent.api_key = "test_key"
        agent.secret_key = "test_secret"
        agent.access_token = "cached_token"
        agent.token_expires_at = time.time() + 3600

        mock_response = Mock()
        mock_response.status_code = 200
        mock_response.raise_for_status = Mock()
        mock_response.json.return_value = {
            "words_result": [
                {"words": "斗拱之制"},
                {"words": "出一跳曰华拱"},
            ],
            "words_result_num": 2,
        }

        mock_client = AsyncMock()
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)
        mock_client.post = AsyncMock(return_value=mock_response)

        with patch("agents.ocr.httpx.AsyncClient", return_value=mock_client):
            result = await agent._baidu_ocr(b"fake_image_bytes")

        assert result["text"] == "斗拱之制\n出一跳曰华拱"
        assert result["confidence"] == 0.95


class TestBaiduOCRVerticalParams:
    """测试百度OCR竖排文字参数"""

    @pytest.mark.asyncio
    async def test_baidu_ocr_vertical_params(self):
        """验证请求中包含 vertically_type=true 参数"""
        agent = OCRAgent()
        agent.api_key = "test_key"
        agent.secret_key = "test_secret"
        agent.access_token = "cached_token"
        agent.token_expires_at = time.time() + 3600

        mock_response = Mock()
        mock_response.raise_for_status = Mock()
        mock_response.json.return_value = {"words_result": [], "words_result_num": 0}

        mock_client = AsyncMock()
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)
        mock_client.post = AsyncMock(return_value=mock_response)

        with patch("agents.ocr.httpx.AsyncClient", return_value=mock_client):
            await agent._baidu_ocr(b"fake_image_bytes")

        # 检查post调用的data参数中包含vertically_type
        call_kwargs = mock_client.post.call_args
        posted_data = call_kwargs.kwargs.get("data", call_kwargs[1].get("data", {}))
        assert posted_data["vertically_type"] == "true"
        assert posted_data["detect_direction"] == "true"
        assert posted_data["language_type"] == "CHN_ENG"


class TestAccessTokenCache:
    """测试access_token缓存机制"""

    @pytest.mark.asyncio
    async def test_access_token_cache(self):
        """连续两次调用只发起一次token请求"""
        agent = OCRAgent()
        agent.api_key = "test_key"
        agent.secret_key = "test_secret"

        mock_token_response = Mock()
        mock_token_response.raise_for_status = Mock()
        mock_token_response.json.return_value = {
            "access_token": "new_token_123",
            "expires_in": 2592000,
        }

        mock_client = AsyncMock()
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)
        mock_client.post = AsyncMock(return_value=mock_token_response)

        with patch("agents.ocr.httpx.AsyncClient", return_value=mock_client):
            token1 = await agent._get_access_token()
            token2 = await agent._get_access_token()

        assert token1 == "new_token_123"
        assert token2 == "new_token_123"
        # 只调用了一次HTTP请求（第二次走缓存）
        assert mock_client.post.call_count == 1


class TestPaddleFallback:
    """测试PaddleOCR降级"""

    @pytest.mark.asyncio
    async def test_paddle_fallback(self):
        """百度OCR失败时降级到PaddleOCR"""
        agent = OCRAgent()
        agent.api_key = "test_key"
        agent.secret_key = "test_secret"

        # Mock百度OCR抛异常
        with patch.object(agent, "_baidu_ocr", side_effect=RuntimeError("API错误")):
            # Mock PaddleOCR
            mock_paddle = Mock()
            mock_paddle.ocr.return_value = [
                [
                    [[[0, 0], [100, 0], [100, 30], [0, 30]], ("测试文字", 0.92)],
                    [[[0, 40], [100, 40], [100, 70], [0, 70]], ("第二行", 0.88)],
                ]
            ]

            with patch.object(agent, "_paddle_ocr") as mock_paddle_method:
                mock_paddle_method.return_value = {
                    "text": "测试文字\n第二行",
                    "confidence": 0.9,
                }
                result = await agent.recognize(b"fake_image_bytes")

        assert "测试文字" in result["text"]
        assert result["confidence"] > 0


class TestZhipuVisionFallback:
    """测试智谱视觉 OCR 云端降级。"""

    @pytest.mark.asyncio
    async def test_zhipu_fallback_when_baidu_unavailable(self):
        agent = OCRAgent()

        with patch.object(agent, "_baidu_ocr", side_effect=RuntimeError("baidu unavailable")), \
             patch.object(agent, "_zhipu_ocr", new=AsyncMock(return_value={"text": "云端识别结果", "confidence": 0.75})):
            result = await agent.recognize(b"fake_image_bytes")

        assert result["text"] == "云端识别结果"
        assert result["confidence"] == 0.75


class TestPaddleLazyLoad:
    """测试PaddleOCR懒加载"""

    def test_paddle_lazy_load(self):
        """PaddleOCR在初始化时不会被加载"""
        agent = OCRAgent()
        assert agent.paddle_ocr is None


class TestRecognizeReturnsTextAndConfidence:
    """测试recognize返回格式"""

    @pytest.mark.asyncio
    async def test_recognize_returns_text_and_confidence(self):
        """recognize返回包含text和confidence的字典"""
        agent = OCRAgent()

        with patch.object(agent, "_baidu_ocr") as mock_baidu:
            mock_baidu.return_value = {"text": "古建筑识别文字", "confidence": 0.95}
            result = await agent.recognize(b"fake_image_bytes")

        assert isinstance(result, dict)
        assert "text" in result
        assert "confidence" in result
        assert isinstance(result["text"], str)
        assert isinstance(result["confidence"], float)


class TestEmptyImageBytes:
    """测试空图片字节输入"""

    @pytest.mark.asyncio
    async def test_empty_image_bytes(self):
        """空字节输入时百度OCR应返回空文本"""
        agent = OCRAgent()
        agent.api_key = "test_key"
        agent.secret_key = "test_secret"
        agent.access_token = "cached_token"
        agent.token_expires_at = time.time() + 3600

        mock_response = Mock()
        mock_response.raise_for_status = Mock()
        mock_response.json.return_value = {"words_result": [], "words_result_num": 0}

        mock_client = AsyncMock()
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)
        mock_client.post = AsyncMock(return_value=mock_response)

        with patch("agents.ocr.httpx.AsyncClient", return_value=mock_client):
            result = await agent._baidu_ocr(b"")

        assert result["text"] == ""


class TestOCRTimeout:
    """测试OCR超时处理"""

    @pytest.mark.asyncio
    async def test_ocr_timeout_falls_back(self):
        """百度OCR超时时应降级到PaddleOCR"""
        agent = OCRAgent()
        agent.api_key = "test_key"
        agent.secret_key = "test_secret"

        import httpx
        with patch.object(agent, "_baidu_ocr", side_effect=httpx.TimeoutException("timeout")):
            with patch.object(agent, "_paddle_ocr") as mock_paddle:
                mock_paddle.return_value = {"text": "降级结果", "confidence": 0.85}
                result = await agent.recognize(b"fake_image_bytes")

        assert result["text"] == "降级结果"


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
