# -*- coding: utf-8 -*-
"""
Knowledge graph router for the reader sidebar (MVP).

Endpoints:
  - GET  /api/v1/graph/snapshot        Full graph snapshot for the sidebar view
  - GET  /api/v1/graph/entity/{id}     Entity detail with neighbors and relations
  - POST /api/v1/graph/extract         Extract entities from text and return subgraph

All endpoints degrade gracefully when the snapshot is unavailable.
"""
import logging
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from core.auth import maybe_auth
from core.knowledge_graph import KnowledgeGraph, get_knowledge_graph

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/graph", tags=["graph"])


class ExtractRequest(BaseModel):
    """Request body for text-driven subgraph extraction."""
    text: str
    max_nodes: int = 30


def _get_graph() -> KnowledgeGraph:
    """Return the shared graph instance (singleton)."""
    return get_knowledge_graph()


@router.get("/snapshot")
async def get_snapshot(_user: dict | None = Depends(maybe_auth)):
    """Return the full knowledge graph snapshot.

    Used by the frontend to render the base graph view. When the snapshot
    is not loaded, returns an empty graph structure instead of erroring.
    """
    graph = _get_graph()
    if not graph.loaded:
        logger.warning("Graph snapshot requested but not loaded")
        return {
            "version": "1.0",
            "nodes": [],
            "edges": [],
            "stats": {"nodes": 0, "edges": 0},
            "loaded": False,
        }
    snapshot = graph.get_snapshot()
    snapshot["loaded"] = True
    return snapshot


@router.get("/entity/{entity_id}")
async def get_entity(entity_id: str, _user: dict | None = Depends(maybe_auth)):
    """Return entity detail with neighbor nodes and relations.

    Returns 404 when the entity_id is unknown to the graph.
    """
    graph = _get_graph()
    if not graph.loaded:
        raise HTTPException(status_code=503, detail="知识图谱未加载，请稍后再试")
    detail = graph.get_entity(entity_id)
    if detail is None:
        raise HTTPException(status_code=404, detail="实体不存在")
    return detail


@router.post("/extract")
async def extract_subgraph(body: ExtractRequest, _user: dict | None = Depends(maybe_auth)):
    """Extract entities from the given text and return the related subgraph.

    Used by the reader sidebar: pass the current paragraph or document text,
    receive the entities mentioned in it plus their neighbor nodes/edges.
    """
    if not body.text or not body.text.strip():
        raise HTTPException(status_code=400, detail="文本不能为空")
    if body.max_nodes < 1 or body.max_nodes > 200:
        raise HTTPException(status_code=400, detail="max_nodes 须在 1-200 之间")

    graph = _get_graph()
    if not graph.loaded:
        logger.warning("Graph extract requested but snapshot not loaded")
        return {
            "entities": [],
            "nodes": [],
            "edges": [],
            "stats": {"nodes": 0, "edges": 0, "matched_entities": 0},
            "loaded": False,
        }
    subgraph = graph.extract_subgraph(body.text, max_nodes=body.max_nodes)
    subgraph["loaded"] = True
    return subgraph
