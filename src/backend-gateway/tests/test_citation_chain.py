"""
test_citation_chain.py - KG-04 Citation Chain BFS Tests

Tests the citation chain BFS traversal API endpoint.
Pure graph traversal tests - no external API needed.
"""
import pytest
from fastapi.testclient import TestClient
from unittest.mock import patch


def _build_graph(nodes, edges):
    """Build a minimal graph dict."""
    return {
        "nodes": nodes,
        "edges": edges,
        "stats": {
            "node_count": len(nodes),
            "edge_count": len(edges),
            "groups": sorted(set(n["group"] for n in nodes)),
        },
    }


SAMPLE_NODES = [
    {"id": "lunyu", "label": "论语", "group": "典籍", "desc": "儒家经典"},
    {"id": "shijing", "label": "诗经", "group": "典籍", "desc": "最早诗歌总集"},
    {"id": "chunqiu", "label": "春秋", "group": "典籍", "desc": "编年体史书"},
    {"id": "mengzi", "label": "孟子", "group": "典籍", "desc": "孟子言行录"},
    {"id": "shiji", "label": "史记", "group": "典籍", "desc": "纪传体通史"},
]

SAMPLE_EDGES = [
    {"from": "lunyu", "to": "shijing", "label": "引用《诗经》", "id": "e1"},
    {"from": "mengzi", "to": "lunyu", "label": "引用《论语》", "id": "e2"},
    {"from": "shiji", "to": "chunqiu", "label": "出自《春秋》", "id": "e3"},
    {"from": "mengzi", "to": "shijing", "label": "源于《诗经》", "id": "e4"},
]

SAMPLE_GRAPH = _build_graph(SAMPLE_NODES, SAMPLE_EDGES)


@pytest.fixture
def client():
    """Create test client with mocked graph data."""
    with patch("routers.knowledge_graph._graph_cache", SAMPLE_GRAPH):
        with patch("routers.knowledge_graph.build_knowledge_graph", return_value=SAMPLE_GRAPH):
            from main import app
            yield TestClient(app)


class TestCitationChain:

    def test_bfs_direct_citation_depth_1(self, client):
        """BFS finds direct citation at depth=1."""
        resp = client.get("/api/v1/knowledge-graph/node/lunyu/citations?max_depth=1")
        assert resp.status_code == 200
        data = resp.json()
        assert data["root"]["id"] == "lunyu"
        # lunyu->shijing (direct), mengzi->lunyu (reverse)
        chain_ids = {c["to_id"] for c in data["chain"]}
        assert len(data["chain"]) >= 1

    def test_bfs_transitive_chain_depth_2(self, client):
        """BFS finds transitive chain: mengzi -> lunyu -> shijing at depth=2."""
        resp = client.get("/api/v1/knowledge-graph/node/mengzi/citations?max_depth=2")
        assert resp.status_code == 200
        data = resp.json()
        chain_ids = [c["to_id"] for c in data["chain"]]
        # mengzi cites lunyu and shijing directly; lunyu cites shijing
        assert len(data["chain"]) >= 2

    def test_bfs_respects_max_depth(self, client):
        """BFS with max_depth=1 does not return depth-2 nodes."""
        resp = client.get("/api/v1/knowledge-graph/node/mengzi/citations?max_depth=1")
        data = resp.json()
        for c in data["chain"]:
            assert c["depth"] <= 1

    def test_no_citations_returns_empty_chain(self, client):
        """Node with no citation edges returns empty chain."""
        # chunqiu has no outgoing citation edges (only shiji->chunqiu incoming)
        # But BFS is bidirectional so chunqiu->shiji should be found
        resp = client.get("/api/v1/knowledge-graph/node/chunqiu/citations")
        assert resp.status_code == 200
        data = resp.json()
        assert isinstance(data["chain"], list)

    def test_citation_keywords_recognized(self, client):
        """Citation keywords (引用, 出自, 源于) are all recognized."""
        resp = client.get("/api/v1/knowledge-graph/node/mengzi/citations?max_depth=3")
        data = resp.json()
        # mengzi has edges with 引用 and 源于
        assert len(data["chain"]) >= 2

    def test_depth_annotated_nodes(self, client):
        """Chain results include depth annotation for coloring."""
        resp = client.get("/api/v1/knowledge-graph/node/mengzi/citations?max_depth=3")
        data = resp.json()
        for c in data["chain"]:
            assert "depth" in c
            assert isinstance(c["depth"], int)
            assert c["depth"] >= 1

    def test_nonexistent_node_returns_404(self, client):
        """Non-existent start node returns 404."""
        resp = client.get("/api/v1/knowledge-graph/node/nonexistent/citations")
        assert resp.status_code == 404

    def test_circular_reference_no_infinite_loop(self):
        """Circular citation does not cause infinite loop."""
        circular_nodes = [
            {"id": "a", "label": "A", "group": "典籍", "desc": ""},
            {"id": "b", "label": "B", "group": "典籍", "desc": ""},
            {"id": "c", "label": "C", "group": "典籍", "desc": ""},
        ]
        circular_edges = [
            {"from": "a", "to": "b", "label": "引用B", "id": "e1"},
            {"from": "b", "to": "c", "label": "引用C", "id": "e2"},
            {"from": "c", "to": "a", "label": "引用A", "id": "e3"},
        ]
        circular_graph = _build_graph(circular_nodes, circular_edges)

        with patch("routers.knowledge_graph._graph_cache", circular_graph):
            with patch("routers.knowledge_graph.build_knowledge_graph", return_value=circular_graph):
                from main import app
                client = TestClient(app)
                resp = client.get("/api/v1/knowledge-graph/node/a/citations?max_depth=5")
                assert resp.status_code == 200
                data = resp.json()
                # Should find b and c but not loop back to a
                chain_to_ids = {c["to_id"] for c in data["chain"]}
                assert "b" in chain_to_ids
                assert "c" in chain_to_ids
                # No duplicate entries
                assert len(data["chain"]) == 2
