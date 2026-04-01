# -*- coding: utf-8 -*-
"""Shared Kanripo source helpers for catalog parsing and on-demand imports."""

from __future__ import annotations

import json
import re
import subprocess
import time
import uuid
from pathlib import Path
from typing import Iterable

try:
    from opencc import OpenCC
except ImportError:  # pragma: no cover - optional dependency at runtime
    OpenCC = None  # type: ignore[assignment]

from core.reading_guides import READING_GUIDES
from core.document_segments import (
    build_featured_excerpt,
    build_original_text,
    build_segment_guides,
    enrich_segments,
)


REPO_ROOT = Path(__file__).resolve().parents[2]
KANRIPO_ORG = "https://github.com/kanripo"
KANRIPO_NAMESPACE = uuid.UUID("7a27c81e-b555-4c78-a631-519a846fc8e1")
DEFAULT_CACHE_DIR = REPO_ROOT.parent / "tmp" / "kanripo-repos"
DEFAULT_CATALOG_CACHE_DIR = REPO_ROOT.parent / "tmp" / "kanripo-catalog"

CURATED_WORKS = [
    {"repo_id": "KR1a0001", "title": "《周易》", "dynasty": "先秦", "author": "佚名", "category": "经学典籍"},
    {"repo_id": "KR1b0001", "title": "《尚书》", "dynasty": "先秦", "author": "佚名", "category": "经学典籍"},
    {"repo_id": "KR1c0001", "title": "《诗经》", "dynasty": "先秦", "author": "佚名", "category": "经学典籍"},
    {"repo_id": "KR1d0052", "title": "《礼记》", "dynasty": "西汉", "author": "戴圣", "category": "经学典籍"},
    {"repo_id": "KR1e0001", "title": "《左传》", "dynasty": "先秦", "author": "左丘明", "category": "经学典籍"},
    {"repo_id": "KR1f0001", "title": "《孝经》", "dynasty": "先秦", "author": "佚名", "category": "经学典籍"},
    {"repo_id": "KR1h0004", "title": "《论语》", "dynasty": "春秋", "author": "孔子弟子", "category": "四书"},
    {"repo_id": "KR1h0001", "title": "《孟子》", "dynasty": "战国", "author": "孟子弟子", "category": "四书"},
    {"repo_id": "KR2a0001", "title": "《史记》", "dynasty": "西汉", "author": "司马迁", "category": "史书"},
    {"repo_id": "KR3l0002", "title": "《世说新语》", "dynasty": "刘宋", "author": "刘义庆", "category": "笔记小说"},
    {"repo_id": "KR4a0001", "title": "《楚辞》", "dynasty": "西汉", "author": "王逸编", "category": "辞赋"},
    {"repo_id": "KR5c0045", "title": "《道德经》", "dynasty": "战国", "author": "老子", "category": "道家"},
    {"repo_id": "KR5c0126", "title": "《庄子》", "dynasty": "战国", "author": "庄子", "category": "道家"},
]

PRIMARY_REPO_IDS = {item["repo_id"] for item in CURATED_WORKS}
TRANSLATION_PREWARM_REPO_IDS = {item["repo_id"] for item in CURATED_WORKS}
PAGE_BREAK_PATTERN = re.compile(r"<pb:[^>]+>")
TITLE_PATTERN = re.compile(r"^\*\*\s+")
INLINE_NUMBER_PATTERN = re.compile(r"^(\d+(?:\.\d+)?)")
SEGMENT_NUMBER_PATTERN = re.compile(r"^\d+(?:\.\d+)?\s*")
FULL_TRANSLATION_CORE_REPO_IDS = {
    "KR1c0001",  # 《诗经》
    "KR1f0001",  # 《孝经》
    "KR1h0004",  # 《论语》
    "KR1h0001",  # 《孟子》
    "KR4a0001",  # 《楚辞》
    "KR5c0045",  # 《道德经》
    "KR5c0126",  # 《庄子》
}


def get_converter():
    return OpenCC("t2s") if OpenCC else None


def run_git(args: list[str], cwd: Path | None = None, retries: int = 3) -> None:
    last_error: subprocess.CalledProcessError | None = None
    for attempt in range(1, retries + 1):
        try:
            subprocess.run(["git", *args], cwd=cwd, check=True)
            return
        except subprocess.CalledProcessError as exc:
            last_error = exc
            if attempt == retries:
                raise
            time.sleep(2 * attempt)
    if last_error:
        raise last_error


def ensure_repo(repo_id: str, cache_dir: Path = DEFAULT_CACHE_DIR) -> Path:
    cache_dir.mkdir(parents=True, exist_ok=True)
    repo_dir = cache_dir / repo_id
    if repo_dir.exists():
        run_git(["pull", "--ff-only"], cwd=repo_dir)
        return repo_dir

    run_git(["clone", "--depth", "1", f"{KANRIPO_ORG}/{repo_id}.git", str(repo_dir)])
    return repo_dir


def iter_text_files(repo_dir: Path, repo_id: str) -> Iterable[Path]:
    return sorted(
        (path for path in repo_dir.glob(f"{repo_id}_*.txt") if path.is_file()),
        key=lambda path: path.name,
    )


def normalize_line(line: str, converter) -> str:
    line = PAGE_BREAK_PATTERN.sub("", line)
    line = line.replace("¶", "\n")
    line = line.replace("\u3000", " ").replace("\t", " ")
    parts: list[str] = []
    for part in line.splitlines():
        cleaned = part.strip()
        if not cleaned:
            continue
        if cleaned.startswith("#+") or cleaned.startswith("# "):
            continue
        if cleaned.startswith("# src:") or cleaned.startswith("# dating:"):
            continue
        if cleaned.startswith(":") or cleaned == "目次":
            continue
        if cleaned.startswith("* "):
            continue
        if TITLE_PATTERN.match(cleaned):
            cleaned = TITLE_PATTERN.sub("", cleaned)
        cleaned = INLINE_NUMBER_PATTERN.sub(lambda m: f"{m.group(1)} ", cleaned)
        cleaned = re.sub(r"\s+", " ", cleaned).strip()
        if converter:
            cleaned = converter.convert(cleaned)
        parts.append(cleaned)
    return "\n".join(parts).strip()


def extract_segment_title(raw_text: str, path: Path, converter) -> str:
    for line in raw_text.splitlines():
        cleaned = line.strip()
        if not cleaned:
            continue
        if TITLE_PATTERN.match(cleaned):
            title = TITLE_PATTERN.sub("", cleaned)
            title = INLINE_NUMBER_PATTERN.sub(lambda m: f"{m.group(1)} ", title)
            title = SEGMENT_NUMBER_PATTERN.sub("", title).strip()
            if converter:
                title = converter.convert(title)
            return title or path.stem
    return path.stem


def build_segments(repo_dir: Path, repo_id: str, converter) -> list[dict[str, str]]:
    segments: list[dict[str, str]] = []
    for path in iter_text_files(repo_dir, repo_id):
        raw_text = path.read_text(encoding="utf-8")
        title = extract_segment_title(raw_text, path, converter)
        normalized = normalize_line(raw_text, converter)
        if normalized:
            segments.append({"title": title, "text": normalized})
    return segments


def build_punctuated_text(segments: list[dict[str, str]]) -> str:
    text = "\n\n".join(segment["text"] for segment in segments)
    return re.sub(r"\n{3,}", "\n\n", text).strip()


def pick_segments_for_translation(
    repo_id: str,
    recommended_chapters: list[str] | None = None,
    max_segments: int = 3,
    cache_dir: Path = DEFAULT_CACHE_DIR,
) -> list[dict[str, str]]:
    segments = build_segments(ensure_repo(repo_id, cache_dir=cache_dir), repo_id, get_converter())
    if not segments:
        return []

    selected: list[dict[str, str]] = []
    if recommended_chapters:
        for segment in segments:
            if any(
                recommendation in segment["title"] or segment["title"] in recommendation
                for recommendation in recommended_chapters
            ):
                selected.append(segment)

    if not selected:
        selected = segments[:max_segments]

    return selected[:max_segments]


def build_repo_record(metadata: dict[str, object], cache_dir: Path = DEFAULT_CACHE_DIR) -> dict[str, object]:
    converter = get_converter()
    repo_id = str(metadata["repo_id"])
    repo_dir = ensure_repo(repo_id, cache_dir=cache_dir)
    raw_segments = build_segments(repo_dir, repo_id, converter)
    segments = enrich_segments(raw_segments, metadata)
    punctuated_text = build_punctuated_text(raw_segments)
    original_text = build_original_text(punctuated_text)
    chapter_titles = [segment["title"] for segment in segments]
    segment_guides = build_segment_guides(segments)

    return {
        "id": str(uuid.uuid5(KANRIPO_NAMESPACE, repo_id)),
        "repo_id": repo_id,
        "title": metadata["title"],
        "author": metadata.get("author"),
        "dynasty": metadata.get("dynasty"),
        "category": metadata.get("category"),
        "family": metadata.get("family"),
        "section": metadata.get("section"),
        "source_name": "Kanripo",
        "source_url": f"{KANRIPO_ORG}/{repo_id}",
        "source_type": "corpus",
        "chapter_titles": chapter_titles,
        "chapter_count": len(chapter_titles),
        "featured_excerpt": build_featured_excerpt(segments),
        "segment_guides": segment_guides,
        "segments": segments,
        "difficulty": READING_GUIDES.get(repo_id, {}).get("difficulty"),
        "guide_summary": READING_GUIDES.get(repo_id, {}).get("guide_summary"),
        "reading_tip": READING_GUIDES.get(repo_id, {}).get("reading_tip"),
        "recommended_chapters": READING_GUIDES.get(repo_id, {}).get("recommended_chapters", []),
        "translation_cache": [],
        "translation_status": "none",
        "original_text": original_text,
        "punctuated_text": punctuated_text,
        "translated_text": "",
        "entity_ids": [],
    }


def parse_catalog_title(raw_title: str) -> tuple[str, str | None, str | None]:
    cleaned = raw_title.strip()
    is_primary = "(正文)" in cleaned
    cleaned = cleaned.replace("(正文)", "").strip()
    parts = cleaned.split("-")
    title = parts[0].strip()
    dynasty = parts[1].strip() if len(parts) > 1 and parts[1].strip() else None
    author = parts[2].strip() if len(parts) > 2 and parts[2].strip() else None
    return title, dynasty, author


def normalize_display_title(title: str, converter=None) -> str:
    cleaned = title.strip()
    if converter:
        cleaned = converter.convert(cleaned)
    return f"《{cleaned}》" if not cleaned.startswith("《") else cleaned


def serialize_json(data: object, output_path: Path) -> None:
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
