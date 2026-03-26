# -*- coding: utf-8 -*-
"""
Reader Router
Reading history tracking, favorite folders, and bookmarks management.
"""
import json
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from core import pg_database
from core.auth import require_auth
from core.database import get_db

router = APIRouter(prefix="/api/v1/reader", tags=["reader"])


def get_connection():
    """Local wrapper so tests can patch either this symbol or pg_database.get_connection."""
    return pg_database.get_connection()


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
    except Exception:
        return []


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
        return {"status": "error", "message": str(e)}


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
    except Exception:
        return []


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
    except Exception:
        return {"frequencies": [], "total_documents": 0}


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
        return {"status": "error", "message": str(e)}


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
    except Exception:
        return []
