# -*- coding: utf-8 -*-
"""
全文搜索和混合检索API
支持三种搜索模式：FULLTEXT（FTS5）、VECTOR（FAISS）、HYBRID（混合）
"""
import json
import os
import re
import jieba
import logging
from enum import Enum
from typing import Any, List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel

from core import pg_database
from core.auth import maybe_auth
from core.database import get_db
from core.lazy_proxy import LazyProxy
from core.rate_limit import limiter
from agents.rag import RAGAgent

# Load custom dictionary for ancient Chinese terms
DICT_PATH = os.path.join(os.path.dirname(__file__), "..", "data", "ancient_words.txt")
if os.path.exists(DICT_PATH):
    jieba.load_userdict(DICT_PATH)

router = APIRouter(prefix="/api/v1", tags=["search"])
logger = logging.getLogger(__name__)
SEARCH_NORMALIZE_PATTERN = re.compile(r"[\s，。！？；：、“”‘’「」『』（）()《》〈〉【】〔〕—…·,.!?:;\"'\-]+")
QUESTION_NOISE_TERMS = {
    "什么", "为何", "为什么", "如何", "怎么", "怎样", "到底", "是否", "哪些", "哪个", "哪句", "哪里",
    "讲", "谈", "说", "解释", "理解", "意思", "入门", "相关", "有关", "适合", "里面", "原本", "本来",
    "可以", "一下", "一下子", "一下儿", "请问", "请", "一下吧", "一下吗",
}
FUNCTION_WORDS = {"的", "了", "吗", "呢", "啊", "呀", "吧", "着", "在", "和", "与", "及", "并", "而", "是", "有"}


def get_connection():
    """Local wrapper so tests can patch either this symbol or pg_database.get_connection."""
    return pg_database.get_connection()


def _create_rag_agent() -> RAGAgent:
    return RAGAgent()


rag_agent = LazyProxy(_create_rag_agent)


def _extract_user_id(user: Any) -> str | None:
    if isinstance(user, dict) and user.get("sub"):
        return str(user["sub"])
    return None


def _can_access_candidate(row: dict[str, Any], user_id: str | None) -> bool:
    source_type = row.get("source_type")
    if source_type in {"corpus", None, ""}:
        return True
    return bool(user_id and row.get("owner_user_id") == user_id)


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
    anchor_text: str | None = None


class SearchResponse(BaseModel):
    """搜索响应"""
    results: List[SearchResult]
    mode: str
    total: int


def normalize_scores(scores: List[float], higher_is_better: bool = True) -> List[float]:
    """归一化分数到0-1区间"""
    if not scores:
        return []
    min_score = min(scores)
    max_score = max(scores)
    if max_score == min_score:
        return [1.0] * len(scores)
    normalized = [(s - min_score) / (max_score - min_score) for s in scores]
    if higher_is_better:
        return normalized
    return [1.0 - value for value in normalized]


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
                "repo_id": "",
                "title": row[1] or "",
                "source_name": row[3] or "",
                "author": "",
                "dynasty": "",
                "category": "",
                "original_text": preview,
                "punctuated_text": preview,
                "translated_text": preview,
                "segments": [],
            }
        return {
            "id": "",
            "repo_id": "",
            "title": "",
            "source_name": "",
            "author": "",
            "dynasty": "",
            "category": "",
            "original_text": "",
            "punctuated_text": "",
            "translated_text": "",
            "segments": [],
        }


async def _load_sqlite_corpus_candidates(limit: int) -> list[dict[str, Any]]:
    async with get_db() as db:
        cursor = await db.execute(
            """
            SELECT id, repo_id, title, source_name, author, dynasty, category,
                   original_text, punctuated_text, translated_text, segments, source_type, owner_user_id
            FROM documents
            WHERE source_type = 'corpus'
            ORDER BY COALESCE(updated_at, created_at) DESC
            LIMIT ?
            """,
            (limit,),
        )
        return [_normalize_candidate_row(row) for row in await cursor.fetchall()]


def _normalize_search_text(value: str) -> str:
    return SEARCH_NORMALIZE_PATTERN.sub("", value or "").lower()


def _extract_preserved_terms(query: str) -> list[str]:
    preserved: list[str] = []
    for pattern in (r"[“\"]([^”\"]+)[”\"]", r"《([^》]+)》"):
        for match in re.findall(pattern, query):
            term = match.strip()
            if term and term not in preserved:
                preserved.append(term)
    return preserved


def _extract_search_terms(query: str) -> list[str]:
    preserved_terms = _extract_preserved_terms(query)
    tokens = [token.strip() for token in jieba.cut(query) if token.strip()]
    terms: list[str] = []

    for token in preserved_terms + tokens:
        normalized = _normalize_search_text(token)
        if not normalized:
            continue
        if normalized in FUNCTION_WORDS or normalized in QUESTION_NOISE_TERMS:
            continue
        if token not in terms:
            terms.append(token)

    if terms:
        return terms

    normalized_query = _normalize_search_text(query)
    return [normalized_query] if normalized_query else []


def _looks_like_exact_quote(query: str) -> bool:
    query = query.strip()
    if not query:
        return False
    if any(marker in query for marker in ["什么", "为何", "为什么", "如何", "怎么", "怎样", "？", "?"]):
        return False
    normalized = _normalize_search_text(query)
    return len(re.findall(r"[\u4e00-\u9fff]", normalized)) >= 3


def _excerpt_around_match(text: str, query: str, radius: int = 28) -> str:
    if not text:
        return ""
    raw_index = text.find(query)
    if raw_index >= 0:
        start = max(0, raw_index - radius)
        end = min(len(text), raw_index + len(query) + radius)
        return text[start:end].strip()
    return text[: min(len(text), 120)].strip()


def _default_source_label(row: dict[str, Any]) -> str:
    source_type = row.get("source_type") or ""
    if source_type == "corpus":
        return "古籍库"
    return "我的文档"


def _row_lexical_haystacks(row: dict[str, Any]) -> dict[str, str]:
    return {
        "title": str(row.get("title") or ""),
        "author": str(row.get("author") or ""),
        "category": str(row.get("category") or ""),
        "source_name": str(row.get("source_name") or ""),
        "original_text": str(row.get("original_text") or ""),
        "punctuated_text": str(row.get("punctuated_text") or ""),
        "translated_text": str(row.get("translated_text") or ""),
    }


def _has_term_grounding(row: dict[str, Any], terms: list[str]) -> bool:
    if not terms:
        return False
    haystacks = _row_lexical_haystacks(row)
    searchable = "\n".join(haystacks.values())
    normalized_searchable = _normalize_search_text(searchable)
    for term in terms:
        normalized = _normalize_search_text(term)
        if not normalized:
            continue
        if term in searchable or normalized in normalized_searchable:
            return True
    return False


def _lexical_rerank_bonus(result: SearchResult, row: dict[str, Any] | None, query: str, search_terms: list[str]) -> float:
    if row is None:
        return 0.0

    haystacks = _row_lexical_haystacks(row)
    normalized_query = _normalize_search_text(query)
    title_lower = haystacks["title"].lower()
    author_lower = haystacks["author"].lower()
    category_lower = haystacks["category"].lower()
    content_lower = "\n".join(
        [haystacks["original_text"], haystacks["punctuated_text"], haystacks["translated_text"], result.content]
    ).lower()

    bonus = 0.0
    if normalized_query and normalized_query in _normalize_search_text(haystacks["title"]):
        bonus += 0.45

    for term in search_terms:
        normalized_term = _normalize_search_text(term)
        if not normalized_term:
            continue
        if normalized_term in title_lower:
            bonus += 0.28
        if normalized_term in author_lower:
            bonus += 0.22
        if normalized_term in category_lower:
            bonus += 0.16
        if result.anchor_text and normalized_term in _normalize_search_text(result.anchor_text):
            bonus += 0.20
        if normalized_term in content_lower:
            bonus += 0.08

    if row.get("source_type") == "corpus":
        bonus += 0.06

    if not _has_term_grounding(row, search_terms):
        bonus -= 0.45

    return bonus


def _iter_segment_candidates(row: dict[str, Any]) -> list[dict[str, Any]]:
    segments = row.get("segments") or []
    if isinstance(segments, str):
        try:
            segments = json.loads(segments)
        except json.JSONDecodeError:
            segments = []
    return [segment for segment in segments if isinstance(segment, dict)]


def _match_segment_location(row: dict[str, Any], query: str) -> dict[str, Any] | None:
    normalized_query = _normalize_search_text(query)
    if not normalized_query:
        return None

    for segment in _iter_segment_candidates(row):
        segment_title = str(segment.get("title") or "").strip()
        segment_text = str(segment.get("text") or "").strip()
        segment_excerpt = str(segment.get("excerpt") or "").strip()
        segment_summary = str(segment.get("summary") or "").strip()
        haystack = "\n".join([segment_title, segment_text, segment_excerpt, segment_summary])
        if not haystack:
            continue
        if query in haystack or normalized_query in _normalize_search_text(haystack):
            return {
                "source": f"{_default_source_label(row)} · {segment_title}" if segment_title else _default_source_label(row),
                "content": segment_excerpt or _excerpt_around_match(segment_text, query),
                "anchor_text": segment_excerpt or query,
                "score_boost": 24.0 if query in haystack else 18.0,
            }
    return None


def _match_document_location(row: dict[str, Any], query: str) -> dict[str, Any] | None:
    normalized_query = _normalize_search_text(query)
    if not normalized_query:
        return None

    for text_key in ("punctuated_text", "original_text", "translated_text"):
        text = str(row.get(text_key) or "").strip()
        if not text:
            continue
        if query in text or normalized_query in _normalize_search_text(text):
            return {
                "source": _default_source_label(row),
                "content": _excerpt_around_match(text, query),
                "anchor_text": query,
                "score_boost": 14.0 if query in text else 10.0,
            }
    return None


async def _load_document_candidates(limit: int = 200, user_id: str | None = None) -> list[dict]:
    corpus_rows = await _load_sqlite_corpus_candidates(limit)

    try:
        async with get_connection() as conn:
            if user_id:
                rows = await conn.fetch(
                    """
                    SELECT id::text AS id, repo_id, title, source_name, author, dynasty, category,
                           original_text, punctuated_text, translated_text, segments, source_type,
                           owner_user_id::text AS owner_user_id
                    FROM documents
                    WHERE source_type <> 'corpus' AND owner_user_id = $1::uuid
                    ORDER BY COALESCE(updated_at, created_at) DESC
                    LIMIT $2
                    """,
                    user_id,
                    limit,
                )
                user_rows = [dict(row) for row in rows]
            else:
                user_rows = []
            return [*corpus_rows, *user_rows][:limit]
    except RuntimeError:
        async with get_db() as db:
            cursor = await db.execute(
                """
                SELECT id, repo_id, title, source_name, author, dynasty, category,
                       original_text, punctuated_text, translated_text, segments, source_type, owner_user_id
                FROM documents
                WHERE source_type = 'corpus' OR (? IS NOT NULL AND owner_user_id = ?)
                ORDER BY COALESCE(updated_at, created_at) DESC
                LIMIT ?
                """,
                (user_id, user_id, limit),
            )
            return [_normalize_candidate_row(row) for row in await cursor.fetchall()]


async def _resolve_document_id(
    raw_id: str | None,
    title: str,
    source: str,
    excerpt: str,
    candidates: list[dict] | None = None,
    user_id: str | None = None,
) -> str | None:
    if raw_id:
        candidate_list = candidates
        if candidate_list is None:
            candidate_list = await _load_document_candidates(limit=50, user_id=user_id)
        for record in candidate_list:
            if str(record.get("id")) == str(raw_id):
                return str(record["id"])

    candidate_list = candidates if candidates is not None else await _load_document_candidates(user_id=user_id)
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


async def fulltext_search(query: str, limit: int = 10, user_id: str | None = None) -> List[SearchResult]:
    """全文搜索（优先兼容当前 documents 表结构）。"""
    search_terms = _extract_search_terms(query)
    exact_quote_mode = _looks_like_exact_quote(query)
    rows = await _load_document_candidates(limit=400, user_id=user_id)

    results: List[SearchResult] = []
    for row in rows:
        if not _can_access_candidate(row, user_id):
            continue
        # Backward-compatible parsing for existing tests that still mock the old
        # (id, title, content, source, score) shape.
        if isinstance(row, (list, tuple)) and len(row) >= 5 and isinstance(row[4], (int, float)):
            title = row[1] or ""
            preview = row[2] or ""
            source = row[3] or ""
            match_score = float(row[4] or 0)
            anchor_text = query.strip() or None
        else:
            title = row.get("title") or ""
            author = row.get("author", "")
            dynasty = row.get("dynasty", "")
            category = row.get("category", "")
            source_name = row.get("source_name", "")
            original_text = row.get("original_text") or ""
            punctuated_text = row.get("punctuated_text") or ""
            translated_text = row.get("translated_text") or ""
            source_type = row.get("source_type") or ""
            searchable_text = "\n".join([title, author or "", dynasty or "", category or "", source_name or "", original_text, punctuated_text, translated_text])
            normalized_searchable = _normalize_search_text(searchable_text)
            normalized_title = _normalize_search_text(title)
            normalized_author = _normalize_search_text(author)
            normalized_category = _normalize_search_text(category)
            normalized_source = _normalize_search_text(source_name)
            normalized_punctuated = _normalize_search_text(punctuated_text)
            normalized_original = _normalize_search_text(original_text)
            normalized_translated = _normalize_search_text(translated_text)
            segment_match = _match_segment_location(row, query) if exact_quote_mode else None
            document_match = _match_document_location(row, query)

            match_score = 0.0
            matched_terms: set[str] = set()
            normalized_query = _normalize_search_text(query)
            if normalized_query and normalized_query == normalized_title:
                match_score += 50.0
            elif normalized_query and normalized_query in normalized_title:
                match_score += 24.0
            if normalized_query and normalized_query in normalized_author:
                match_score += 18.0

            for term in search_terms:
                normalized_term = _normalize_search_text(term)
                if not normalized_term:
                    continue
                term_matched = False
                if normalized_term == normalized_title:
                    match_score += 28.0
                    term_matched = True
                elif normalized_term in normalized_title:
                    match_score += 16.0
                    term_matched = True
                if normalized_author and normalized_term in normalized_author:
                    match_score += 18.0
                    term_matched = True
                if normalized_category and normalized_term in normalized_category:
                    match_score += 12.0
                    term_matched = True
                if normalized_source and normalized_term in normalized_source:
                    match_score += 6.0
                    term_matched = True

                occurrences = normalized_punctuated.count(normalized_term) + normalized_original.count(normalized_term)
                if occurrences:
                    match_score += min(occurrences, 5) * 3.2
                    term_matched = True

                translated_occurrences = normalized_translated.count(normalized_term)
                if translated_occurrences:
                    match_score += min(translated_occurrences, 3) * 1.0
                    term_matched = True

                if term_matched:
                    matched_terms.add(normalized_term)

            if segment_match:
                match_score += float(segment_match["score_boost"])
            elif document_match:
                match_score += float(document_match["score_boost"])

            if matched_terms:
                coverage = len(matched_terms) / max(len(search_terms), 1)
                match_score += coverage * 20.0

            if source_type == "corpus" and matched_terms:
                match_score += 3.0

            if match_score <= 0 or (search_terms and not exact_quote_mode and not matched_terms and not document_match):
                continue

            preview = (
                (segment_match or document_match or {}).get("content")
                or translated_text
                or punctuated_text
                or original_text
            )
            source = (
                (segment_match or document_match or {}).get("source")
                or _default_source_label(row)
            )
            if source_type == "corpus" and exact_quote_mode and not segment_match and row.get("source_name"):
                source = f"古籍库 · {row.get('source_name')}"
            anchor_text = (
                (segment_match or document_match or {}).get("anchor_text")
                or query.strip()
                or None
            )

        results.append(SearchResult(
            id=str(row["id"]),
            document_id=str(row["id"]),
            title=title,
            content=preview,
            source=source,
            score=match_score,
            anchor_text=anchor_text,
        ))

    results.sort(key=lambda item: item.score, reverse=True)
    return results[:limit]


async def vector_search(query: str, limit: int = 10, user_id: str | None = None) -> List[SearchResult]:
    """FAISS向量检索"""
    if not rag_agent or not rag_agent.vectorstore:
        raise HTTPException(status_code=503, detail="向量检索服务不可用")

    try:
        docs_with_scores = rag_agent.vectorstore.similarity_search_with_score(query, k=limit)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"向量检索失败: {str(e)}")

    results = []
    candidates = await _load_document_candidates(user_id=user_id)
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
            user_id=user_id,
        )
        if document_id is None and metadata.get("document_id"):
            continue
        results.append(SearchResult(
            id=str(metadata.get("id", 0)),
            document_id=document_id,
            title=title,
            content=doc.page_content,
            source=source,
            score=float(score),
            anchor_text=doc.page_content[:60] if doc.page_content else None,
        ))

    return results


async def hybrid_search(query: str, limit: int = 10, user_id: str | None = None) -> List[SearchResult]:
    """混合检索：BM25 + Embedding，优化相关性"""
    search_terms = _extract_search_terms(query)
    question_like_query = not _looks_like_exact_quote(query) and any(
        marker in query for marker in ("什么", "为何", "为什么", "如何", "怎么", "怎样", "到底", "？", "?")
    )

    fulltext_results = await fulltext_search(query, limit=limit * 4, user_id=user_id)

    try:
        vector_results = await vector_search(query, limit=limit * 4, user_id=user_id)
    except HTTPException:
        return fulltext_results[:limit]

    fulltext_scores = [r.score for r in fulltext_results]
    vector_scores = [r.score for r in vector_results]

    norm_fulltext = normalize_scores(fulltext_scores)
    norm_vector = normalize_scores(vector_scores, higher_is_better=False)

    fulltext_weight = 0.7 if question_like_query else 0.55
    vector_weight = 0.3 if question_like_query else 0.45

    for i, result in enumerate(fulltext_results):
        result.score = norm_fulltext[i] * fulltext_weight

    for i, result in enumerate(vector_results):
        result.score = norm_vector[i] * vector_weight

    merged: dict[str, SearchResult] = {}
    for result in fulltext_results:
        merge_key = result.document_id or result.id
        merged[merge_key] = result

    for result in vector_results:
        merge_key = result.document_id or result.id
        if merge_key in merged:
            merged[merge_key].score += result.score
        else:
            merged[merge_key] = result

    candidate_rows = await _load_document_candidates(limit=500, user_id=user_id)
    candidate_map = {str(row.get("id")): row for row in candidate_rows if row.get("id") is not None}

    for merge_key, result in merged.items():
        row = candidate_map.get(str(result.document_id or result.id))
        result.score += _lexical_rerank_bonus(result, row, query, search_terms)
        if row and question_like_query and not _has_term_grounding(row, search_terms):
            result.score *= 0.25

    sorted_results = sorted(merged.values(), key=lambda x: x.score, reverse=True)
    threshold = 0.2 if question_like_query else 0.08
    filtered_results = [r for r in sorted_results if r.score >= threshold]

    return filtered_results[:limit]


@router.get("/search", response_model=SearchResponse)
@limiter.limit("30/minute")
async def search(
    request: Request,
    q: str = Query(..., description="搜索关键词"),
    mode: SearchMode = Query(SearchMode.HYBRID, description="搜索模式"),
    limit: int = Query(10, ge=1, le=100, description="返回结果数量"),
    _user: dict | None = Depends(maybe_auth),
):
    """
    全文搜索和混合检索API

    - **q**: 搜索关键词（必填）
    - **mode**: 搜索模式（FULLTEXT/VECTOR/HYBRID，默认HYBRID）
    - **limit**: 返回结果数量（1-100，默认10）
    """
    if not q or not q.strip():
        raise HTTPException(status_code=400, detail="搜索关键词不能为空")

    user_id = _extract_user_id(_user)

    # Execute search based on mode
    if mode == SearchMode.FULLTEXT:
        results = await fulltext_search(q, limit, user_id=user_id)
    elif mode == SearchMode.VECTOR:
        results = await vector_search(q, limit, user_id=user_id)
    else:  # HYBRID
        results = await hybrid_search(q, limit, user_id=user_id)

    return SearchResponse(
        results=results,
        mode=mode.value,
        total=len(results)
    )
