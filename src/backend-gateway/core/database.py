# -*- coding: utf-8 -*-
"""
SQLite异步数据库管理模块。

当 PostgreSQL 不可用时，这里承担项目的真实降级存储职责，而不只是保存聊天记录。
"""
from contextlib import asynccontextmanager
import json
from typing import AsyncGenerator

import aiosqlite

from core.sample_documents import SAMPLE_DOCUMENTS


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
            original_text TEXT NOT NULL DEFAULT '',
            punctuated_text TEXT,
            translated_text TEXT,
            ocr_confidence REAL,
            image_data TEXT,
            status TEXT DEFAULT 'ocr_complete',
            entity_ids TEXT DEFAULT '[]',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)


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


async def init_database(db_path: str = "ancient_texts.db") -> None:
    """
    初始化 SQLite 数据库，确保主链路需要的表结构和降级字段都存在。

    Args:
        db_path: 数据库文件路径
    """
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
            CREATE TABLE IF NOT EXISTS favorite_folders (
                id TEXT PRIMARY KEY,
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
            CREATE TABLE IF NOT EXISTS document_notes (
                document_id TEXT PRIMARY KEY,
                note_text TEXT NOT NULL DEFAULT '',
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
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

        await db.executemany(
            """
            INSERT INTO documents (
                id, title, original_text, punctuated_text, translated_text,
                ocr_confidence, image_data, status, entity_ids, source_type
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
                title = excluded.title,
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
            [
                (
                    item["id"],
                    item["title"],
                    item["original_text"],
                    item["punctuated_text"],
                    item["translated_text"],
                    1.0,
                    None,
                    "done",
                    json.dumps(item["entity_ids"], ensure_ascii=False),
                    item["source_type"],
                )
                for item in SAMPLE_DOCUMENTS
            ],
        )

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
