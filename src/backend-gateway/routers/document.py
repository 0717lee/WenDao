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

from fastapi import APIRouter, File, HTTPException, UploadFile
from fastapi.responses import Response, StreamingResponse
from pydantic import BaseModel, Field

from agents.ocr import OCRAgent
from agents.translator import TranslatorAgent
from agents.word_explainer import WordExplainerAgent
from core import pg_database
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
                       image_data, entity_ids
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
                   image_data, entity_ids
            FROM documents
            WHERE id = ?
            """,
            (document_id,),
        )
        row = await cursor.fetchone()
        return dict(row) if row else None


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
