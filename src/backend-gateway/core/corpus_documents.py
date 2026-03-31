# -*- coding: utf-8 -*-
"""Real corpus document loader.

Loads a locally curated Kanripo-derived corpus snapshot so the product's main
reading experience can rely on a stable offline dataset instead of a handful of
hard-coded demo samples.
"""

from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path
from typing import Any


DATA_PATH = Path(__file__).resolve().parent.parent / "data" / "kanripo_corpus.json"


@lru_cache(maxsize=1)
def load_corpus_documents() -> list[dict[str, Any]]:
    """Return corpus documents if a local snapshot exists."""
    if not DATA_PATH.exists():
        return []

    payload = json.loads(DATA_PATH.read_text(encoding="utf-8"))
    if not isinstance(payload, list):
        return []

    return [item for item in payload if isinstance(item, dict)]
