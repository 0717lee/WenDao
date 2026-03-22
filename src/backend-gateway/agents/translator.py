# -*- coding: utf-8 -*-
"""
TranslatorAgent - Kimi + DeepSeek fallback, OpenCC t2s
-------------------------------------------------------
"""
import os
import asyncio
import json
import logging
import re
from openai import OpenAI

logger = logging.getLogger(__name__)


class TranslatorAgent:
    """Kimi primary + DeepSeek fallback + OpenCC t2s"""

    def __init__(self):
        self.kimi_client = OpenAI(
            api_key=os.getenv("MOONSHOT_API_KEY", ""),
            base_url="https://api.moonshot.cn/v1",
        )
        self.deepseek_client = None
        self.converter = None

    async def punctuate_and_translate(self, raw_text: str) -> dict:
        segments = self._split_segments(raw_text, max_len=400)
        results = []
        used_fallback = False
        for seg in segments:
            try:
                result = await self._call_kimi(seg)
            except Exception as e:
                logger.info("[降级] TranslatorAgent: Kimi-8k → DeepSeek-Chat, reason: %s", str(e))
                result = await self._call_deepseek(seg)
                used_fallback = True
            results.append(result)
        punctuated = "\n".join([r["punctuated"] for r in results])
        translated = "\n".join([r["translated"] for r in results])
        punctuated = self.normalize_variants(punctuated)
        return {"punctuated": punctuated, "translated": translated, "used_fallback": used_fallback}

    def _split_segments(self, text: str, max_len: int = 400) -> list:
        if len(text) <= max_len:
            return [text]
        segments, start = [], 0
        while start < len(text):
            end = min(start + max_len, len(text))
            if end < len(text):
                for i in range(end, max(start + 200, start), -1):
                    if text[i] in "\u3002\uff1f\uff01":
                        end = i + 1
                        break
            segments.append(text[start:end])
            start = end
        return segments

    async def _call_kimi(self, text: str) -> dict:
        prompt = (
            "请对以下古文进行处理：\n"
            "1. 添加现代标点符号（句号、逗号、问号等）\n"
            "2. 翻译为通俗易懂的白话文\n\n"
            f"古文原文：\n{text}\n\n"
            "请严格按以下JSON格式返回，不要包含其他内容：\n"
            '{"punctuated": "标点后的文本", "translated": "白话翻译"}'
        )
        response = await asyncio.to_thread(
            self.kimi_client.chat.completions.create,
            model="moonshot-v1-8k",
            messages=[{"role": "user", "content": prompt}],
            temperature=0.3,
        )
        content = response.choices[0].message.content
        return self._parse_json(content)

    async def _call_deepseek(self, text: str) -> dict:
        if self.deepseek_client is None:
            self.deepseek_client = OpenAI(
                api_key=os.getenv("DEEPSEEK_API_KEY", ""),
                base_url="https://api.deepseek.com",
            )
        prompt = (
            "请对以下古文进行处理：\n"
            "1. 添加现代标点符号\n"
            "2. 翻译为白话文\n\n"
            f"古文：{text}\n\n"
            '返回JSON格式：{"punctuated": "...", "translated": "..."}'
        )
        response = await asyncio.to_thread(
            self.deepseek_client.chat.completions.create,
            model="deepseek-chat",
            messages=[{"role": "user", "content": prompt}],
            temperature=0.3,
        )
        content = response.choices[0].message.content
        return self._parse_json(content)

    def _parse_json(self, content: str) -> dict:
        try:
            return json.loads(content)
        except json.JSONDecodeError:
            match = re.search(r"\{.*\}", content, re.DOTALL)
            if match:
                return json.loads(match.group())
            raise

    def normalize_variants(self, text: str) -> str:
        if self.converter is None:
            try:
                from opencc import OpenCC

                self.converter = OpenCC("t2s")
            except ImportError:
                return text
        return self.converter.convert(text)
