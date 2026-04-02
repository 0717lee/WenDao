import os
import json
import logging
from fastapi import APIRouter

router = APIRouter(prefix="/api/v1/knowledge-graph", tags=["Knowledge Graph"])
logger = logging.getLogger(__name__)

GRAPH_DATA_PATH = os.path.join(os.path.dirname(os.path.dirname(__file__)), "data", "ancient_texts_graph.json")

def _get_graph() -> dict:
    """内部辅助函数：读取本地图谱JSON数据"""
    try:
        if os.path.exists(GRAPH_DATA_PATH):
            with open(GRAPH_DATA_PATH, "r", encoding="utf-8") as f:
                return json.load(f)
    except Exception as e:
        logger.error(f"读取图谱数据失败: {e}")
    return {"nodes": [], "edges": []}

@router.get("/")
def get_knowledge_graph():
    """获取知识图谱（古籍、人物、事件等）"""
    return _get_graph()
