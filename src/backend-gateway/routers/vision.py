"""Vision API: Architecture photo recognition with knowledge graph linking."""

import base64
import json
import os
import re
import logging
from typing import Optional

from fastapi import APIRouter, Depends, Request, UploadFile, File, Form
from fastapi.responses import JSONResponse
from core.auth import require_auth
from core.rate_limit import limiter

router = APIRouter(prefix="/api/v1", tags=["vision"])
logger = logging.getLogger(__name__)

MAX_FILE_SIZE = 5 * 1024 * 1024  # 5MB

# Architecture-specific terms for graph node matching
ARCH_TERMS = [
    "斗拱", "飞檐", "歇山顶", "庑殿顶", "悬山顶", "硬山顶",
    "琉璃瓦", "藻井", "斗栱", "营造法式", "梁柱", "彩画",
    "攒尖顶", "卷棚顶", "檩", "枋", "额枋", "雀替",
    "宋代", "唐代", "明清", "明代", "清代", "元代",
    "宫殿", "寺庙", "佛塔", "园林", "民居", "牌坊",
]

# Path to knowledge graph data
_GRAPH_DATA_PATH = os.path.join(
    os.path.dirname(__file__), "..", "data", "ancient_texts_graph.json"
)


def _load_graph_data() -> dict:
    """Load knowledge graph JSON data from file."""
    try:
        with open(_GRAPH_DATA_PATH, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception as e:
        logger.warning("[Vision] 图谱数据加载失败: %s", e)
        return {"nodes": [], "edges": []}


def parse_vision_result(raw_text: str) -> dict:
    """
    Parse VisionAgent natural language response into structured fields.
    Extracts building_type, roof_style, components, era from Chinese text.
    """
    building_type = ""
    roof_style = ""
    components = []
    era = ""

    lines = raw_text.split("\n")
    for line in lines:
        line = line.strip()
        if not line:
            continue

        # Match building type patterns
        if re.search(r"建筑类型|类型", line) and not building_type:
            # Extract the content after colon or label
            match = re.search(r"[：:](.*)", line)
            if match:
                building_type = match.group(1).strip()
            else:
                building_type = re.sub(r"^\d+[\.\、\)）]?\s*建筑类型\s*", "", line).strip()

        # Match roof style patterns
        elif re.search(r"屋顶|形制|顶部", line) and not roof_style:
            match = re.search(r"[：:](.*)", line)
            if match:
                roof_style = match.group(1).strip()
            else:
                roof_style = re.sub(r"^\d+[\.\、\)）]?\s*屋顶形制\s*", "", line).strip()

        # Match components patterns
        elif re.search(r"构件|可见构件|主要.*构件", line) and not components:
            match = re.search(r"[：:](.*)", line)
            text = match.group(1).strip() if match else line
            # Split by common delimiters
            parts = re.split(r"[、，,/]", text)
            components = [p.strip() for p in parts if p.strip() and len(p.strip()) <= 20]

        # Match era/period patterns
        elif re.search(r"年代|风格|时期|朝代", line) and not era:
            match = re.search(r"[：:](.*)", line)
            if match:
                era = match.group(1).strip()
            else:
                era = re.sub(r"^\d+[\.\、\)）]?\s*大致年代风格\s*", "", line).strip()

    return {
        "building_type": building_type,
        "roof_style": roof_style,
        "components": components,
        "era": era,
        "raw_text": raw_text,
    }


def match_vision_to_graph(vision_text: str, graph_data: dict) -> list:
    """
    Match vision analysis text against knowledge graph nodes.
    Uses substring matching on node labels and architecture-specific terms.
    Returns list of {id, label} dicts for matched nodes.
    """
    matched = []
    seen_ids = set()

    for node in graph_data.get("nodes", []):
        node_id = node.get("id", "")
        node_label = node.get("label", "")
        node_desc = node.get("desc", "") or node.get("description", "") or ""

        if node_id in seen_ids:
            continue

        # Direct label match: if node label appears in vision text
        if len(node_label) >= 2 and node_label in vision_text:
            matched.append({"id": node_id, "label": node_label})
            seen_ids.add(node_id)
            continue

        # Term-based match: if any architecture term appears in both
        # the vision text AND the node's label or description
        for term in ARCH_TERMS:
            if term in vision_text and term in (node_label + node_desc):
                if node_id not in seen_ids:
                    matched.append({"id": node_id, "label": node_label})
                    seen_ids.add(node_id)
                break

    return matched


@router.post("/vision/analyze")
@limiter.limit("10/minute")
async def analyze_image(
    request: Request,
    file: UploadFile = File(...),
    question: str = Form(""),
    _user: dict = Depends(require_auth),
):
    """
    Upload an architecture photo for AI recognition.
    Returns structured analysis + matched knowledge graph nodes.
    """
    contents = await file.read()

    if len(contents) > MAX_FILE_SIZE:
        return JSONResponse(
            status_code=413,
            content={"error": "文件过大（最大 5MB）"},
        )

    # Validate file type
    content_type = file.content_type or ""
    if not content_type.startswith("image/"):
        return JSONResponse(
            status_code=400,
            content={"error": "仅支持图片文件（JPG/PNG）"},
        )

    image_b64 = base64.b64encode(contents).decode("utf-8")

    # Call VisionAgent for analysis
    try:
        from agents.vision import VisionAgent
        vision = VisionAgent()
        raw_text = vision.analyze_image(image_b64, question)
    except ValueError as e:
        # API key not configured
        return JSONResponse(
            status_code=503,
            content={"error": "图片识别服务暂未配置"},
        )
    except Exception as e:
        logger.error("Vision analysis failed: %s", e, exc_info=True)
        return JSONResponse(
            status_code=500,
            content={"error": "图片识别失败，请稍后重试"},
        )

    # Parse structured fields from natural language response
    analysis = parse_vision_result(raw_text)

    # Match against knowledge graph
    graph_data = _load_graph_data()
    matched_nodes = match_vision_to_graph(raw_text, graph_data)

    return {
        "analysis": analysis,
        "matched_graph_nodes": matched_nodes,
    }
