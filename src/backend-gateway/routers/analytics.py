# -*- coding: utf-8 -*-
"""分析数据聚合 API"""
from fastapi import APIRouter
from routers.knowledge_graph import _get_graph

router = APIRouter(prefix="/api/v1/analytics", tags=["analytics"])

@router.get("/overview")
def get_analytics_overview():
    """聚合知识图谱分析数据"""
    g = _get_graph()
    nodes = g.get("nodes", [])
    edges = g.get("edges", [])

    # 1. Entity type distribution
    entity_distribution = {}
    for n in nodes:
        group = n.get("group", "其他")
        entity_distribution[group] = entity_distribution.get(group, 0) + 1

    # 2. Top entities by connection count
    connection_count = {}
    for e in edges:
        connection_count[e["from"]] = connection_count.get(e["from"], 0) + 1
        connection_count[e["to"]] = connection_count.get(e["to"], 0) + 1

    node_map = {n["id"]: n["label"] for n in nodes}
    top_entities = sorted(
        [{"id": k, "label": node_map.get(k, k), "count": v} for k, v in connection_count.items()],
        key=lambda x: -x["count"]
    )[:10]

    # 3. Edge type distribution
    edge_type_distribution = {}
    for e in edges:
        label = e.get("label", "关联")
        edge_type_distribution[label] = edge_type_distribution.get(label, 0) + 1

    # 4. Dynasty distribution (parse from node descriptions or groups)
    dynasty_keywords = ["先秦", "秦", "汉", "三国", "魏晋", "南北朝", "隋", "唐", "宋", "元", "明", "清", "近现代"]
    dynasty_distribution = {d: 0 for d in dynasty_keywords}
    for n in nodes:
        desc = n.get("desc", "")
        for dynasty in dynasty_keywords:
            if dynasty in desc:
                dynasty_distribution[dynasty] += 1

    return {
        "entity_distribution": entity_distribution,
        "top_entities": top_entities,
        "edge_type_distribution": edge_type_distribution,
        "dynasty_distribution": {k: v for k, v in dynasty_distribution.items() if v > 0},
        "total_nodes": len(nodes),
        "total_edges": len(edges),
    }
