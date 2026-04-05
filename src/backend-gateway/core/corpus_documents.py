# -*- coding: utf-8 -*-
"""Real corpus document loader.

Loads a locally curated Kanripo-derived corpus snapshot so the product's main
reading experience can rely on a stable offline dataset instead of a handful of
hard-coded demo samples.
"""

from __future__ import annotations

import json
import logging
from functools import lru_cache
from pathlib import Path
from typing import Any

logger = logging.getLogger(__name__)

DATA_PATH = Path(__file__).resolve().parent.parent / "data" / "kanripo_corpus.json"


@lru_cache(maxsize=1)
def load_corpus_documents() -> list[dict[str, Any]]:
    """Return corpus documents if a local snapshot exists."""
    if not DATA_PATH.exists():
        logger.warning("[CorpusLoader] kanripo_corpus.json not found at %s", DATA_PATH)
        return []

    try:
        payload = json.loads(DATA_PATH.read_text(encoding="utf-8"))
    except Exception as exc:
        logger.error("[CorpusLoader] Failed to parse kanripo_corpus.json: %s", exc)
        return []

    if not isinstance(payload, list):
        logger.warning("[CorpusLoader] kanripo_corpus.json is not a list, got %s", type(payload).__name__)
        return []

    docs = [item for item in payload if isinstance(item, dict)]
    logger.info("[CorpusLoader] Loaded %d corpus documents from %s", len(docs), DATA_PATH)
    return docs
