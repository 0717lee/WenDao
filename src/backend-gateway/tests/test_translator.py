# -*- coding: utf-8 -*-
"""
TranslatorAgent tests - all mocked, no real API calls
"""
import os
import sys
import json
import pytest
from unittest.mock import Mock, patch, MagicMock

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from agents.translator import TranslatorAgent


class TestKimiTranslateSuccess:
    """Kimi returns valid punctuated + translated JSON"""

    @patch("agents.translator.OpenAI")
    def test_kimi_translate_success(self, mock_openai_cls):
        mock_response = Mock()
        mock_response.choices = [Mock()]
        mock_response.choices[0].message.content = json.dumps(
            {"punctuated": "天命之谓性，率性之谓道。", "translated": "天所赋予的叫做性，顺着本性行事叫做道。"},
            ensure_ascii=False,
        )
        mock_client = Mock()
        mock_client.chat.completions.create.return_value = mock_response
        mock_openai_cls.return_value = mock_client

        agent = TranslatorAgent()

        import asyncio
        result = asyncio.run(agent._call_kimi("天命之谓性率性之谓道"))

        assert result["punctuated"] == "天命之谓性，率性之谓道。"
        assert "本性" in result["translated"]


class TestDeepSeekFallback:
    """When Kimi raises, DeepSeek succeeds"""

    @patch("agents.translator.OpenAI")
    def test_deepseek_fallback(self, mock_openai_cls):
        # First call creates kimi_client, second creates deepseek_client
        kimi_client = Mock()
        kimi_client.chat.completions.create.side_effect = Exception("Kimi down")
        deepseek_client = Mock()
        ds_response = Mock()
        ds_response.choices = [Mock()]
        ds_response.choices[0].message.content = json.dumps(
            {"punctuated": "有标点。", "translated": "有翻译。"}, ensure_ascii=False
        )
        deepseek_client.chat.completions.create.return_value = ds_response

        mock_openai_cls.side_effect = [kimi_client, deepseek_client]

        agent = TranslatorAgent()

        import asyncio
        result = asyncio.run(agent.punctuate_and_translate("短文"))

        assert result["punctuated"] == "有标点。"
        assert result["translated"] == "有翻译。"


class TestSegmentSplitting:
    """Text >400 chars splits correctly"""

    @patch("agents.translator.OpenAI")
    def test_segment_splitting(self, mock_openai_cls):
        agent = TranslatorAgent()
        long_text = "天" * 500
        segments = agent._split_segments(long_text, max_len=400)
        assert len(segments) >= 2
        assert "".join(segments) == long_text


class TestSegmentSplittingShort:
    """Text <=400 chars returns single segment"""

    @patch("agents.translator.OpenAI")
    def test_segment_splitting_short(self, mock_openai_cls):
        agent = TranslatorAgent()
        short_text = "天命之谓性"
        segments = agent._split_segments(short_text, max_len=400)
        assert len(segments) == 1
        assert segments[0] == short_text


class TestNormalizeVariants:
    """OpenCC t2s conversion"""

    @patch("agents.translator.OpenAI")
    def test_normalize_variants(self, mock_openai_cls):
        agent = TranslatorAgent()
        mock_converter = Mock()
        mock_converter.convert.return_value = "国学经典"
        agent.converter = mock_converter

        result = agent.normalize_variants("國學經典")
        mock_converter.convert.assert_called_once_with("國學經典")
        assert result == "国学经典"


class TestParseJsonWithMarkdown:
    """_parse_json handles ```json wrapper"""

    @patch("agents.translator.OpenAI")
    def test_parse_json_with_markdown(self, mock_openai_cls):
        agent = TranslatorAgent()
        raw = '```json\n{"punctuated": "test", "translated": "test2"}\n```'
        result = agent._parse_json(raw)
        assert result["punctuated"] == "test"
        assert result["translated"] == "test2"


class TestPunctuateAndTranslateFullFlow:
    """Full flow: split -> kimi -> normalize"""

    @patch("agents.translator.OpenAI")
    def test_punctuate_and_translate_full_flow(self, mock_openai_cls):
        mock_response = Mock()
        mock_response.choices = [Mock()]
        mock_response.choices[0].message.content = json.dumps(
            {"punctuated": "天命之谓性。", "translated": "上天赋予的叫做性。"},
            ensure_ascii=False,
        )
        mock_client = Mock()
        mock_client.chat.completions.create.return_value = mock_response
        mock_openai_cls.return_value = mock_client

        agent = TranslatorAgent()
        # bypass OpenCC
        agent.converter = Mock()
        agent.converter.convert.side_effect = lambda t: t

        import asyncio
        result = asyncio.run(agent.punctuate_and_translate("天命之谓性"))

        assert "punctuated" in result
        assert "translated" in result
        assert result["punctuated"] == "天命之谓性。"
        assert result["translated"] == "上天赋予的叫做性。"


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
