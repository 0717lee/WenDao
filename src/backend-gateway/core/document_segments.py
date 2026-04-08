# -*- coding: utf-8 -*-
"""Segment enrichment and translation-cache helpers for source documents."""

from __future__ import annotations

import re
from collections import OrderedDict
from typing import Any

try:
    from jieba import analyse as jieba_analyse
except ImportError:  # pragma: no cover - optional at runtime
    jieba_analyse = None  # type: ignore[assignment]


PUNCTUATION_PATTERN = re.compile(r"[，。！？：；、“”‘’「」『』（）()《》〈〉【】〔〕—…·,.!?;:\"'\\-]")


def build_original_text(punctuated_text: str) -> str:
    """Remove punctuation while preserving line structure."""
    lines = []
    for line in punctuated_text.splitlines():
        if not line.strip():
            lines.append("")
            continue
        cleaned = PUNCTUATION_PATTERN.sub("", line).replace(" ", "")
        lines.append(cleaned)
    return "\n".join(lines).strip()


def _readable_lines(text: str, title: str) -> list[str]:
    lines = [line.strip() for line in text.splitlines() if line.strip()]
    normalized_title = re.sub(r"^\d+(?:\.\d+)?\s*", "", title).strip("《》 ")
    readable: list[str] = []
    for line in lines:
        normalized_line = re.sub(r"^\d+(?:\.\d+)?\s*", "", line).strip("《》 ")
        if line == title:
            continue
        if normalized_title and normalized_line == normalized_title:
            continue
        readable.append(line)
    return readable


def _segment_excerpt(text: str, title: str, max_length: int = 80) -> str:
    readable_lines = _readable_lines(text, title)
    for line in readable_lines:
        if len(line) >= 10 and not line.endswith(("：", ":")):
            return line[:max_length]
    for line in readable_lines:
        if len(line) >= 8:
            return line[:max_length]
    fallback = next(iter(readable_lines), title)
    return fallback[:max_length]


def _extract_keywords(text: str, title: str, top_k: int = 3) -> list[str]:
    payload = " ".join(_readable_lines(text, title)[:12])
    if not payload:
        return []
    if jieba_analyse is None:
        return []
    keywords = [
        item.strip()
        for item in jieba_analyse.extract_tags(payload, topK=top_k + 2)
        if item and item.strip() and len(item.strip()) > 1
    ]
    deduped: list[str] = []
    seen: set[str] = set()
    for item in keywords:
        if item in seen:
            continue
        seen.add(item)
        deduped.append(item)
        if len(deduped) >= top_k:
            break
    return deduped


def _infer_focus(metadata: dict[str, Any], title: str) -> str:
    title_blob = f"{metadata.get('category') or ''}{metadata.get('family') or ''}{title}"
    if any(token in title_blob for token in ("本纪", "列传", "世家", "纪", "传", "策", "记")):
        return "人物与事件"
    if any(token in title_blob for token in ("诗", "歌", "骚", "辞", "风", "雅")):
        return "意象与情感"
    if any(token in title_blob for token in ("论", "说", "问", "章", "篇", "经", "义", "礼")):
        return "概念与论证"
    if any(token in str(metadata.get("category") or "") for token in ("史书", "笔记小说")):
        return "人物与事件"
    return "主旨与关键词"


def _build_segment_summary(title: str, text: str, metadata: dict[str, Any]) -> str:
    excerpt = _segment_excerpt(text, title)
    keywords = _extract_keywords(text, title)
    focus = _infer_focus(metadata, title)
    keyword_text = "、".join(keywords) if keywords else title

    if focus == "人物与事件":
        return f"这一段先看 {keyword_text}，再从“{excerpt}”这一句进入，更容易理清人物和事件。"
    if focus == "意象与情感":
        return f"这一段先看 {keyword_text}，从“{excerpt}”开始读，先把画面和情绪读出来。"
    if focus == "概念与论证":
        return f"这一段先看 {keyword_text} 这些关键词，再结合“{excerpt}”理解这一段在讲什么。"
    return f"这一段先看 {keyword_text}，再从“{excerpt}”这一句进入，先读懂大意。"


def enrich_segments(
    segments: list[dict[str, str]],
    metadata: dict[str, Any] | None = None,
) -> list[dict[str, Any]]:
    """Attach excerpt/summary metadata to source segments."""
    metadata = metadata or {}
    enriched: list[dict[str, Any]] = []
    for index, segment in enumerate(segments):
        title = str(segment.get("title") or f"第{index + 1}节").strip()
        text = str(segment.get("text") or "").strip()
        excerpt = _segment_excerpt(text, title)
        enriched.append(
            {
                "index": index,
                "title": title,
                "text": text,
                "excerpt": excerpt,
                "summary": _build_segment_summary(title, text, metadata),
                "char_count": len(text),
                "line_count": len([line for line in text.splitlines() if line.strip()]),
            }
        )
    return enriched


def build_segment_guides(segments: list[dict[str, Any]]) -> list[dict[str, str]]:
    return [
        {
            "title": str(segment.get("title") or ""),
            "excerpt": str(segment.get("excerpt") or ""),
            "summary": str(segment.get("summary") or ""),
        }
        for segment in segments
    ]


def build_featured_excerpt(segments: list[dict[str, Any]]) -> str:
    for segment in segments:
        excerpt = str(segment.get("excerpt") or "").strip()
        if excerpt:
            return excerpt[:140]
    return ""


def merge_translation_cache(
    existing_cache: list[dict[str, Any]] | None,
    new_items: list[dict[str, Any]] | None,
) -> list[dict[str, Any]]:
    merged: "OrderedDict[str, dict[str, Any]]" = OrderedDict()
    for item in existing_cache or []:
        key = f"{item.get('segment_index', '')}:{item.get('title', '')}"
        merged[key] = dict(item)
    for item in new_items or []:
        key = f"{item.get('segment_index', '')}:{item.get('title', '')}"
        merged[key] = dict(item)
    return list(merged.values())


def build_translation_lookup(cache: list[dict[str, Any]] | None) -> dict[int, dict[str, Any]]:
    lookup: dict[int, dict[str, Any]] = {}
    for item in cache or []:
        index = item.get("segment_index")
        if isinstance(index, int):
            lookup[index] = dict(item)
    return lookup


def build_translated_text(
    segments: list[dict[str, Any]] | None,
    translation_cache: list[dict[str, Any]] | None,
) -> str:
    if not segments:
        return ""
    cache_by_index = build_translation_lookup(translation_cache)
    translated_blocks: list[str] = []
    for segment in segments:
        index = segment.get("index")
        cached = cache_by_index.get(index) if isinstance(index, int) else None
        if not cached or not str(cached.get("translated") or "").strip():
            return ""
        translated_blocks.append(str(cached["translated"]).strip())
    return "\n\n".join(translated_blocks).strip()


def get_translation_progress(
    segments: list[dict[str, Any]] | None,
    translation_cache: list[dict[str, Any]] | None,
) -> dict[str, int | bool]:
    total = len(segments or [])
    translated = len(build_translation_lookup(translation_cache))
    return {
        "total_segments": total,
        "translated_segments": min(translated, total),
        "is_complete": total > 0 and translated >= total,
    }


def pick_translation_segments(
    segments: list[dict[str, Any]] | None,
    translation_cache: list[dict[str, Any]] | None,
    strategy: str,
    max_segments: int,
    recommended_titles: list[str] | None = None,
) -> list[dict[str, Any]]:
    if not segments:
        return []

    cache_by_index = build_translation_lookup(translation_cache)
    missing_segments = [
        segment
        for segment in segments
        if isinstance(segment.get("index"), int) and segment["index"] not in cache_by_index
    ]
    if not missing_segments:
        return []

    if strategy == "full":
        return missing_segments

    if strategy == "recommended":
        preferred: list[dict[str, Any]] = []
        if recommended_titles:
            for segment in missing_segments:
                title = str(segment.get("title") or "")
                if any(token and (token in title or title in token) for token in recommended_titles):
                    preferred.append(segment)
        if preferred:
            return preferred[:max_segments]

    return missing_segments[:max_segments]
