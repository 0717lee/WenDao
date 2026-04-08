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
DATA_GLOB = "kanripo_corpus.part*.json"


@lru_cache(maxsize=1)
def load_corpus_documents() -> list[dict[str, Any]]:
    """Return corpus documents if a local snapshot exists."""
    data_files = sorted(DATA_PATH.parent.glob(DATA_GLOB))
    if not data_files and DATA_PATH.exists():
        data_files = [DATA_PATH]
    if not data_files:
        logger.warning("[CorpusLoader] kanripo corpus snapshot not found under %s", DATA_PATH.parent)
        return []

    try:
        payload: list[dict[str, Any]] = []
        for data_file in data_files:
            file_payload = json.loads(data_file.read_text(encoding="utf-8"))
            if not isinstance(file_payload, list):
                logger.warning("[CorpusLoader] %s is not a list, got %s", data_file, type(file_payload).__name__)
                continue
            payload.extend(item for item in file_payload if isinstance(item, dict))
    except Exception as exc:
        logger.error("[CorpusLoader] Failed to parse corpus snapshot: %s", exc)
        return []
    logger.info("[CorpusLoader] Loaded %d corpus documents from %d file(s)", len(payload), len(data_files))
    return payload
