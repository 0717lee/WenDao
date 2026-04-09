# -*- coding: utf-8 -*-
"""Real corpus document loader.

Loads a locally curated Kanripo-derived corpus snapshot so the product's main
reading experience can rely on a stable offline dataset instead of a handful of
hard-coded demo samples.
"""

from __future__ import annotations

import json
import logging
import sqlite3
from functools import lru_cache
from pathlib import Path
from typing import Any, Iterator

logger = logging.getLogger(__name__)

DATA_PATH = Path(__file__).resolve().parent.parent / "data" / "kanripo_corpus.json"
DATA_GLOB = "kanripo_corpus.part*.json"
SQLITE_SNAPSHOT_PATH = Path(__file__).resolve().parent.parent / "ancient_texts.db"


def resolve_corpus_data_files() -> list[Path]:
    data_files = sorted(DATA_PATH.parent.glob(DATA_GLOB))
    if not data_files and DATA_PATH.exists():
        data_files = [DATA_PATH]
    return data_files


def iter_corpus_document_batches() -> Iterator[list[dict[str, Any]]]:
    """Yield corpus documents one source file at a time to keep memory bounded."""
    data_files = resolve_corpus_data_files()
    if not data_files:
        logger.warning("[CorpusLoader] kanripo corpus snapshot not found under %s", DATA_PATH.parent)
        return

    for data_file in data_files:
        try:
            file_payload = json.loads(data_file.read_text(encoding="utf-8"))
        except Exception as exc:
            logger.error("[CorpusLoader] Failed to parse corpus snapshot %s: %s", data_file, exc)
            continue

        if not isinstance(file_payload, list):
            logger.warning("[CorpusLoader] %s is not a list, got %s", data_file, type(file_payload).__name__)
            continue

        batch = [item for item in file_payload if isinstance(item, dict)]
        logger.info("[CorpusLoader] Loaded %d corpus documents from %s", len(batch), data_file.name)
        yield batch


@lru_cache(maxsize=1)
def load_corpus_documents() -> list[dict[str, Any]]:
    """Return corpus documents if a local snapshot exists."""
    data_files = resolve_corpus_data_files()
    if not data_files:
        logger.warning("[CorpusLoader] kanripo corpus snapshot not found under %s", DATA_PATH.parent)
        return []

    try:
        payload: list[dict[str, Any]] = []
        for batch in iter_corpus_document_batches():
            payload.extend(batch)
    except Exception as exc:
        logger.error("[CorpusLoader] Failed to parse corpus snapshot: %s", exc)
        return []
    logger.info("[CorpusLoader] Loaded %d corpus documents from %d file(s)", len(payload), len(data_files))
    return payload


def load_corpus_seed_documents_from_sqlite() -> list[dict[str, Any]]:
    """Return lightweight corpus seed rows from the packaged SQLite snapshot."""
    if not SQLITE_SNAPSHOT_PATH.exists():
        logger.warning("[CorpusLoader] SQLite corpus snapshot not found at %s", SQLITE_SNAPSHOT_PATH)
        return []

    conn: sqlite3.Connection | None = None
    try:
        conn = sqlite3.connect(SQLITE_SNAPSHOT_PATH)
        conn.row_factory = sqlite3.Row
        cursor = conn.execute(
            """
            SELECT id, title, repo_id, author, dynasty, category, source_name, source_url,
                   chapter_titles, chapter_count, featured_excerpt,
                   difficulty, guide_summary, reading_tip, recommended_chapters,
                   entity_ids, source_type
            FROM documents
            WHERE source_type = 'corpus'
            ORDER BY COALESCE(updated_at, created_at) DESC
            """
        )
        rows = []
        for row in cursor.fetchall():
            rows.append(
                {
                    "id": row["id"],
                    "title": row["title"],
                    "repo_id": row["repo_id"],
                    "author": row["author"],
                    "dynasty": row["dynasty"],
                    "category": row["category"],
                    "source_name": row["source_name"],
                    "source_url": row["source_url"],
                    "chapter_titles": json.loads(row["chapter_titles"] or "[]"),
                    "chapter_count": int(row["chapter_count"] or 0),
                    "featured_excerpt": row["featured_excerpt"],
                    "difficulty": row["difficulty"],
                    "guide_summary": row["guide_summary"],
                    "reading_tip": row["reading_tip"],
                    "recommended_chapters": json.loads(row["recommended_chapters"] or "[]"),
                    "entity_ids": json.loads(row["entity_ids"] or "[]"),
                    "source_type": row["source_type"] or "corpus",
                }
            )
        logger.info("[CorpusLoader] Loaded %d lightweight corpus documents from SQLite snapshot", len(rows))
        return rows
    except Exception as exc:
        logger.error("[CorpusLoader] Failed to read SQLite corpus snapshot: %s", exc)
        return []
    finally:
        if conn is not None:
            try:
                conn.close()
            except Exception:
                pass
