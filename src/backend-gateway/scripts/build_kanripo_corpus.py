#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""Build the curated local Kanripo corpus snapshot for WenDao."""

from __future__ import annotations

import asyncio
import argparse
import os
import sys
from pathlib import Path

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from dotenv import load_dotenv

from agents.translator import TranslatorAgent
from core.kanripo_source import (
    CURATED_WORKS,
    DEFAULT_CACHE_DIR,
    TRANSLATION_PREWARM_REPO_IDS,
    build_original_text,
    build_repo_record,
    pick_segments_for_translation,
    serialize_json,
)


REPO_ROOT = Path(__file__).resolve().parents[3]
DEFAULT_OUTPUT_PATH = REPO_ROOT / "src" / "backend-gateway" / "data" / "kanripo_corpus.json"
DEFAULT_ENV_PATH = REPO_ROOT / "src" / "backend-gateway" / ".env"


async def prewarm_translation_cache(
    record: dict[str, object],
    translator_agent: TranslatorAgent,
    cache_dir: Path,
    max_segments: int,
) -> dict[str, object]:
    repo_id = str(record["repo_id"])
    if repo_id not in TRANSLATION_PREWARM_REPO_IDS:
        return record

    segments = pick_segments_for_translation(
        repo_id,
        recommended_chapters=record.get("recommended_chapters") or [],
        max_segments=max_segments,
        cache_dir=cache_dir,
    )
    if not segments:
        return record

    segment_index_lookup = {
        item.get("title"): item.get("index")
        for item in record.get("segments", [])
        if isinstance(item, dict)
    }
    generated: list[dict[str, object]] = []
    for segment in segments:
        raw_segment = build_original_text(segment["text"])
        try:
            result = await translator_agent.punctuate_and_translate(raw_segment)
        except Exception:
            record["translation_status"] = "failed"
            return record
        generated.append({
            "segment_index": segment_index_lookup.get(segment["title"]),
            "title": segment["title"],
            "punctuated": result.get("punctuated", ""),
            "translated": result.get("translated", ""),
        })

    record["translation_cache"] = generated
    record["translation_status"] = "prebuilt"
    return record


async def main() -> int:
    load_dotenv(DEFAULT_ENV_PATH)
    parser = argparse.ArgumentParser(description="Build a local Kanripo corpus snapshot.")
    parser.add_argument("--cache-dir", type=Path, default=DEFAULT_CACHE_DIR)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT_PATH)
    parser.add_argument("--with-translation-cache", action="store_true", help="Prebuild recommended chapter translations for curated classics.")
    parser.add_argument("--translation-segments", type=int, default=3)
    args = parser.parse_args()

    translator_agent = TranslatorAgent() if args.with_translation_cache else None
    records = []
    for work in CURATED_WORKS:
        record = build_repo_record(work, cache_dir=args.cache_dir)
        if translator_agent:
            record = await prewarm_translation_cache(
                record,
                translator_agent=translator_agent,
                cache_dir=args.cache_dir,
                max_segments=args.translation_segments,
            )
        records.append(record)
        print(f"[OK] {work['repo_id']} -> {work['title']} ({len(record['punctuated_text'])} chars)")

    serialize_json(records, args.output)
    print(f"[DONE] Wrote {len(records)} corpus documents to {args.output}")
    return 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
