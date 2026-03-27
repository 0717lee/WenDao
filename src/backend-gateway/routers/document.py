# -*- coding: utf-8 -*-
"""
Document Processing Router
Upload images for OCR recognition, process ancient text (punctuation + translation),
export documents (PDF/TXT), and explain ancient words.
"""
import base64
import json
import logging
import time
import uuid
from typing import Any

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile
from fastapi.responses import Response, StreamingResponse
from pydantic import BaseModel, Field

from agents.ocr import OCRAgent
from agents.translator import TranslatorAgent
from agents.word_explainer import WordExplainerAgent
from core import pg_database
from core.auth import require_auth
from core.database import get_db
from core.entity_extractor import EntityExtractor
from core.lazy_proxy import LazyProxy

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/documents", tags=["documents"])


def _create_ocr_agent() -> OCRAgent:
    return OCRAgent()


def _create_translator_agent() -> TranslatorAgent:
    return TranslatorAgent()


def _create_word_explainer() -> WordExplainerAgent:
    return WordExplainerAgent()


def _create_entity_extractor() -> EntityExtractor:
    return EntityExtractor()


ocr_agent = LazyProxy(_create_ocr_agent)
translator_agent = LazyProxy(_create_translator_agent)
word_explainer = LazyProxy(_create_word_explainer)
entity_extractor = LazyProxy(_create_entity_extractor)


def get_connection():
    """Local wrapper so tests can patch either this symbol or pg_database.get_connection."""
    return pg_database.get_connection()

ALLOWED_CONTENT_TYPES = {"image/jpeg", "image/png", "image/tiff"}


class DocumentTextUpdateRequest(BaseModel):
    """Update manually corrected OCR text before further processing."""
    text: str = Field(..., min_length=1, max_length=50000)


class DocumentNoteUpdateRequest(BaseModel):
    """Upsert a note attached to the current document."""
    note_text: str = Field(default="", max_length=10000)


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
) -> None:
    """Persist uploaded document to PostgreSQL or SQLite."""
    try:
        async with get_connection() as conn:
            await conn.execute(
                "INSERT INTO documents (id, title, original_text, ocr_confidence, image_data, status) "
                "VALUES ($1::uuid, $2, $3, $4, $5, 'ocr_complete')",
                document_id,
                title,
                original_text,
                confidence,
                image_data,
            )
        return
    except RuntimeError:
        pass

    async with get_db() as db:
        await db.execute(
            """
            INSERT INTO documents (id, title, original_text, ocr_confidence, image_data, status)
            VALUES (?, ?, ?, ?, ?, 'ocr_complete')
            """,
            (document_id, title, original_text, confidence, image_data),
        )
        await db.commit()


async def _get_document(document_id: str) -> dict | None:
    """Fetch a normalized document row from PostgreSQL or SQLite."""
    try:
        async with get_connection() as conn:
            row = await conn.fetchrow(
                """
                SELECT id, title, original_text, punctuated_text, translated_text, ocr_confidence,
                       image_data, entity_ids, status, created_at, updated_at
                FROM documents
                WHERE id = $1::uuid
                """,
                document_id,
            )
            return dict(row) if row else None
    except RuntimeError:
        pass

    async with get_db() as db:
        cursor = await db.execute(
            """
            SELECT id, title, original_text, punctuated_text, translated_text, ocr_confidence,
                   image_data, entity_ids, status, created_at, updated_at
            FROM documents
            WHERE id = ?
            """,
            (document_id,),
        )
        row = await cursor.fetchone()
        return dict(row) if row else None


async def _list_documents(limit: int = 50) -> list[dict[str, Any]]:
    """Return bookshelf-ready document metadata ordered by most recently updated."""
    try:
        async with get_connection() as conn:
            rows = await conn.fetch(
                """
                SELECT
                    d.id::text AS id,
                    d.title,
                    d.status,
                    d.created_at,
                    d.updated_at,
                    LEFT(COALESCE(NULLIF(d.translated_text, ''), NULLIF(d.punctuated_text, ''), d.original_text), 140) AS preview,
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
                    FROM reading_history
                    WHERE document_id = d.id
                    ORDER BY last_read_at DESC
                    LIMIT 1
                ) h ON TRUE
                LEFT JOIN document_notes n ON n.document_id = d.id
                ORDER BY COALESCE(d.updated_at, d.created_at) DESC
                LIMIT $1
                """,
                limit,
            )
            return [dict(row) for row in rows]
    except RuntimeError:
        pass

    async with get_db() as db:
        cursor = await db.execute(
            """
            SELECT
                d.id,
                d.title,
                d.status,
                d.created_at,
                d.updated_at,
                SUBSTR(COALESCE(NULLIF(d.translated_text, ''), NULLIF(d.punctuated_text, ''), d.original_text), 1, 140) AS preview,
                COALESCE((
                    SELECT current_paragraph
                    FROM reading_history h
                    WHERE h.document_id = d.id
                    ORDER BY h.last_read_at DESC
                    LIMIT 1
                ), 0) AS current_paragraph,
                COALESCE((
                    SELECT total_paragraphs
                    FROM reading_history h
                    WHERE h.document_id = d.id
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
            LEFT JOIN document_notes n ON n.document_id = d.id
            ORDER BY COALESCE(d.updated_at, d.created_at) DESC
            LIMIT ?
            """,
            (limit,),
        )
        rows = await cursor.fetchall()
        return [dict(row) for row in rows]


async def _get_document_note(document_id: str) -> dict[str, Any]:
    """Fetch saved note content for one document."""
    try:
        async with get_connection() as conn:
            row = await conn.fetchrow(
                """
                SELECT document_id::text AS document_id, note_text, updated_at
                FROM document_notes
                WHERE document_id = $1::uuid
                """,
                document_id,
            )
            if row:
                return dict(row)
            return {"document_id": document_id, "note_text": "", "updated_at": None}
    except RuntimeError:
        pass

    async with get_db() as db:
        cursor = await db.execute(
            """
            SELECT document_id, note_text, updated_at
            FROM document_notes
            WHERE document_id = ?
            """,
            (document_id,),
        )
        row = await cursor.fetchone()
        return dict(row) if row else {"document_id": document_id, "note_text": "", "updated_at": None}


async def _save_document_note(document_id: str, note_text: str) -> dict[str, Any]:
    """Create or update a note attached to a document."""
    try:
        async with get_connection() as conn:
            row = await conn.fetchrow(
                """
                INSERT INTO document_notes (document_id, note_text, updated_at)
                VALUES ($1::uuid, $2, NOW())
                ON CONFLICT (document_id)
                DO UPDATE SET note_text = EXCLUDED.note_text, updated_at = NOW()
                RETURNING document_id::text AS document_id, note_text, updated_at
                """,
                document_id,
                note_text,
            )
            return dict(row)
    except RuntimeError:
        pass

    async with get_db() as db:
        await db.execute(
            """
            INSERT INTO document_notes (document_id, note_text, updated_at)
            VALUES (?, ?, CURRENT_TIMESTAMP)
            ON CONFLICT(document_id) DO UPDATE SET
                note_text = excluded.note_text,
                updated_at = CURRENT_TIMESTAMP
            """,
            (document_id, note_text),
        )
        await db.commit()
    return await _get_document_note(document_id)


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
async def list_documents(limit: int = Query(50, ge=1, le=200)):
    """List documents for the bookshelf/home views."""
    documents = await _list_documents(limit=limit)
    return {"documents": documents, "total": len(documents)}


@router.get("/{document_id}")
async def get_document(document_id: str):
    """Return one document with full text content for reader/book shelf navigation."""
    row = await _get_document(document_id)
    if not row:
        raise HTTPException(status_code=404, detail="文档不存在")
    return row


@router.get("/{document_id}/note")
async def get_document_note(document_id: str):
    """Fetch the saved note for one document."""
    return await _get_document_note(document_id)


@router.put("/{document_id}/note")
async def save_document_note(document_id: str, body: DocumentNoteUpdateRequest, _user: dict = Depends(require_auth)):
    """Create or update a reader note for one document."""
    document = await _get_document(document_id)
    if not document:
        raise HTTPException(status_code=404, detail="文档不存在")
    return await _save_document_note(document_id, body.note_text.strip())


@router.get("/{document_id}/study-cards")
async def get_study_cards(document_id: str):
    """Generate lightweight study cards and self-check prompts for one document."""
    document = await _get_document(document_id)
    if not document:
        raise HTTPException(status_code=404, detail="文档不存在")

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


@router.post("/upload")
async def upload_document(file: UploadFile = File(...)):
    """
    Upload an image for OCR recognition.
    Supports JPG, PNG, TIFF formats.
    Returns recognized text and confidence score.
    """
    if file.content_type not in ALLOWED_CONTENT_TYPES:
        raise HTTPException(status_code=400, detail="仅支持JPG/PNG/TIFF格式")

    image_bytes = await file.read()
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
async def update_document_text(document_id: str, body: DocumentTextUpdateRequest):
    """Save the manually corrected OCR text before opening the SSE processing stream."""
    updated = await _update_document_text(document_id, body.text.strip())
    if not updated:
        raise HTTPException(status_code=404, detail="文档不存在")
    return {"status": "ok"}


@router.get("/process/{document_id}")
@router.post("/process/{document_id}")
async def process_document(document_id: str):
    """
    Process an uploaded document: punctuate and translate ancient text.
    Returns SSE stream with progress events and final result.
    """
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

        # Step 3: Extract entities and link to knowledge graph
        entity_ids = []
        combined_text = f"{original_text} {result['punctuated']} {result['translated']}"
        if combined_text and len(combined_text.strip()) > 10:
            try:
                yield sse_reasoning("entity_extraction", "实体抽取", "running", model="GLM-4-Flash")
                yield _sse_event("progress", {"status": "关联知识图谱实体..."})
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
        yield _sse_event("error", {"message": f"处理失败: {str(e)}"})


def _sse_event(event_type: str, data: dict) -> str:
    """Format a single SSE event string."""
    return f'event: {event_type}\ndata: {json.dumps(data, ensure_ascii=False)}\n\n'


@router.post("/explain")
async def explain_word_endpoint(word: str, context: str = ""):
    """Explain an ancient Chinese word/term with meaning, allusion, and citations."""
    result = await word_explainer.explain_word(word, context)
    return result


@router.get("/export/{document_id}")
async def export_document(document_id: str, format: str = "txt"):
    """
    Export a document as PDF or TXT.
    TXT: sections listed sequentially (original, punctuated, translated).
    PDF: uses fpdf2 with CJK font support.
    """
    row = await _get_document(document_id)
    if not row:
        raise HTTPException(404, "文档不存在")
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
