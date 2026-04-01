#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""Prewarm full vernacular translations for the first batch of core classics."""

from __future__ import annotations

import argparse
import asyncio
import json
import os
import sys
from pathlib import Path

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from dotenv import load_dotenv

from agents.translator import TranslatorAgent
from core.database import init_database
from core.document_segments import build_original_text, build_translated_text, merge_translation_cache
from core.kanripo_source import FULL_TRANSLATION_CORE_REPO_IDS


REPO_ROOT = Path(__file__).resolve().parents[3]
DEFAULT_INPUT_PATH = REPO_ROOT / "src" / "backend-gateway" / "data" / "kanripo_corpus.json"
DEFAULT_ENV_PATH = REPO_ROOT / "src" / "backend-gateway" / ".env"


def _cache_lookup(cache: list[dict[str, object]]) -> set[int]:
    translated: set[int] = set()
    for item in cache:
        index = item.get("segment_index")
        if isinstance(index, int):
            translated.add(index)
    return translated


async def _translate_record(record: dict[str, object], translator: TranslatorAgent) -> dict[str, object]:
    segments = list(record.get("segments") or [])
    if not segments:
        return record

    cache = list(record.get("translation_cache") or [])
    translated_indices = _cache_lookup(cache)
    generated_items: list[dict[str, object]] = []

    for segment in segments:
        index = segment.get("index")
        if not isinstance(index, int) or index in translated_indices:
            continue
        raw_segment = build_original_text(str(segment.get("text") or ""))
        result = await translator.punctuate_and_translate(raw_segment)
        generated_items.append(
            {
                "segment_index": index,
                "title": segment.get("title"),
                "excerpt": segment.get("excerpt"),
                "summary": segment.get("summary"),
                "punctuated": result.get("punctuated", ""),
                "translated": result.get("translated", ""),
            }
        )

    cache = merge_translation_cache(cache, generated_items)
    record["translation_cache"] = cache
    record["translated_text"] = build_translated_text(segments, cache)
    record["translation_status"] = "full" if record.get("translated_text") else "partial"
    return record


async def main() -> int:
    load_dotenv(DEFAULT_ENV_PATH)
    parser = argparse.ArgumentParser(description="Prewarm full translations for core corpus classics.")
    parser.add_argument("--input", type=Path, default=DEFAULT_INPUT_PATH)
    parser.add_argument(
        "--repo-ids",
        nargs="*",
        default=sorted(FULL_TRANSLATION_CORE_REPO_IDS),
        help="Override the default first-batch core repo ids.",
    )
    parser.add_argument("--sync-sqlite", action="store_true", help="Sync the local SQLite corpus after writing JSON.")
    args = parser.parse_args()

    payload = json.loads(args.input.read_text(encoding="utf-8"))
    translator = TranslatorAgent()
    target_repo_ids = set(args.repo_ids)

    for index, record in enumerate(payload):
        repo_id = str(record.get("repo_id") or "")
        if repo_id not in target_repo_ids:
            continue
        if record.get("translation_status") == "full" and str(record.get("translated_text") or "").strip():
            print(f"[SKIP] {repo_id} already has full translation")
            continue
        print(f"[RUN] {repo_id} -> {record.get('title')}")
        payload[index] = await _translate_record(record, translator)
        args.input.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
        print(f"[OK] {repo_id} translated")

    if args.sync_sqlite:
        await init_database(str(REPO_ROOT / "src" / "backend-gateway" / "ancient_texts.db"))
        print("[SYNC] SQLite corpus refreshed")

    return 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
