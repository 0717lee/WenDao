# -*- coding: utf-8 -*-
"""
Document Processing Router
Upload images for OCR recognition, process ancient text (punctuation + translation),
export documents (PDF/TXT), and explain ancient words.
"""
import asyncio
import base64
import json
import logging
import time
import uuid
from typing import Any

from fastapi import APIRouter, Depends, File, HTTPException, Query, Request, UploadFile
from fastapi.responses import Response, StreamingResponse
from pydantic import BaseModel, Field

from agents.ocr import OCRAgent
from agents.sentence_explainer import SentenceExplainerAgent
from agents.translator import TranslatorAgent
from agents.word_explainer import WordExplainerAgent
from core import pg_database
from core.auth import maybe_auth, require_auth
from core.document_segments import (
    build_original_text,
    build_translated_text,
    get_translation_progress,
    merge_translation_cache,
    pick_translation_segments,
)
from core.kanripo_catalog import load_kanripo_catalog
from core.kanripo_source import build_repo_record
from core.database import get_db
from core.entity_extractor import EntityExtractor
from core.lazy_proxy import LazyProxy
from core.rate_limit import limiter
from core.user_learning_repository import (
    get_document_note as repo_get_document_note,
    get_study_progress as repo_get_study_progress,
    save_document_note as repo_save_document_note,
    save_study_session as repo_save_study_session,
)
from core.wikisource_source import build_wikisource_record, search_wikisource_catalog

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/documents", tags=["documents"])
MAX_UPLOAD_FILE_SIZE = 5 * 1024 * 1024


def _extract_user_id(user: Any) -> str | None:
    if isinstance(user, dict) and user.get("sub"):
        return str(user["sub"])
    return None


def _create_ocr_agent() -> OCRAgent:
    return OCRAgent()


def _create_translator_agent() -> TranslatorAgent:
    return TranslatorAgent()


def _create_word_explainer() -> WordExplainerAgent:
    return WordExplainerAgent()


def _create_entity_extractor() -> EntityExtractor:
    return EntityExtractor()


def _create_sentence_explainer() -> SentenceExplainerAgent:
    return SentenceExplainerAgent()


ocr_agent = LazyProxy(_create_ocr_agent)
sentence_explainer = LazyProxy(_create_sentence_explainer)
translator_agent = LazyProxy(_create_translator_agent)
word_explainer = LazyProxy(_create_word_explainer)
entity_extractor = LazyProxy(_create_entity_extractor)


def get_connection():
    """Local wrapper so tests can patch either this symbol or pg_database.get_connection."""
    return pg_database.get_connection()

ALLOWED_CONTENT_TYPES = {"image/jpeg", "image/png", "image/tiff"}


def _normalize_document_payload(row: dict[str, Any]) -> dict[str, Any]:
    for key in ("entity_ids", "chapter_titles", "recommended_chapters", "segment_guides", "segments", "translation_cache"):
        value = row.get(key)
        if isinstance(value, str):
            try:
                row[key] = json.loads(value)
            except json.JSONDecodeError:
                row[key] = []
        elif value is None:
            row[key] = []
    return row


def _is_public_document(row: dict[str, Any] | None) -> bool:
    return bool(row and row.get("source_type") in {"corpus", "sample"})


def _can_access_document(row: dict[str, Any] | None, user_id: str | None) -> bool:
    if not row:
        return False
    if _is_public_document(row):
        return True
    return bool(user_id and row.get("owner_user_id") == user_id)


def _ensure_document_access(row: dict[str, Any] | None, user_id: str | None) -> dict[str, Any]:
    if not _can_access_document(row, user_id):
        raise HTTPException(status_code=404, detail="文档不存在")
    return row or {}


class DocumentTextUpdateRequest(BaseModel):
    """Update manually corrected OCR text before further processing."""
    text: str = Field(..., min_length=1, max_length=50000)


class DocumentNoteUpdateRequest(BaseModel):
    """Upsert a note attached to the current document."""
    note_text: str = Field(default="", max_length=10000)


class StudyProgressUpdateRequest(BaseModel):
    completed_cards: int = Field(..., ge=0)
    total_cards: int = Field(..., ge=0)
    mastered_cards: int = Field(..., ge=0)
    review_again_cards: int = Field(..., ge=0)


class TranslationCacheRequest(BaseModel):
    strategy: str = Field(default="recommended", pattern="^(recommended|next|full)$")
    max_segments: int = Field(default=6, ge=1, le=60)


class SentenceExplainRequest(BaseModel):
    sentence: str = Field(..., min_length=1, max_length=300)
    context: str = Field(default="", max_length=1200)
    chapter_title: str = Field(default="", max_length=120)


def _split_learning_sentences(text: str) -> list[str]:
    chunks = [segment.strip() for segment in text.replace("\r", "").splitlines() if segment.strip()]
    if not chunks:
        chunks = [segment.strip() for segment in text.replace("。", "。\n").splitlines() if segment.strip()]
    return chunks[:6]


def _make_image_data_url(content_type: str, image_bytes: bytes) -> str:
    encoded = base64.b64encode(image_bytes).decode("ascii")
    return f"data:{content_type};base64,{encoded}"


def sse_reasoning(
    step: str,
    label: str,
    status: str,
    duration: float | None = None,
    model: str | None = None,
    fallback: bool = False,
) -> str:
    """Local SSE reasoning helper to avoid importing the heavier chat module."""
    data = {"step": step, "label": label, "status": status}
    if duration is not None:
        data["duration"] = round(duration, 2)
    if model:
        data["model"] = model
    if fallback:
        data["fallback"] = True
    return f'event: reasoning\ndata: {json.dumps(data, ensure_ascii=False)}\n\n'


async def _create_document(
    document_id: str,
    title: str,
    original_text: str,
    confidence: float,
    image_data: str,
    owner_user_id: str,
) -> None:
    """Persist uploaded document to PostgreSQL or SQLite."""
    try:
        async with get_connection() as conn:
            await conn.execute(
                "INSERT INTO documents (id, title, original_text, ocr_confidence, image_data, status, owner_user_id, source_type) "
                "VALUES ($1::uuid, $2, $3, $4, $5, 'ocr_complete', $6::uuid, 'user')",
                document_id,
                title,
                original_text,
                confidence,
                image_data,
                owner_user_id,
            )
        return
    except RuntimeError:
        pass

    async with get_db() as db:
        await db.execute(
            """
            INSERT INTO documents (id, title, original_text, ocr_confidence, image_data, status, owner_user_id, source_type)
            VALUES (?, ?, ?, ?, ?, 'ocr_complete', ?, 'user')
            """,
            (document_id, title, original_text, confidence, image_data, owner_user_id),
        )
        await db.commit()


async def _get_document(document_id: str) -> dict | None:
    """Fetch a normalized document row from PostgreSQL or SQLite."""
    try:
        async with get_connection() as conn:
            row = await conn.fetchrow(
                """
                SELECT id, title, repo_id, author, dynasty, category, source_name, source_url,
                       chapter_titles, chapter_count, featured_excerpt,
                       difficulty, guide_summary, reading_tip, recommended_chapters,
                       segment_guides, segments, translation_cache, translation_status,
                       original_text, punctuated_text, translated_text, ocr_confidence,
                       image_data, entity_ids, status, source_type, owner_user_id, created_at, updated_at
                FROM documents
                WHERE id = $1::uuid
                """,
                document_id,
            )
            return _normalize_document_payload(dict(row)) if row else None
    except RuntimeError:
        pass

    async with get_db() as db:
        cursor = await db.execute(
            """
            SELECT id, title, repo_id, author, dynasty, category, source_name, source_url,
                   chapter_titles, chapter_count, featured_excerpt,
                   difficulty, guide_summary, reading_tip, recommended_chapters,
                   segment_guides, segments, translation_cache, translation_status,
                   original_text, punctuated_text, translated_text, ocr_confidence,
                   image_data, entity_ids, status, source_type, owner_user_id, created_at, updated_at
            FROM documents
            WHERE id = ?
            """,
            (document_id,),
        )
        row = await cursor.fetchone()
        return _normalize_document_payload(dict(row)) if row else None


async def _get_document_by_repo_id(repo_id: str) -> dict[str, Any] | None:
    try:
        async with get_connection() as conn:
            row = await conn.fetchrow(
                """
                SELECT id::text AS id
                FROM documents
                WHERE repo_id = $1
                LIMIT 1
                """,
                repo_id,
            )
            if not row:
                return None
            return await _get_document(row["id"])
    except RuntimeError:
        pass

    async with get_db() as db:
        cursor = await db.execute(
            """
            SELECT id
            FROM documents
            WHERE repo_id = ?
            LIMIT 1
            """,
            (repo_id,),
        )
        row = await cursor.fetchone()
        if not row:
            return None
        return await _get_document(row["id"])


async def _list_documents(limit: int = 50, source_type: str | None = None, user_id: str | None = None) -> list[dict[str, Any]]:
    """Return bookshelf-ready document metadata ordered by most recently updated."""
    where_clause = (
        "WHERE (d.source_type IN ('corpus', 'sample') OR ($2::uuid IS NOT NULL AND d.owner_user_id = $2::uuid))"
    )
    if source_type:
        where_clause += " AND d.source_type = $3"
    try:
        async with get_connection() as conn:
            sql = f"""
                SELECT
                    d.id::text AS id,
                    d.title,
                    d.repo_id,
                    d.author,
                    d.dynasty,
                    d.category,
                    d.source_name,
                    d.source_url,
                    d.chapter_count,
                    d.difficulty,
                    d.guide_summary,
                    d.translation_status,
                    d.status,
                    d.source_type,
                    d.owner_user_id::text AS owner_user_id,
                    d.created_at,
                    d.updated_at,
                    LEFT(COALESCE(NULLIF(d.featured_excerpt, ''), NULLIF(d.translated_text, ''), NULLIF(d.punctuated_text, ''), d.original_text), 140) AS preview,
                    COALESCE(h.current_paragraph, 0) AS current_paragraph,
                    COALESCE(h.total_paragraphs, 0) AS total_paragraphs,
                    CASE
                        WHEN d.punctuated_text IS NOT NULL AND d.punctuated_text <> '' THEN TRUE
                        ELSE FALSE
                    END AS has_processed,
                    CASE
                        WHEN n.note_text IS NOT NULL AND n.note_text <> '' THEN TRUE
                        ELSE FALSE
                    END AS has_note
                FROM documents d
                LEFT JOIN LATERAL (
                    SELECT current_paragraph, total_paragraphs
                    FROM user_reading_history
                    WHERE document_id = d.id
                      AND user_id = $2::uuid
                    ORDER BY last_read_at DESC
                    LIMIT 1
                ) h ON TRUE
                LEFT JOIN user_document_notes n
                  ON n.document_id = d.id
                 AND n.user_id = $2::uuid
                {where_clause}
                ORDER BY CASE
                    WHEN d.source_type = 'corpus' THEN 0
                    WHEN d.source_type = 'sample' THEN 1
                    ELSE 2
                END, COALESCE(d.updated_at, d.created_at) DESC
                LIMIT $1
                """
            rows = await conn.fetch(
                sql,
                limit,
                user_id,
                source_type,
            ) if source_type else await conn.fetch(sql, limit, user_id)
            return [dict(row) for row in rows]
    except RuntimeError:
        pass

    async with get_db() as db:
        sql = """
            SELECT
                d.id,
                d.title,
                d.repo_id,
                d.author,
                d.dynasty,
                d.category,
                d.source_name,
                d.source_url,
                d.chapter_count,
                d.difficulty,
                d.guide_summary,
                d.translation_status,
                d.status,
                d.source_type,
                d.owner_user_id,
                d.created_at,
                d.updated_at,
                SUBSTR(COALESCE(NULLIF(d.featured_excerpt, ''), NULLIF(d.translated_text, ''), NULLIF(d.punctuated_text, ''), d.original_text), 1, 140) AS preview,
                COALESCE((
                    SELECT current_paragraph
                    FROM user_reading_history h
                    WHERE h.document_id = d.id
                      AND h.user_id = ?
                    ORDER BY h.last_read_at DESC
                    LIMIT 1
                ), 0) AS current_paragraph,
                COALESCE((
                    SELECT total_paragraphs
                    FROM user_reading_history h
                    WHERE h.document_id = d.id
                      AND h.user_id = ?
                    ORDER BY h.last_read_at DESC
                    LIMIT 1
                ), 0) AS total_paragraphs,
                CASE
                    WHEN d.punctuated_text IS NOT NULL AND d.punctuated_text != '' THEN 1
                    ELSE 0
                END AS has_processed,
                CASE
                    WHEN n.note_text IS NOT NULL AND n.note_text != '' THEN 1
                    ELSE 0
                END AS has_note
            FROM documents d
            LEFT JOIN user_document_notes n ON n.document_id = d.id AND n.user_id = ?
            {where_clause_sqlite}
            ORDER BY CASE
                WHEN d.source_type = 'corpus' THEN 0
                WHEN d.source_type = 'sample' THEN 1
                ELSE 2
            END, COALESCE(d.updated_at, d.created_at) DESC
            LIMIT ?
            """
        where_clause_sqlite = "WHERE (d.source_type IN ('corpus', 'sample') OR (? IS NOT NULL AND d.owner_user_id = ?))"
        if source_type:
            where_clause_sqlite += " AND d.source_type = ?"
        cursor = await db.execute(
            sql.format(where_clause_sqlite=where_clause_sqlite),
            (user_id, user_id, user_id, user_id, user_id, source_type, limit) if source_type else (user_id, user_id, user_id, user_id, user_id, limit),
        )
        rows = await cursor.fetchall()
        return [dict(row) for row in rows]


async def _upsert_document_record(record: dict[str, Any]) -> None:
    try:
        async with get_connection() as conn:
            await conn.execute(
                """
                INSERT INTO documents (
                    id, title, repo_id, author, dynasty, category, source_name, source_url,
                    chapter_titles, chapter_count, featured_excerpt,
                    difficulty, guide_summary, reading_tip, recommended_chapters,
                    segment_guides, segments, translation_cache, translation_status,
                    original_text, punctuated_text, translated_text,
                    ocr_confidence, image_data, status, entity_ids, source_type
                ) VALUES (
                    $1::uuid, $2, $3, $4, $5, $6, $7, $8,
                    $9::jsonb, $10, $11,
                    $12, $13, $14, $15::jsonb,
                    $16::jsonb, $17::jsonb, $18::jsonb, $19,
                    $20, $21, $22,
                    $23, $24, $25, $26::jsonb, $27
                )
                ON CONFLICT (id) DO UPDATE SET
                    title = EXCLUDED.title,
                    repo_id = EXCLUDED.repo_id,
                    author = EXCLUDED.author,
                    dynasty = EXCLUDED.dynasty,
                    category = EXCLUDED.category,
                    source_name = EXCLUDED.source_name,
                    source_url = EXCLUDED.source_url,
                    chapter_titles = EXCLUDED.chapter_titles,
                    chapter_count = EXCLUDED.chapter_count,
                    featured_excerpt = EXCLUDED.featured_excerpt,
                    difficulty = EXCLUDED.difficulty,
                    guide_summary = EXCLUDED.guide_summary,
                    reading_tip = EXCLUDED.reading_tip,
                    recommended_chapters = EXCLUDED.recommended_chapters,
                    segment_guides = EXCLUDED.segment_guides,
                    segments = EXCLUDED.segments,
                    translation_cache = EXCLUDED.translation_cache,
                    translation_status = EXCLUDED.translation_status,
                    original_text = EXCLUDED.original_text,
                    punctuated_text = EXCLUDED.punctuated_text,
                    translated_text = EXCLUDED.translated_text,
                    ocr_confidence = EXCLUDED.ocr_confidence,
                    image_data = EXCLUDED.image_data,
                    status = EXCLUDED.status,
                    entity_ids = EXCLUDED.entity_ids,
                    source_type = EXCLUDED.source_type,
                    updated_at = NOW()
                """,
                record["id"],
                record["title"],
                record.get("repo_id"),
                record.get("author"),
                record.get("dynasty"),
                record.get("category"),
                record.get("source_name"),
                record.get("source_url"),
                json.dumps(record.get("chapter_titles", []), ensure_ascii=False),
                int(record.get("chapter_count", 0)),
                record.get("featured_excerpt"),
                record.get("difficulty"),
                record.get("guide_summary"),
                record.get("reading_tip"),
                json.dumps(record.get("recommended_chapters", []), ensure_ascii=False),
                json.dumps(record.get("segment_guides", []), ensure_ascii=False),
                json.dumps(record.get("segments", []), ensure_ascii=False),
                json.dumps(record.get("translation_cache", []), ensure_ascii=False),
                record.get("translation_status", "none"),
                record.get("original_text", ""),
                record.get("punctuated_text", ""),
                record.get("translated_text", ""),
                1.0,
                None,
                "done",
                json.dumps(record.get("entity_ids", []), ensure_ascii=False),
                record.get("source_type", "corpus"),
            )
        return
    except RuntimeError:
        pass

    async with get_db() as db:
        await db.execute(
            """
            INSERT INTO documents (
                id, title, repo_id, author, dynasty, category, source_name, source_url,
                chapter_titles, chapter_count, featured_excerpt,
                difficulty, guide_summary, reading_tip, recommended_chapters,
                segment_guides, segments, translation_cache, translation_status,
                original_text, punctuated_text, translated_text,
                ocr_confidence, image_data, status, entity_ids, source_type
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
                title = excluded.title,
                repo_id = excluded.repo_id,
                author = excluded.author,
                dynasty = excluded.dynasty,
                category = excluded.category,
                source_name = excluded.source_name,
                source_url = excluded.source_url,
                chapter_titles = excluded.chapter_titles,
                chapter_count = excluded.chapter_count,
                featured_excerpt = excluded.featured_excerpt,
                difficulty = excluded.difficulty,
                guide_summary = excluded.guide_summary,
                reading_tip = excluded.reading_tip,
                recommended_chapters = excluded.recommended_chapters,
                segment_guides = excluded.segment_guides,
                segments = excluded.segments,
                translation_cache = excluded.translation_cache,
                translation_status = excluded.translation_status,
                original_text = excluded.original_text,
                punctuated_text = excluded.punctuated_text,
                translated_text = excluded.translated_text,
                ocr_confidence = excluded.ocr_confidence,
                image_data = excluded.image_data,
                status = excluded.status,
                entity_ids = excluded.entity_ids,
                source_type = excluded.source_type,
                updated_at = CURRENT_TIMESTAMP
            """,
            (
                record["id"],
                record["title"],
                record.get("repo_id"),
                record.get("author"),
                record.get("dynasty"),
                record.get("category"),
                record.get("source_name"),
                record.get("source_url"),
                json.dumps(record.get("chapter_titles", []), ensure_ascii=False),
                int(record.get("chapter_count", 0)),
                record.get("featured_excerpt"),
                record.get("difficulty"),
                record.get("guide_summary"),
                record.get("reading_tip"),
                json.dumps(record.get("recommended_chapters", []), ensure_ascii=False),
                json.dumps(record.get("segment_guides", []), ensure_ascii=False),
                json.dumps(record.get("segments", []), ensure_ascii=False),
                json.dumps(record.get("translation_cache", []), ensure_ascii=False),
                record.get("translation_status", "none"),
                record.get("original_text", ""),
                record.get("punctuated_text", ""),
                record.get("translated_text", ""),
                1.0,
                None,
                "done",
                json.dumps(record.get("entity_ids", []), ensure_ascii=False),
                record.get("source_type", "corpus"),
            ),
        )
        await db.commit()


async def _list_catalog_entries(
    query: str = "",
    family: str | None = None,
    section: str | None = None,
    primary_only: bool = True,
    limit: int = 50,
    offset: int = 0,
) -> dict[str, Any]:
    entries = load_kanripo_catalog()
    query_text = query.strip().lower()

    imported_rows = await _list_documents(limit=5000)
    imported_by_repo_id = {
        item.get("repo_id"): {"document_id": item.get("id"), "title": item.get("title")}
        for item in imported_rows
        if item.get("repo_id")
    }

    def matches(entry: dict[str, Any]) -> bool:
        if primary_only and not entry.get("is_primary_text"):
            return False
        if family and entry.get("family") != family:
            return False
        if section and entry.get("section") != section:
            return False
        if query_text:
            haystack = " ".join(
                str(entry.get(key) or "")
                for key in ("title", "author", "dynasty", "family", "section")
            ).lower()
            if query_text not in haystack:
                return False
        return True

    filtered = []
    for entry in entries:
        if not matches(entry):
            continue
        imported = imported_by_repo_id.get(entry["repo_id"])
        filtered.append({
            **entry,
            "imported": bool(imported),
            "imported_document_id": imported["document_id"] if imported else None,
        })

    wikisource_entries: list[dict[str, Any]] = []
    if not section and (not family or family == "维基文库"):
        try:
            for entry in await asyncio.to_thread(search_wikisource_catalog, query, min(limit, 12)):
                imported = imported_by_repo_id.get(entry["repo_id"])
                wikisource_entries.append(
                    {
                        **entry,
                        "imported": bool(imported),
                        "imported_document_id": imported["document_id"] if imported else None,
                    }
                )
        except Exception as exc:
            logger.warning("Wikisource catalog supplement unavailable: %s", exc)

    deduped: dict[str, dict[str, Any]] = {}
    for entry in [*wikisource_entries, *filtered]:
        deduped[entry["repo_id"]] = entry

    filtered = list(deduped.values())
    filtered.sort(
        key=lambda item: (
            0 if item.get("source_backend") == "wikisource" else 1,
            not item.get("is_primary_text", False),
            item.get("title", ""),
        )
    )
    return {
        "entries": filtered[offset: offset + limit],
        "total": len(filtered),
    }


async def _save_translation_state(
    document_id: str,
    translation_cache: list[dict[str, Any]],
    status: str,
    translated_text: str,
) -> None:
    payload = json.dumps(translation_cache, ensure_ascii=False)
    try:
        async with get_connection() as conn:
            await conn.execute(
                """
                UPDATE documents
                SET translation_cache = $2::jsonb,
                    translation_status = $3,
                    translated_text = $4,
                    updated_at = NOW()
                WHERE id = $1::uuid
                """,
                document_id,
                payload,
                status,
                translated_text,
            )
        return
    except RuntimeError:
        pass

    async with get_db() as db:
        await db.execute(
            """
            UPDATE documents
            SET translation_cache = ?,
                translation_status = ?,
                translated_text = ?,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
            """,
            (payload, status, translated_text, document_id),
        )
        await db.commit()


async def _hydrate_document_source(document: dict[str, Any]) -> dict[str, Any]:
    repo_id = str(document.get("repo_id") or "")
    if not repo_id:
        return document

    if repo_id.startswith("WS:"):
        record = build_wikisource_record(
            {
                "repo_id": repo_id,
                "page_title": repo_id.removeprefix("WS:"),
                "title": document.get("title"),
                "author": document.get("author"),
                "dynasty": document.get("dynasty"),
                "category": document.get("category"),
                "difficulty": document.get("difficulty"),
                "guide_summary": document.get("guide_summary"),
                "reading_tip": document.get("reading_tip"),
            }
        )
    else:
        catalog = load_kanripo_catalog()
        entry = next((item for item in catalog if item.get("repo_id") == repo_id), None) or {
            "repo_id": repo_id,
            "title": document.get("title"),
            "author": document.get("author"),
            "dynasty": document.get("dynasty"),
            "category": document.get("category"),
            "family": document.get("family"),
            "section": document.get("section"),
        }
        record = build_repo_record(entry)

    await _upsert_document_record(record)
    return await _get_document(str(record["id"])) or document


async def _translate_document_segments(
    document: dict[str, Any],
    strategy: str,
    max_segments: int,
) -> tuple[dict[str, Any], int, dict[str, int | bool]]:
    hydrated_document = document
    segments = hydrated_document.get("segments") or []
    if not segments and hydrated_document.get("repo_id"):
        hydrated_document = await _hydrate_document_source(hydrated_document)
        segments = hydrated_document.get("segments") or []

    if not segments:
        raise HTTPException(status_code=400, detail="当前文档缺少可翻译的分段信息")

    existing_cache = hydrated_document.get("translation_cache") or []
    progress = get_translation_progress(segments, existing_cache)
    if progress["is_complete"]:
        translated_text = hydrated_document.get("translated_text") or build_translated_text(segments, existing_cache)
        if translated_text != (hydrated_document.get("translated_text") or ""):
            await _save_translation_state(
                str(hydrated_document["id"]),
                existing_cache,
                "full",
                translated_text,
            )
            hydrated_document = await _get_document(str(hydrated_document["id"])) or hydrated_document
        return hydrated_document, 0, progress

    selected_segments = pick_translation_segments(
        segments,
        existing_cache,
        strategy=strategy,
        max_segments=max_segments,
        recommended_titles=hydrated_document.get("recommended_chapters") or [],
    )
    if not selected_segments:
        return hydrated_document, 0, progress

    generated_items: list[dict[str, Any]] = []
    for segment in selected_segments:
        raw_segment = build_original_text(str(segment.get("text") or ""))
        result = await translator_agent.punctuate_and_translate(raw_segment)
        generated_items.append(
            {
                "segment_index": segment.get("index"),
                "title": segment.get("title"),
                "excerpt": segment.get("excerpt"),
                "summary": segment.get("summary"),
                "punctuated": result.get("punctuated", ""),
                "translated": result.get("translated", ""),
            }
        )

    merged_cache = merge_translation_cache(existing_cache, generated_items)
    progress = get_translation_progress(segments, merged_cache)
    translated_text = build_translated_text(segments, merged_cache) if progress["is_complete"] else ""
    await _save_translation_state(
        str(hydrated_document["id"]),
        merged_cache,
        "full" if progress["is_complete"] else "partial",
        translated_text,
    )
    hydrated_document = await _get_document(str(hydrated_document["id"])) or hydrated_document
    return hydrated_document, len(generated_items), progress


async def _get_document_note(document_id: str, user_id: str | None) -> dict[str, Any]:
    """Fetch saved note content for one document."""
    return await repo_get_document_note(document_id, user_id)


async def _save_document_note(document_id: str, user_id: str, note_text: str) -> dict[str, Any]:
    """Create or update a note attached to a document."""
    return await repo_save_document_note(document_id, user_id, note_text)


async def _save_study_session(document_id: str, user_id: str, body: StudyProgressUpdateRequest) -> dict[str, Any]:
    """Persist one study-card review session."""
    return await repo_save_study_session(
        document_id=document_id,
        user_id=user_id,
        completed_cards=body.completed_cards,
        total_cards=body.total_cards,
        mastered_cards=body.mastered_cards,
        review_again_cards=body.review_again_cards,
    )


async def _get_study_progress(document_id: str, user_id: str | None) -> dict[str, Any]:
    """Return aggregate study progress for one document."""
    return await repo_get_study_progress(document_id, user_id)


async def _resolve_citation_reference(title: str, source: str, excerpt: str = "", user_id: str | None = None) -> dict[str, Any] | None:
    """Try to map a citation to an uploaded document and a readable anchor snippet."""
    terms = [value.strip() for value in (title, source, excerpt) if value and value.strip()]
    if not terms:
        return None

    def score_record(record: dict[str, Any]) -> tuple[int, str]:
        haystacks = [
            record.get("title") or "",
            record.get("original_text") or "",
            record.get("punctuated_text") or "",
            record.get("translated_text") or "",
        ]
        score = 0
        anchor = ""
        for term in terms:
            for text in haystacks:
                if term and term in text:
                    score += len(term) * 5
                    if not anchor:
                        anchor = term
                        break
            if term == title and title == record.get("title"):
                score += 25
        return score, anchor

    candidates: list[dict[str, Any]] = []
    try:
        async with get_connection() as conn:
            rows = await conn.fetch(
                """
                SELECT id::text AS id, title, original_text, punctuated_text, translated_text, source_type, owner_user_id::text AS owner_user_id
                FROM documents
                WHERE source_type IN ('corpus', 'sample') OR ($1::uuid IS NOT NULL AND owner_user_id = $1::uuid)
                ORDER BY COALESCE(updated_at, created_at) DESC
                LIMIT $2
                """
                ,
                user_id,
                200,
            )
            candidates = [dict(row) for row in rows]
    except RuntimeError:
        async with get_db() as db:
            cursor = await db.execute(
                """
                SELECT id, title, original_text, punctuated_text, translated_text, source_type, owner_user_id
                FROM documents
                WHERE source_type IN ('corpus', 'sample') OR (? IS NOT NULL AND owner_user_id = ?)
                ORDER BY COALESCE(updated_at, created_at) DESC
                LIMIT ?
                """
                ,
                (user_id, user_id, 200),
            )
            candidates = [dict(row) for row in await cursor.fetchall()]

    best_match: dict[str, Any] | None = None
    best_score = 0
    best_anchor = ""
    for candidate in candidates:
        score, anchor = score_record(candidate)
        if score > best_score:
            best_match = candidate
            best_score = score
            best_anchor = anchor

    if not best_match or best_score <= 0:
        return None

    return {
        "document_id": best_match["id"],
        "title": best_match["title"],
        "anchor_text": best_anchor or excerpt or source or title,
        "match_score": best_score,
    }


async def _get_recommendations(document_id: str | None, user_id: str | None, limit: int = 6) -> list[dict[str, Any]]:
    """Recommend next readings using shared entities, history, and wordbook signals."""
    docs = await _list_documents(limit=200, user_id=user_id)
    if not docs:
        return []

    current_doc = await _get_document(document_id) if document_id else None
    if current_doc and not _can_access_document(current_doc, user_id):
        current_doc = None
    current_entities = set()
    if current_doc:
        try:
            current_entities = set(json.loads(current_doc.get("entity_ids") or "[]"))
        except json.JSONDecodeError:
            current_entities = set()

    history_ids: set[str] = set()
    wordbook_terms: list[str] = []
    try:
        from routers.reader import _list_reading_history, _list_wordbook_entries

        history_items = await _list_reading_history(user_id)
        history_ids = {str(item.get("id")) for item in history_items}
        wordbook_entries = await _list_wordbook_entries(user_id, limit=20)
        wordbook_terms = [entry["word"] for entry in wordbook_entries if entry.get("word")]
    except Exception:
        pass

    recommendations = []
    for doc in docs:
        if document_id and str(doc["id"]) == document_id:
            continue

        score = 0
        reasons: list[str] = []

        candidate = await _get_document(str(doc["id"]))
        if candidate and not _can_access_document(candidate, user_id):
            continue
        candidate_entities = set()
        if candidate:
            try:
                candidate_entities = set(json.loads(candidate.get("entity_ids") or "[]"))
            except json.JSONDecodeError:
                candidate_entities = set()

        shared_entities = current_entities & candidate_entities
        if shared_entities:
            score += len(shared_entities) * 8
            reasons.append("与当前文档共享图谱实体")

        if str(doc["id"]) in history_ids:
            score += 3
            reasons.append("与你的阅读记录有关")

        preview = (doc.get("preview") or "") + " " + (doc.get("title") or "")
        word_hits = [term for term in wordbook_terms if term and term in preview]
        if word_hits:
            score += min(len(word_hits), 3) * 2
            reasons.append("命中你的生词本")

        if doc.get("has_processed"):
            score += 1

        if score > 0:
            recommendations.append({
                **doc,
                "recommendation_score": score,
                "reasons": reasons,
            })

    recommendations.sort(key=lambda item: item["recommendation_score"], reverse=True)
    if not recommendations:
        return docs[:limit]
    return recommendations[:limit]


async def _update_document_text(document_id: str, text: str) -> bool:
    """Persist corrected OCR text before running translation and entity extraction."""
    try:
        async with get_connection() as conn:
            result = await conn.execute(
                """
                UPDATE documents
                SET original_text = $2, updated_at = NOW()
                WHERE id = $1::uuid
                """,
                document_id,
                text,
            )
            return result != "UPDATE 0"
    except RuntimeError:
        pass

    async with get_db() as db:
        cursor = await db.execute(
            """
            UPDATE documents
            SET original_text = ?, updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
            """,
            (text, document_id),
        )
        await db.commit()
        return cursor.rowcount > 0


async def _update_document_results(
    document_id: str,
    punctuated: str,
    translated: str,
    entity_ids: list[str] | None = None,
) -> None:
    """Persist final processing results using the active database backend."""
    try:
        async with get_connection() as conn:
            await conn.execute(
                """
                UPDATE documents
                SET punctuated_text = $2,
                    translated_text = $3,
                    entity_ids = $4::jsonb,
                    status = 'done',
                    updated_at = NOW()
                WHERE id = $1::uuid
                """,
                document_id,
                punctuated,
                translated,
                json.dumps(entity_ids or []),
            )
        return
    except RuntimeError:
        pass

    async with get_db() as db:
        await db.execute(
            """
            UPDATE documents
            SET punctuated_text = ?,
                translated_text = ?,
                entity_ids = ?,
                status = 'done',
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
            """,
            (punctuated, translated, json.dumps(entity_ids or [], ensure_ascii=False), document_id),
        )
        await db.commit()


@router.get("")
async def list_documents(
    limit: int = Query(50, ge=1, le=200),
    source_type: str | None = Query(default=None),
    _user: dict = Depends(require_auth),
):
    """List documents for the bookshelf/home views."""
    documents = await _list_documents(limit=limit, source_type=source_type, user_id=_extract_user_id(_user))
    return {"documents": documents, "total": len(documents)}


@router.get("/resolve-citation")
async def resolve_citation(
    title: str = Query(..., min_length=1),
    source: str = Query(..., min_length=1),
    excerpt: str = Query(""),
    _user: dict | None = Depends(maybe_auth),
):
    """Try to resolve a citation to an uploaded document and anchor text."""
    result = await _resolve_citation_reference(
        title=title,
        source=source,
        excerpt=excerpt,
        user_id=_extract_user_id(_user),
    )
    return {"match": result}


@router.get("/recommendations")
async def get_recommendations(document_id: str | None = Query(default=None), limit: int = Query(6, ge=1, le=20), _user: dict = Depends(require_auth)):
    """Recommend next documents using reading history, wordbook, and shared entities."""
    items = await _get_recommendations(document_id=document_id, user_id=_extract_user_id(_user), limit=limit)
    return {"documents": items, "total": len(items)}


@router.get("/catalog")
async def list_catalog(
    q: str = Query(default="", description="搜索整源书目"),
    family: str | None = Query(default=None),
    section: str | None = Query(default=None),
    primary_only: bool = Query(default=True),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    _user: dict = Depends(require_auth),
):
    """Browse the full Kanripo catalog with lazy-import status."""
    return await _list_catalog_entries(
        query=q,
        family=family,
        section=section,
        primary_only=primary_only,
        limit=limit,
        offset=offset,
    )


@router.post("/catalog/import/{repo_id}")
async def import_catalog_document(repo_id: str, _user: dict = Depends(require_auth)):
    """Import one Kanripo text on demand and return the ready-to-read document."""
    existing = await _get_document_by_repo_id(repo_id)
    if existing:
        return {"document": existing, "imported": False}

    try:
        if repo_id.startswith("WS:"):
            record = await asyncio.to_thread(
                build_wikisource_record,
                {"repo_id": repo_id, "page_title": repo_id.removeprefix("WS:")},
            )
        else:
            catalog = load_kanripo_catalog()
            entry = next((item for item in catalog if item.get("repo_id") == repo_id), None)
            if not entry:
                raise HTTPException(status_code=404, detail="古籍源条目不存在")
            record = await asyncio.to_thread(build_repo_record, entry)
    except HTTPException:
        raise
    except Exception as exc:
        logger.error("古籍导入失败 repo_id=%s: %s", repo_id, exc)
        raise HTTPException(status_code=500, detail="古籍导入失败，请稍后重试")

    await _upsert_document_record(record)
    document = await _get_document_by_repo_id(repo_id)
    if not document:
        raise HTTPException(status_code=500, detail="古籍导入失败")
    return {"document": document, "imported": True}


@router.post("/{document_id}/translation-cache")
@limiter.limit("10/minute")
async def generate_translation_cache(request: Request, document_id: str, body: TranslationCacheRequest, _user: dict = Depends(require_auth)):
    """Generate cached translations for corpus/source documents."""
    document = _ensure_document_access(await _get_document(document_id), _extract_user_id(_user))
    if document.get("source_type") != "corpus":
        raise HTTPException(status_code=400, detail="只有古籍库文档支持生成白话译缓存")

    updated_document, generated_count, progress = await _translate_document_segments(
        document=document,
        strategy=body.strategy,
        max_segments=body.max_segments,
    )
    return {
        "document": updated_document,
        "generated": generated_count > 0,
        "generated_segments": generated_count,
        "progress": progress,
    }


@router.get("/{document_id}")
async def get_document(document_id: str, _user: dict = Depends(require_auth)):
    """Return one document with full text content for reader/book shelf navigation."""
    return _ensure_document_access(await _get_document(document_id), _extract_user_id(_user))


@router.get("/{document_id}/note")
async def get_document_note(document_id: str, _user: dict = Depends(require_auth)):
    """Fetch the saved note for one document."""
    _ensure_document_access(await _get_document(document_id), _extract_user_id(_user))
    return await _get_document_note(document_id, _extract_user_id(_user))


@router.put("/{document_id}/note")
async def save_document_note(document_id: str, body: DocumentNoteUpdateRequest, _user: dict = Depends(require_auth)):
    """Create or update a reader note for one document."""
    _ensure_document_access(await _get_document(document_id), _extract_user_id(_user))
    return await _save_document_note(document_id, _extract_user_id(_user) or "", body.note_text.strip())


@router.get("/{document_id}/study-cards")
async def get_study_cards(document_id: str, _user: dict = Depends(require_auth)):
    """Generate lightweight study cards and self-check prompts for one document."""
    document = _ensure_document_access(await _get_document(document_id), _extract_user_id(_user))

    base_text = document.get("punctuated_text") or document.get("original_text") or ""
    translated_text = document.get("translated_text") or ""
    cards = []

    sentences = _split_learning_sentences(base_text)
    translated_chunks = _split_learning_sentences(translated_text)

    for index, sentence in enumerate(sentences[:5]):
        cards.append({
            "id": f"card-{index + 1}",
            "front": sentence,
            "back": translated_chunks[index] if index < len(translated_chunks) else "请结合上下文尝试用白话复述这句话。",
            "hint": "先尝试自己解释，再翻看背面答案。",
        })

    quiz = [
        {
            "id": "quiz-1",
            "question": "这篇内容主要讨论的核心主题是什么？",
            "answer": translated_chunks[0] if translated_chunks else "请结合全文概括主旨。",
        },
        {
            "id": "quiz-2",
            "question": "任选一句原文，用你自己的话解释它。",
            "answer": "建议先尝试复述，再对照白话译。",
        },
    ]

    return {"cards": cards, "quiz": quiz}


@router.get("/{document_id}/study-progress")
async def get_study_progress(document_id: str, _user: dict = Depends(require_auth)):
    """Return aggregated study-card review progress for a document."""
    _ensure_document_access(await _get_document(document_id), _extract_user_id(_user))
    return await _get_study_progress(document_id, _extract_user_id(_user))


@router.post("/{document_id}/study-progress")
async def save_study_progress(document_id: str, body: StudyProgressUpdateRequest, _user: dict = Depends(require_auth)):
    """Persist one study-card review result."""
    _ensure_document_access(await _get_document(document_id), _extract_user_id(_user))
    return await _save_study_session(document_id, _extract_user_id(_user) or "", body)


@router.post("/upload")
@limiter.limit("10/minute")
async def upload_document(request: Request, file: UploadFile = File(...), _user: dict = Depends(require_auth)):
    """
    Upload an image for OCR recognition.
    Supports JPG, PNG, TIFF formats.
    Returns recognized text and confidence score.
    """
    if file.content_type not in ALLOWED_CONTENT_TYPES:
        raise HTTPException(status_code=400, detail="仅支持JPG/PNG/TIFF格式")

    image_bytes = await file.read()
    if len(image_bytes) > MAX_UPLOAD_FILE_SIZE:
        raise HTTPException(status_code=413, detail="图片大小不能超过 5MB")
    ocr_result = await ocr_agent.recognize(image_bytes)

    doc_id = str(uuid.uuid4())
    image_data = _make_image_data_url(file.content_type, image_bytes)

    try:
        await _create_document(
            document_id=doc_id,
            title=file.filename or "untitled",
            original_text=ocr_result["text"],
            confidence=ocr_result["confidence"],
            image_data=image_data,
            owner_user_id=_extract_user_id(_user) or "",
        )
    except Exception as exc:
        logger.warning("Document persistence failed during upload: %s", exc)

    return {
        "document_id": doc_id,
        "text": ocr_result["text"],
        "confidence": ocr_result["confidence"],
        "image_url": image_data,
    }


@router.put("/{document_id}/text")
@limiter.limit("20/minute")
async def update_document_text(request: Request, document_id: str, body: DocumentTextUpdateRequest, _user: dict = Depends(require_auth)):
    """Save the manually corrected OCR text before opening the SSE processing stream."""
    _ensure_document_access(await _get_document(document_id), _extract_user_id(_user))
    updated = await _update_document_text(document_id, body.text.strip())
    if not updated:
        raise HTTPException(status_code=404, detail="文档不存在")
    return {"status": "ok"}


@router.get("/process/{document_id}")
@router.post("/process/{document_id}")
@limiter.limit("10/minute")
async def process_document(request: Request, document_id: str, _user: dict = Depends(require_auth)):
    """
    Process an uploaded document: punctuate and translate ancient text.
    Returns SSE stream with progress events and final result.
    """
    _ensure_document_access(await _get_document(document_id), _extract_user_id(_user))
    return StreamingResponse(
        stream_process(document_id),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "Connection": "keep-alive"},
    )


async def stream_process(document_id: str):
    """
    SSE generator for document processing pipeline.
    Events: progress (status updates), done (final result), error.
    """
    try:
        # Step 0: OCR (already completed during upload — emit for timeline visibility)
        yield sse_reasoning("ocr", "OCR文字识别", "running", model="百度OCR-高精度")

        row = await _get_document(document_id)
        if not row:
            yield _sse_event("error", {"message": "文档不存在"})
            return
        original_text = row["original_text"]

        yield sse_reasoning("ocr", "OCR文字识别", "complete", duration=0.0, model="百度OCR-高精度")

        # Step 1: Punctuate and translate
        yield sse_reasoning("punctuation", "断句标点+白话翻译", "running", model="Kimi-8k")
        yield _sse_event("progress", {"status": "断句标点中..."})
        t0 = time.time()
        result = await translator_agent.punctuate_and_translate(original_text)
        punct_duration = time.time() - t0

        if result.get("used_fallback"):
            # Kimi failed, DeepSeek was used — emit fallback reasoning
            yield sse_reasoning("punctuation", "断句标点+白话翻译", "complete", punct_duration, model="DeepSeek-Chat", fallback=True)
        else:
            yield sse_reasoning("punctuation", "断句标点+白话翻译", "complete", punct_duration, model="Kimi-8k")

        # Step 2: Normalize variant characters
        yield _sse_event("progress", {"status": "归一化异体字..."})

        # Step 3: Extract reading cues for downstream study/recommendation features
        entity_ids = []
        combined_text = f"{original_text} {result['punctuated']} {result['translated']}"
        if combined_text and len(combined_text.strip()) > 10:
            try:
                yield sse_reasoning("entity_extraction", "实体抽取", "running", model="GLM-4-Flash")
                yield _sse_event("progress", {"status": "提取阅读线索..."})
                t0 = time.time()
                entity_ids = entity_extractor.extract_entities(combined_text)
                yield sse_reasoning("entity_extraction", "实体抽取", "complete", time.time() - t0, model="GLM-4-Flash")
                if entity_ids:
                    yield _sse_event("entities", {"entity_ids": entity_ids, "count": len(entity_ids)})
            except Exception as e:
                logger.warning("Entity extraction failed: %s", e)

        try:
            await _update_document_results(
                document_id=document_id,
                punctuated=result["punctuated"],
                translated=result["translated"],
                entity_ids=entity_ids,
            )
        except Exception as exc:
            logger.warning("Failed to persist document processing result: %s", exc)

        yield _sse_event("done", {
            "punctuated": result["punctuated"],
            "translated": result["translated"],
        })

    except Exception as e:
        yield _sse_event("error", {"message": "处理失败，请稍后重试"})


def _sse_event(event_type: str, data: dict) -> str:
    """Format a single SSE event string."""
    return f'event: {event_type}\ndata: {json.dumps(data, ensure_ascii=False)}\n\n'


async def stream_sentence_explanation(document: dict[str, Any], body: SentenceExplainRequest):
    """SSE generator for AI sentence explanation."""
    try:
        sentence = body.sentence.strip()
        context = body.context.strip()
        chapter_title = body.chapter_title.strip()

        if not sentence:
            yield _sse_event("error", {"message": "句子不能为空"})
            return

        yield _sse_event(
            "meta",
            {
                "sentence": sentence,
                "chapter_title": chapter_title,
                "document_title": document.get("title", ""),
            },
        )

        # Step 1: gloss
        yield sse_reasoning("gloss", "逐字解析", "running", model="GLM-4-Flash")
        t0 = time.time()
        gloss_payload = await sentence_explainer.generate_gloss(
            document_title=document.get("title", ""),
            sentence=sentence,
            context=context,
            chapter_title=chapter_title,
        )
        yield sse_reasoning("gloss", "逐字解析", "complete", time.time() - t0, model="GLM-4-Flash")
        yield _sse_event("section", {"section": "gloss", "data": gloss_payload.get("gloss", [])})

        # Step 2: translation
        yield sse_reasoning("translation", "白话翻译", "running", model="Kimi-8k")
        t0 = time.time()
        translation = await sentence_explainer.translate_sentence(sentence)
        translation_duration = time.time() - t0
        yield sse_reasoning("translation", "白话翻译", "complete", translation_duration, model="Kimi-8k")
        yield _sse_event("section", {"section": "translation", "data": translation})

        # Step 3: references
        yield sse_reasoning("reference", "出处参考", "running", model="FAISS + Kimi")
        t0 = time.time()
        references = await sentence_explainer.retrieve_references(
            document_title=document.get("title", ""),
            sentence=sentence,
            context=context,
        )
        yield sse_reasoning("reference", "出处参考", "complete", time.time() - t0, model="FAISS + Kimi")
        yield _sse_event("section", {"section": "references", "data": references})

        # Step 4: rhetoric and follow-up
        yield sse_reasoning("follow_up", "修辞与追问", "running", model="GLM-4-Flash")
        await asyncio.sleep(0.05)
        yield sse_reasoning("follow_up", "修辞与追问", "complete", 0.05, model="GLM-4-Flash")
        yield _sse_event("section", {"section": "rhetoric", "data": gloss_payload.get("rhetoric", "")})
        yield _sse_event("section", {"section": "follow_up", "data": gloss_payload.get("follow_up", "")})

        yield _sse_event("done", {})
    except Exception as exc:
        logger.exception("Sentence explanation failed: %s", exc)
        yield _sse_event("error", {"message": "逐句精讲暂时不可用，请稍后再试"})


@router.post("/explain")
@limiter.limit("30/minute")
async def explain_word_endpoint(request: Request, word: str, context: str = "", _user: dict = Depends(require_auth)):
    """Explain an ancient Chinese word/term with meaning, allusion, and citations."""
    result = await word_explainer.explain_word(word, context)
    return result


@router.post("/{document_id}/sentence-explain")
@limiter.limit("20/minute")
async def explain_sentence_endpoint(
    request: Request,
    document_id: str,
    body: SentenceExplainRequest,
    _user: dict = Depends(require_auth),
):
    """Stream AI sentence explanation in ordered sections."""
    document = _ensure_document_access(await _get_document(document_id), _extract_user_id(_user))
    return StreamingResponse(
        stream_sentence_explanation(document, body),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@router.get("/export/{document_id}")
async def export_document(document_id: str, format: str = "txt", _user: dict = Depends(require_auth)):
    """
    Export a document as PDF or TXT.
    TXT: sections listed sequentially (original, punctuated, translated).
    PDF: uses fpdf2 with CJK font support.
    """
    row = _ensure_document_access(await _get_document(document_id), _extract_user_id(_user))
    if format == "pdf":
        return await _generate_pdf(row)
    return await _generate_txt(row)


async def _generate_txt(row) -> Response:
    """Generate plain text export with all three sections."""
    content = (
        f"原文：\n{row['original_text'] or ''}\n\n"
        f"标点文：\n{row['punctuated_text'] or ''}\n\n"
        f"白话译：\n{row['translated_text'] or ''}\n"
    )
    return Response(
        content=content,
        media_type="text/plain; charset=utf-8",
        headers={
            "Content-Disposition": f'attachment; filename="{row["title"] or "export"}.txt"'
        },
    )


async def _generate_pdf(row) -> Response:
    """Generate PDF export with CJK font support."""
    try:
        import os
        from fpdf import FPDF
        from fpdf.enums import XPos, YPos

        pdf = FPDF()
        pdf.add_page()

        # Try CJK fonts, fallback to built-in
        font_set = False
        try:
            font_paths = [
                "C:/Windows/Fonts/msyh.ttc",  # Windows
                "/usr/share/fonts/truetype/noto/NotoSansCJK-Regular.ttc",  # Linux
            ]
            for fp in font_paths:
                if os.path.exists(fp):
                    pdf.add_font("CJK", "", fp)
                    pdf.set_font("CJK", size=10)
                    font_set = True
                    break
        except Exception:
            pass

        if not font_set:
            pdf.set_font("Helvetica", size=10)

        sections = [
            ("Original Text", row["original_text"] or ""),
            ("Punctuated Text", row["punctuated_text"] or ""),
            ("Translation", row["translated_text"] or ""),
        ]
        for title, text in sections:
            pdf.cell(0, 10, title, new_x=XPos.LMARGIN, new_y=YPos.NEXT)
            pdf.multi_cell(0, 5, text)
            pdf.ln(5)

        pdf_bytes = bytes(pdf.output())
        return Response(
            content=pdf_bytes,
            media_type="application/pdf",
            headers={
                "Content-Disposition": f'attachment; filename="{row["title"] or "export"}.pdf"'
            },
        )
    except ImportError:
        raise HTTPException(500, "PDF导出需要安装fpdf2")
