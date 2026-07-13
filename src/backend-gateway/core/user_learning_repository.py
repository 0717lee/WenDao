from __future__ import annotations

import logging
from typing import Any

from core.database import get_db
from core.pg_database import (
    get_connection,
    is_sqlite_fallback_allowed,
    prevent_sqlite_fallback_in_production,
)

logger = logging.getLogger(__name__)


def empty_document_note(document_id: str) -> dict[str, Any]:
    return {"document_id": document_id, "note_text": "", "updated_at": None}


def empty_study_progress(document_id: str) -> dict[str, Any]:
    return {
        "document_id": document_id,
        "sessions_count": 0,
        "completed_cards": 0,
        "mastered_cards": 0,
        "review_again_cards": 0,
        "mastery_rate": 0.0,
        "last_reviewed_at": None,
    }


async def get_document_note(document_id: str, user_id: str | None) -> dict[str, Any]:
    if not user_id:
        return empty_document_note(document_id)

    try:
        async with get_connection() as conn:
            row = await conn.fetchrow(
                """
                SELECT document_id::text AS document_id, note_text, updated_at
                FROM user_document_notes
                WHERE user_id = $1::uuid AND document_id = $2::uuid
                """,
                user_id,
                document_id,
            )
            if row:
                return dict(row)
            if not is_sqlite_fallback_allowed():
                return empty_document_note(document_id)
    except Exception as exc:
        prevent_sqlite_fallback_in_production()
        logger.warning("PostgreSQL 文档笔记读取失败，降级到 SQLite: %s", exc)

    async with get_db() as db:
        cursor = await db.execute(
            """
            SELECT document_id, note_text, updated_at
            FROM user_document_notes
            WHERE user_id = ? AND document_id = ?
            """,
            (user_id, document_id),
        )
        row = await cursor.fetchone()
        return dict(row) if row else empty_document_note(document_id)


async def save_document_note(document_id: str, user_id: str, note_text: str) -> dict[str, Any]:
    try:
        async with get_connection() as conn:
            row = await conn.fetchrow(
                """
                INSERT INTO user_document_notes (user_id, document_id, note_text, updated_at)
                VALUES ($1::uuid, $2::uuid, $3, NOW())
                ON CONFLICT (user_id, document_id)
                DO UPDATE SET note_text = EXCLUDED.note_text, updated_at = NOW()
                RETURNING document_id::text AS document_id, note_text, updated_at
                """,
                user_id,
                document_id,
                note_text,
            )
            return dict(row)
    except Exception as exc:
        prevent_sqlite_fallback_in_production()
        logger.warning("PostgreSQL 文档笔记保存失败，降级到 SQLite: %s", exc)

    async with get_db() as db:
        await db.execute(
            """
            INSERT INTO user_document_notes (user_id, document_id, note_text, updated_at)
            VALUES (?, ?, ?, CURRENT_TIMESTAMP)
            ON CONFLICT(user_id, document_id) DO UPDATE SET
                note_text = excluded.note_text,
                updated_at = CURRENT_TIMESTAMP
            """,
            (user_id, document_id, note_text),
        )
        await db.commit()
    return await get_document_note(document_id, user_id)


async def save_study_session(
    document_id: str,
    user_id: str,
    completed_cards: int,
    total_cards: int,
    mastered_cards: int,
    review_again_cards: int,
) -> dict[str, Any]:
    payload = (
        completed_cards,
        total_cards,
        mastered_cards,
        review_again_cards,
    )
    try:
        async with get_connection() as conn:
            row = await conn.fetchrow(
                """
                INSERT INTO user_study_sessions (
                    user_id, document_id, completed_cards, total_cards, mastered_cards, review_again_cards
                ) VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6)
                RETURNING
                    document_id::text AS document_id,
                    completed_cards,
                    total_cards,
                    mastered_cards,
                    review_again_cards,
                    created_at
                """,
                user_id,
                document_id,
                *payload,
            )
            return dict(row)
    except Exception as exc:
        prevent_sqlite_fallback_in_production()
        logger.warning("PostgreSQL 学习记录保存失败，降级到 SQLite: %s", exc)

    async with get_db() as db:
        await db.execute(
            """
            INSERT INTO user_study_sessions (
                user_id, document_id, completed_cards, total_cards, mastered_cards, review_again_cards
            ) VALUES (?, ?, ?, ?, ?, ?)
            """,
            (user_id, document_id, *payload),
        )
        await db.commit()
    return await get_study_progress(document_id, user_id)


async def _get_study_progress_sqlite(document_id: str, user_id: str) -> dict[str, Any]:
    async with get_db() as db:
        cursor = await db.execute(
            """
            SELECT
                COUNT(*) AS sessions_count,
                COALESCE(SUM(completed_cards), 0) AS completed_cards,
                COALESCE(SUM(mastered_cards), 0) AS mastered_cards,
                COALESCE(SUM(review_again_cards), 0) AS review_again_cards,
                MAX(created_at) AS last_reviewed_at
            FROM user_study_sessions
            WHERE user_id = ? AND document_id = ?
            """,
            (user_id, document_id),
        )
        row = await cursor.fetchone()
        return dict(row) if row else {}


async def get_study_progress(document_id: str, user_id: str | None) -> dict[str, Any]:
    if not user_id:
        return empty_study_progress(document_id)

    try:
        async with get_connection() as conn:
            row = await conn.fetchrow(
                """
                SELECT
                    COUNT(*)::int AS sessions_count,
                    COALESCE(SUM(completed_cards), 0)::int AS completed_cards,
                    COALESCE(SUM(mastered_cards), 0)::int AS mastered_cards,
                    COALESCE(SUM(review_again_cards), 0)::int AS review_again_cards,
                    MAX(created_at) AS last_reviewed_at
                FROM user_study_sessions
                WHERE user_id = $1::uuid AND document_id = $2::uuid
                """,
                user_id,
                document_id,
            )
            data = dict(row) if row else {}
    except Exception as exc:
        prevent_sqlite_fallback_in_production()
        logger.warning("PostgreSQL 学习进度读取失败，降级到 SQLite: %s", exc)
        data = {}

    if int(data.get("sessions_count") or 0) == 0 and is_sqlite_fallback_allowed():
        sqlite_data = await _get_study_progress_sqlite(document_id, user_id)
        if int(sqlite_data.get("sessions_count") or 0) > 0 or not data:
            data = sqlite_data

    sessions = int(data.get("sessions_count") or 0)
    completed = int(data.get("completed_cards") or 0)
    mastered = int(data.get("mastered_cards") or 0)
    review_again = int(data.get("review_again_cards") or 0)
    accuracy = round(mastered / max(completed, 1), 2) if completed else 0.0
    return {
        "document_id": document_id,
        "sessions_count": sessions,
        "completed_cards": completed,
        "mastered_cards": mastered,
        "review_again_cards": review_again,
        "mastery_rate": accuracy,
        "last_reviewed_at": data.get("last_reviewed_at"),
    }
