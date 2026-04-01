# -*- coding: utf-8 -*-
"""
PostgreSQL async database module using asyncpg.
Provides connection pool management and schema initialization for Phase 2 features.
"""
import os
import json
import logging
from contextlib import asynccontextmanager
from typing import AsyncGenerator, Optional

import asyncpg

from core.corpus_documents import load_corpus_documents
from core.sample_documents import SAMPLE_DOCUMENTS

logger = logging.getLogger(__name__)

# Module-level pool reference
pool: Optional[asyncpg.Pool] = None


@asynccontextmanager
async def pg_lifespan():
    """
    Async context manager for FastAPI lifespan.
    Creates and closes the asyncpg connection pool.
    """
    global pool
    database_url = os.getenv("DATABASE_URL")

    if not database_url:
        logger.warning("DATABASE_URL not set, PostgreSQL features disabled")
        yield
        return

    try:
        pool = await asyncpg.create_pool(
            database_url,
            min_size=5,
            max_size=20,
            command_timeout=60,
        )
        logger.info("PostgreSQL connection pool created")
        yield
    finally:
        if pool:
            await pool.close()
            pool = None
            logger.info("PostgreSQL connection pool closed")


@asynccontextmanager
async def get_connection() -> AsyncGenerator[asyncpg.Connection, None]:
    """
    Acquire a connection from the pool.

    Usage:
        async with get_connection() as conn:
            row = await conn.fetchrow("SELECT 1")
    """
    if pool is None:
        raise RuntimeError("PostgreSQL pool not initialized. Is DATABASE_URL set?")

    async with pool.acquire() as conn:
        yield conn


async def init_pg_database() -> None:
    """
    Create Phase 2 tables if they don't exist.
    Tables: documents, reading_history, favorite_folders, favorites, users.
    """
    if pool is None:
        logger.warning("PostgreSQL pool not available, skipping table creation")
        return

    async with pool.acquire() as conn:
        await conn.execute("""
            CREATE TABLE IF NOT EXISTS documents (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                title TEXT NOT NULL,
                repo_id TEXT,
                author TEXT,
                dynasty TEXT,
                category TEXT,
                source_name TEXT,
                source_url TEXT,
                chapter_titles JSONB DEFAULT '[]'::jsonb,
                chapter_count INT DEFAULT 0,
                featured_excerpt TEXT,
                difficulty TEXT,
                guide_summary TEXT,
                reading_tip TEXT,
                recommended_chapters JSONB DEFAULT '[]'::jsonb,
                segment_guides JSONB DEFAULT '[]'::jsonb,
                segments JSONB DEFAULT '[]'::jsonb,
                translation_cache JSONB DEFAULT '[]'::jsonb,
                translation_status TEXT DEFAULT 'none',
                original_text TEXT NOT NULL,
                punctuated_text TEXT,
                translated_text TEXT,
                ocr_confidence FLOAT,
                image_path TEXT,
                image_data TEXT,
                status TEXT DEFAULT 'ocr_complete',
                created_at TIMESTAMPTZ DEFAULT NOW(),
                updated_at TIMESTAMPTZ DEFAULT NOW()
            )
        """)

        await conn.execute("""
            CREATE TABLE IF NOT EXISTS reading_history (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                document_id UUID REFERENCES documents(id) ON DELETE CASCADE,
                current_paragraph INT DEFAULT 0,
                total_paragraphs INT DEFAULT 0,
                last_read_at TIMESTAMPTZ DEFAULT NOW()
            )
        """)

        await conn.execute("""
            CREATE TABLE IF NOT EXISTS favorite_folders (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                name TEXT NOT NULL,
                created_at TIMESTAMPTZ DEFAULT NOW()
            )
        """)

        await conn.execute("""
            CREATE TABLE IF NOT EXISTS favorites (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                document_id UUID REFERENCES documents(id) ON DELETE CASCADE,
                folder_id UUID REFERENCES favorite_folders(id) ON DELETE CASCADE,
                created_at TIMESTAMPTZ DEFAULT NOW(),
                UNIQUE(document_id, folder_id)
            )
        """)

        await conn.execute("""
            CREATE TABLE IF NOT EXISTS wordbook_entries (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                word TEXT UNIQUE NOT NULL,
                meaning TEXT DEFAULT '',
                allusion TEXT DEFAULT '',
                citations_json JSONB DEFAULT '[]'::jsonb,
                created_at TIMESTAMPTZ DEFAULT NOW()
            )
        """)

        await conn.execute("""
            CREATE TABLE IF NOT EXISTS document_notes (
                document_id UUID PRIMARY KEY REFERENCES documents(id) ON DELETE CASCADE,
                note_text TEXT NOT NULL DEFAULT '',
                updated_at TIMESTAMPTZ DEFAULT NOW()
            )
        """)

        await conn.execute("""
            CREATE TABLE IF NOT EXISTS study_sessions (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                document_id UUID REFERENCES documents(id) ON DELETE CASCADE,
                completed_cards INT DEFAULT 0,
                total_cards INT DEFAULT 0,
                mastered_cards INT DEFAULT 0,
                review_again_cards INT DEFAULT 0,
                created_at TIMESTAMPTZ DEFAULT NOW()
            )
        """)

        # Add entity_ids column for GraphRAG cross-referencing (Phase 3)
        await conn.execute("""
            ALTER TABLE documents
            ADD COLUMN IF NOT EXISTS entity_ids JSONB DEFAULT '[]'::jsonb
        """)

        await conn.execute("""
            ALTER TABLE documents
            ADD COLUMN IF NOT EXISTS image_data TEXT
        """)

        await conn.execute("""
            ALTER TABLE documents
            ADD COLUMN IF NOT EXISTS source_type TEXT DEFAULT 'user'
        """)

        await conn.execute("""
            ALTER TABLE documents
            ADD COLUMN IF NOT EXISTS repo_id TEXT
        """)

        await conn.execute("""
            ALTER TABLE documents
            ADD COLUMN IF NOT EXISTS author TEXT
        """)

        await conn.execute("""
            ALTER TABLE documents
            ADD COLUMN IF NOT EXISTS dynasty TEXT
        """)

        await conn.execute("""
            ALTER TABLE documents
            ADD COLUMN IF NOT EXISTS category TEXT
        """)

        await conn.execute("""
            ALTER TABLE documents
            ADD COLUMN IF NOT EXISTS source_name TEXT
        """)

        await conn.execute("""
            ALTER TABLE documents
            ADD COLUMN IF NOT EXISTS source_url TEXT
        """)

        await conn.execute("""
            ALTER TABLE documents
            ADD COLUMN IF NOT EXISTS chapter_titles JSONB DEFAULT '[]'::jsonb
        """)

        await conn.execute("""
            ALTER TABLE documents
            ADD COLUMN IF NOT EXISTS chapter_count INT DEFAULT 0
        """)

        await conn.execute("""
            ALTER TABLE documents
            ADD COLUMN IF NOT EXISTS featured_excerpt TEXT
        """)

        await conn.execute("""
            ALTER TABLE documents
            ADD COLUMN IF NOT EXISTS difficulty TEXT
        """)

        await conn.execute("""
            ALTER TABLE documents
            ADD COLUMN IF NOT EXISTS guide_summary TEXT
        """)

        await conn.execute("""
            ALTER TABLE documents
            ADD COLUMN IF NOT EXISTS reading_tip TEXT
        """)

        await conn.execute("""
            ALTER TABLE documents
            ADD COLUMN IF NOT EXISTS recommended_chapters JSONB DEFAULT '[]'::jsonb
        """)

        await conn.execute("""
            ALTER TABLE documents
            ADD COLUMN IF NOT EXISTS segment_guides JSONB DEFAULT '[]'::jsonb
        """)

        await conn.execute("""
            ALTER TABLE documents
            ADD COLUMN IF NOT EXISTS segments JSONB DEFAULT '[]'::jsonb
        """)

        await conn.execute("""
            ALTER TABLE documents
            ADD COLUMN IF NOT EXISTS translation_cache JSONB DEFAULT '[]'::jsonb
        """)

        await conn.execute("""
            ALTER TABLE documents
            ADD COLUMN IF NOT EXISTS translation_status TEXT DEFAULT 'none'
        """)

        # Users table for JWT auth
        await conn.execute("""
            CREATE TABLE IF NOT EXISTS users (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                username TEXT UNIQUE NOT NULL,
                email TEXT UNIQUE,
                hashed_password TEXT NOT NULL,
                created_at TIMESTAMPTZ DEFAULT NOW()
            )
        """)

        await conn.execute("""
            ALTER TABLE users
            ADD COLUMN IF NOT EXISTS email TEXT UNIQUE
        """)

        await conn.executemany(
            """
            INSERT INTO documents (
                id, title, author, dynasty, category, source_name, source_url,
                repo_id,
                chapter_titles, chapter_count, featured_excerpt,
                difficulty, guide_summary, reading_tip, recommended_chapters,
                segment_guides, segments, translation_cache, translation_status,
                original_text, punctuated_text, translated_text,
                ocr_confidence, image_data, status, entity_ids, source_type
            ) VALUES ($1::uuid, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10, $11, $12, $13, $14, $15::jsonb, $16::jsonb, $17::jsonb, $18::jsonb, $19, $20, $21, $22, $23, $24, $25, $26::jsonb, $27)
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
            [
                (
                    item["id"],
                    item["title"],
                    item.get("author"),
                    item.get("dynasty"),
                    item.get("category"),
                    "TextTwin",
                    None,
                    item.get("repo_id"),
                    "[]",
                    0,
                    None,
                    None,
                    None,
                    None,
                    "[]",
                    "[]",
                    "[]",
                    "[]",
                    "none",
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

        corpus_documents = load_corpus_documents()
        if corpus_documents:
            await conn.executemany(
                """
                INSERT INTO documents (
                    id, title, author, dynasty, category, source_name, source_url,
                    repo_id,
                    chapter_titles, chapter_count, featured_excerpt,
                    difficulty, guide_summary, reading_tip, recommended_chapters,
                    segment_guides, segments, translation_cache, translation_status,
                    original_text, punctuated_text, translated_text,
                    ocr_confidence, image_data, status, entity_ids, source_type
                ) VALUES ($1::uuid, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10, $11, $12, $13, $14, $15::jsonb, $16::jsonb, $17::jsonb, $18::jsonb, $19, $20, $21, $22, $23, $24, $25, $26::jsonb, $27)
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
                    )
                    for item in corpus_documents
                ],
            )

    logger.info("PostgreSQL tables initialized (documents, reading_history, favorite_folders, favorites, users, wordbook_entries, document_notes, study_sessions, sample docs, corpus docs)")
