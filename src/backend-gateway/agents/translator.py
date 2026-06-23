# -*- coding: utf-8 -*-
"""
TranslatorAgent - configurable OpenAI-compatible translator providers, OpenCC t2s
--------------------------------------------------------------------------------
"""
import os
import asyncio
import json
import logging
import re
from openai import OpenAI

from core.output_validator import OutputValidator
from core.runtime_checks import get_zhipu_api_key

logger = logging.getLogger(__name__)

TRANSLATOR_PROVIDER_ALIASES = {
    "kimi": "moonshot",
    "moonshot": "moonshot",
    "deepseek": "deepseek",
    "zhipu": "zhipu",
    "glm": "zhipu",
}
DEFAULT_TRANSLATOR_PROVIDER_ORDER = ["moonshot", "deepseek"]


def _resolve_translator_provider_order(value: str | None) -> list[str]:
    raw_providers = [part.strip().lower() for part in (value or "moonshot").split(",")]
    order: list[str] = []
    for raw_provider in raw_providers:
        if not raw_provider:
            continue
        provider = TRANSLATOR_PROVIDER_ALIASES.get(raw_provider)
        if provider is None:
            logger.warning("Unsupported TRANSLATOR_PROVIDER entry=%s, ignoring", raw_provider)
            continue
        if provider not in order:
            order.append(provider)
    if not order:
        order.append("moonshot")
    for provider in DEFAULT_TRANSLATOR_PROVIDER_ORDER:
        if provider not in order:
            order.append(provider)
    return order


class TranslatorAgent:
    """Configurable translator with Moonshot and DeepSeek provider order."""

    def __init__(self):
        self.provider_order = _resolve_translator_provider_order(os.getenv("TRANSLATOR_PROVIDER"))
        self.primary_provider = self.provider_order[0]
        self.kimi_client = None
        self.deepseek_client = None
        self.zhipu_client = None
        self.deepseek_enabled = bool(os.getenv("DEEPSEEK_API_KEY", "").strip())
        self.zhipu_enabled = bool(get_zhipu_api_key().strip())
        self.moonshot_model = os.getenv("TRANSLATOR_MOONSHOT_MODEL", "moonshot-v1-8k")
        self.deepseek_model = os.getenv("TRANSLATOR_DEEPSEEK_MODEL", "deepseek-chat")
        self.zhipu_model = os.getenv("TRANSLATOR_ZHIPU_MODEL", "glm-4-flash")
        self.converter = None

    async def punctuate_and_translate(self, raw_text: str) -> dict:
        if not raw_text.strip():
            return {"punctuated": "", "translated": "", "used_fallback": False}
        segments = self._split_segments(raw_text, max_len=400)
        results = []
        used_fallback = False
        for seg in segments:
            result, segment_used_fallback = await self._translate_segment(seg)
            validation = OutputValidator.validate_translation(seg, result)
            if validation["warnings"]:
                logger.warning("TranslatorAgent validation warnings: %s", validation["warnings"])
            results.append(result)
            used_fallback = used_fallback or segment_used_fallback
        punctuated = "\n".join([r["punctuated"] for r in results])
        translated = "\n".join([r["translated"] for r in results])
        punctuated = self.normalize_variants(punctuated)
        return {"punctuated": punctuated, "translated": translated, "used_fallback": used_fallback}

    async def _translate_segment(self, text: str, depth: int = 0) -> tuple[dict, bool]:
        last_error: Exception | None = None
        for provider in self._provider_order():
            if provider == "moonshot":
                result, provider_error = await self._try_kimi(text)
                if result is not None:
                    return result, provider != self.primary_provider
                last_error = provider_error or last_error
                continue

            if provider == "deepseek":
                if not self.deepseek_enabled:
                    if provider == self.primary_provider:
                        logger.warning("TRANSLATOR_PROVIDER includes deepseek but DEEPSEEK_API_KEY is not configured")
                    continue
                try:
                    if provider != self.primary_provider:
                        logger.info("[降级] TranslatorAgent: %s → DeepSeek, reason: %s", self.primary_provider, str(last_error))
                    return await self._call_deepseek(text), provider != self.primary_provider
                except Exception as exc:
                    last_error = exc
                    logger.warning("TranslatorAgent DeepSeek provider failed: %s", exc)
                    continue

            if provider == "zhipu":
                if not self.zhipu_enabled:
                    if provider == self.primary_provider:
                        logger.warning("TRANSLATOR_PROVIDER includes zhipu but ZHIPUAI_API_KEY is not configured")
                    continue
                try:
                    if provider != self.primary_provider:
                        logger.info("[降级] TranslatorAgent: %s → Zhipu, reason: %s", self.primary_provider, str(last_error))
                    return await self._call_zhipu(text), provider != self.primary_provider
                except Exception as exc:
                    last_error = exc
                    logger.warning("TranslatorAgent Zhipu provider failed: %s", exc)
                    continue

        if depth < 2:
            smaller_segments = self._split_for_recovery(text)
            if len(smaller_segments) > 1:
                nested_results = []
                used_fallback = False
                for segment in smaller_segments:
                    nested_result, nested_used_fallback = await self._translate_segment(segment, depth + 1)
                    nested_results.append(nested_result)
                    used_fallback = used_fallback or nested_used_fallback
                return {
                    "punctuated": "\n".join(item["punctuated"] for item in nested_results if item.get("punctuated")),
                    "translated": "\n".join(item["translated"] for item in nested_results if item.get("translated")),
                }, used_fallback

        raise last_error or RuntimeError("Translation failed")

    def _provider_order(self) -> list[str]:
        return self.provider_order

    async def _try_kimi(self, text: str) -> tuple[dict | None, Exception | None]:
        last_error: Exception | None = None
        for attempt in range(2):
            try:
                return await self._call_kimi(text), None
            except Exception as exc:
                last_error = exc
                logger.warning("TranslatorAgent Kimi attempt %s failed: %s", attempt + 1, exc)
                await asyncio.sleep(0.2 * (attempt + 1))

        try:
            return await self._call_kimi_plain(text), None
        except Exception as exc:
            last_error = exc
            logger.warning("TranslatorAgent Kimi plain-format fallback failed: %s", exc)
            return None, last_error

    def _get_kimi_client(self):
        if self.kimi_client is None:
            self.kimi_client = OpenAI(
                api_key=os.getenv("MOONSHOT_API_KEY", ""),
                base_url="https://api.moonshot.cn/v1",
            )
        return self.kimi_client

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

    def _split_for_recovery(self, text: str) -> list[str]:
        if len(text) <= 180:
            return [text]
        target = max(180, min(260, len(text) // 2))
        smaller = self._split_segments(text, max_len=target)
        if len(smaller) > 1:
            return smaller
        midpoint = len(text) // 2
        return [text[:midpoint], text[midpoint:]]

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
            self._get_kimi_client().chat.completions.create,
            model=self.moonshot_model,
            messages=[{"role": "user", "content": prompt}],
            temperature=0.3,
        )
        content = response.choices[0].message.content
        return self._parse_json(content)

    async def _call_kimi_plain(self, text: str) -> dict:
        prompt = (
            "请对以下古文进行处理：\n"
            "1. 添加现代标点符号\n"
            "2. 翻译为通俗易懂的白话文\n\n"
            f"古文原文：\n{text}\n\n"
            "请严格按下面两段返回，不要加解释：\n"
            "标点文：...\n"
            "白话译：..."
        )
        response = await asyncio.to_thread(
            self._get_kimi_client().chat.completions.create,
            model=self.moonshot_model,
            messages=[{"role": "user", "content": prompt}],
            temperature=0.3,
        )
        content = response.choices[0].message.content
        return self._parse_plain_response(content)

    async def _call_deepseek(self, text: str) -> dict:
        if not self.deepseek_enabled:
            raise RuntimeError("DeepSeek API key not configured")
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
            model=self.deepseek_model,
            messages=[{"role": "user", "content": prompt}],
            temperature=0.3,
        )
        content = response.choices[0].message.content
        return self._parse_json(content)

    async def _call_zhipu(self, text: str) -> dict:
        if not self.zhipu_enabled:
            raise RuntimeError("Zhipu API key not configured")
        if self.zhipu_client is None:
            self.zhipu_client = OpenAI(
                api_key=get_zhipu_api_key(),
                base_url="https://open.bigmodel.cn/api/paas/v4",
            )
        prompt = (
            "请对以下古文进行处理：\n"
            "1. 添加现代标点符号\n"
            "2. 翻译为白话文\n\n"
            f"古文：{text}\n\n"
            '返回JSON格式：{"punctuated": "...", "translated": "..."}'
        )
        response = await asyncio.to_thread(
            self.zhipu_client.chat.completions.create,
            model=self.zhipu_model,
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

    def _parse_plain_response(self, content: str) -> dict:
        punctuated_match = re.search(r"标点文[:：]\s*(.+?)(?:\n+白话译[:：]|$)", content, re.DOTALL)
        translated_match = re.search(r"白话译[:：]\s*(.+)$", content, re.DOTALL)
        if punctuated_match and translated_match:
            return {
                "punctuated": punctuated_match.group(1).strip(),
                "translated": translated_match.group(1).strip(),
            }
        raise ValueError("Unable to parse plain translation response")

    def normalize_variants(self, text: str) -> str:
        if self.converter is None:
            try:
                from opencc import OpenCC

                self.converter = OpenCC("t2s")
            except ImportError:
                return text
        return self.converter.convert(text)
