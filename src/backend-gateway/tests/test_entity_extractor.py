# -*- coding: utf-8 -*-
"""
Entity extractor unit tests.
Tests fast path (substring), enhanced path (GLM-4), batch, and edge cases.
"""
import json
import os
import sys
import pytest
from unittest.mock import Mock, patch, mock_open

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from core.entity_extractor import EntityExtractor


# Sample graph data for tests
SAMPLE_GRAPH = {
    "nodes": [
        {"id": "kongzi", "label": "孔子", "group": "人物", "desc": ""},
        {"id": "lunyu", "label": "论语", "group": "典籍", "desc": ""},
        {"id": "mengzi", "label": "孟子", "group": "人物", "desc": ""},
        {"id": "rujia", "label": "儒家", "group": "思想流派", "desc": ""},
        {"id": "chunqiu", "label": "春秋", "group": "典籍", "desc": ""},
        {"id": "daodejing", "label": "道德经", "group": "典籍", "desc": ""},
        {"id": "laozi", "label": "老子", "group": "人物", "desc": ""},
    ],
    "edges": [],
    "stats": {"nodes": 7, "edges": 0},
}


@pytest.fixture
def tmp_graph_file(tmp_path):
    """Create a temporary graph JSON file."""
    path = tmp_path / "test_graph.json"
    path.write_text(json.dumps(SAMPLE_GRAPH, ensure_ascii=False), encoding="utf-8")
    return str(path)


@pytest.fixture
def extractor(tmp_graph_file):
    """Entity extractor loaded with sample graph data."""
    return EntityExtractor(graph_path=tmp_graph_file)


class TestExtractEntitiesFastPath:
    """Test substring matching (fast path)."""

    def test_finds_single_entity(self, extractor):
        result = extractor.extract_entities("孔子是伟大的思想家")
        assert "kongzi" in result

    def test_finds_multiple_entities(self, extractor):
        result = extractor.extract_entities("孔子编撰了论语和春秋")
        assert "kongzi" in result
        assert "lunyu" in result
        assert "chunqiu" in result

    def test_no_entities_found(self, extractor):
        result = extractor.extract_entities("今天天气很好")
        assert result == []

    def test_empty_text(self, extractor):
        result = extractor.extract_entities("")
        assert result == []

    def test_no_duplicates(self, extractor):
        result = extractor.extract_entities("孔子说孔子是圣人")
        assert result.count("kongzi") == 1

    def test_only_returns_known_ids(self, extractor):
        """Ensure only IDs from the graph are returned."""
        result = extractor.extract_entities("孔子和庄子都是先秦思想家")
        assert "kongzi" in result
        # zhuangzi is not in our sample data
        for eid in result:
            assert eid in {"kongzi", "lunyu", "mengzi", "rujia", "chunqiu", "daodejing", "laozi"}


class TestExtractEntitiesEnhancedPath:
    """Test GLM-4 enhanced extraction."""

    @patch.dict(os.environ, {"ZHIPU_API_KEY": "test_key"})
    @patch("core.entity_extractor.ZhipuAI", create=True)
    def test_enhanced_path_returns_valid_ids(self, mock_zhipu_cls, extractor):
        """When API key set and call succeeds, use LLM result."""
        # Patch the import inside the method
        mock_client = Mock()
        mock_zhipu_cls.return_value = mock_client
        mock_response = Mock()
        mock_response.choices = [Mock()]
        mock_response.choices[0].message.content = '["kongzi", "lunyu"]'
        mock_client.chat.completions.create.return_value = mock_response

        with patch("core.entity_extractor.ZhipuAI", mock_zhipu_cls):
            result = extractor.extract_entities("孔子编撰了论语")

        assert "kongzi" in result
        assert "lunyu" in result

    @patch.dict(os.environ, {"ZHIPU_API_KEY": "test_key"})
    @patch("core.entity_extractor.ZhipuAI", create=True)
    def test_enhanced_path_filters_unknown_ids(self, mock_zhipu_cls, extractor):
        """LLM returns hallucinated IDs, only known ones kept."""
        mock_client = Mock()
        mock_zhipu_cls.return_value = mock_client
        mock_response = Mock()
        mock_response.choices = [Mock()]
        mock_response.choices[0].message.content = '["kongzi", "fake_id", "unknown"]'
        mock_client.chat.completions.create.return_value = mock_response

        with patch("core.entity_extractor.ZhipuAI", mock_zhipu_cls):
            result = extractor.extract_entities("孔子")

        assert "kongzi" in result
        assert "fake_id" not in result
        assert "unknown" not in result

    @patch.dict(os.environ, {"ZHIPU_API_KEY": "test_key"})
    @patch("core.entity_extractor.ZhipuAI", create=True)
    def test_enhanced_path_fallback_on_api_error(self, mock_zhipu_cls, extractor):
        """When API fails, fall back to fast path."""
        mock_client = Mock()
        mock_zhipu_cls.return_value = mock_client
        mock_client.chat.completions.create.side_effect = Exception("API Error")

        with patch("core.entity_extractor.ZhipuAI", mock_zhipu_cls):
            result = extractor.extract_entities("孔子编撰了论语")

        # Should still find entities via fast path
        assert "kongzi" in result
        assert "lunyu" in result

    @patch.dict(os.environ, {}, clear=False)
    def test_no_api_key_uses_fast_path(self, extractor):
        """Without ZHIPU_API_KEY, fast path is used."""
        # Remove key if present
        os.environ.pop("ZHIPU_API_KEY", None)
        result = extractor.extract_entities("孔子编撰了论语")
        assert "kongzi" in result
        assert "lunyu" in result


class TestExtractEntitiesBatch:
    """Test batch extraction."""

    def test_batch_returns_correct_count(self, extractor):
        texts = ["孔子", "老子写了道德经", "今天天气不错"]
        results = extractor.extract_entities_batch(texts)
        assert len(results) == 3

    def test_batch_results_match_individual(self, extractor):
        texts = ["孔子编撰了论语", "老子写了道德经"]
        batch = extractor.extract_entities_batch(texts)
        individual = [extractor.extract_entities(t) for t in texts]
        assert batch == individual

    def test_batch_empty_list(self, extractor):
        assert extractor.extract_entities_batch([]) == []


class TestExtractorEdgeCases:
    """Test edge cases and error handling."""

    def test_missing_graph_file(self, tmp_path):
        """Gracefully handle missing JSON file."""
        ext = EntityExtractor(graph_path=str(tmp_path / "nonexistent.json"))
        assert ext.known_entity_count == 0
        assert ext.extract_entities("孔子") == []

    def test_invalid_json_file(self, tmp_path):
        """Gracefully handle invalid JSON."""
        bad_file = tmp_path / "bad.json"
        bad_file.write_text("not valid json", encoding="utf-8")
        ext = EntityExtractor(graph_path=str(bad_file))
        assert ext.known_entity_count == 0

    def test_known_entity_count(self, extractor):
        assert extractor.known_entity_count == 7


class TestExtractorWithRealGraphData:
    """Test with the actual ancient_texts_graph.json if available."""

    @pytest.fixture
    def real_extractor(self):
        """Load the real graph data file."""
        real_path = os.path.join(
            os.path.dirname(__file__), "..", "data", "ancient_texts_graph.json"
        )
        if not os.path.exists(real_path):
            pytest.skip("Real graph data not available")
        return EntityExtractor(graph_path=real_path)

    def test_loads_all_entities(self, real_extractor):
        assert real_extractor.known_entity_count > 100

    def test_finds_entities_in_sample_text(self, real_extractor):
        result = real_extractor.extract_entities("孔子是春秋时期的思想家，著有论语")
        assert len(result) > 0
        # At minimum should find kongzi and lunyu
        assert "kongzi" in result or any("kong" in r for r in result)


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
