"""Tests for knowledge graph API endpoints."""

import pytest
from fastapi.testclient import TestClient

# Reset cache before importing to ensure fresh load
import routers.knowledge_graph as kg_router
kg_router._graph_cache = None

from main import app

client = TestClient(app)


class TestGetKnowledgeGraph:
    """Test GET /api/v1/knowledge-graph"""

    def test_returns_200(self):
        resp = client.get("/api/v1/knowledge-graph")
        assert resp.status_code == 200

    def test_response_has_correct_structure(self):
        resp = client.get("/api/v1/knowledge-graph")
        data = resp.json()
        assert "nodes" in data
        assert "edges" in data
        assert "stats" in data
        assert isinstance(data["nodes"], list)
        assert isinstance(data["edges"], list)

    def test_stats_match_data(self):
        resp = client.get("/api/v1/knowledge-graph")
        data = resp.json()
        assert data["stats"]["node_count"] == len(data["nodes"])
        assert data["stats"]["edge_count"] == len(data["edges"])

    def test_has_ancient_texts_domain_nodes(self):
        resp = client.get("/api/v1/knowledge-graph")
        data = resp.json()
        # Should have 200+ nodes from ancient texts domain
        assert len(data["nodes"]) >= 200
        groups = set(data["stats"]["groups"])
        assert "人物" in groups
        assert "典籍" in groups


class TestGetStats:
    """Test GET /api/v1/knowledge-graph/stats"""

    def test_returns_200(self):
        resp = client.get("/api/v1/knowledge-graph/stats")
        assert resp.status_code == 200

    def test_has_counts_and_groups(self):
        resp = client.get("/api/v1/knowledge-graph/stats")
        data = resp.json()
        assert "node_count" in data
        assert "edge_count" in data
        assert "groups" in data
        assert data["node_count"] >= 200


class TestSearchEndpoint:
    """Test GET /api/v1/knowledge-graph/search"""

    def test_search_kongzi(self):
        resp = client.get("/api/v1/knowledge-graph/search", params={"q": "孔子"})
        assert resp.status_code == 200
        data = resp.json()
        assert data["count"] >= 1
        labels = [n["label"] for n in data["nodes"]]
        assert "孔子" in labels

    def test_search_by_desc(self):
        resp = client.get("/api/v1/knowledge-graph/search", params={"q": "儒家"})
        assert resp.status_code == 200
        data = resp.json()
        assert data["count"] >= 1

    def test_search_no_results(self):
        resp = client.get("/api/v1/knowledge-graph/search", params={"q": "xyz不存在的内容"})
        assert resp.status_code == 200
        data = resp.json()
        assert data["count"] == 0
        assert data["nodes"] == []

    def test_search_requires_query(self):
        resp = client.get("/api/v1/knowledge-graph/search")
        assert resp.status_code == 422


class TestNodeDetailEndpoint:
    """Test GET /api/v1/knowledge-graph/node/{node_id}"""

    def test_valid_node(self):
        resp = client.get("/api/v1/knowledge-graph/node/kongzi")
        assert resp.status_code == 200
        data = resp.json()
        assert data["node"]["id"] == "kongzi"
        assert data["node"]["label"] == "孔子"
        assert isinstance(data["edges"], list)
        assert isinstance(data["neighbors"], list)
        assert len(data["edges"]) > 0
        assert len(data["neighbors"]) > 0

    def test_invalid_node_returns_404(self):
        resp = client.get("/api/v1/knowledge-graph/node/nonexistent_node_xyz")
        assert resp.status_code == 404

    def test_node_neighbors_are_valid(self):
        resp = client.get("/api/v1/knowledge-graph/node/kongzi")
        data = resp.json()
        neighbor_ids = {n["id"] for n in data["neighbors"]}
        # All edge endpoints (other than kongzi) should be in neighbors
        for edge in data["edges"]:
            other = edge["to"] if edge["from"] == "kongzi" else edge["from"]
            assert other in neighbor_ids
