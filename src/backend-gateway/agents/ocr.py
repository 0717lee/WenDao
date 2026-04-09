# -*- coding: utf-8 -*-
"""
OCR Agent - 百度OCR + PaddleOCR 降级
支持竖排古文识别，用于古籍文档数字化。
"""
import os
import asyncio
import base64
import logging
import re
import time

import httpx
from zhipuai import ZhipuAI

from core.runtime_checks import get_zhipu_api_key

logger = logging.getLogger(__name__)
NO_TEXT_MARKERS = ("没有可识别文字", "未识别到文字", "无可识别文字", "图片中没有文字")


class OCRAgent:
    """图片文字识别代理，百度OCR为主，PaddleOCR为降级方案"""

    def __init__(self):
        self.api_key = os.getenv("BAIDU_OCR_API_KEY")
        self.secret_key = os.getenv("BAIDU_OCR_SECRET_KEY")
        self.access_token = None
        self.token_expires_at = 0
        self.zhipu_api_key = get_zhipu_api_key()
        self.zhipu_client = None
        self.paddle_ocr = None

    async def recognize(self, image_bytes: bytes) -> dict:
        """
        识别图片文字，返回 {"text": str, "confidence": float}

        Args:
            image_bytes: 图片二进制数据

        Returns:
            dict: {"text": str, "confidence": float}
        """
        try:
            return await self._baidu_ocr(image_bytes)
        except Exception as e:
            logger.info("[降级] OCRAgent: 百度OCR-高精度 → Zhipu-Vision, reason: %s", str(e))

        try:
            return await self._zhipu_ocr(image_bytes)
        except Exception as e:
            logger.info("[降级] OCRAgent: Zhipu-Vision → PaddleOCR-本地, reason: %s", str(e))
            return await self._paddle_ocr(image_bytes)

    async def _get_access_token(self) -> str:
        """获取百度OCR access_token，带缓存"""
        if self.access_token and time.time() < self.token_expires_at:
            return self.access_token
        if not self.api_key or not self.secret_key:
            raise ValueError("百度OCR API Key未配置")
        url = "https://aip.baidubce.com/oauth/2.0/token"
        params = {
            "grant_type": "client_credentials",
            "client_id": self.api_key,
            "client_secret": self.secret_key,
        }
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.post(url, params=params)
            resp.raise_for_status()
            data = resp.json()
        self.access_token = data["access_token"]
        self.token_expires_at = time.time() + data.get("expires_in", 2592000)
        return self.access_token

    async def _baidu_ocr(self, image_bytes: bytes) -> dict:
        """调用百度OCR高精度接口"""
        token = await self._get_access_token()
        url = f"https://aip.baidubce.com/rest/2.0/ocr/v1/accurate_basic?access_token={token}"
        img_b64 = base64.b64encode(image_bytes).decode()
        data = {
            "image": img_b64,
            "detect_direction": "true",
            "vertically_type": "true",
            "language_type": "CHN_ENG",
        }
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.post(
                url,
                data=data,
                headers={"Content-Type": "application/x-www-form-urlencoded"},
            )
            resp.raise_for_status()
            result = resp.json()
        if "error_code" in result:
            raise RuntimeError(f"百度OCR错误: {result.get('error_msg', '未知错误')}")
        words = result.get("words_result", [])
        texts = [w["words"] for w in words]
        return {"text": "\n".join(texts), "confidence": 0.95}

    def _get_zhipu_client(self) -> ZhipuAI:
        if not self.zhipu_api_key:
            raise ValueError("ZHIPUAI_API_KEY 未配置")
        if self.zhipu_client is None:
            self.zhipu_client = ZhipuAI(api_key=self.zhipu_api_key)
        return self.zhipu_client

    @staticmethod
    def _clean_zhipu_ocr_text(content: str) -> str:
        text = (content or "").strip()
        text = re.sub(r"^```(?:json|text)?\s*", "", text, flags=re.IGNORECASE)
        text = re.sub(r"\s*```$", "", text)
        text = re.sub(r"^(识别文字|提取文字|OCR结果)[:：]\s*", "", text)
        if any(marker in text for marker in NO_TEXT_MARKERS):
            return ""
        return text.strip()

    async def _zhipu_ocr(self, image_bytes: bytes) -> dict:
        """使用智谱视觉模型提取图片中的文字，作为云端 OCR fallback。"""
        client = self._get_zhipu_client()
        image_b64 = base64.b64encode(image_bytes).decode("utf-8")
        prompt = (
            "请识别并提取图片里所有可见文字，只返回纯文本结果，尽量保留原来的换行顺序。"
            "如果图片中没有清晰可读的文字，只返回“没有可识别文字”。不要做解释。"
        )

        response = await asyncio.to_thread(
            client.chat.completions.create,
            model="glm-4v-flash",
            messages=[
                {
                    "role": "user",
                    "content": [
                        {"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{image_b64}"}},
                        {"type": "text", "text": prompt},
                    ],
                }
            ],
            temperature=0.1,
            max_tokens=500,
        )
        content = response.choices[0].message.content if response.choices else ""
        text = self._clean_zhipu_ocr_text(content)
        return {"text": text, "confidence": 0.75 if text else 0.0}

    async def _paddle_ocr(self, image_bytes: bytes) -> dict:
        """PaddleOCR降级方案，懒加载避免启动时加载500MB+模型"""
        if self.paddle_ocr is None:
            from paddleocr import PaddleOCR

            self.paddle_ocr = await asyncio.to_thread(
                PaddleOCR, use_angle_cls=True, lang="ch", use_gpu=False
            )
        import numpy as np
        from PIL import Image
        import io as _io

        image = Image.open(_io.BytesIO(image_bytes))
        image_np = np.array(image)
        result = await asyncio.to_thread(self.paddle_ocr.ocr, image_np, cls=True)
        if not result or not result[0]:
            return {"text": "", "confidence": 0.0}
        texts, confidences = [], []
        for line in result[0]:
            texts.append(line[1][0])
            confidences.append(line[1][1])
        avg_conf = sum(confidences) / len(confidences) if confidences else 0.0
        return {"text": "\n".join(texts), "confidence": avg_conf}
