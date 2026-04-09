# -*- coding: utf-8 -*-
"""
SQLite异步数据库管理模块。

当 PostgreSQL 不可用时，这里承担项目的真实降级存储职责，而不只是保存聊天记录。
"""
from contextlib import asynccontextmanager
import json
import logging
import os
from typing import AsyncGenerator

import aiosqlite

from core.corpus_documents import iter_corpus_document_batches

logger = logging.getLogger(__name__)
SQLITE_CORPUS_SEED_MODE_ENV = "SQLITE_CORPUS_SEED_MODE"
DEFAULT_SQLITE_CORPUS_SEED_MODE = "auto"
VALID_SQLITE_CORPUS_SEED_MODES = {"auto", "refresh", "none"}


def _resolve_sqlite_corpus_seed_mode(seed_mode: str | None = None) -> str:
    mode = (seed_mode or os.getenv(SQLITE_CORPUS_SEED_MODE_ENV, DEFAULT_SQLITE_CORPUS_SEED_MODE)).strip().lower()
    if mode not in VALID_SQLITE_CORPUS_SEED_MODES:
        logger.warning(
            "未知的 SQLITE_CORPUS_SEED_MODE=%s，回退到默认值 %s",
            mode,
            DEFAULT_SQLITE_CORPUS_SEED_MODE,
        )
        return DEFAULT_SQLITE_CORPUS_SEED_MODE
    return mode


async def _ensure_column(
    db: aiosqlite.Connection,
    table: str,
    column: str,
    definition: str,
) -> None:
    """Add a missing SQLite column in a backward-compatible way."""
    cursor = await db.execute(f"PRAGMA table_info({table})")
    rows = await cursor.fetchall()
    existing_columns = {row[1] for row in rows}
    if column not in existing_columns:
        await db.execute(f"ALTER TABLE {table} ADD COLUMN {column} {definition}")


async def _create_documents_table(db: aiosqlite.Connection) -> None:
    await db.execute("""
        CREATE TABLE IF NOT EXISTS documents (
            id TEXT PRIMARY KEY,
            title TEXT NOT NULL,
            repo_id TEXT,
            author TEXT,
            dynasty TEXT,
            category TEXT,
            source_name TEXT,
            source_url TEXT,
            chapter_titles TEXT DEFAULT '[]',
            chapter_count INTEGER DEFAULT 0,
            featured_excerpt TEXT,
            difficulty TEXT,
            guide_summary TEXT,
            reading_tip TEXT,
            recommended_chapters TEXT DEFAULT '[]',
            segment_guides TEXT DEFAULT '[]',
            segments TEXT DEFAULT '[]',
            translation_cache TEXT DEFAULT '[]',
            translation_status TEXT DEFAULT 'none',
            original_text TEXT NOT NULL DEFAULT '',
            punctuated_text TEXT,
            translated_text TEXT,
            ocr_confidence REAL,
            image_data TEXT,
            status TEXT DEFAULT 'ocr_complete',
            entity_ids TEXT DEFAULT '[]',
            owner_user_id TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)


async def _count_rows(db: aiosqlite.Connection, table: str) -> int:
    cursor = await db.execute(f"SELECT COUNT(*) FROM {table}")
    row = await cursor.fetchone()
    return int(row[0] if row else 0)


async def count_corpus_documents(db_path: str = "ancient_texts.db") -> int:
    async with aiosqlite.connect(db_path) as db:
        cursor = await db.execute(
            "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='documents'"
        )
        table_exists = await cursor.fetchone()
        if not table_exists or int(table_exists[0] if table_exists else 0) == 0:
            return 0

        cursor = await db.execute("SELECT COUNT(*) FROM documents WHERE source_type = 'corpus'")
        row = await cursor.fetchone()
        return int(row[0] if row else 0)


async def _count_user_rows(db: aiosqlite.Connection, table: str, user_id: str) -> int:
    cursor = await db.execute(f"SELECT COUNT(*) FROM {table} WHERE user_id = ?", (user_id,))
    row = await cursor.fetchone()
    return int(row[0] if row else 0)


async def _resolve_single_user_id(db: aiosqlite.Connection) -> str | None:
    cursor = await db.execute("SELECT id FROM users ORDER BY created_at ASC LIMIT 2")
    rows = await cursor.fetchall()
    if len(rows) == 1:
        row = rows[0]
        return str(row["id"] if isinstance(row, aiosqlite.Row) else row[0])
    if len(rows) > 1:
        logger.warning("检测到多个用户，跳过旧共享数据自动回填")
    return None


async def _maybe_backfill_user_scoped_tables(db: aiosqlite.Connection) -> None:
    """Backfill legacy shared user-state tables when ownership is unambiguous."""
    user_id = await _resolve_single_user_id(db)
    if not user_id:
        return

    if await _count_user_rows(db, "user_reading_history", user_id) == 0 and await _count_rows(db, "reading_history") > 0:
        await db.execute(
            """
            INSERT INTO user_reading_history (user_id, document_id, current_paragraph, total_paragraphs, last_read_at)
            SELECT ?, document_id, current_paragraph, total_paragraphs, last_read_at
            FROM reading_history
            """,
            (user_id,),
        )

    if await _count_user_rows(db, "user_favorite_folders", user_id) == 0 and await _count_rows(db, "favorite_folders") > 0:
        await db.execute(
            """
            INSERT OR IGNORE INTO user_favorite_folders (id, user_id, name, created_at)
            SELECT id, ?, name, created_at
            FROM favorite_folders
            """,
            (user_id,),
        )

    if await _count_user_rows(db, "user_favorites", user_id) == 0 and await _count_rows(db, "favorites") > 0:
        await db.execute(
            """
            INSERT OR IGNORE INTO user_favorites (user_id, document_id, folder_id, created_at)
            SELECT ?, document_id, folder_id, created_at
            FROM favorites
            """,
            (user_id,),
        )

    if await _count_user_rows(db, "user_wordbook_entries", user_id) == 0 and await _count_rows(db, "wordbook_entries") > 0:
        await db.execute(
            """
            INSERT OR IGNORE INTO user_wordbook_entries (user_id, word, meaning, allusion, citations_json, created_at)
            SELECT ?, word, meaning, allusion, citations_json, created_at
            FROM wordbook_entries
            """,
            (user_id,),
        )

    if await _count_user_rows(db, "user_document_notes", user_id) == 0 and await _count_rows(db, "document_notes") > 0:
        await db.execute(
            """
            INSERT OR IGNORE INTO user_document_notes (user_id, document_id, note_text, updated_at)
            SELECT ?, document_id, note_text, updated_at
            FROM document_notes
            """,
            (user_id,),
        )

    if await _count_user_rows(db, "user_study_sessions", user_id) == 0 and await _count_rows(db, "study_sessions") > 0:
        await db.execute(
            """
            INSERT INTO user_study_sessions (user_id, document_id, completed_cards, total_cards, mastered_cards, review_again_cards, created_at)
            SELECT ?, document_id, completed_cards, total_cards, mastered_cards, review_again_cards, created_at
            FROM study_sessions
            """,
            (user_id,),
        )

    await db.execute(
        """
        UPDATE documents
        SET owner_user_id = ?
        WHERE source_type = 'user'
          AND (owner_user_id IS NULL OR owner_user_id = '')
        """,
        (user_id,),
    )


async def _migrate_legacy_documents_table_if_needed(db: aiosqlite.Connection) -> None:
    """
    Upgrade the old demo-era documents table to the current schema.

    Legacy table shape:
    - id INTEGER PRIMARY KEY AUTOINCREMENT
    - title / content / source / metadata
    """
    cursor = await db.execute(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='documents'"
    )
    exists = await cursor.fetchone()
    if not exists:
        return

    cursor = await db.execute("PRAGMA table_info(documents)")
    rows = await cursor.fetchall()
    columns = {row[1]: str(row[2]).upper() for row in rows}
    legacy_layout = "content" in columns or columns.get("id") == "INTEGER"
    if not legacy_layout:
        return

    await db.execute("ALTER TABLE documents RENAME TO documents_legacy")
    await _create_documents_table(db)
    await db.execute("""
        INSERT INTO documents (
            id, title, original_text, punctuated_text, translated_text,
            ocr_confidence, image_data, status, entity_ids, created_at, updated_at
        )
        SELECT
            CAST(id AS TEXT),
            COALESCE(title, 'untitled'),
            COALESCE(content, ''),
            NULL,
            NULL,
            NULL,
            NULL,
            'ocr_complete',
            '[]',
            COALESCE(created_at, CURRENT_TIMESTAMP),
            CURRENT_TIMESTAMP
        FROM documents_legacy
    """)
    await db.execute("DROP TABLE documents_legacy")


async def _sync_corpus_documents(db: aiosqlite.Connection, db_path: str) -> None:
    corpus_ids: list[str] = []
    synced_count = 0

    for batch in iter_corpus_document_batches():
        if not batch:
            continue

        corpus_ids.extend(str(item["id"]) for item in batch)
        await db.executemany(
            """
            INSERT INTO documents (
                id, title, author, dynasty, category, source_name, source_url,
                repo_id,
                chapter_titles, chapter_count, featured_excerpt,
                difficulty, guide_summary, reading_tip, recommended_chapters,
                segment_guides, segments, translation_cache, translation_status,
                original_text, punctuated_text, translated_text,
                ocr_confidence, image_data, status, entity_ids, source_type, owner_user_id
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
                owner_user_id = excluded.owner_user_id,
                updated_at = CURRENT_TIMESTAMP
            """,
            [
                (
                    item["id"],
                    item["title"],
                    item.get("author"),
                    item.get("dynasty"),
                    item.get("category"),
                    item.get("source_name"),
                    item.get("source_url"),
                    item.get("repo_id"),
                    json.dumps(item.get("chapter_titles", []), ensure_ascii=False),
                    int(item.get("chapter_count", 0)),
                    item.get("featured_excerpt"),
                    item.get("difficulty"),
                    item.get("guide_summary"),
                    item.get("reading_tip"),
                    json.dumps(item.get("recommended_chapters", []), ensure_ascii=False),
                    json.dumps(item.get("segment_guides", []), ensure_ascii=False),
                    json.dumps(item.get("segments", []), ensure_ascii=False),
                    json.dumps(item.get("translation_cache", []), ensure_ascii=False),
                    item.get("translation_status", "none"),
                    item["original_text"],
                    item["punctuated_text"],
                    item.get("translated_text", ""),
                    1.0,
                    None,
                    "done",
                    json.dumps(item.get("entity_ids", []), ensure_ascii=False),
                    item["source_type"],
                    None,
                )
                for item in batch
            ],
        )
        synced_count += len(batch)
        logger.info("[SQLite] corpus 同步进度: %d 条 -> %s", synced_count, db_path)

    if corpus_ids:
        placeholders = ",".join("?" for _ in corpus_ids)
        await db.execute(
            f"DELETE FROM documents WHERE source_type = 'corpus' AND id NOT IN ({placeholders})",
            corpus_ids,
        )
        logger.info("[SQLite] 已同步 %d 条 corpus 文档到 %s", synced_count, db_path)
    else:
        await db.execute("DELETE FROM documents WHERE source_type = 'corpus'")
        logger.warning("[SQLite] 未找到可同步的 corpus 文档，已清空旧 corpus 数据")


async def init_database(db_path: str = "ancient_texts.db", seed_mode: str | None = None) -> None:
    """
    初始化 SQLite 数据库，确保主链路需要的表结构和降级字段都存在。

    Args:
        db_path: 数据库文件路径
    """
    resolved_seed_mode = _resolve_sqlite_corpus_seed_mode(seed_mode)

    async with aiosqlite.connect(db_path) as db:
        await _migrate_legacy_documents_table_if_needed(db)
        await _create_documents_table(db)

        # 兼容旧版 SQLite 表结构
        await _ensure_column(db, "documents", "id", "TEXT")
        await _ensure_column(db, "documents", "original_text", "TEXT DEFAULT ''")
        await _ensure_column(db, "documents", "punctuated_text", "TEXT")
        await _ensure_column(db, "documents", "translated_text", "TEXT")
        await _ensure_column(db, "documents", "ocr_confidence", "REAL")
        await _ensure_column(db, "documents", "image_data", "TEXT")
        await _ensure_column(db, "documents", "status", "TEXT DEFAULT 'ocr_complete'")
        await _ensure_column(db, "documents", "entity_ids", "TEXT DEFAULT '[]'")
        await _ensure_column(db, "documents", "source_type", "TEXT DEFAULT 'user'")
        await _ensure_column(db, "documents", "owner_user_id", "TEXT")
        await _ensure_column(db, "documents", "repo_id", "TEXT")
        await _ensure_column(db, "documents", "author", "TEXT")
        await _ensure_column(db, "documents", "dynasty", "TEXT")
        await _ensure_column(db, "documents", "category", "TEXT")
        await _ensure_column(db, "documents", "source_name", "TEXT")
        await _ensure_column(db, "documents", "source_url", "TEXT")
        await _ensure_column(db, "documents", "chapter_titles", "TEXT DEFAULT '[]'")
        await _ensure_column(db, "documents", "chapter_count", "INTEGER DEFAULT 0")
        await _ensure_column(db, "documents", "featured_excerpt", "TEXT")
        await _ensure_column(db, "documents", "difficulty", "TEXT")
        await _ensure_column(db, "documents", "guide_summary", "TEXT")
        await _ensure_column(db, "documents", "reading_tip", "TEXT")
        await _ensure_column(db, "documents", "recommended_chapters", "TEXT DEFAULT '[]'")
        await _ensure_column(db, "documents", "segment_guides", "TEXT DEFAULT '[]'")
        await _ensure_column(db, "documents", "segments", "TEXT DEFAULT '[]'")
        await _ensure_column(db, "documents", "translation_cache", "TEXT DEFAULT '[]'")
        await _ensure_column(db, "documents", "translation_status", "TEXT DEFAULT 'none'")
        await _ensure_column(db, "documents", "updated_at", "TIMESTAMP DEFAULT CURRENT_TIMESTAMP")

        # 如果是旧表，尽量把历史 content 迁移到 original_text
        cursor = await db.execute("PRAGMA table_info(documents)")
        document_columns = {row[1] for row in await cursor.fetchall()}
        if "content" in document_columns:
            await db.execute("""
                UPDATE documents
                SET original_text = COALESCE(NULLIF(original_text, ''), content, '')
            """)

        await db.execute("""
            CREATE TABLE IF NOT EXISTS conversations (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_message TEXT NOT NULL,
                ai_response TEXT NOT NULL,
                citations_json TEXT,
                timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)

        await db.execute("""
            CREATE TABLE IF NOT EXISTS users (
                id TEXT PRIMARY KEY,
                username TEXT NOT NULL UNIQUE,
                email TEXT NOT NULL UNIQUE,
                hashed_password TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)

        await db.execute("""
            CREATE TABLE IF NOT EXISTS reading_history (
                document_id TEXT PRIMARY KEY,
                current_paragraph INTEGER DEFAULT 0,
                total_paragraphs INTEGER DEFAULT 0,
                last_read_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY(document_id) REFERENCES documents(id) ON DELETE CASCADE
            )
        """)

        await db.execute("""
            CREATE TABLE IF NOT EXISTS user_reading_history (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id TEXT NOT NULL,
                document_id TEXT NOT NULL,
                current_paragraph INTEGER DEFAULT 0,
                total_paragraphs INTEGER DEFAULT 0,
                last_read_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(user_id, document_id),
                FOREIGN KEY(document_id) REFERENCES documents(id) ON DELETE CASCADE
            )
        """)

        await db.execute("""
            CREATE TABLE IF NOT EXISTS favorite_folders (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)

        await db.execute("""
            CREATE TABLE IF NOT EXISTS user_favorite_folders (
                id TEXT PRIMARY KEY,
                user_id TEXT NOT NULL,
                name TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)

        await db.execute("""
            CREATE TABLE IF NOT EXISTS favorites (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                document_id TEXT NOT NULL,
                folder_id TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(document_id, folder_id),
                FOREIGN KEY(document_id) REFERENCES documents(id) ON DELETE CASCADE,
                FOREIGN KEY(folder_id) REFERENCES favorite_folders(id) ON DELETE CASCADE
            )
        """)

        await db.execute("""
            CREATE TABLE IF NOT EXISTS user_favorites (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id TEXT NOT NULL,
                document_id TEXT NOT NULL,
                folder_id TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(user_id, document_id, folder_id),
                FOREIGN KEY(document_id) REFERENCES documents(id) ON DELETE CASCADE,
                FOREIGN KEY(folder_id) REFERENCES user_favorite_folders(id) ON DELETE CASCADE
            )
        """)

        await db.execute("""
            CREATE TABLE IF NOT EXISTS wordbook_entries (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                word TEXT NOT NULL UNIQUE,
                meaning TEXT DEFAULT '',
                allusion TEXT DEFAULT '',
                citations_json TEXT DEFAULT '[]',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)

        await db.execute("""
            CREATE TABLE IF NOT EXISTS user_wordbook_entries (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id TEXT NOT NULL,
                word TEXT NOT NULL,
                meaning TEXT DEFAULT '',
                allusion TEXT DEFAULT '',
                citations_json TEXT DEFAULT '[]',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(user_id, word)
            )
        """)

        await db.execute("""
            CREATE TABLE IF NOT EXISTS document_notes (
                document_id TEXT PRIMARY KEY,
                note_text TEXT NOT NULL DEFAULT '',
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY(document_id) REFERENCES documents(id) ON DELETE CASCADE
            )
        """)

        await db.execute("""
            CREATE TABLE IF NOT EXISTS user_document_notes (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id TEXT NOT NULL,
                document_id TEXT NOT NULL,
                note_text TEXT NOT NULL DEFAULT '',
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(user_id, document_id),
                FOREIGN KEY(document_id) REFERENCES documents(id) ON DELETE CASCADE
            )
        """)

        await db.execute("""
            CREATE TABLE IF NOT EXISTS study_sessions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                document_id TEXT NOT NULL,
                completed_cards INTEGER DEFAULT 0,
                total_cards INTEGER DEFAULT 0,
                mastered_cards INTEGER DEFAULT 0,
                review_again_cards INTEGER DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY(document_id) REFERENCES documents(id) ON DELETE CASCADE
            )
        """)

        await db.execute("""
            CREATE TABLE IF NOT EXISTS user_study_sessions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id TEXT NOT NULL,
                document_id TEXT NOT NULL,
                completed_cards INTEGER DEFAULT 0,
                total_cards INTEGER DEFAULT 0,
                mastered_cards INTEGER DEFAULT 0,
                review_again_cards INTEGER DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY(document_id) REFERENCES documents(id) ON DELETE CASCADE
            )
        """)

        await db.execute("DELETE FROM documents WHERE source_type = 'sample'")

        if resolved_seed_mode == "none":
            logger.info("[SQLite] 跳过 corpus 同步，当前模式: %s", resolved_seed_mode)
        else:
            existing_corpus_count = 0
            cursor = await db.execute("SELECT COUNT(*) FROM documents WHERE source_type = 'corpus'")
            row = await cursor.fetchone()
            existing_corpus_count = int(row[0] if row else 0)

            should_refresh_corpus = resolved_seed_mode == "refresh" or existing_corpus_count == 0
            if should_refresh_corpus:
                await _sync_corpus_documents(db, db_path)
            else:
                logger.info(
                    "[SQLite] 发现 %d 条现成 corpus 文档，跳过启动同步（模式: %s）",
                    existing_corpus_count,
                    resolved_seed_mode,
                )

        await _maybe_backfill_user_scoped_tables(db)
        await db.commit()


@asynccontextmanager
async def get_db(db_path: str = "ancient_texts.db") -> AsyncGenerator[aiosqlite.Connection, None]:
    """
    异步数据库连接上下文管理器。
    """
    async with aiosqlite.connect(db_path) as db:
        db.row_factory = aiosqlite.Row
        await db.execute("PRAGMA foreign_keys = ON")
        yield db
