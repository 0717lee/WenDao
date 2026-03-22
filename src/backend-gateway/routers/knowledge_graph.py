"""知识图谱 REST API"""

import json
import os
from uuid import uuid4
from fastapi import APIRouter, HTTPException, Query, Depends, Request
from pydantic import BaseModel
from typing import Optional
from core.knowledge_graph import build_knowledge_graph
from core.auth import require_auth

router = APIRouter(prefix="/api/v1", tags=["knowledge-graph"])

# 图谱缓存（启动后首次访问加载）
_graph_cache = None

# In-memory pending nodes store
_pending_nodes: dict = {}  # id -> node dict
_approved_additions: list = []  # approved nodes added this session

_GRAPH_DATA_PATH = os.path.join(
    os.path.dirname(__file__), "..", "data", "ancient_texts_graph.json"
)


class PendingNodeRequest(BaseModel):
    label: str
    group: str
    desc: str = ""
    confidence: float = 0.7
    similar_to: Optional[dict] = None


def _get_graph():
    global _graph_cache
    if _graph_cache is None:
        _graph_cache = build_knowledge_graph()
    return _graph_cache


def _persist_graph():
    """Write current graph (including approved nodes) back to JSON file."""
    try:
        g = _get_graph()
        with open(_GRAPH_DATA_PATH, "w", encoding="utf-8") as f:
            json.dump(g, f, ensure_ascii=False, indent=2)
    except Exception as e:
        print(f"[KG] Failed to persist graph: {e}")


@router.get("/knowledge-graph")
def get_knowledge_graph():
    """返回完整的古籍知识图谱"""
    return _get_graph()


@router.get("/knowledge-graph/stats")
def get_knowledge_graph_stats():
    """返回图谱统计信息"""
    g = _get_graph()
    return g["stats"]


@router.get("/knowledge-graph/search")
def search_knowledge_graph(q: str = Query(..., min_length=1, description="搜索关键词")):
    """
    按 label 或 desc 搜索节点（中文不区分大小写）。
    返回匹配的节点列表。
    """
    g = _get_graph()
    query = q.lower()
    results = [
        n for n in g["nodes"]
        if query in n["label"].lower() or query in (n.get("desc") or "").lower()
    ]
    return {"nodes": results, "count": len(results)}


@router.get("/knowledge-graph/node/{node_id}/citations")
def get_citation_chain(node_id: str, max_depth: int = Query(3, ge=1, le=5)):
    """
    Traverse citation relationships from a node (BFS).
    Returns ordered chain: [{node, edge, depth, from_id, to_id}]

    Citation edge labels: 引用, 出自, 源于, 参考, 典出, 引, 见于, 载于
    """
    g = _get_graph()
    node_map = {n["id"]: n for n in g["nodes"]}

    if node_id not in node_map:
        raise HTTPException(status_code=404, detail=f"Node '{node_id}' not found")

    CITATION_KEYWORDS = {"引用", "出自", "源于", "参考", "典出", "引", "见于", "载于"}

    chain = []
    visited = {node_id}
    queue = [(node_id, 0)]

    while queue:
        current_id, depth = queue.pop(0)
        if depth >= max_depth:
            continue

        for edge in g["edges"]:
            is_citation = any(kw in edge.get("label", "") for kw in CITATION_KEYWORDS)
            if not is_citation:
                continue

            neighbor_id = None
            if edge["from"] == current_id:
                neighbor_id = edge["to"]
            elif edge["to"] == current_id:
                neighbor_id = edge["from"]

            if neighbor_id and neighbor_id not in visited:
                visited.add(neighbor_id)
                chain.append({
                    "node": node_map.get(neighbor_id),
                    "edge": edge,
                    "depth": depth + 1,
                    "from_id": current_id,
                    "to_id": neighbor_id,
                })
                queue.append((neighbor_id, depth + 1))

    return {
        "root": node_map[node_id],
        "chain": chain,
        "total_depth": max(c["depth"] for c in chain) if chain else 0,
        "truncated": any(depth >= max_depth for _, depth in queue) if queue else False,
    }


@router.get("/knowledge-graph/node/{node_id}")
def get_node_detail(node_id: str):
    """
    返回指定节点的详细信息，包括关联的边和邻居节点。
    """
    g = _get_graph()

    # 查找目标节点
    node = None
    node_map = {n["id"]: n for n in g["nodes"]}
    node = node_map.get(node_id)

    if node is None:
        raise HTTPException(status_code=404, detail=f"Node '{node_id}' not found")

    # 查找关联的边
    connected_edges = [
        e for e in g["edges"]
        if e["from"] == node_id or e["to"] == node_id
    ]

    # 查找邻居节点
    neighbor_ids = set()
    for e in connected_edges:
        if e["from"] == node_id:
            neighbor_ids.add(e["to"])
        else:
            neighbor_ids.add(e["from"])

    neighbors = [node_map[nid] for nid in neighbor_ids if nid in node_map]

    return {
        "node": node,
        "edges": connected_edges,
        "neighbors": neighbors,
    }


# ========== Dynamic Graph CRUD ==========


@router.get("/knowledge-graph/pending")
def get_pending_nodes():
    """Return all pending nodes awaiting review."""
    return {"nodes": list(_pending_nodes.values()), "count": len(_pending_nodes)}


@router.post("/knowledge-graph/nodes")
def add_pending_node(node: PendingNodeRequest, _user: dict = Depends(require_auth)):
    """Add a node to pending review queue."""
    node_id = f"new_{uuid4().hex[:8]}"
    _pending_nodes[node_id] = {
        "id": node_id,
        "label": node.label,
        "group": node.group,
        "desc": node.desc,
        "status": "pending",
        "confidence": node.confidence,
        "similar_to": node.similar_to,
    }
    return {"id": node_id, "status": "pending"}


@router.put("/knowledge-graph/nodes/{node_id}/approve")
def approve_node(node_id: str, _user: dict = Depends(require_auth)):
    """Approve pending node -> add to graph."""
    node = _pending_nodes.pop(node_id, None)
    if not node:
        raise HTTPException(404, "Node not found in pending queue")
    node["status"] = "approved"
    # Add to graph cache
    g = _get_graph()
    g["nodes"].append(node)
    # Update stats
    g["stats"]["node_count"] = len(g["nodes"])
    g["stats"]["groups"] = sorted(set(n["group"] for n in g["nodes"]))
    _approved_additions.append(node)
    # Persist to JSON file
    _persist_graph()
    return {"id": node_id, "status": "approved", "node": node}


@router.delete("/knowledge-graph/nodes/{node_id}")
def reject_node(node_id: str, _user: dict = Depends(require_auth)):
    """Reject and remove pending node."""
    _pending_nodes.pop(node_id, None)
    return {"id": node_id, "status": "rejected"}
