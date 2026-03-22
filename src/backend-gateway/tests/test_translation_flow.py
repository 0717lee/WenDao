# -*- coding: utf-8 -*-
"""
Translation pipeline integration tests.
Tests the full flow: raw text -> punctuation -> translation -> OpenCC normalization.
All external API calls mocked.
"""
import os
import sys
import json
import pytest
from unittest.mock import Mock, patch, AsyncMock

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from agents.translator import TranslatorAgent


def _make_mock_openai(punctuated, translated):
    """Helper to create a mock OpenAI client returning given punctuated/translated."""
    mock_response = Mock()
    mock_response.choices = [Mock()]
    mock_response.choices[0].message.content = json.dumps(
        {"punctuated": punctuated, "translated": translated},
        ensure_ascii=False,
    )
    mock_client = Mock()
    mock_client.chat.completions.create.return_value = mock_response
    return mock_client


class TestFullPipelineSuccess:
    """Full translation pipeline: text in -> punctuated + translated text out"""

    @patch("agents.translator.OpenAI")
    def test_full_pipeline_success(self, mock_openai_cls):
        mock_openai_cls.return_value = _make_mock_openai(
            "大学之道，在明明德。", "大学的宗旨，在于彰明美德。"
        )
        agent = TranslatorAgent()
        agent.converter = Mock()
        agent.converter.convert.side_effect = lambda t: t

        import asyncio
        result = asyncio.run(agent.punctuate_and_translate("大学之道在明明德"))

        assert result["punctuated"] == "大学之道，在明明德。"
        assert "美德" in result["translated"]


class TestPunctuationAddsMarks:
    """Punctuation correctly adds marks to classical Chinese"""

    @patch("agents.translator.OpenAI")
    def test_punctuation_adds_marks(self, mock_openai_cls):
        mock_openai_cls.return_value = _make_mock_openai(
            "天命之谓性，率性之谓道，修道之谓教。",
            "上天赋予的叫做性，顺本性行事叫做道，修养道德叫做教。",
        )
        agent = TranslatorAgent()
        agent.converter = Mock()
        agent.converter.convert.side_effect = lambda t: t

        import asyncio
        result = asyncio.run(agent.punctuate_and_translate("天命之谓性率性之谓道修道之谓教"))

        assert "，" in result["punctuated"]
        assert "。" in result["punctuated"]


class TestOpenCCNormalization:
    """OpenCC traditional-to-simplified normalization"""

    @patch("agents.translator.OpenAI")
    def test_opencc_normalization(self, mock_openai_cls):
        mock_openai_cls.return_value = _make_mock_openai("國學經典。", "国学经典。")
        agent = TranslatorAgent()
        mock_converter = Mock()
        mock_converter.convert.return_value = "国学经典。"
        agent.converter = mock_converter

        import asyncio
        result = asyncio.run(agent.punctuate_and_translate("國學經典"))

        mock_converter.convert.assert_called()


class TestEmptyTextInput:
    """Empty text input returns empty result"""

    @patch("agents.translator.OpenAI")
    def test_empty_text_input(self, mock_openai_cls):
        mock_openai_cls.return_value = _make_mock_openai("", "")
        agent = TranslatorAgent()
        agent.converter = Mock()
        agent.converter.convert.side_effect = lambda t: t

        import asyncio
        result = asyncio.run(agent.punctuate_and_translate(""))

        assert result["punctuated"] == ""
        assert result["translated"] == ""


class TestLongTextHandled:
    """Very long text (>5000 chars) is split into segments and handled"""

    @patch("agents.translator.OpenAI")
    def test_long_text_segmented(self, mock_openai_cls):
        mock_openai_cls.return_value = _make_mock_openai("段。", "Segment.")
        agent = TranslatorAgent()
        agent.converter = Mock()
        agent.converter.convert.side_effect = lambda t: t

        long_text = "天" * 5001
        segments = agent._split_segments(long_text, max_len=400)
        assert len(segments) > 1
        assert "".join(segments) == long_text


class TestMixedModernClassical:
    """Text with mixed modern/classical Chinese"""

    @patch("agents.translator.OpenAI")
    def test_mixed_text(self, mock_openai_cls):
        mock_openai_cls.return_value = _make_mock_openai(
            "今天学习《论语》，子曰：学而时习之。",
            "Today we study the Analerta. The Master said: to learn and practice regularly.",
        )
        agent = TranslatorAgent()
        agent.converter = Mock()
        agent.converter.convert.side_effect = lambda t: t

        import asyncio
        result = asyncio.run(agent.punctuate_and_translate("今天学习论语子曰学而时习之"))

        assert "punctuated" in result
        assert "translated" in result


class TestAPIFailureGracefulError:
    """Pipeline with translation API mock failure returns graceful error"""

    @patch("agents.translator.OpenAI")
    def test_api_failure_graceful(self, mock_openai_cls):
        mock_client = Mock()
        mock_client.chat.completions.create.side_effect = Exception("API unavailable")
        mock_openai_cls.return_value = mock_client

        agent = TranslatorAgent()

        import asyncio
        with pytest.raises(Exception):
            asyncio.run(agent.punctuate_and_translate("测试文本"))


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
