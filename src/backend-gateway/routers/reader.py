# -*- coding: utf-8 -*-
"""
Reader Router
Reading history tracking, favorite folders, and bookmarks management.
"""
import json
import logging
from typing import Any
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel

from core import pg_database
from core.auth import require_auth
from core.database import get_db

router = APIRouter(prefix="/api/v1/reader", tags=["reader"])
logger = logging.getLogger(__name__)


def get_connection():
    """Local wrapper so tests can patch either this symbol or pg_database.get_connection."""
    return pg_database.get_connection()


def _raise_reader_error(detail: str, exc: Exception) -> None:
    logger.exception("%s: %s", detail, exc)
    raise HTTPException(status_code=500, detail=detail)


# --- Request Models ---

class ProgressUpdate(BaseModel):
    document_id: str
    current_paragraph: int
    total_paragraphs: int


class FolderCreate(BaseModel):
    name: str


class FavoriteAdd(BaseModel):
    document_id: str
    folder_id: str


class WordbookEntryCreate(BaseModel):
    word: str
    meaning: str = ""
    allusion: str = ""
    citations: list[dict[str, Any]] = []


async def _get_study_overview() -> dict[str, Any]:
    """Aggregate study-session progress across all documents."""
    try:
        async with get_connection() as conn:
            summary = await conn.fetchrow(
                """
                SELECT
                    COUNT(*)::int AS sessions_count,
                    COUNT(DISTINCT document_id)::int AS reviewed_documents_count,
                    COALESCE(SUM(completed_cards), 0)::int AS completed_cards,
                    COALESCE(SUM(mastered_cards), 0)::int AS mastered_cards,
                    COALESCE(SUM(review_again_cards), 0)::int AS review_again_cards
                FROM study_sessions
                """
            )
            latest = await conn.fetchrow(
                """
                SELECT s.document_id::text AS document_id, d.title, s.created_at
                FROM study_sessions s
                JOIN documents d ON d.id = s.document_id
                ORDER BY s.created_at DESC
                LIMIT 1
                """
            )
    except RuntimeError:
        async with get_db() as db:
            cursor = await db.execute(
                """
                SELECT
                    COUNT(*) AS sessions_count,
                    COUNT(DISTINCT document_id) AS reviewed_documents_count,
                    COALESCE(SUM(completed_cards), 0) AS completed_cards,
                    COALESCE(SUM(mastered_cards), 0) AS mastered_cards,
                    COALESCE(SUM(review_again_cards), 0) AS review_again_cards
                FROM study_sessions
                """
            )
            summary = await cursor.fetchone()
            cursor = await db.execute(
                """
                SELECT s.document_id, d.title, s.created_at
                FROM study_sessions s
                JOIN documents d ON d.id = s.document_id
                ORDER BY s.created_at DESC
                LIMIT 1
                """
            )
            latest = await cursor.fetchone()

    summary_dict = dict(summary) if summary else {}
    completed = int(summary_dict.get("completed_cards") or 0)
    mastered = int(summary_dict.get("mastered_cards") or 0)
    mastery_rate = round(mastered / max(completed, 1), 2) if completed else 0.0

    return {
        "sessions_count": int(summary_dict.get("sessions_count") or 0),
        "reviewed_documents_count": int(summary_dict.get("reviewed_documents_count") or 0),
        "completed_cards": completed,
        "mastered_cards": mastered,
        "review_again_cards": int(summary_dict.get("review_again_cards") or 0),
        "mastery_rate": mastery_rate,
        "last_reviewed_document": dict(latest) if latest else None,
    }


async def _list_wordbook_entries(limit: int | None = None) -> list[dict[str, Any]]:
    """Return wordbook entries ordered by recency."""
    try:
        async with get_connection() as conn:
            sql = """
                SELECT id::text AS id, word, meaning, allusion, citations_json, created_at
                FROM wordbook_entries
                ORDER BY created_at DESC
            """
            rows = await conn.fetch(f"{sql} LIMIT $1" if limit is not None else sql, limit) if limit is not None else await conn.fetch(sql)
            entries = [dict(row) for row in rows]
    except RuntimeError:
        async with get_db() as db:
            sql = """
                SELECT id, word, meaning, allusion, citations_json, created_at
                FROM wordbook_entries
                ORDER BY created_at DESC
            """
            cursor = await db.execute(f"{sql} LIMIT ?" if limit is not None else sql, (limit,) if limit is not None else ())
            entries = [dict(row) for row in await cursor.fetchall()]

    for entry in entries:
        try:
            entry["citations"] = json.loads(entry.pop("citations_json") or "[]")
        except json.JSONDecodeError:
            entry["citations"] = []
    return entries


async def _save_wordbook_entry(body: WordbookEntryCreate) -> dict[str, Any]:
    citations_json = json.dumps(body.citations, ensure_ascii=False)
    try:
        async with get_connection() as conn:
            row = await conn.fetchrow(
                """
                INSERT INTO wordbook_entries (word, meaning, allusion, citations_json)
                VALUES ($1, $2, $3, $4::jsonb)
                ON CONFLICT (word)
                DO UPDATE SET
                    meaning = EXCLUDED.meaning,
                    allusion = EXCLUDED.allusion,
                    citations_json = EXCLUDED.citations_json
                RETURNING id::text AS id, word, meaning, allusion, citations_json, created_at
                """,
                body.word.strip(),
                body.meaning.strip(),
                body.allusion.strip(),
                citations_json,
            )
            entry = dict(row)
    except RuntimeError:
        async with get_db() as db:
            await db.execute(
                """
                INSERT INTO wordbook_entries (word, meaning, allusion, citations_json)
                VALUES (?, ?, ?, ?)
                ON CONFLICT(word) DO UPDATE SET
                    meaning = excluded.meaning,
                    allusion = excluded.allusion,
                    citations_json = excluded.citations_json
                """,
                (body.word.strip(), body.meaning.strip(), body.allusion.strip(), citations_json),
            )
            await db.commit()
        entries = await _list_wordbook_entries()
        entry = next((item for item in entries if item["word"] == body.word.strip()), {
            "id": "",
            "word": body.word.strip(),
            "meaning": body.meaning.strip(),
            "allusion": body.allusion.strip(),
            "citations": body.citations,
            "created_at": None,
        })

    try:
        entry["citations"] = json.loads(entry.pop("citations_json") or "[]")
    except (KeyError, json.JSONDecodeError):
        entry.setdefault("citations", body.citations)
    return entry


async def _delete_wordbook_entry(entry_id: str) -> bool:
    try:
        async with get_connection() as conn:
            result = await conn.execute(
                "DELETE FROM wordbook_entries WHERE id = $1::uuid",
                entry_id,
            )
            return result != "DELETE 0"
    except RuntimeError:
        async with get_db() as db:
            cursor = await db.execute(
                "DELETE FROM wordbook_entries WHERE id = ?",
                (entry_id,),
            )
            await db.commit()
            return cursor.rowcount > 0


# --- Reading History ---

@router.get("/history")
async def get_reading_history():
    """Get reading history sorted by last read time."""
    try:
        if pg_database.pool:
            async with get_connection() as conn:
                rows = await conn.fetch("""
                    SELECT d.id, d.title, h.current_paragraph, h.total_paragraphs, h.last_read_at
                    FROM reading_history h
                    JOIN documents d ON h.document_id = d.id
                    ORDER BY h.last_read_at DESC
                """)
                return [dict(row) for row in rows]

        async with get_db() as db:
            cursor = await db.execute("""
                SELECT d.id, d.title, h.current_paragraph, h.total_paragraphs, h.last_read_at
                FROM reading_history h
                JOIN documents d ON h.document_id = d.id
                ORDER BY h.last_read_at DESC
            """)
            rows = await cursor.fetchall()
            return [dict(row) for row in rows]
    except Exception as exc:
        _raise_reader_error("读取阅读记录失败", exc)


@router.post("/progress")
async def update_progress(body: ProgressUpdate, _user: dict = Depends(require_auth)):
    """Update reading progress for a document (upsert)."""
    try:
        if pg_database.pool:
            async with get_connection() as conn:
                result = await conn.execute("""
                    UPDATE reading_history
                    SET current_paragraph = $2, total_paragraphs = $3, last_read_at = NOW()
                    WHERE document_id = $1::uuid
                """, body.document_id, body.current_paragraph, body.total_paragraphs)
                if result == "UPDATE 0":
                    await conn.execute("""
                        INSERT INTO reading_history (document_id, current_paragraph, total_paragraphs)
                        VALUES ($1::uuid, $2, $3)
                    """, body.document_id, body.current_paragraph, body.total_paragraphs)
        else:
            async with get_db() as db:
                await db.execute("""
                    INSERT INTO reading_history (document_id, current_paragraph, total_paragraphs, last_read_at)
                    VALUES (?, ?, ?, CURRENT_TIMESTAMP)
                    ON CONFLICT(document_id) DO UPDATE SET
                        current_paragraph = excluded.current_paragraph,
                        total_paragraphs = excluded.total_paragraphs,
                        last_read_at = CURRENT_TIMESTAMP
                """, (body.document_id, body.current_paragraph, body.total_paragraphs))
                await db.commit()
        return {"status": "ok"}
    except Exception as e:
        _raise_reader_error("保存阅读进度失败", e)


# --- Favorite Folders ---

@router.get("/folders")
async def get_folders():
    """Get all favorite folders."""
    try:
        if pg_database.pool:
            async with get_connection() as conn:
                rows = await conn.fetch(
                    "SELECT id, name, created_at FROM favorite_folders ORDER BY created_at DESC"
                )
                return [dict(row) for row in rows]

        async with get_db() as db:
            cursor = await db.execute(
                "SELECT id, name, created_at FROM favorite_folders ORDER BY created_at DESC"
            )
            rows = await cursor.fetchall()
            return [dict(row) for row in rows]
    except Exception as exc:
        _raise_reader_error("读取收藏夹失败", exc)


@router.post("/folders")
async def create_folder(body: FolderCreate, _user: dict = Depends(require_auth)):
    """Create a new favorite folder."""
    try:
        if pg_database.pool:
            async with get_connection() as conn:
                row = await conn.fetchrow(
                    "INSERT INTO favorite_folders (name) VALUES ($1) RETURNING id", body.name
                )
                return {"folder_id": str(row["id"]), "name": body.name}

        folder_id = str(uuid4())
        async with get_db() as db:
            await db.execute(
                "INSERT INTO favorite_folders (id, name) VALUES (?, ?)",
                (folder_id, body.name),
            )
            await db.commit()
        return {"folder_id": folder_id, "name": body.name}
    except Exception as e:
        raise HTTPException(500, f"Failed to create folder: {str(e)}")


# --- Favorites ---

@router.get("/entity-frequency")
async def get_entity_frequency():
    """Aggregate entity frequency from reading history documents."""
    try:
        try:
            async with get_connection() as conn:
                rows = await conn.fetch("""
                    SELECT entity_id, COUNT(*) as freq
                    FROM reading_history h
                    JOIN documents d ON h.document_id = d.id,
                         jsonb_array_elements_text(d.entity_ids) AS entity_id
                    WHERE d.entity_ids IS NOT NULL
                      AND d.entity_ids != '[]'::jsonb
                    GROUP BY entity_id
                    ORDER BY freq DESC
                """)
                total = await conn.fetchval("""
                    SELECT COUNT(DISTINCT h.document_id)
                    FROM reading_history h
                    JOIN documents d ON h.document_id = d.id
                    WHERE d.entity_ids IS NOT NULL
                      AND d.entity_ids != '[]'::jsonb
                """)
            return {
                "frequencies": [{"entity_id": row["entity_id"], "count": row["freq"]} for row in rows],
                "total_documents": total or 0,
            }
        except RuntimeError:
            pass

        async with get_db() as db:
            cursor = await db.execute("""
                SELECT DISTINCT h.document_id, d.entity_ids
                FROM reading_history h
                JOIN documents d ON h.document_id = d.id
                WHERE d.entity_ids IS NOT NULL AND d.entity_ids != '' AND d.entity_ids != '[]'
            """)
            rows = await cursor.fetchall()

        frequency_map: dict[str, int] = {}
        for row in rows:
            try:
                entity_ids = json.loads(row["entity_ids"] or "[]")
            except json.JSONDecodeError:
                entity_ids = []
            for entity_id in entity_ids:
                frequency_map[entity_id] = frequency_map.get(entity_id, 0) + 1

        frequencies = sorted(
            (
                {"entity_id": entity_id, "count": count}
                for entity_id, count in frequency_map.items()
            ),
            key=lambda item: item["count"],
            reverse=True,
        )
        return {"frequencies": frequencies, "total_documents": len(rows)}
    except Exception as exc:
        _raise_reader_error("读取实体频率失败", exc)


@router.get("/wordbook")
async def get_wordbook(limit: int = Query(100, ge=1, le=500)):
    """Return saved vocabulary entries for the wordbook view."""
    entries = await _list_wordbook_entries(limit=limit)
    return {"entries": entries, "total": len(entries)}


@router.get("/study-overview")
async def get_study_overview():
    """Return aggregate study progress for the dashboard."""
    return await _get_study_overview()


@router.post("/wordbook")
async def add_wordbook_entry(body: WordbookEntryCreate, _user: dict = Depends(require_auth)):
    """Create or update a wordbook entry."""
    if not body.word.strip():
        raise HTTPException(status_code=400, detail="字词不能为空")
    return await _save_wordbook_entry(body)


@router.delete("/wordbook/{entry_id}")
async def delete_wordbook_entry(entry_id: str, _user: dict = Depends(require_auth)):
    """Delete a wordbook entry by id."""
    deleted = await _delete_wordbook_entry(entry_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="生词不存在")
    return {"status": "ok"}


@router.post("/favorites")
async def add_favorite(body: FavoriteAdd, _user: dict = Depends(require_auth)):
    """Add a document to a favorite folder."""
    try:
        if pg_database.pool:
            async with get_connection() as conn:
                await conn.execute(
                    "INSERT INTO favorites (document_id, folder_id) VALUES ($1::uuid, $2::uuid) ON CONFLICT DO NOTHING",
                    body.document_id, body.folder_id,
                )
        else:
            async with get_db() as db:
                await db.execute(
                    "INSERT OR IGNORE INTO favorites (document_id, folder_id) VALUES (?, ?)",
                    (body.document_id, body.folder_id),
                )
                await db.commit()
        return {"status": "ok"}
    except Exception as e:
        _raise_reader_error("加入收藏失败", e)


@router.get("/favorites/{folder_id}")
async def get_favorites(folder_id: str):
    """Get all documents in a favorite folder."""
    try:
        if pg_database.pool:
            async with get_connection() as conn:
                rows = await conn.fetch("""
                    SELECT d.id, d.title, f.created_at
                    FROM favorites f
                    JOIN documents d ON f.document_id = d.id
                    WHERE f.folder_id = $1::uuid
                    ORDER BY f.created_at DESC
                """, folder_id)
                return [dict(row) for row in rows]

        async with get_db() as db:
            cursor = await db.execute("""
                SELECT d.id, d.title, f.created_at
                FROM favorites f
                JOIN documents d ON f.document_id = d.id
                WHERE f.folder_id = ?
                ORDER BY f.created_at DESC
            """, (folder_id,))
            rows = await cursor.fetchall()
            return [dict(row) for row in rows]
    except Exception as exc:
        _raise_reader_error("读取收藏内容失败", exc)
