# -*- coding: utf-8 -*-
"""
Unit tests for core/knowledge_graph.py.

Covers:
  - Snapshot loading (success + missing file + malformed JSON)
  - get_snapshot() structure
  - get_entity() detail + neighbors + relations
  - extract_subgraph() text-driven subgraph extraction
  - Singleton accessor
"""
import json
import os
import sys
import pytest
from unittest.mock import patch

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from core.knowledge_graph import KnowledgeGraph


SAMPLE_SNAPSHOT = {
    "version": "1.0",
    "nodes": [
        {"id": "kongzi", "label": "孔子", "group": "人物", "desc": "儒家创始人", "era": "春秋", "aliases": ["仲尼"]},
        {"id": "lunyu", "label": "论语", "group": "典籍", "desc": "儒家经典", "era": "春秋", "aliases": []},
        {"id": "ren", "label": "仁", "group": "概念", "desc": "儒家核心概念", "era": "先秦", "aliases": []},
        {"id": "mengzi", "label": "孟子", "group": "人物", "desc": "儒家代表", "era": "战国", "aliases": []},
    ],
    "edges": [
        {"source": "kongzi", "target": "lunyu", "relation": "著作", "desc": "孔子言行记录成论语"},
        {"source": "kongzi", "target": "ren", "relation": "倡导", "desc": "孔子以仁为核心"},
        {"source": "mengzi", "target": "kongzi", "relation": "师承", "desc": "孟子私淑孔子"},
    ],
    "stats": {"nodes": 4, "edges": 3},
}


@pytest.fixture
def snapshot_file(tmp_path):
    """Create a temporary snapshot JSON file."""
    path = tmp_path / "graph_snapshot.json"
    path.write_text(json.dumps(SAMPLE_SNAPSHOT, ensure_ascii=False), encoding="utf-8")
    return str(path)


@pytest.fixture
def graph(snapshot_file):
    """KnowledgeGraph loaded with the sample snapshot."""
    return KnowledgeGraph(snapshot_path=snapshot_file)


class TestSnapshotLoading:
    def test_loads_nodes_and_edges(self, graph):
        assert graph.loaded is True
        assert graph.node_count == 4
        assert graph.edge_count == 3

    def test_missing_snapshot_file(self, tmp_path):
        """Missing file should not raise; graph stays unloaded."""
        graph = KnowledgeGraph(snapshot_path=str(tmp_path / "nonexistent.json"))
        assert graph.loaded is False
        assert graph.node_count == 0
        assert graph.edge_count == 0

    def test_malformed_json(self, tmp_path):
        """Malformed JSON should not raise; graph stays unloaded."""
        bad = tmp_path / "bad.json"
        bad.write_text("not valid json", encoding="utf-8")
        graph = KnowledgeGraph(snapshot_path=str(bad))
        assert graph.loaded is False


class TestGetSnapshot:
    def test_returns_full_structure(self, graph):
        snap = graph.get_snapshot()
        assert snap["version"] == "1.0"
        assert len(snap["nodes"]) == 4
        assert len(snap["edges"]) == 3
        assert snap["stats"]["nodes"] == 4
        assert snap["stats"]["edges"] == 3

    def test_empty_when_not_loaded(self, tmp_path):
        graph = KnowledgeGraph(snapshot_path=str(tmp_path / "missing.json"))
        snap = graph.get_snapshot()
        assert snap["nodes"] == []
        assert snap["edges"] == []
        assert snap["stats"]["nodes"] == 0


class TestGetEntity:
    def test_returns_entity_with_neighbors(self, graph):
        detail = graph.get_entity("kongzi")
        assert detail is not None
        assert detail["entity"]["id"] == "kongzi"
        # kongzi has 3 relations: 著作->lunyu, 倡导->ren, 师承<-mengzi
        assert len(detail["relations"]) == 3
        neighbor_ids = {n["id"] for n in detail["neighbors"]}
        assert "lunyu" in neighbor_ids
        assert "ren" in neighbor_ids
        assert "mengzi" in neighbor_ids

    def test_unknown_entity_returns_none(self, graph):
        assert graph.get_entity("nonexistent") is None

    def test_relations_include_direction(self, graph):
        """Outbound and inbound relations are both captured.

        kongzi has 2 outbound edges (著作->lunyu, 倡导->ren) plus 1 reverse
        edge from mengzi's 师承 (rendered as 被师承 with source=kongzi).
        All 3 appear in kongzi's neighbor list.
        """
        detail = graph.get_entity("kongzi")
        relations = detail["relations"]
        # All relations in kongzi's neighbor list have source=kongzi
        # (reverse edges are rewritten so the queried entity is always source).
        for relation in relations:
            assert relation["source"] == "kongzi"
        # 2 original outbound + 1 reverse (被师承) = 3
        assert len(relations) == 3
        # The reverse edge should be marked as 被师承
        reverse_relations = [r for r in relations if r["relation"].startswith("被")]
        assert len(reverse_relations) == 1
        assert reverse_relations[0]["target"] == "mengzi"


class TestExtractSubgraph:
    def test_extracts_entities_from_text(self, graph):
        result = graph.extract_subgraph("孔子是伟大的思想家")
        assert "kongzi" in [e["id"] for e in result["entities"]]
        assert len(result["nodes"]) >= 1
        assert result["stats"]["matched_entities"] >= 1

    def test_includes_neighbor_nodes(self, graph):
        """When kongzi is mentioned, neighbors (lunyu, ren, mengzi) appear."""
        result = graph.extract_subgraph("孔子编撰了论语")
        node_ids = {n["id"] for n in result["nodes"]}
        assert "kongzi" in node_ids
        assert "lunyu" in node_ids
        # ren is a neighbor of kongzi via 倡导
        assert "ren" in node_ids

    def test_empty_text_returns_empty(self, graph):
        result = graph.extract_subgraph("")
        assert result["entities"] == []
        assert result["nodes"] == []
        assert result["stats"]["matched_entities"] == 0

    def test_no_match_returns_empty(self, graph):
        result = graph.extract_subgraph("今天天气很好")
        assert result["entities"] == []
        assert result["nodes"] == []

    def test_max_nodes_cap(self, graph):
        """Subgraph respects max_nodes limit."""
        result = graph.extract_subgraph("孔子孟子", max_nodes=1)
        assert len(result["nodes"]) <= 1
        # Edges should only reference nodes that survived the cap
        for edge in result["edges"]:
            assert edge["source"] in {n["id"] for n in result["nodes"]}
            assert edge["target"] in {n["id"] for n in result["nodes"]}

    def test_does_not_call_llm_enhanced_path(self, graph):
        """extract_subgraph must use the fast path only, never GLM-4.

        This guards against regressing into per-open ZHIPUAI quota consumption
        when the sidebar view extracts entities from the current paragraph.

        We assert both sides of the contract:
        - extract_entities_fast IS called (positive proof)
        - extract_entities (the LLM-capable entry) is NOT called (negative proof)
        """
        with patch.object(
            graph._extractor, "extract_entities_fast",
            wraps=graph._extractor.extract_entities_fast,
        ) as spy_fast, patch.object(
            graph._extractor, "extract_entities",
            wraps=graph._extractor.extract_entities,
        ) as spy_full:
            result = graph.extract_subgraph("孔子编撰了论语")
            # Must have produced a result via fast path...
            assert "kongzi" in [e["id"] for e in result["entities"]]
            # ...by calling extract_entities_fast exactly once...
            assert spy_fast.call_count == 1
            # ...and never calling the LLM-capable extract_entities.
            assert spy_full.call_count == 0

    def test_uses_fast_path_even_with_api_key(self, graph, monkeypatch):
        """Even when ZHIPUAI_API_KEY is configured, extract_subgraph stays local."""
        monkeypatch.setenv("ZHIPUAI_API_KEY", "fake-key-for-test")
        with patch.object(
            graph._extractor, "extract_entities_fast",
            wraps=graph._extractor.extract_entities_fast,
        ) as spy_fast, patch.object(
            graph._extractor, "extract_entities",
            wraps=graph._extractor.extract_entities,
        ) as spy_full:
            result = graph.extract_subgraph("孔子")
            assert "kongzi" in [e["id"] for e in result["entities"]]
            assert spy_fast.call_count == 1
            assert spy_full.call_count == 0


class TestRealSnapshot:
    """Tests against the real graph_snapshot.json shipped with the project."""

    @pytest.fixture
    def real_graph(self):
        path = os.path.join(os.path.dirname(__file__), "..", "data", "graph_snapshot.json")
        if not os.path.exists(path):
            pytest.skip("Real graph snapshot not available")
        return KnowledgeGraph(snapshot_path=path)

    def test_loads_successfully(self, real_graph):
        assert real_graph.loaded is True
        assert real_graph.node_count >= 50
        assert real_graph.edge_count >= 30

    def test_kongzi_has_neighbors(self, real_graph):
        detail = real_graph.get_entity("kongzi")
        assert detail is not None
        assert len(detail["neighbors"]) >= 3

    def test_extract_from_classical_text(self, real_graph):
        result = real_graph.extract_subgraph("孔子曰：学而时习之")
        assert len(result["entities"]) >= 1
        assert "kongzi" in [e["id"] for e in result["entities"]]


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
