# -*- coding: utf-8 -*-
"""
Reader Router
Reading history tracking, favorite folders, and bookmarks management.
"""
from fastapi import APIRouter, HTTPException, Query, Depends
from pydantic import BaseModel
from core.pg_database import get_connection
from core.auth import require_auth

router = APIRouter(prefix="/api/v1/reader", tags=["reader"])


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
        async with get_connection() as conn:
            rows = await conn.fetch("""
                SELECT d.id, d.title, h.current_paragraph, h.total_paragraphs, h.last_read_at
                FROM reading_history h
                JOIN documents d ON h.document_id = d.id
                ORDER BY h.last_read_at DESC
            """)
            return [dict(row) for row in rows]
    except Exception:
        return []


@router.post("/progress")
async def update_progress(body: ProgressUpdate, _user: dict = Depends(require_auth)):
    """Update reading progress for a document (upsert)."""
    try:
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
        return {"status": "ok"}
    except Exception as e:
        return {"status": "error", "message": str(e)}


# --- Favorite Folders ---

@router.get("/folders")
async def get_folders():
    """Get all favorite folders."""
    try:
        async with get_connection() as conn:
            rows = await conn.fetch(
                "SELECT id, name, created_at FROM favorite_folders ORDER BY created_at DESC"
            )
            return [dict(row) for row in rows]
    except Exception:
        return []


@router.post("/folders")
async def create_folder(body: FolderCreate, _user: dict = Depends(require_auth)):
    """Create a new favorite folder."""
    try:
        async with get_connection() as conn:
            row = await conn.fetchrow(
                "INSERT INTO favorite_folders (name) VALUES ($1) RETURNING id", body.name
            )
            return {"folder_id": str(row["id"]), "name": body.name}
    except Exception as e:
        raise HTTPException(500, f"Failed to create folder: {str(e)}")


# --- Favorites ---

@router.get("/entity-frequency")
async def get_entity_frequency():
    """Aggregate entity frequency from reading history documents."""
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
    except Exception:
        return {"frequencies": [], "total_documents": 0}


@router.post("/favorites")
async def add_favorite(body: FavoriteAdd, _user: dict = Depends(require_auth)):
    """Add a document to a favorite folder."""
    try:
        async with get_connection() as conn:
            await conn.execute(
                "INSERT INTO favorites (document_id, folder_id) VALUES ($1::uuid, $2::uuid) ON CONFLICT DO NOTHING",
                body.document_id, body.folder_id,
            )
        return {"status": "ok"}
    except Exception as e:
        return {"status": "error", "message": str(e)}


@router.get("/favorites/{folder_id}")
async def get_favorites(folder_id: str):
    """Get all documents in a favorite folder."""
    try:
        async with get_connection() as conn:
            rows = await conn.fetch("""
                SELECT d.id, d.title, f.created_at
                FROM favorites f
                JOIN documents d ON f.document_id = d.id
                WHERE f.folder_id = $1::uuid
                ORDER BY f.created_at DESC
            """, folder_id)
            return [dict(row) for row in rows]
    except Exception:
        return []
