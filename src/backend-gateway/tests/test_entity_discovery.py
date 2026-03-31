"""
test_entity_discovery.py - KG-03/KG-06 Entity Discovery Tests

Tests the EntityDiscovery service for new entity extraction,
deduplication (string + semantic), fast-path fallback, and confidence scoring.
"""
import pytest
from unittest.mock import patch, MagicMock
from core.entity_discovery import EntityDiscovery, VALID_GROUPS


@pytest.fixture
def sample_graph():
    """Minimal graph with known entities."""
    return {
        "nodes": [
            {"id": "lunyu", "label": "论语", "group": "典籍", "desc": "儒家经典"},
            {"id": "kongzi", "label": "孔子", "group": "人物", "desc": "至圣先师"},
            {"id": "mengzi", "label": "孟子", "group": "人物", "desc": "亚圣"},
        ],
        "edges": [],
    }


@pytest.fixture
def discovery(sample_graph):
    return EntityDiscovery(sample_graph)


class TestEntityDiscovery:

    def test_discover_new_entity_not_in_graph(self, discovery):
        """New entity not matching any known label is discovered."""
        # Fast-path will find book-title pattern
        text = "《大学》是儒家重要经典"
        result = discovery.discover_new_entities(text, "")
        labels = [e["label"] for e in result]
        assert "大学" in labels

    def test_filter_known_entity(self, discovery):
        """Entity already in graph is filtered out."""
        text = "《论语》是儒家核心经典"
        result = discovery.discover_new_entities(text, "")
        labels = [e["label"] for e in result]
        assert "论语" not in labels

    def test_semantic_dedup_with_embeddings(self, sample_graph):
        """Entity with >0.8 embedding similarity marked as duplicate."""
        mock_embed = MagicMock()
        # New entity vector very similar to known "孔子"
        mock_embed.embed_query.return_value = [1.0] * 10
        mock_embed.embed_documents.return_value = [
            [1.0] * 10,  # 论语 - identical
            [0.0] * 10,  # 孔子
            [0.0] * 10,  # 孟子
        ]
        disc = EntityDiscovery(sample_graph, embeddings=mock_embed)
        similar = disc._check_semantic_duplicate("论语注疏", "论语的注释")
        assert similar is not None
        assert similar["similarity"] > 0.8

    def test_regex_fast_path_when_glm4_unavailable(self, discovery):
        """When ZHIPU_API_KEY not set, fast-path regex extracts book titles."""
        with patch.dict("os.environ", {}, clear=True):
            with patch.object(discovery, "_extract_with_glm4", return_value=None):
                text = "《中庸》讲述了中庸之道的核心思想"
                result = discovery.discover_new_entities(text, "")
                labels = [e["label"] for e in result]
                assert "中庸" in labels

    def test_llm_extraction_requires_explicit_flag(self, sample_graph):
        """Even with API keys present, LLM extraction stays opt-in for deterministic behavior."""
        with patch.dict("os.environ", {"ZHIPUAI_API_KEY": "live-key"}, clear=True):
            discovery = EntityDiscovery(sample_graph)
            with patch.object(discovery, "_extract_with_glm4", return_value=[
                {"label": "礼记", "group": "典籍", "desc": "LLM result", "confidence": 0.9}
            ]) as mocked_llm:
                result = discovery.discover_new_entities("《礼记》记载了古代礼仪制度", "")

        matching = [e for e in result if e["label"] == "礼记"]
        assert len(matching) == 1
        assert matching[0]["confidence"] == 0.5
        mocked_llm.assert_not_called()

    def test_entity_with_source_has_confidence(self, discovery):
        """Entities extracted via fast-path have confidence 0.5 for book titles."""
        text = "《礼记》记载了古代礼仪制度"
        result = discovery.discover_new_entities(text, "")
        matching = [e for e in result if e["label"] == "礼记"]
        assert len(matching) == 1
        assert matching[0]["confidence"] == 0.5

    def test_entity_without_corpus_low_confidence(self, discovery):
        """Quoted entities have lower confidence (0.4)."""
        text = '他提到了「程朱理学」的影响'
        result = discovery.discover_new_entities(text, "")
        matching = [e for e in result if e["label"] == "程朱理学"]
        assert len(matching) == 1
        assert matching[0]["confidence"] == 0.4

    def test_batch_discovery_from_long_text(self, discovery):
        """Multiple entities discovered from longer text."""
        text = "《大学》和《中庸》都是四书之一，「程朱理学」对其进行了深入解读"
        result = discovery.discover_new_entities(text, "")
        labels = [e["label"] for e in result]
        assert "大学" in labels
        assert "中庸" in labels

    def test_empty_text_returns_empty(self, discovery):
        """Empty text input returns empty entity list."""
        result = discovery.discover_new_entities("", "")
        assert result == []

    def test_string_similarity_dedup(self, sample_graph):
        """String containment dedup catches partial label matches."""
        disc = EntityDiscovery(sample_graph)
        similar = disc._check_string_similarity("孟子(书)")
        assert similar is not None
        assert similar["label"] == "孟子"

    def test_valid_groups_enforced(self, discovery):
        """Invalid group is normalized to default."""
        with patch.object(discovery, "_extract_entities_from_text", return_value=[
            {"label": "测试实体", "group": "无效类型", "desc": "", "confidence": 0.7}
        ]):
            result = discovery.discover_new_entities("dummy", "")
            assert result[0]["group"] == "人物"
