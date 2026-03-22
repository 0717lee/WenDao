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


class WordExplainerAgent:
    def __init__(self):
        self.zhipu_client = OpenAI(
            api_key=os.getenv("ZHIPUAI_API_KEY", ""),
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
                messages=[{"role": "user", "content": prompt}],
                temperature=0.3,
            )
            content = response.choices[0].message.content

            try:
                result = json.loads(content)
            except json.JSONDecodeError:
                match = re.search(r"\{.*\}", content, re.DOTALL)
                if match:
                    result = json.loads(match.group())
                else:
                    result = {"meaning": content, "allusion": ""}

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
