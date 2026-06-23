# -*- coding: utf-8 -*-
"""
API tests for routers/graph.py.

Uses FastAPI TestClient against the real app. The real graph_snapshot.json
is expected to be present in data/, so most tests exercise the loaded path.
A separate test class mocks an unloaded graph to verify graceful degradation.
"""
import os
import sys
import pytest
from fastapi.testclient import TestClient
from unittest.mock import patch, MagicMock

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

# Mock heavy agent modules to keep imports lightweight.
sys.modules.setdefault('agents.router', MagicMock())
sys.modules.setdefault('agents.speech', MagicMock())

from main import app  # noqa: E402

client = TestClient(app, raise_server_exceptions=False)


class TestSnapshotEndpoint:
    def test_returns_snapshot_structure(self):
        response = client.get("/api/v1/graph/snapshot")
        assert response.status_code == 200
        data = response.json()
        assert data["version"] == "1.0"
        assert "nodes" in data
        assert "edges" in data
        assert "stats" in data
        assert "loaded" in data

    def test_snapshot_has_nodes_when_loaded(self):
        """When the real snapshot is present, nodes should be non-empty."""
        response = client.get("/api/v1/graph/snapshot")
        data = response.json()
        if data.get("loaded"):
            assert len(data["nodes"]) >= 50
            assert data["stats"]["nodes"] == len(data["nodes"])
            assert data["stats"]["edges"] == len(data["edges"])

    def test_snapshot_node_has_required_fields(self):
        response = client.get("/api/v1/graph/snapshot")
        data = response.json()
        if not data.get("loaded") or not data["nodes"]:
            pytest.skip("Snapshot not loaded or empty")
        node = data["nodes"][0]
        assert "id" in node
        assert "label" in node
        assert "group" in node


class TestEntityEndpoint:
    def test_returns_entity_detail(self):
        response = client.get("/api/v1/graph/entity/kongzi")
        assert response.status_code == 200
        data = response.json()
        assert data["entity"]["id"] == "kongzi"
        assert data["entity"]["label"] == "孔子"
        assert "relations" in data
        assert "neighbors" in data

    def test_kongzi_has_neighbors(self):
        response = client.get("/api/v1/graph/entity/kongzi")
        data = response.json()
        assert len(data["neighbors"]) >= 3
        neighbor_ids = {n["id"] for n in data["neighbors"]}
        # kongzi should connect to lunyu, ren, and at least one more
        assert "lunyu" in neighbor_ids

    def test_unknown_entity_returns_404(self):
        response = client.get("/api/v1/graph/entity/nonexistent_id")
        assert response.status_code == 404

    def test_entity_relations_have_relation_field(self):
        response = client.get("/api/v1/graph/entity/kongzi")
        data = response.json()
        for relation in data["relations"]:
            assert "source" in relation
            assert "target" in relation
            assert "relation" in relation


class TestExtractEndpoint:
    def test_extracts_entities_from_text(self):
        response = client.post(
            "/api/v1/graph/extract",
            json={"text": "孔子编撰了论语，论述仁的内涵"},
        )
        assert response.status_code == 200
        data = response.json()
        entity_ids = [e["id"] for e in data["entities"]]
        assert "kongzi" in entity_ids

    def test_returns_subgraph_with_neighbors(self):
        response = client.post(
            "/api/v1/graph/extract",
            json={"text": "孔子"},
        )
        data = response.json()
        node_ids = {n["id"] for n in data["nodes"]}
        assert "kongzi" in node_ids
        # kongzi's neighbors should appear
        assert len(node_ids) >= 2

    def test_empty_text_returns_400(self):
        response = client.post(
            "/api/v1/graph/extract",
            json={"text": ""},
        )
        assert response.status_code == 400

    def test_whitespace_text_returns_400(self):
        response = client.post(
            "/api/v1/graph/extract",
            json={"text": "   "},
        )
        assert response.status_code == 400

    def test_max_nodes_out_of_range_returns_400(self):
        response = client.post(
            "/api/v1/graph/extract",
            json={"text": "孔子", "max_nodes": 0},
        )
        assert response.status_code == 400

        response = client.post(
            "/api/v1/graph/extract",
            json={"text": "孔子", "max_nodes": 500},
        )
        assert response.status_code == 400

    def test_no_match_returns_empty_subgraph(self):
        response = client.post(
            "/api/v1/graph/extract",
            json={"text": "今天天气很好，没有相关实体"},
        )
        assert response.status_code == 200
        data = response.json()
        assert data["entities"] == []
        assert data["nodes"] == []
        assert data["stats"]["matched_entities"] == 0

    def test_stats_include_matched_count(self):
        response = client.post(
            "/api/v1/graph/extract",
            json={"text": "孔子孟子"},
        )
        data = response.json()
        assert "matched_entities" in data["stats"]
        assert data["stats"]["matched_entities"] >= 1


class TestGracefulDegradation:
    """When the graph snapshot is not loaded, endpoints degrade gracefully."""

    def test_snapshot_returns_empty_when_not_loaded(self):
        """Mock the singleton to simulate an unloaded graph."""
        mock_graph = MagicMock()
        mock_graph.loaded = False
        with patch("routers.graph.get_knowledge_graph", return_value=mock_graph):
            response = client.get("/api/v1/graph/snapshot")
        assert response.status_code == 200
        data = response.json()
        assert data["loaded"] is False
        assert data["nodes"] == []
        assert data["edges"] == []

    def test_entity_returns_503_when_not_loaded(self):
        mock_graph = MagicMock()
        mock_graph.loaded = False
        with patch("routers.graph.get_knowledge_graph", return_value=mock_graph):
            response = client.get("/api/v1/graph/entity/kongzi")
        assert response.status_code == 503

    def test_extract_returns_empty_when_not_loaded(self):
        mock_graph = MagicMock()
        mock_graph.loaded = False
        with patch("routers.graph.get_knowledge_graph", return_value=mock_graph):
            response = client.post(
                "/api/v1/graph/extract",
                json={"text": "孔子"},
            )
        assert response.status_code == 200
        data = response.json()
        assert data["loaded"] is False
        assert data["entities"] == []
        assert data["nodes"] == []


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
