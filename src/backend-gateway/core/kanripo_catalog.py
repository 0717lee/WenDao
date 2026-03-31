# -*- coding: utf-8 -*-
"""Load the local Kanripo catalog index for lazy browsing/import."""

from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path
from typing import Any


DATA_PATH = Path(__file__).resolve().parent.parent / "data" / "kanripo_catalog_index.json"


@lru_cache(maxsize=1)
def load_kanripo_catalog() -> list[dict[str, Any]]:
    if not DATA_PATH.exists():
        return []

    payload = json.loads(DATA_PATH.read_text(encoding="utf-8"))
    if not isinstance(payload, list):
        return []

    return [item for item in payload if isinstance(item, dict)]
