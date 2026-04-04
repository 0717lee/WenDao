# -*- coding: utf-8 -*-
"""
Sentence explainer for WenDao reader-side close reading.
Builds structured sentence notes for:
  - token-by-token gloss
  - plain-language translation
  - related references
  - rhetoric summary and follow-up prompt
"""
from __future__ import annotations

import asyncio
import json
import re
from typing import Any

from openai import OpenAI

from agents.rag import RAGAgent
from agents.translator import TranslatorAgent
from core.runtime_checks import get_zhipu_api_key


TOKEN_PATTERN = re.compile(r"[，。！？；：“”‘’、\s]")


class SentenceExplainerAgent:
    def __init__(self) -> None:
        api_key = get_zhipu_api_key()
        self.zhipu_client = (
            OpenAI(
                api_key=api_key,
                base_url="https://open.bigmodel.cn/api/paas/v4",
            )
            if api_key
            else None
        )
        self.translator_agent = TranslatorAgent()
        self.rag_agent = RAGAgent()

    def _tokenize_sentence(self, sentence: str) -> list[str]:
        tokens = [char for char in TOKEN_PATTERN.sub("", sentence) if char.strip()]
        return tokens[:24]

    def _fallback_gloss(self, sentence: str) -> dict[str, Any]:
        return {
            "gloss": [
                {
                    "token": token,
                    "explanation": "请结合上下文理解这一字在句中的具体义项。",
                }
                for token in self._tokenize_sentence(sentence)
            ],
            "rhetoric": "可先结合上下文判断句式、语气和作者强调的重点。",
            "follow_up": f"这句话放回全文里，前后文是怎样一步步把“{sentence[:6]}”说清楚的？",
        }

    def _parse_json_object(self, content: str) -> dict[str, Any]:
        try:
            payload = json.loads(content)
            return payload if isinstance(payload, dict) else {}
        except json.JSONDecodeError:
            match = re.search(r"\{.*\}", content, re.DOTALL)
            if not match:
                return {}
            try:
                payload = json.loads(match.group())
                return payload if isinstance(payload, dict) else {}
            except json.JSONDecodeError:
                return {}

    async def generate_gloss(
        self,
        document_title: str,
        sentence: str,
        context: str = "",
        chapter_title: str = "",
    ) -> dict[str, Any]:
        if self.zhipu_client is None:
            return self._fallback_gloss(sentence)

        prompt = (
            "你是古籍课堂里的带读老师，请对一句古文做逐句精讲。\n"
            "要求：\n"
            "1. 优先做逐字或逐词解释，适合初学者\n"
            "2. 修辞分析只写一句话，直说最关键的句式或语气\n"
            "3. 追问要像老师继续启发学生，不要空泛\n"
            "4. 只返回 JSON，不要附加解释\n\n"
            f"书名：{document_title}\n"
            f"篇章：{chapter_title or '未提供'}\n"
            f"句子：{sentence}\n"
            f"上下文：{context or '未提供'}\n"
            f"建议拆解的字词：{', '.join(self._tokenize_sentence(sentence))}\n\n"
            '返回格式：{"gloss":[{"token":"学","explanation":"学习"}],"rhetoric":"一句话概括","follow_up":"一句启发式追问"}'
        )

        try:
            response = await asyncio.to_thread(
                self.zhipu_client.chat.completions.create,
                model="glm-4-flash",
                messages=[
                    {
                        "role": "system",
                        "content": "你只返回结构化 JSON，不要使用 markdown 代码块。",
                    },
                    {"role": "user", "content": prompt},
                ],
                temperature=0.2,
            )
            parsed = self._parse_json_object(response.choices[0].message.content or "")
        except Exception:
            parsed = {}

        gloss = parsed.get("gloss")
        if not isinstance(gloss, list) or not gloss:
            return self._fallback_gloss(sentence)

        normalized_gloss: list[dict[str, str]] = []
        for item in gloss[:24]:
            if not isinstance(item, dict):
                continue
            token = str(item.get("token") or "").strip()
            explanation = str(item.get("explanation") or "").strip()
            if token and explanation:
                normalized_gloss.append({"token": token, "explanation": explanation})

        if not normalized_gloss:
            return self._fallback_gloss(sentence)

        return {
            "gloss": normalized_gloss,
            "rhetoric": str(parsed.get("rhetoric") or "").strip() or "建议结合上下文观察语气和句式重点。",
            "follow_up": str(parsed.get("follow_up") or "").strip() or f"为什么作者会在这里特别强调“{sentence[:6]}”？",
        }

    async def translate_sentence(self, sentence: str) -> str:
        try:
            result = await self.translator_agent.punctuate_and_translate(sentence)
            translated = str(result.get("translated") or "").strip()
            if translated:
                return translated
        except Exception:
            pass
        return "这句话的白话解释暂时未生成成功，请稍后再试。"

    async def retrieve_references(
        self,
        document_title: str,
        sentence: str,
        context: str = "",
    ) -> list[dict[str, str]]:
        query = " ".join(part for part in [document_title, sentence, context] if part).strip()
        try:
            result = await asyncio.to_thread(self.rag_agent.query_ancient_text, query)
            citations = result.get("citations", [])
        except Exception:
            citations = []

        normalized: list[dict[str, str]] = []
        for citation in citations[:3]:
            if not isinstance(citation, dict):
                continue
            normalized.append(
                {
                    "title": str(citation.get("title") or "").strip(),
                    "source": str(citation.get("source") or "").strip(),
                    "excerpt": str(citation.get("excerpt") or "").strip(),
                }
            )
        return normalized
