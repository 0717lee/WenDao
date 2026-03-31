#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""Build a full Kanripo catalog index for lazy browsing/import."""

from __future__ import annotations

import argparse
import os
import re
import shutil
import sys
from pathlib import Path

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from core.kanripo_source import (
    DEFAULT_CATALOG_CACHE_DIR,
    PRIMARY_REPO_IDS,
    get_converter,
    normalize_display_title,
    parse_catalog_title,
    run_git,
    serialize_json,
)


REPO_ROOT = Path(__file__).resolve().parents[3]
DEFAULT_OUTPUT_PATH = REPO_ROOT / "src" / "backend-gateway" / "data" / "kanripo_catalog_index.json"
CATALOG_REPO = "https://github.com/kanripo/KR-Catalog.git"
ENTRY_PATTERN = re.compile(r"^\*\*\*\s+(KR[^\s]+)\s+(.+)$", flags=re.M)
SECTION_PATTERN = re.compile(r"^\*\*\s+(KR[^\s]+)\s+.+?\s+(.+)$")
FAMILY_MAP = {
    "KR1": "经部",
    "KR2": "史部",
    "KR3": "子部",
    "KR4": "集部",
    "KR5": "道部",
    "KR6": "佛部",
}


def ensure_catalog_repo(cache_dir: Path, refresh: bool) -> Path:
    if refresh and cache_dir.exists():
        shutil.rmtree(cache_dir)
    if cache_dir.exists():
        run_git(["pull", "--ff-only"], cwd=cache_dir)
        return cache_dir
    run_git(["clone", "--depth", "1", CATALOG_REPO, str(cache_dir)])
    return cache_dir


def load_section_labels(kr_dir: Path) -> dict[str, str]:
    labels: dict[str, str] = {}
    for path in kr_dir.glob("KR*.txt"):
        lines = path.read_text(encoding="utf-8").splitlines()
        for line in lines:
            match = SECTION_PATTERN.match(line.strip())
            if match:
                labels[path.stem] = match.group(2).strip()
                break
    return labels


def main() -> int:
    parser = argparse.ArgumentParser(description="Build a full Kanripo catalog index.")
    parser.add_argument("--cache-dir", type=Path, default=DEFAULT_CATALOG_CACHE_DIR)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT_PATH)
    parser.add_argument("--refresh", action="store_true")
    args = parser.parse_args()

    repo_dir = ensure_catalog_repo(args.cache_dir, args.refresh)
    kr_dir = repo_dir / "KR"
    section_labels = load_section_labels(kr_dir)
    converter = get_converter()

    entries = []
    for path in sorted(kr_dir.glob("KR*.txt")):
        file_section = path.stem
        family = FAMILY_MAP.get(file_section[:3], "其他")
        section = section_labels.get(file_section, file_section)
        text = path.read_text(encoding="utf-8")

        for repo_id, raw_title in ENTRY_PATTERN.findall(text):
            title, dynasty, author = parse_catalog_title(raw_title)
            entries.append({
                "repo_id": repo_id,
                "title": normalize_display_title(title, converter),
                "raw_title": raw_title.strip(),
                "dynasty": converter.convert(dynasty) if converter and dynasty else dynasty,
                "author": converter.convert(author) if converter and author else author,
                "family": family,
                "section": section,
                "is_primary_text": repo_id in PRIMARY_REPO_IDS or "(正文)" in raw_title,
            })

    serialize_json(entries, args.output)
    print(f"[DONE] Wrote {len(entries)} catalog entries to {args.output}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
