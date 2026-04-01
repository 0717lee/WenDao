# -*- coding: utf-8 -*-
"""Wikisource supplement source helpers for live catalog search and import."""

from __future__ import annotations

import json
import logging
import re
import urllib.parse
import urllib.request
import uuid
from typing import Any

try:
    from opencc import OpenCC
except ImportError:  # pragma: no cover - optional at runtime
    OpenCC = None  # type: ignore[assignment]

from core.document_segments import (
    build_featured_excerpt,
    build_original_text,
    build_segment_guides,
    enrich_segments,
)
from core.kanripo_source import get_converter, normalize_display_title


logger = logging.getLogger(__name__)

WIKISOURCE_API_URL = "https://zh.wikisource.org/w/api.php"
WIKISOURCE_BASE_URL = "https://zh.wikisource.org/wiki/"
WIKISOURCE_NAMESPACE = uuid.UUID("8ecb6f90-58dc-4a98-bc84-e1c8f0d57bf0")
USER_AGENT = "TextTwin/1.0 (student project; source adapter)"
RELATIVE_SUBPAGE_PATTERN = re.compile(r"\[\[/([^|\]#]+)(?:\|[^\]]*)?\]\]")

WIKISOURCE_CURATED_WORKS: list[dict[str, str]] = [
    {"page_title": "古文觀止", "title": "《古文观止》", "dynasty": "清", "author": "吴楚材、吴调侯", "category": "古文选本"},
    {"page_title": "荀子", "title": "《荀子》", "dynasty": "战国", "author": "荀况", "category": "诸子"},
    {"page_title": "韓非子", "title": "《韩非子》", "dynasty": "战国", "author": "韩非", "category": "诸子"},
    {"page_title": "戰國策", "title": "《战国策》", "dynasty": "西汉", "author": "刘向", "category": "史书"},
    {"page_title": "孫子兵法", "title": "《孙子兵法》", "dynasty": "春秋", "author": "孙武", "category": "兵书"},
    {"page_title": "文心雕龍", "title": "《文心雕龙》", "dynasty": "南朝梁", "author": "刘勰", "category": "文论"},
    {"page_title": "夢溪筆談", "title": "《梦溪笔谈》", "dynasty": "北宋", "author": "沈括", "category": "笔记"},
    {"page_title": "傳習錄", "title": "《传习录》", "dynasty": "明", "author": "王阳明", "category": "心学"},
]

WIKISOURCE_CURATED_BY_PAGE = {item["page_title"]: item for item in WIKISOURCE_CURATED_WORKS}


def _request_json(params: dict[str, str]) -> dict[str, Any]:
    url = f"{WIKISOURCE_API_URL}?{urllib.parse.urlencode(params)}"
    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(request, timeout=30) as response:
        return json.load(response)


def _normalize_page_title(title: str) -> str:
    return title.replace("_", " ").strip()


def _build_repo_id(page_title: str) -> str:
    return f"WS:{page_title}"


def _build_catalog_entry(page_title: str, metadata: dict[str, Any] | None = None) -> dict[str, Any]:
    metadata = metadata or {}
    converter = get_converter()
    display_title = metadata.get("title") or normalize_display_title(page_title, converter)
    return {
        "repo_id": _build_repo_id(page_title),
        "page_title": page_title,
        "title": display_title,
        "raw_title": page_title,
        "dynasty": metadata.get("dynasty"),
        "author": metadata.get("author"),
        "family": "维基文库",
        "section": "在线补源",
        "category": metadata.get("category") or "补充古籍",
        "is_primary_text": True,
        "source_backend": "wikisource",
    }


def search_wikisource_catalog(query: str, limit: int = 12) -> list[dict[str, Any]]:
    """Search Wikisource titles; empty query returns a curated supplement list."""
    if not query.strip():
        return [_build_catalog_entry(item["page_title"], item) for item in WIKISOURCE_CURATED_WORKS[:limit]]

    search_terms = [query.strip()]
    if OpenCC is not None:
        traditional_query = OpenCC("s2t").convert(query.strip())
        if traditional_query and traditional_query not in search_terms:
            search_terms.append(traditional_query)

    entries: list[dict[str, Any]] = []
    seen_roots: set[str] = set()
    for term in search_terms:
        payload = _request_json(
            {
                "action": "query",
                "list": "search",
                "srsearch": term,
                "srlimit": str(limit * 2),
                "format": "json",
                "formatversion": "2",
            }
        )
        search_results = payload.get("query", {}).get("search", [])
        for item in search_results:
            title = _normalize_page_title(str(item.get("title") or ""))
            if not title:
                continue
            root_title = title.split("/", 1)[0]
            if root_title in seen_roots:
                continue
            seen_roots.add(root_title)
            entries.append(_build_catalog_entry(root_title, WIKISOURCE_CURATED_BY_PAGE.get(root_title)))
            if len(entries) >= limit:
                return entries
        if entries:
            return entries
    return entries


def _fetch_wikitext(page_title: str) -> str:
    payload = _request_json(
        {
            "action": "query",
            "prop": "revisions",
            "titles": page_title,
            "rvprop": "content",
            "rvslots": "main",
            "format": "json",
            "formatversion": "2",
        }
    )
    pages = payload.get("query", {}).get("pages", [])
    if not pages or pages[0].get("missing"):
        return ""
    revisions = pages[0].get("revisions") or []
    if not revisions:
        return ""
    return str(revisions[0].get("slots", {}).get("main", {}).get("content") or "")


def _list_ordered_subpages(page_title: str) -> list[str]:
    wikitext = _fetch_wikitext(page_title)
    if not wikitext:
        return []

    ordered: list[str] = []
    seen: set[str] = set()
    for match in RELATIVE_SUBPAGE_PATTERN.finditer(wikitext):
        child_title = _normalize_page_title(match.group(1))
        if not child_title:
            continue
        if "/" in child_title:
            continue
        full_title = f"{page_title}/{child_title}"
        if full_title in seen:
            continue
        seen.add(full_title)
        ordered.append(full_title)

    non_overview = [item for item in ordered if not item.endswith("/全覽")]
    return non_overview or ordered


def _fetch_plain_text(page_title: str) -> str:
    payload = _request_json(
        {
            "action": "query",
            "prop": "extracts",
            "titles": page_title,
            "explaintext": "1",
            "format": "json",
            "formatversion": "2",
        }
    )
    pages = payload.get("query", {}).get("pages", [])
    if not pages or pages[0].get("missing"):
        return ""
    extract = str(pages[0].get("extract") or "")
    lines: list[str] = []
    for raw_line in extract.splitlines():
        line = re.sub(r"\s+", " ", raw_line).strip()
        if not line:
            continue
        if line in {"註疏", "姊妹计划", "编辑"}:
            continue
        lines.append(line)
    return "\n".join(lines).strip()


def _build_segments(page_title: str) -> list[dict[str, str]]:
    subpages = _list_ordered_subpages(page_title)
    if not subpages:
        text = _fetch_plain_text(page_title)
        return [{"title": page_title, "text": text}] if text else []

    segments: list[dict[str, str]] = []
    for full_title in subpages:
        short_title = full_title.split("/", 1)[1] if "/" in full_title else full_title
        text = _fetch_plain_text(full_title)
        if not text:
            continue
        segments.append({"title": short_title, "text": text})
    if segments:
        return segments

    full_view_text = _fetch_plain_text(f"{page_title}/全覽")
    return [{"title": page_title, "text": full_view_text}] if full_view_text else []


def build_wikisource_record(entry: dict[str, Any]) -> dict[str, Any]:
    """Build a normalized document record from a Wikisource title."""
    page_title = _normalize_page_title(
        str(entry.get("page_title") or str(entry.get("repo_id") or "").removeprefix("WS:") or entry.get("raw_title") or "")
    )
    if not page_title:
        raise ValueError("Wikisource page title is required")

    raw_segments = _build_segments(page_title)
    if not raw_segments:
        raise ValueError(f"Wikisource page '{page_title}' has no readable text")

    converter = get_converter()
    metadata = {
        **entry,
        "family": "维基文库",
        "section": "在线补源",
        "category": entry.get("category") or "补充古籍",
    }
    segments = enrich_segments(raw_segments, metadata)
    punctuated_text = "\n\n".join(segment["text"] for segment in raw_segments).strip()
    original_text = build_original_text(punctuated_text)
    chapter_titles = [segment["title"] for segment in segments]
    source_url = f"{WIKISOURCE_BASE_URL}{urllib.parse.quote(page_title.replace(' ', '_'))}"

    return {
        "id": str(uuid.uuid5(WIKISOURCE_NAMESPACE, page_title)),
        "repo_id": _build_repo_id(page_title),
        "title": entry.get("title") or normalize_display_title(page_title, converter),
        "author": entry.get("author"),
        "dynasty": entry.get("dynasty"),
        "category": entry.get("category") or "补充古籍",
        "family": "维基文库",
        "section": "在线补源",
        "source_name": "Wikisource",
        "source_url": source_url,
        "source_type": "corpus",
        "chapter_titles": chapter_titles,
        "chapter_count": len(chapter_titles),
        "featured_excerpt": build_featured_excerpt(segments),
        "difficulty": entry.get("difficulty"),
        "guide_summary": entry.get("guide_summary") or "这部作品来自维基文库补源，适合先按章节慢读，再决定是否继续扩展阅读。",
        "reading_tip": entry.get("reading_tip") or "建议先看前几节的分段导读摘要，再按需生成白话译，避免第一次就被整部大部头劝退。",
        "recommended_chapters": chapter_titles[:3],
        "segment_guides": build_segment_guides(segments),
        "segments": segments,
        "translation_cache": [],
        "translation_status": "none",
        "original_text": original_text,
        "punctuated_text": punctuated_text,
        "translated_text": "",
        "entity_ids": [],
    }
