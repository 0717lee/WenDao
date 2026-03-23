# -*- coding: utf-8 -*-
"""
全文搜索和混合检索API
支持三种搜索模式：FULLTEXT（FTS5）、VECTOR（FAISS）、HYBRID（混合）
"""
import os
import jieba
from enum import Enum
from typing import List, Optional
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

from core.database import get_db
from agents.rag import RAGAgent

# Load custom dictionary for ancient Chinese terms
DICT_PATH = os.path.join(os.path.dirname(__file__), "..", "data", "ancient_words.txt")
if os.path.exists(DICT_PATH):
    jieba.load_userdict(DICT_PATH)

router = APIRouter(prefix="/api/v1", tags=["search"])

# Initialize RAG agent for vector search
try:
    rag_agent = RAGAgent()
except Exception as e:
    print(f"[Search] RAG Agent initialization failed: {e}")
    rag_agent = None


class SearchMode(str, Enum):
    """搜索模式枚举"""
    FULLTEXT = "FULLTEXT"  # 仅FTS5全文搜索
    VECTOR = "VECTOR"      # 仅向量检索
    HYBRID = "HYBRID"      # 混合检索


class SearchResult(BaseModel):
    """搜索结果项"""
    id: str  # Changed from int to str to match document IDs like 'doc_1'
    title: str
    content: str
    source: str
    score: float


class SearchResponse(BaseModel):
    """搜索响应"""
    results: List[SearchResult]
    mode: str
    total: int


def normalize_scores(scores: List[float]) -> List[float]:
    """归一化分数到0-1区间"""
    if not scores:
        return []
    min_score = min(scores)
    max_score = max(scores)
    if max_score == min_score:
        return [1.0] * len(scores)
    return [(s - min_score) / (max_score - min_score) for s in scores]


async def fulltext_search(query: str, limit: int = 10) -> List[SearchResult]:
    """FTS5全文搜索"""
    # Tokenize query with jieba
    tokens = jieba.cut(query)
    fts_query = " ".join(tokens)

    async with get_db() as db:
        # Check if FTS5 table exists
        cursor = await db.execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND name='documents_fts'"
        )
        fts_exists = await cursor.fetchone()

        if not fts_exists:
            # Fallback to LIKE search if FTS5 not available
            cursor = await db.execute(
                """
                SELECT id, title, content, source, 1.0 as score
                FROM documents
                WHERE content LIKE ? OR title LIKE ?
                LIMIT ?
                """,
                (f"%{query}%", f"%{query}%", limit)
            )
        else:
            # Use FTS5 MATCH
            cursor = await db.execute(
                """
                SELECT d.id, d.title, d.content, d.source,
                       bm25(documents_fts) as score
                FROM documents_fts
                JOIN documents d ON documents_fts.rowid = d.id
                WHERE documents_fts MATCH ?
                ORDER BY score DESC
                LIMIT ?
                """,
                (fts_query, limit)
            )

        rows = await cursor.fetchall()

    results = []
    for row in rows:
        results.append(SearchResult(
            id=str(row[0]),
            title=row[1],
            content=row[2],
            source=row[3] or "",
            score=abs(float(row[4])) if row[4] else 0.0
        ))

    return results


async def vector_search(query: str, limit: int = 10) -> List[SearchResult]:
    """FAISS向量检索"""
    if not rag_agent or not rag_agent.vectorstore:
        raise HTTPException(status_code=503, detail="向量检索服务不可用")

    try:
        docs_with_scores = rag_agent.vectorstore.similarity_search_with_score(query, k=limit)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"向量检索失败: {str(e)}")

    results = []
    for doc, score in docs_with_scores:
        metadata = doc.metadata
        results.append(SearchResult(
            id=str(metadata.get("id", 0)),
            title=metadata.get("title", ""),
            content=doc.page_content,
            source=metadata.get("source", ""),
            score=float(score)
        ))

    return results


async def hybrid_search(query: str, limit: int = 10) -> List[SearchResult]:
    """混合检索：BM25 + Embedding，优化相关性"""
    # Execute both searches in parallel
    fulltext_results = await fulltext_search(query, limit=limit * 3)

    try:
        vector_results = await vector_search(query, limit=limit * 3)
    except HTTPException:
        # Fallback to fulltext only if vector search fails
        return fulltext_results[:limit]

    # Normalize scores
    fulltext_scores = [r.score for r in fulltext_results]
    vector_scores = [r.score for r in vector_results]

    norm_fulltext = normalize_scores(fulltext_scores)
    norm_vector = normalize_scores(vector_scores)

    # Update normalized scores
    for i, result in enumerate(fulltext_results):
        result.score = norm_fulltext[i]

    for i, result in enumerate(vector_results):
        result.score = norm_vector[i]

    # Merge results by ID with adjusted weights
    merged = {}
    for result in fulltext_results:
        merged[result.id] = result
        result.score *= 0.5  # BM25 weight increased from 0.4

    for result in vector_results:
        if result.id in merged:
            merged[result.id].score += result.score * 0.5  # Embedding weight decreased from 0.6
        else:
            result.score *= 0.5
            merged[result.id] = result

    # Boost results that contain query keywords in title
    query_lower = query.lower()
    for result in merged.values():
        if query_lower in result.title.lower():
            result.score *= 1.3  # Title match boost
        # Boost if query appears multiple times in content
        content_lower = result.content.lower()
        query_count = content_lower.count(query_lower)
        if query_count > 1:
            result.score *= (1 + min(query_count * 0.1, 0.5))  # Max 50% boost

    # Sort by combined score
    sorted_results = sorted(merged.values(), key=lambda x: x.score, reverse=True)

    # Filter out very low relevance results (score < 0.1)
    filtered_results = [r for r in sorted_results if r.score >= 0.1]

    return filtered_results[:limit]


@router.get("/search", response_model=SearchResponse)
async def search(
    q: str = Query(..., description="搜索关键词"),
    mode: SearchMode = Query(SearchMode.HYBRID, description="搜索模式"),
    limit: int = Query(10, ge=1, le=100, description="返回结果数量")
):
    """
    全文搜索和混合检索API

    - **q**: 搜索关键词（必填）
    - **mode**: 搜索模式（FULLTEXT/VECTOR/HYBRID，默认HYBRID）
    - **limit**: 返回结果数量（1-100，默认10）
    """
    if not q or not q.strip():
        raise HTTPException(status_code=400, detail="搜索关键词不能为空")

    # Execute search based on mode
    if mode == SearchMode.FULLTEXT:
        results = await fulltext_search(q, limit)
    elif mode == SearchMode.VECTOR:
        results = await vector_search(q, limit)
    else:  # HYBRID
        results = await hybrid_search(q, limit)

    return SearchResponse(
        results=results,
        mode=mode.value,
        total=len(results)
    )
