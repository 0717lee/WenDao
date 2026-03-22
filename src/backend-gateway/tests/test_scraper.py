"""Tests for the ancient texts knowledge graph scraper."""

import json
import os
import tempfile

import pytest

from core.scraper import scrape_ancient_texts_data


@pytest.fixture
def graph_data():
    """Generate graph data to a temp directory."""
    with tempfile.TemporaryDirectory() as tmpdir:
        data = scrape_ancient_texts_data(output_dir=tmpdir)
        yield data


class TestScraperOutput:
    """Test the scraper produces valid graph data."""

    def test_returns_valid_structure(self, graph_data):
        assert "nodes" in graph_data
        assert "edges" in graph_data
        assert "stats" in graph_data

    def test_node_count_at_least_200(self, graph_data):
        assert len(graph_data["nodes"]) >= 200, (
            f"Expected >= 200 nodes, got {len(graph_data['nodes'])}"
        )

    def test_stats_match_actual_counts(self, graph_data):
        assert graph_data["stats"]["node_count"] == len(graph_data["nodes"])
        assert graph_data["stats"]["edge_count"] == len(graph_data["edges"])

    def test_all_four_groups_present(self, graph_data):
        groups = {n["group"] for n in graph_data["nodes"]}
        expected = {"人物", "典籍", "历史事件", "思想流派"}
        assert expected.issubset(groups), (
            f"Missing groups: {expected - groups}"
        )

    def test_no_duplicate_node_ids(self, graph_data):
        ids = [n["id"] for n in graph_data["nodes"]]
        duplicates = [nid for nid in ids if ids.count(nid) > 1]
        assert len(set(ids)) == len(ids), (
            f"Duplicate node IDs: {set(duplicates)}"
        )

    def test_all_edges_reference_existing_nodes(self, graph_data):
        node_ids = {n["id"] for n in graph_data["nodes"]}
        for edge in graph_data["edges"]:
            assert edge["from"] in node_ids, (
                f"Edge {edge['id']}: from '{edge['from']}' not in nodes"
            )
            assert edge["to"] in node_ids, (
                f"Edge {edge['id']}: to '{edge['to']}' not in nodes"
            )

    def test_nodes_have_required_fields(self, graph_data):
        for node in graph_data["nodes"]:
            assert "id" in node
            assert "label" in node
            assert "group" in node
            assert "desc" in node
            assert len(node["id"]) > 0
            assert len(node["label"]) > 0

    def test_edges_have_required_fields(self, graph_data):
        for edge in graph_data["edges"]:
            assert "id" in edge
            assert "from" in edge
            assert "to" in edge
            assert "label" in edge

    def test_no_duplicate_edge_ids(self, graph_data):
        ids = [e["id"] for e in graph_data["edges"]]
        assert len(set(ids)) == len(ids), "Duplicate edge IDs found"

    def test_json_file_written(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            scrape_ancient_texts_data(output_dir=tmpdir)
            fpath = os.path.join(tmpdir, "ancient_texts_graph.json")
            assert os.path.exists(fpath)
            with open(fpath, "r", encoding="utf-8") as f:
                data = json.load(f)
            assert len(data["nodes"]) >= 200

    def test_works_offline_without_network(self, graph_data):
        """Seed data should produce a complete graph without any network calls."""
        assert len(graph_data["nodes"]) >= 200
        assert len(graph_data["edges"]) >= 100
