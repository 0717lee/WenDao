"""
古籍知识图谱数据加载

从 JSON 数据文件加载知识图谱，替代原有硬编码方式。
数据文件由 core/scraper.py 生成。
"""

import json
import os
from typing import Dict, Any, List


_DATA_PATH = os.path.join(
    os.path.dirname(__file__), "..", "data", "ancient_texts_graph.json"
)


def _build_fallback_graph() -> Dict[str, Any]:
    """当 JSON 文件不存在时，返回最小化的 10 节点图谱"""
    nodes = [
        {"id": "kongzi", "label": "孔子", "group": "人物", "desc": "儒家创始人"},
        {"id": "mengzi", "label": "孟子", "group": "人物", "desc": "儒家亚圣"},
        {"id": "laozi", "label": "老子", "group": "人物", "desc": "道家创始人"},
        {"id": "lunyu", "label": "论语", "group": "典籍", "desc": "孔子言行录"},
        {"id": "daodejing", "label": "道德经", "group": "典籍", "desc": "道家经典"},
        {"id": "shiji", "label": "史记", "group": "典籍", "desc": "纪传体通史之祖"},
        {"id": "rujia", "label": "儒家", "group": "思想流派", "desc": "仁义礼智信"},
        {"id": "daojia", "label": "道家", "group": "思想流派", "desc": "道法自然"},
        {"id": "baijia", "label": "百家争鸣", "group": "历史事件", "desc": "诸子百家争鸣"},
        {"id": "keju", "label": "科举制度", "group": "历史事件", "desc": "选官制度"},
    ]
    edges = [
        {"id": "e1", "from": "kongzi", "to": "lunyu", "label": "言行录于"},
        {"id": "e2", "from": "laozi", "to": "daodejing", "label": "著"},
        {"id": "e3", "from": "kongzi", "to": "rujia", "label": "创立"},
        {"id": "e4", "from": "laozi", "to": "daojia", "label": "创立"},
        {"id": "e5", "from": "mengzi", "to": "rujia", "label": "属于"},
        {"id": "e6", "from": "baijia", "to": "rujia", "label": "催生"},
        {"id": "e7", "from": "baijia", "to": "daojia", "label": "催生"},
    ]
    groups = sorted(set(n["group"] for n in nodes))
    return {
        "nodes": nodes,
        "edges": edges,
        "stats": {
            "node_count": len(nodes),
            "edge_count": len(edges),
            "groups": groups,
        },
    }


def build_knowledge_graph() -> Dict[str, Any]:
    """
    构建知识图谱数据。

    优先从 data/ancient_texts_graph.json 加载；
    文件不存在时返回最小化 fallback 图谱。
    """
    try:
        with open(_DATA_PATH, "r", encoding="utf-8") as f:
            data = json.load(f)
        # 确保返回格式正确
        if "nodes" in data and "edges" in data:
            # 重新计算 stats 以保证一致性
            nodes = data["nodes"]
            edges = data["edges"]
            groups = sorted(set(n["group"] for n in nodes))
            data["stats"] = {
                "node_count": len(nodes),
                "edge_count": len(edges),
                "groups": groups,
            }
            return data
    except (FileNotFoundError, json.JSONDecodeError, KeyError):
        pass

    return _build_fallback_graph()
