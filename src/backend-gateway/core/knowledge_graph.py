# -*- coding: utf-8 -*-
"""
Knowledge graph engine for WenDao reader sidebar (MVP).

Loads a prebuilt JSON snapshot (data/graph_snapshot.json) and provides:
  - Full snapshot access for the frontend graph view
  - Entity detail with neighbor nodes and relations
  - Text-driven subgraph extraction (reuses EntityExtractor)

Design goals (KISS):
  - In-memory only, no graph database
  - Reuse existing EntityExtractor for entity recognition
  - Graceful degradation when snapshot missing or malformed
"""
import json
import logging
import os
from typing import Any, Dict, List, Optional

from core.entity_extractor import EntityExtractor

logger = logging.getLogger(__name__)

# Default snapshot path: backend-gateway/data/graph_snapshot.json
_SNAPSHOT_PATH = os.path.join(
    os.path.dirname(__file__), "..", "data", "graph_snapshot.json"
)


class KnowledgeGraph:
    """In-memory knowledge graph backed by a JSON snapshot."""

    def __init__(self, snapshot_path: Optional[str] = None, extractor: Optional[EntityExtractor] = None):
        self._snapshot_path = os.path.abspath(snapshot_path or _SNAPSHOT_PATH)
        self._nodes: Dict[str, Dict[str, Any]] = {}
        self._edges: List[Dict[str, Any]] = []
        self._neighbors: Dict[str, List[Dict[str, Any]]] = {}
        self._stats: Dict[str, int] = {"nodes": 0, "edges": 0}
        self._loaded = False
        # Reuse a single EntityExtractor instance (defaults to reading_entities.json)
        self._extractor = extractor or EntityExtractor()
        self._load_snapshot()

    # ------------------------------------------------------------------
    # Loading
    # ------------------------------------------------------------------

    def _load_snapshot(self) -> None:
        """Load nodes and edges from the JSON snapshot file."""
        try:
            if not os.path.exists(self._snapshot_path):
                logger.warning("Graph snapshot not found: %s", self._snapshot_path)
                self._loaded = False
                return

            with open(self._snapshot_path, "r", encoding="utf-8") as f:
                data = json.load(f)

            raw_nodes = data.get("nodes", []) if isinstance(data, dict) else []
            raw_edges = data.get("edges", []) if isinstance(data, dict) else []
            raw_stats = data.get("stats", {}) if isinstance(data, dict) else {}

            self._nodes = {}
            for node in raw_nodes:
                if not isinstance(node, dict):
                    continue
                node_id = node.get("id")
                if node_id:
                    self._nodes[node_id] = node

            self._edges = [edge for edge in raw_edges if isinstance(edge, dict)]
            self._build_neighbor_index()

            self._stats = {
                "nodes": int(raw_stats.get("nodes", len(self._nodes))),
                "edges": int(raw_stats.get("edges", len(self._edges))),
            }
            self._loaded = True
            logger.info(
                "KnowledgeGraph loaded %d nodes / %d edges from %s",
                len(self._nodes),
                len(self._edges),
                self._snapshot_path,
            )
        except Exception as exc:
            logger.warning("Failed to load graph snapshot: %s", exc)
            self._loaded = False

    def _build_neighbor_index(self) -> None:
        """Build an adjacency index for fast neighbor lookup."""
        self._neighbors = {}
        for edge in self._edges:
            source = edge.get("source")
            target = edge.get("target")
            if not source or not target:
                continue
            self._neighbors.setdefault(source, []).append(edge)
            # Reverse edge so we can find inbound relations too.
            reverse_edge = dict(edge)
            reverse_edge["source"], reverse_edge["target"] = target, source
            reverse_edge["relation"] = f"被{edge.get('relation', '关联')}"
            self._neighbors.setdefault(target, []).append(reverse_edge)

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    @property
    def loaded(self) -> bool:
        return self._loaded

    @property
    def node_count(self) -> int:
        return len(self._nodes)

    @property
    def edge_count(self) -> int:
        return len(self._edges)

    def get_snapshot(self) -> Dict[str, Any]:
        """Return the full snapshot for frontend rendering."""
        return {
            "version": "1.0",
            "nodes": list(self._nodes.values()),
            "edges": list(self._edges),
            "stats": {
                "nodes": len(self._nodes),
                "edges": len(self._edges),
            },
        }

    def get_entity(self, entity_id: str) -> Optional[Dict[str, Any]]:
        """Return entity detail with neighbor nodes and relations.

        Returns None when entity_id is unknown.
        """
        node = self._nodes.get(entity_id)
        if not node:
            return None

        relations = self._neighbors.get(entity_id, [])
        neighbor_ids: List[str] = []
        seen = {entity_id}
        for edge in relations:
            target_id = edge.get("target") if edge.get("source") == entity_id else edge.get("source")
            if target_id and target_id not in seen:
                neighbor_ids.append(target_id)
                seen.add(target_id)

        neighbors = [
            self._nodes[tid]
            for tid in neighbor_ids
            if tid in self._nodes
        ]

        return {
            "entity": node,
            "relations": relations,
            "neighbors": neighbors,
        }

    def extract_subgraph(self, text: str, max_nodes: int = 30) -> Dict[str, Any]:
        """Extract entities from text and return the related subgraph.

        Uses the local fast path (substring matching) only, never the GLM-4
        enhanced path, so the sidebar view does not consume ZHIPUAI quota on
        every open. Then collects matched nodes plus their direct neighbors
        into a subgraph for the sidebar view.
        """
        if not text:
            return {"entities": [], "nodes": [], "edges": [], "stats": {"nodes": 0, "edges": 0, "matched_entities": 0}}

        entity_ids = self._extractor.extract_entities_fast(text)
        # Only keep IDs that exist in the graph snapshot.
        known_ids = [eid for eid in entity_ids if eid in self._nodes]

        collected_nodes: Dict[str, Dict[str, Any]] = {}
        collected_edges: List[Dict[str, Any]] = []
        seen_edge_keys: set = set()

        def add_node(node_id: str) -> None:
            if node_id and node_id in self._nodes and node_id not in collected_nodes:
                collected_nodes[node_id] = self._nodes[node_id]

        def add_edge(edge: Dict[str, Any]) -> None:
            source = edge.get("source")
            target = edge.get("target")
            relation = edge.get("relation", "")
            key = f"{source}->{target}:{relation}"
            if key not in seen_edge_keys:
                seen_edge_keys.add(key)
                collected_edges.append(edge)

        for eid in known_ids:
            add_node(eid)
            for edge in self._neighbors.get(eid, []):
                add_node(edge.get("source"))
                add_node(edge.get("target"))
                add_edge(edge)

        # Cap node count to keep the sidebar view responsive.
        nodes_list = list(collected_nodes.values())
        if len(nodes_list) > max_nodes:
            nodes_list = nodes_list[:max_nodes]
            allowed_ids = {node["id"] for node in nodes_list}
            collected_edges = [
                edge for edge in collected_edges
                if edge.get("source") in allowed_ids and edge.get("target") in allowed_ids
            ]

        return {
            "entities": [
                {"id": eid, "label": self._nodes[eid].get("label", eid), "group": self._nodes[eid].get("group", "")}
                for eid in known_ids
                if eid in self._nodes
            ],
            "nodes": nodes_list,
            "edges": collected_edges,
            "stats": {
                "nodes": len(nodes_list),
                "edges": len(collected_edges),
                "matched_entities": len(known_ids),
            },
        }


# Module-level lazy singleton so routers can import a shared instance.
_graph_instance: Optional[KnowledgeGraph] = None


def get_knowledge_graph() -> KnowledgeGraph:
    """Return a process-wide KnowledgeGraph singleton."""
    global _graph_instance
    if _graph_instance is None:
        _graph_instance = KnowledgeGraph()
    return _graph_instance
