# -*- coding: utf-8 -*-
"""
WordExplainerAgent - ZhipuAI + RAG word explanation for ancient Chinese text.
Explains word meaning, allusion, and provides RAG-sourced citations.
"""
import os
import asyncio
import json
import re
from openai import OpenAI

from core.runtime_checks import get_zhipu_api_key

class WordExplainerAgent:
    def __init__(self):
        self.zhipu_client = OpenAI(
            api_key=get_zhipu_api_key(),
            base_url="https://open.bigmodel.cn/api/paas/v4",
        )
        self._rag_agent = None

    @property
    def rag_agent(self):
        if self._rag_agent is None:
            try:
                from agents.rag import RAGAgent

                self._rag_agent = RAGAgent()
            except Exception:
                self._rag_agent = None
        return self._rag_agent

    @staticmethod
    def _strip_code_fences(content: str) -> str:
        text = (content or "").strip()
        text = re.sub(r"^```(?:json|JSON)?\s*", "", text)
        text = re.sub(r"\s*```$", "", text)
        return text.strip()

    @classmethod
    def _extract_balanced_json(cls, content: str) -> str | None:
        text = cls._strip_code_fences(content)
        start = text.find("{")
        if start == -1:
            return None
        depth = 0
        in_string = False
        escaped = False
        for index in range(start, len(text)):
            char = text[index]
            if in_string:
                if escaped:
                    escaped = False
                elif char == "\\":
                    escaped = True
                elif char == '"':
                    in_string = False
                continue
            if char == '"':
                in_string = True
            elif char == "{":
                depth += 1
            elif char == "}":
                depth -= 1
                if depth == 0:
                    return text[start:index + 1]
        return None

    @classmethod
    def _extract_field_with_regex(cls, content: str, field_name: str) -> str:
        text = cls._strip_code_fences(content)
        json_key_pattern = re.compile(
            rf'"{field_name}"\s*:\s*"(?P<value>(?:[^"\\]|\\.)*)"',
            re.DOTALL,
        )
        match = json_key_pattern.search(text)
        if match:
            raw_value = match.group("value")
            try:
                return json.loads(f'"{raw_value}"').strip()
            except json.JSONDecodeError:
                return raw_value.strip()

        label_map = {
            "meaning": ("meaning", "释义", "含义", "意思"),
            "allusion": ("allusion", "典故", "来源"),
        }
        for raw_line in text.splitlines():
            line = raw_line.strip().lstrip("-*0123456789.、)） ")
            if not line:
                continue
            for label in label_map.get(field_name, (field_name,)):
                if line.lower().startswith(f"{label.lower()}:") or line.startswith(f"{label}："):
                    _, _, value = line.partition(":" if ":" in line else "：")
                    return value.strip()
        return ""

    @classmethod
    def _parse_explanation_payload(cls, content: str) -> dict:
        cleaned = cls._strip_code_fences(content)

        try:
            payload = json.loads(cleaned)
            if isinstance(payload, dict):
                return {
                    "meaning": str(payload.get("meaning") or "").strip(),
                    "allusion": str(payload.get("allusion") or "").strip(),
                }
        except json.JSONDecodeError:
            pass

        balanced = cls._extract_balanced_json(cleaned)
        if balanced:
            try:
                payload = json.loads(balanced)
                if isinstance(payload, dict):
                    return {
                        "meaning": str(payload.get("meaning") or "").strip(),
                        "allusion": str(payload.get("allusion") or "").strip(),
                    }
            except json.JSONDecodeError:
                pass

        meaning = cls._extract_field_with_regex(cleaned, "meaning")
        allusion = cls._extract_field_with_regex(cleaned, "allusion")
        if meaning or allusion:
            return {"meaning": meaning, "allusion": allusion}

        paragraphs = [line.strip() for line in cleaned.splitlines() if line.strip()]
        return {
            "meaning": paragraphs[0] if paragraphs else cleaned,
            "allusion": paragraphs[1] if len(paragraphs) > 1 else "",
        }

    async def explain_word(self, word: str, context: str = "") -> dict:
        """
        Explain an ancient Chinese word/term.

        Args:
            word: The word to explain.
            context: Optional surrounding text for disambiguation.

        Returns:
            dict with keys: meaning, allusion, citations
        """
        try:
            prompt = f'请解释古文字词"{word}"的含义和典故。'
            if context:
                prompt += f"\n上下文：{context}"
            prompt += '\n\n返回JSON格式：{"meaning": "字词释义", "allusion": "典故来源"}'

            response = await asyncio.to_thread(
                self.zhipu_client.chat.completions.create,
                model="glm-4",
                messages=[
                    {"role": "system", "content": "你只返回 JSON，不要使用 markdown 代码块，也不要补充额外解释。"},
                    {"role": "user", "content": prompt},
                ],
                temperature=0.3,
            )
            content = response.choices[0].message.content
            result = self._parse_explanation_payload(content)

            # RAG citations
            citations = []
            if self.rag_agent:
                try:
                    rag_result = self.rag_agent.query_ancient_text(
                        f"{word}的含义和用法"
                    )
                    citations = rag_result.get("citations", [])
                except Exception:
                    pass

            result["citations"] = citations
            return result
        except Exception as e:
            return {
                "meaning": f"释义服务暂不可用: {str(e)}",
                "allusion": "",
                "citations": [],
            }
