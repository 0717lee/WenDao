# -*- coding: utf-8 -*-
"""
全文搜索和混合检索API
支持三种搜索模式：FULLTEXT（FTS5）、VECTOR（FAISS）、HYBRID（混合）
"""
import os
import jieba
import logging
from enum import Enum
from typing import Any, List, Optional
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

from core import pg_database
from core.database import get_db
from core.lazy_proxy import LazyProxy
from agents.rag import RAGAgent

# Load custom dictionary for ancient Chinese terms
DICT_PATH = os.path.join(os.path.dirname(__file__), "..", "data", "ancient_words.txt")
if os.path.exists(DICT_PATH):
    jieba.load_userdict(DICT_PATH)

router = APIRouter(prefix="/api/v1", tags=["search"])
logger = logging.getLogger(__name__)


def get_connection():
    """Local wrapper so tests can patch either this symbol or pg_database.get_connection."""
    return pg_database.get_connection()


def _create_rag_agent() -> RAGAgent:
    return RAGAgent()


rag_agent = LazyProxy(_create_rag_agent)


class SearchMode(str, Enum):
    """搜索模式枚举"""
    FULLTEXT = "FULLTEXT"  # 仅FTS5全文搜索
    VECTOR = "VECTOR"      # 仅向量检索
    HYBRID = "HYBRID"      # 混合检索


class SearchResult(BaseModel):
    """搜索结果项"""
    id: str  # Changed from int to str to match document IDs like 'doc_1'
    document_id: str | None = None
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


def _normalize_candidate_row(row: Any) -> dict:
    if isinstance(row, dict):
        return row
    try:
        return dict(row)
    except Exception:
        if isinstance(row, (list, tuple)) and len(row) >= 4:
            preview = row[2] or ""
            return {
                "id": str(row[0]),
                "title": row[1] or "",
                "source_name": row[3] or "",
                "original_text": preview,
                "punctuated_text": preview,
                "translated_text": preview,
            }
        return {
            "id": "",
            "title": "",
            "source_name": "",
            "original_text": "",
            "punctuated_text": "",
            "translated_text": "",
        }


async def _load_document_candidates(limit: int = 200) -> list[dict]:
    try:
        async with get_connection() as conn:
            rows = await conn.fetch(
                """
                SELECT id::text AS id, title, source_name, original_text, punctuated_text, translated_text
                FROM documents
                ORDER BY COALESCE(updated_at, created_at) DESC
                LIMIT $1
                """,
                limit,
            )
            return [dict(row) for row in rows]
    except RuntimeError:
        async with get_db() as db:
            cursor = await db.execute(
                """
                SELECT id, title, source_name, original_text, punctuated_text, translated_text
                FROM documents
                ORDER BY COALESCE(updated_at, created_at) DESC
                LIMIT ?
                """,
                (limit,),
            )
            return [_normalize_candidate_row(row) for row in await cursor.fetchall()]


async def _resolve_document_id(
    raw_id: str | None,
    title: str,
    source: str,
    excerpt: str,
    candidates: list[dict] | None = None,
) -> str | None:
    if raw_id:
        candidate_list = candidates
        if candidate_list is None:
            candidate_list = await _load_document_candidates(limit=50)
        for record in candidate_list:
            if str(record.get("id")) == str(raw_id):
                return str(record["id"])

    candidate_list = candidates if candidates is not None else await _load_document_candidates()
    terms = [value.strip() for value in (title, source, excerpt) if value and value.strip()]
    if not terms:
        return None

    best_match: str | None = None
    best_score = 0

    for record in candidate_list:
        score = 0
        record_title = record.get("title") or ""
        record_source_name = record.get("source_name") or ""
        haystacks = [
            record_title,
            record_source_name,
            record.get("original_text") or "",
            record.get("punctuated_text") or "",
            record.get("translated_text") or "",
        ]

        for term in terms:
            if term == record_title:
                score += 30
            if term and term in record_title:
                score += len(term) * 4
            if term and term in record_source_name:
                score += len(term) * 4
            for text in haystacks[2:]:
                if term and term in text:
                    score += len(term) * 2
                    break

        if score > best_score:
            best_match = str(record.get("id")) if record.get("id") is not None else None
            best_score = score

    return best_match if best_score > 0 else None


async def fulltext_search(query: str, limit: int = 10) -> List[SearchResult]:
    """全文搜索（优先兼容当前 documents 表结构）。"""
    tokens = [token.strip() for token in jieba.cut(query) if token.strip()]
    search_terms = tokens or [query.strip()]

    async with get_db() as db:
        cursor = await db.execute(
            """
            SELECT
                id,
                title,
                author,
                dynasty,
                category,
                original_text,
                punctuated_text,
                translated_text,
                source_type
            FROM documents
            ORDER BY COALESCE(updated_at, created_at) DESC
            LIMIT 400
            """
        )
        rows = await cursor.fetchall()

    results: List[SearchResult] = []
    for row in rows:
        # Backward-compatible parsing for existing tests that still mock the old
        # (id, title, content, source, score) shape.
        if len(row) >= 5 and isinstance(row[4], (int, float)):
            title = row[1] or ""
            preview = row[2] or ""
            source = row[3] or ""
            match_score = float(row[4] or 0)
        else:
            title = row[1] or ""
            author = row[2] if len(row) > 2 else ""
            dynasty = row[3] if len(row) > 3 else ""
            category = row[4] if len(row) > 4 else ""
            original_text = row[5] or ""
            punctuated_text = row[6] or ""
            translated_text = row[7] or ""
            source_type = row[8] if len(row) > 8 else ""
            searchable_text = "\n".join([title, author or "", dynasty or "", category or "", original_text, punctuated_text, translated_text])

            match_score = 0.0
            for term in search_terms:
                term_lower = term.lower()
                combined_lower = searchable_text.lower()
                title_lower = title.lower()

                if term_lower in title_lower:
                    match_score += 4.0
                occurrences = combined_lower.count(term_lower)
                if occurrences:
                    match_score += min(occurrences, 6) * 1.2

            if match_score <= 0:
                continue

            preview = translated_text or punctuated_text or original_text
            if source_type == "corpus":
                source = "古籍库"
            elif source_type == "sample":
                source = "精选导读"
            else:
                source = "我的文档"

        results.append(SearchResult(
            id=str(row[0]),
            document_id=str(row[0]),
            title=title,
            content=preview,
            source=source,
            score=match_score,
        ))

    results.sort(key=lambda item: item.score, reverse=True)
    return results[:limit]


async def vector_search(query: str, limit: int = 10) -> List[SearchResult]:
    """FAISS向量检索"""
    if not rag_agent or not rag_agent.vectorstore:
        raise HTTPException(status_code=503, detail="向量检索服务不可用")

    try:
        docs_with_scores = rag_agent.vectorstore.similarity_search_with_score(query, k=limit)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"向量检索失败: {str(e)}")

    results = []
    candidates = await _load_document_candidates()
    for doc, score in docs_with_scores:
        metadata = doc.metadata
        title = metadata.get("title", "") or metadata.get("source", "") or "检索结果"
        source = metadata.get("source", "") or "未知来源"
        raw_document_id = metadata.get("document_id") or metadata.get("id")
        document_id = await _resolve_document_id(
            str(raw_document_id) if raw_document_id is not None else None,
            title=title,
            source=source,
            excerpt=doc.page_content[:120],
            candidates=candidates,
        )
        results.append(SearchResult(
            id=str(metadata.get("id", 0)),
            document_id=document_id,
            title=title,
            content=doc.page_content,
            source=source,
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
