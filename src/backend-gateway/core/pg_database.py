# -*- coding: utf-8 -*-
"""
PostgreSQL async database module using asyncpg.
Provides connection pool management and schema initialization for Phase 2 features.
"""
import os
import logging
from contextlib import asynccontextmanager
from typing import AsyncGenerator, Optional

import asyncpg

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

        # Add entity_ids column for GraphRAG cross-referencing (Phase 3)
        await conn.execute("""
            ALTER TABLE documents
            ADD COLUMN IF NOT EXISTS entity_ids JSONB DEFAULT '[]'::jsonb
        """)

        await conn.execute("""
            ALTER TABLE documents
            ADD COLUMN IF NOT EXISTS image_data TEXT
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

    logger.info("PostgreSQL tables initialized (documents, reading_history, favorite_folders, favorites, users, wordbook_entries, document_notes)")
