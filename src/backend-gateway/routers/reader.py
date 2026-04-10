# -*- coding: utf-8 -*-
"""
Reader Router
Reading history tracking, favorite folders, and bookmarks management.
"""
import json
import logging
import sqlite3
from datetime import datetime, timedelta
from typing import Any
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel

from core import pg_database
from core.auth import maybe_auth, require_auth
from core.database import get_db

router = APIRouter(prefix="/api/v1/reader", tags=["reader"])
logger = logging.getLogger(__name__)


def get_connection():
    """Local wrapper so tests can patch either this symbol or pg_database.get_connection."""
    return pg_database.get_connection()


def _raise_reader_error(detail: str, exc: Exception) -> None:
    logger.exception("%s: %s", detail, exc)
    raise HTTPException(status_code=500, detail=detail)


def _empty_entity_frequency() -> dict[str, Any]:
    """Return a stable empty payload for non-critical analytics endpoints."""
    return {"frequencies": [], "total_documents": 0}


def _empty_study_overview() -> dict[str, Any]:
    return {
        "sessions_count": 0,
        "reviewed_documents_count": 0,
        "completed_cards": 0,
        "mastered_cards": 0,
        "review_again_cards": 0,
        "mastery_rate": 0.0,
        "last_reviewed_document": None,
    }


def _empty_learning_focus() -> dict[str, Any]:
    return {
        "streak_days": 0,
        "review_queue_count": 0,
        "today_review": {
            "title": "从一篇经典开始",
            "description": "先打开一篇古籍，后续这里会自动形成你的复习重点。",
            "action_label": "开始阅读",
            "action_type": "reader",
            "document_id": None,
            "query": "",
        },
        "reading_paths": [
            {
                "id": "path-classroom",
                "title": "课内古文快读",
                "description": "从熟悉篇目切入，先看原句，再补白话和背景。",
                "action_type": "search",
                "query": "学而时习之",
                "badge": "入门",
            },
            {
                "id": "path-classics",
                "title": "经典入门路径",
                "description": "先读《论语》《孟子》《道德经》这些最常见的入口。",
                "action_type": "search",
                "query": "《论语·学而》有哪些值得先读的片段",
                "badge": "经典",
            },
            {
                "id": "path-allusions",
                "title": "人物典故路线",
                "description": "按人物和典故追索古籍，更容易形成整体印象。",
                "action_type": "chat",
                "prompt": "请用白话串讲孔子、孟子和庄子各自最适合初学者入门的典故。",
                "badge": "串讲",
            },
        ],
        "co_reading_prompts": [
            {
                "id": "co-read-1",
                "title": "一句原文开读",
                "description": "从一句最熟的原文切进去，再反推整段在讲什么。",
                "action_type": "chat",
                "prompt": "请从“学而时习之，不亦说乎”开始，像老师带读一样讲整段的意思。",
            },
            {
                "id": "co-read-2",
                "title": "追典故不追术语",
                "description": "先搞懂人物、场景和故事，再去理解抽象概念。",
                "action_type": "search",
                "query": "孔子怎样谈仁",
            },
        ],
    }


def _extract_user_id(user: Any) -> str | None:
    """Return a stable user id when called via FastAPI or directly in tests."""
    if isinstance(user, dict) and user.get("sub"):
        return str(user["sub"])
    return None


def _parse_datetime(value: str | None) -> datetime | None:
    if not value:
        return None
    normalized = value.replace("Z", "+00:00")
    try:
        return datetime.fromisoformat(normalized)
    except ValueError:
        return None


def _calculate_streak_days(values: list[str]) -> int:
    parsed_dates = sorted(
        {
            parsed.date()
            for value in values
            if (parsed := _parse_datetime(value)) is not None
        },
        reverse=True,
    )
    if not parsed_dates:
        return 0

    today = datetime.now().date()
    if parsed_dates[0] not in {today, today - timedelta(days=1)}:
        return 0

    streak = 1
    current = parsed_dates[0]
    for next_date in parsed_dates[1:]:
        if current - next_date == timedelta(days=1):
            streak += 1
            current = next_date
            continue
        break
    return streak


def _is_missing_sqlite_table(exc: sqlite3.OperationalError) -> bool:
    """Detect missing-table errors so analytics can degrade gracefully."""
    return "no such table" in str(exc).lower()


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


async def _list_reading_history(user_id: str | None) -> list[dict[str, Any]]:
    """Return reading history rows for one authenticated user."""
    if not user_id:
        return []

    try:
        async with get_connection() as conn:
            rows = await conn.fetch(
                """
                SELECT d.id::text AS id, d.id::text AS document_id, d.title, h.current_paragraph, h.total_paragraphs, h.last_read_at
                FROM user_reading_history h
                JOIN documents d ON h.document_id = d.id
                WHERE h.user_id = $1::uuid
                ORDER BY h.last_read_at DESC
                """,
                user_id,
            )
            return [dict(row) for row in rows]
    except Exception as exc:
        logger.warning("PostgreSQL 阅读记录读取失败，降级到 SQLite: %s", exc)
        async with get_db() as db:
            cursor = await db.execute(
                """
                SELECT d.id AS id, d.id AS document_id, d.title, h.current_paragraph, h.total_paragraphs, h.last_read_at
                FROM user_reading_history h
                JOIN documents d ON h.document_id = d.id
                WHERE h.user_id = ?
                ORDER BY h.last_read_at DESC
                """,
                (user_id,),
            )
            return [dict(row) for row in await cursor.fetchall()]


async def _get_study_overview(user_id: str | None) -> dict[str, Any]:
    """Aggregate study-session progress across all documents."""
    if not user_id:
        return _empty_study_overview()

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
                FROM user_study_sessions
                WHERE user_id = $1::uuid
                """
                ,
                user_id,
            )
            latest = await conn.fetchrow(
                """
                SELECT s.document_id::text AS document_id, d.title, s.created_at
                FROM user_study_sessions s
                JOIN documents d ON d.id = s.document_id
                WHERE s.user_id = $1::uuid
                ORDER BY s.created_at DESC
                LIMIT 1
                """,
                user_id,
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
                FROM user_study_sessions
                WHERE user_id = ?
                """,
                (user_id,),
            )
            summary = await cursor.fetchone()
            cursor = await db.execute(
                """
                SELECT s.document_id, d.title, s.created_at
                FROM user_study_sessions s
                JOIN documents d ON d.id = s.document_id
                WHERE s.user_id = ?
                ORDER BY s.created_at DESC
                LIMIT 1
                """,
                (user_id,),
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


async def _list_wordbook_entries(user_id: str | None, limit: int | None = None) -> list[dict[str, Any]]:
    """Return wordbook entries ordered by recency."""
    if not user_id:
        return []

    try:
        async with get_connection() as conn:
            sql = """
                SELECT id::text AS id, word, meaning, allusion, citations_json, created_at
                FROM user_wordbook_entries
                WHERE user_id = $1::uuid
                ORDER BY created_at DESC
            """
            rows = await conn.fetch(f"{sql} LIMIT $2", user_id, limit) if limit is not None else await conn.fetch(sql, user_id)
            entries = [dict(row) for row in rows]
    except RuntimeError:
        async with get_db() as db:
            sql = """
                SELECT id, word, meaning, allusion, citations_json, created_at
                FROM user_wordbook_entries
                WHERE user_id = ?
                ORDER BY created_at DESC
            """
            cursor = await db.execute(f"{sql} LIMIT ?" if limit is not None else sql, (user_id, limit) if limit is not None else (user_id,))
            entries = [dict(row) for row in await cursor.fetchall()]

    for entry in entries:
        try:
            entry["citations"] = json.loads(entry.pop("citations_json") or "[]")
        except json.JSONDecodeError:
            entry["citations"] = []
    return entries


async def _build_learning_focus(user_id: str | None) -> dict[str, Any]:
    focus = _empty_learning_focus()
    if not user_id:
        return focus

    history = await _list_reading_history(user_id)
    overview = await _get_study_overview(user_id)
    wordbook_entries = await _list_wordbook_entries(user_id, limit=12)

    streak_sources = [item.get("last_read_at") for item in history if item.get("last_read_at")]
    last_reviewed_document = overview.get("last_reviewed_document") or {}
    if last_reviewed_document.get("created_at"):
        streak_sources.append(last_reviewed_document["created_at"])

    streak_days = _calculate_streak_days(streak_sources)
    review_queue_count = 0
    if wordbook_entries:
        review_queue_count += min(len(wordbook_entries), 3)
    if overview.get("review_again_cards"):
        review_queue_count += min(int(overview["review_again_cards"]), 3)

    today_review = focus["today_review"]
    if last_reviewed_document.get("document_id"):
        today_review = {
            "title": f"先复习《{last_reviewed_document['title']}》",
            "description": "回到上次做过的学习卡片，优先处理还没完全掌握的部分。",
            "action_label": "继续复习",
            "action_type": "study",
            "document_id": last_reviewed_document["document_id"],
            "query": "",
        }
    elif history:
        today_review = {
            "title": f"先回到《{history[0]['title']}》",
            "description": "你的阅读记录已经存在，适合从上次停下的位置继续读。",
            "action_label": "继续阅读",
            "action_type": "reader",
            "document_id": history[0]["id"],
            "query": "",
        }
    elif wordbook_entries:
        today_review = {
            "title": f"先回看“{wordbook_entries[0]['word']}”",
            "description": "先复习一个生词，再回到相关原文，学习更容易形成闭环。",
            "action_label": "打开字词本",
            "action_type": "wordbook",
            "document_id": None,
            "query": "",
        }

    focus["streak_days"] = streak_days
    focus["review_queue_count"] = review_queue_count
    focus["today_review"] = today_review
    focus["co_reading_prompts"] = [
        {
            "id": "co-read-history",
            "title": "围绕最近阅读继续追问",
            "description": f"从《{history[0]['title']}》继续往下问，最容易形成连续阅读。"
            if history
            else "从一句熟悉原文继续追问，适合建立第一条学习路径。",
            "action_type": "chat",
            "prompt": (
                f"请围绕《{history[0]['title']}》继续做一轮陪读：先概括主旨，再补背景，再给我两个追问方向。"
                if history
                else "请从一句最适合初学者入门的古文开始，带我一步步读懂。"
            ),
        },
        {
            "id": "co-read-wordbook",
            "title": "把生词带回原文",
            "description": (
                f"先理解“{wordbook_entries[0]['word']}”，再回到它所在的语境去读。"
                if wordbook_entries
                else "先抓关键词，再回到古籍中核对它真正出现的语境。"
            ),
            "action_type": "search",
            "query": wordbook_entries[0]["word"] if wordbook_entries else "孔子怎样谈仁",
        },
    ]
    return focus


async def _save_wordbook_entry(user_id: str, body: WordbookEntryCreate) -> dict[str, Any]:
    citations_json = json.dumps(body.citations, ensure_ascii=False)
    try:
        async with get_connection() as conn:
            row = await conn.fetchrow(
                """
                INSERT INTO user_wordbook_entries (user_id, word, meaning, allusion, citations_json)
                VALUES ($1::uuid, $2, $3, $4, $5::jsonb)
                ON CONFLICT (user_id, word)
                DO UPDATE SET
                    meaning = EXCLUDED.meaning,
                    allusion = EXCLUDED.allusion,
                    citations_json = EXCLUDED.citations_json
                RETURNING id::text AS id, word, meaning, allusion, citations_json, created_at
                """,
                user_id,
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
                INSERT INTO user_wordbook_entries (user_id, word, meaning, allusion, citations_json)
                VALUES (?, ?, ?, ?, ?)
                ON CONFLICT(user_id, word) DO UPDATE SET
                    meaning = excluded.meaning,
                    allusion = excluded.allusion,
                    citations_json = excluded.citations_json
                """,
                (user_id, body.word.strip(), body.meaning.strip(), body.allusion.strip(), citations_json),
            )
            await db.commit()
        entries = await _list_wordbook_entries(user_id)
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


async def _delete_wordbook_entry(user_id: str, entry_id: str) -> bool:
    try:
        async with get_connection() as conn:
            result = await conn.execute(
                "DELETE FROM user_wordbook_entries WHERE user_id = $1::uuid AND id = $2::uuid",
                user_id,
                entry_id,
            )
            return result != "DELETE 0"
    except RuntimeError:
        async with get_db() as db:
            cursor = await db.execute(
                "DELETE FROM user_wordbook_entries WHERE user_id = ? AND id = ?",
                (user_id, entry_id),
            )
            await db.commit()
            return cursor.rowcount > 0


# --- Reading History ---

@router.get("/history")
async def get_reading_history(_user: dict | None = Depends(maybe_auth)):
    """Get reading history sorted by last read time."""
    user_id = _extract_user_id(_user)
    try:
        return await _list_reading_history(user_id)
    except Exception as exc:
        _raise_reader_error("读取阅读记录失败", exc)


@router.post("/progress")
async def update_progress(body: ProgressUpdate, _user: dict = Depends(require_auth)):
    """Update reading progress for a document (upsert)."""
    user_id = _extract_user_id(_user)
    try:
        if pg_database.pool:
            try:
                async with get_connection() as conn:
                    await conn.execute("""
                        INSERT INTO user_reading_history (user_id, document_id, current_paragraph, total_paragraphs, last_read_at)
                        VALUES ($1::uuid, $2::uuid, $3, $4, NOW())
                        ON CONFLICT (user_id, document_id) DO UPDATE SET
                            current_paragraph = EXCLUDED.current_paragraph,
                            total_paragraphs = EXCLUDED.total_paragraphs,
                            last_read_at = NOW()
                    """, user_id, body.document_id, body.current_paragraph, body.total_paragraphs)
                return {"status": "ok"}
            except Exception as exc:
                logger.warning("PostgreSQL 阅读进度保存失败，降级到 SQLite: %s", exc)

        async with get_db() as db:
            await db.execute("""
                INSERT INTO user_reading_history (user_id, document_id, current_paragraph, total_paragraphs, last_read_at)
                VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
                ON CONFLICT(user_id, document_id) DO UPDATE SET
                    current_paragraph = excluded.current_paragraph,
                    total_paragraphs = excluded.total_paragraphs,
                    last_read_at = CURRENT_TIMESTAMP
            """, (user_id, body.document_id, body.current_paragraph, body.total_paragraphs))
            await db.commit()
        return {"status": "ok"}
    except Exception as e:
        _raise_reader_error("保存阅读进度失败", e)


# --- Favorite Folders ---

@router.get("/folders")
async def get_folders(_user: dict | None = Depends(maybe_auth)):
    """Get all favorite folders."""
    user_id = _extract_user_id(_user)
    if not user_id:
        return []
    try:
        if pg_database.pool:
            async with get_connection() as conn:
                rows = await conn.fetch(
                    "SELECT id::text AS id, name, created_at FROM user_favorite_folders WHERE user_id = $1::uuid ORDER BY created_at DESC",
                    user_id,
                )
                return [dict(row) for row in rows]

        async with get_db() as db:
            cursor = await db.execute(
                "SELECT id, name, created_at FROM user_favorite_folders WHERE user_id = ? ORDER BY created_at DESC",
                (user_id,),
            )
            rows = await cursor.fetchall()
            return [dict(row) for row in rows]
    except Exception as exc:
        _raise_reader_error("读取收藏夹失败", exc)


@router.post("/folders")
async def create_folder(body: FolderCreate, _user: dict = Depends(require_auth)):
    """Create a new favorite folder."""
    user_id = _extract_user_id(_user)
    try:
        if pg_database.pool:
            async with get_connection() as conn:
                row = await conn.fetchrow(
                    "INSERT INTO user_favorite_folders (user_id, name) VALUES ($1::uuid, $2) RETURNING id::text AS id",
                    user_id,
                    body.name,
                )
                return {"folder_id": row["id"], "name": body.name}

        folder_id = str(uuid4())
        async with get_db() as db:
            await db.execute(
                "INSERT INTO user_favorite_folders (id, user_id, name) VALUES (?, ?, ?)",
                (folder_id, user_id, body.name),
            )
            await db.commit()
        return {"folder_id": folder_id, "name": body.name}
    except Exception as e:
        _raise_reader_error("创建收藏夹失败", e)


# --- Favorites ---

@router.get("/entity-frequency")
async def get_entity_frequency(_user: dict | None = Depends(maybe_auth)):
    """Aggregate entity frequency from reading history documents."""
    user_id = _extract_user_id(_user)
    if not user_id:
        return _empty_entity_frequency()
    try:
        try:
            async with get_connection() as conn:
                rows = await conn.fetch("""
                    SELECT entity_id, COUNT(*) as freq
                    FROM user_reading_history h
                    JOIN documents d ON h.document_id = d.id,
                         jsonb_array_elements_text(d.entity_ids) AS entity_id
                    WHERE h.user_id = $1::uuid
                      AND d.entity_ids IS NOT NULL
                      AND d.entity_ids != '[]'::jsonb
                    GROUP BY entity_id
                    ORDER BY freq DESC
                """, user_id)
                total = await conn.fetchval("""
                    SELECT COUNT(DISTINCT h.document_id)
                    FROM user_reading_history h
                    JOIN documents d ON h.document_id = d.id
                    WHERE h.user_id = $1::uuid
                      AND d.entity_ids IS NOT NULL
                      AND d.entity_ids != '[]'::jsonb
                """, user_id)
            return {
                "frequencies": [{"entity_id": row["entity_id"], "count": row["freq"]} for row in rows],
                "total_documents": total or 0,
            }
        except Exception as exc:
            logger.warning("PostgreSQL实体频率读取失败，降级到SQLite: %s", exc)

        try:
            async with get_db() as db:
                cursor = await db.execute("""
                    SELECT DISTINCT h.document_id, d.entity_ids
                    FROM user_reading_history h
                    JOIN documents d ON h.document_id = d.id
                    WHERE h.user_id = ? AND d.entity_ids IS NOT NULL AND d.entity_ids != '' AND d.entity_ids != '[]'
                """, (user_id,))
                rows = await cursor.fetchall()
        except sqlite3.OperationalError as exc:
            if _is_missing_sqlite_table(exc):
                logger.warning("SQLite实体频率表缺失，返回空统计: %s", exc)
                return _empty_entity_frequency()
            raise

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
async def get_wordbook(limit: int = Query(100, ge=1, le=500), _user: dict | None = Depends(maybe_auth)):
    """Return saved vocabulary entries for the wordbook view."""
    entries = await _list_wordbook_entries(_extract_user_id(_user), limit=limit)
    return {"entries": entries, "total": len(entries)}


@router.get("/study-overview")
async def get_study_overview(_user: dict | None = Depends(maybe_auth)):
    """Return aggregate study progress for the dashboard."""
    return await _get_study_overview(_extract_user_id(_user))


@router.get("/focus")
async def get_learning_focus(_user: dict | None = Depends(maybe_auth)):
    """Return one payload for today's review focus, reading paths, and co-reading prompts."""
    return await _build_learning_focus(_extract_user_id(_user))


@router.post("/wordbook")
async def add_wordbook_entry(body: WordbookEntryCreate, _user: dict = Depends(require_auth)):
    """Create or update a wordbook entry."""
    if not body.word.strip():
        raise HTTPException(status_code=400, detail="字词不能为空")
    return await _save_wordbook_entry(_extract_user_id(_user) or "", body)


@router.delete("/wordbook/{entry_id}")
async def delete_wordbook_entry(entry_id: str, _user: dict = Depends(require_auth)):
    """Delete a wordbook entry by id."""
    deleted = await _delete_wordbook_entry(_extract_user_id(_user) or "", entry_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="生词不存在")
    return {"status": "ok"}


@router.post("/favorites")
async def add_favorite(body: FavoriteAdd, _user: dict = Depends(require_auth)):
    """Add a document to a favorite folder."""
    user_id = _extract_user_id(_user)
    try:
        if pg_database.pool:
            async with get_connection() as conn:
                folder = await conn.fetchrow(
                    "SELECT id FROM user_favorite_folders WHERE user_id = $1::uuid AND id = $2::uuid",
                    user_id,
                    body.folder_id,
                )
                if not folder:
                    raise HTTPException(status_code=404, detail="收藏夹不存在")
                await conn.execute(
                    "INSERT INTO user_favorites (user_id, document_id, folder_id) VALUES ($1::uuid, $2::uuid, $3::uuid) ON CONFLICT DO NOTHING",
                    user_id, body.document_id, body.folder_id,
                )
        else:
            async with get_db() as db:
                cursor = await db.execute(
                    "SELECT id FROM user_favorite_folders WHERE user_id = ? AND id = ?",
                    (user_id, body.folder_id),
                )
                if not await cursor.fetchone():
                    raise HTTPException(status_code=404, detail="收藏夹不存在")
                await db.execute(
                    "INSERT OR IGNORE INTO user_favorites (user_id, document_id, folder_id) VALUES (?, ?, ?)",
                    (user_id, body.document_id, body.folder_id),
                )
                await db.commit()
        return {"status": "ok"}
    except HTTPException:
        raise
    except Exception as e:
        _raise_reader_error("加入收藏失败", e)


@router.get("/favorites/{folder_id}")
async def get_favorites(folder_id: str, _user: dict | None = Depends(maybe_auth)):
    """Get all documents in a favorite folder."""
    user_id = _extract_user_id(_user)
    if not user_id:
        return []
    try:
        if pg_database.pool:
            async with get_connection() as conn:
                rows = await conn.fetch("""
                    SELECT d.id::text AS id, d.title, f.created_at
                    FROM user_favorites f
                    JOIN documents d ON f.document_id = d.id
                    WHERE f.user_id = $1::uuid AND f.folder_id = $2::uuid
                    ORDER BY f.created_at DESC
                """, user_id, folder_id)
                return [dict(row) for row in rows]

        async with get_db() as db:
            cursor = await db.execute("""
                SELECT d.id, d.title, f.created_at
                FROM user_favorites f
                JOIN documents d ON f.document_id = d.id
                WHERE f.user_id = ? AND f.folder_id = ?
                ORDER BY f.created_at DESC
            """, (user_id, folder_id))
            rows = await cursor.fetchall()
            return [dict(row) for row in rows]
    except Exception as exc:
        _raise_reader_error("读取收藏内容失败", exc)
