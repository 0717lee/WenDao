"""Tests for MM-02: Vision result to knowledge graph node matching.

Covers match_vision_to_graph() — substring matching + architecture-term list
for linking VisionAgent analysis results to KG nodes.
"""

import pytest
from routers.vision import match_vision_to_graph, ARCH_TERMS


# --- Fixtures ---

@pytest.fixture
def kg_nodes():
    """Knowledge graph with diverse node types."""
    return {
        "nodes": [
            {"id": "yingzaofashi", "label": "营造法式", "group": "典籍", "desc": "宋代建筑规范，详述斗拱制度"},
            {"id": "dougong", "label": "斗拱构造", "group": "构件", "desc": "中国传统木构建筑的关键承重构件"},
            {"id": "feiyan", "label": "飞檐翘角", "group": "构件", "desc": "屋檐向上翘起的装饰结构"},
            {"id": "songdai", "label": "宋代建筑", "group": "朝代", "desc": "宋代建筑风格特征"},
            {"id": "lunyu", "label": "论语", "group": "典籍", "desc": "孔子言行录"},
            {"id": "tangshi", "label": "唐诗三百首", "group": "文学", "desc": "唐代诗歌选集"},
            {"id": "simiao", "label": "寺庙建筑", "group": "建筑类型", "desc": "佛教寺庙的建筑形式"},
        ],
        "edges": [],
    }


@pytest.fixture
def empty_kg():
    return {"nodes": [], "edges": []}


@pytest.fixture
def no_arch_kg():
    """KG with no architecture-related nodes."""
    return {
        "nodes": [
            {"id": "lunyu", "label": "论语", "group": "典籍", "desc": "孔子言行录"},
            {"id": "mengzi", "label": "孟子", "group": "典籍", "desc": "孟子思想"},
        ],
        "edges": [],
    }


# --- Tests ---

class TestMatchVisionToGraph:
    """MM-02: Vision-to-graph matching logic."""

    def test_match_arch_term_found_in_kg(self, kg_nodes):
        """1. Architecture term in vision text matches KG node containing that term."""
        text = "可见精美的斗拱结构，展现宋代工艺"
        matches = match_vision_to_graph(text, kg_nodes)
        ids = {m["id"] for m in matches}
        assert "dougong" in ids  # label contains "斗拱"

    def test_match_multiple_terms_from_single_result(self, kg_nodes):
        """2. Single vision result with multiple terms matches multiple nodes."""
        text = "建筑特征包括斗拱和飞檐，属于宋代风格"
        matches = match_vision_to_graph(text, kg_nodes)
        ids = {m["id"] for m in matches}
        assert len(ids) >= 2
        assert "dougong" in ids
        assert "feiyan" in ids

    def test_no_match_when_no_arch_terms(self, kg_nodes):
        """3. Vision result with no architecture terms returns empty."""
        text = "这是一张普通的风景照片，没有建筑元素"
        matches = match_vision_to_graph(text, kg_nodes)
        assert len(matches) == 0

    def test_substring_matching_partial_term_in_label(self, kg_nodes):
        """4. Substring matching: node label containing term is matched."""
        # "营造法式" is an ARCH_TERM and appears as a node label
        text = "参考了营造法式的建筑规范"
        matches = match_vision_to_graph(text, kg_nodes)
        ids = {m["id"] for m in matches}
        assert "yingzaofashi" in ids

    def test_empty_vision_text_returns_empty(self, kg_nodes):
        """5. Empty vision analysis text returns empty list."""
        matches = match_vision_to_graph("", kg_nodes)
        assert matches == []

    def test_kg_with_no_arch_nodes_returns_empty(self, no_arch_kg):
        """6. KG with no architecture-related nodes returns empty gracefully."""
        text = "这座建筑有精美的斗拱和飞檐"
        matches = match_vision_to_graph(text, no_arch_kg)
        assert matches == []

    def test_deduplicates_matched_nodes(self, kg_nodes):
        """7. Same node matched by multiple terms appears only once."""
        # "斗拱" appears in both vision text AND yingzaofashi desc;
        # "营造法式" also directly matches the label
        text = "宋代营造法式记载的斗拱制度非常精密"
        matches = match_vision_to_graph(text, kg_nodes)
        ids = [m["id"] for m in matches]
        assert len(ids) == len(set(ids)), f"Duplicate IDs found: {ids}"

    def test_match_result_includes_id_and_label(self, kg_nodes):
        """8. Each match result contains node ID and label for UI highlighting."""
        text = "典型的寺庙建筑风格"
        matches = match_vision_to_graph(text, kg_nodes)
        assert len(matches) > 0
        for m in matches:
            assert "id" in m
            assert "label" in m
            assert isinstance(m["id"], str)
            assert isinstance(m["label"], str)
