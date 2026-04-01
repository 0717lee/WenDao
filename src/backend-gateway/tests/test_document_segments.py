# -*- coding: utf-8 -*-
"""Tests for shared segment enrichment and translation-cache helpers."""

from core.document_segments import (
    build_translated_text,
    enrich_segments,
    get_translation_progress,
    merge_translation_cache,
    pick_translation_segments,
)


def test_enrich_segments_adds_excerpt_and_summary():
    segments = enrich_segments(
        [
            {"title": "学而第一", "text": "学而时习之，不亦说乎？有朋自远方来，不亦乐乎？"},
            {"title": "为政第二", "text": "道之以政，齐之以刑，民免而无耻。"},
        ],
        {"category": "四书"},
    )

    assert segments[0]["excerpt"].startswith("学而时习之")
    assert "核心词" in segments[0]["summary"] or "主线" in segments[0]["summary"] or "论述" in segments[0]["summary"]
    assert segments[1]["index"] == 1


def test_pick_translation_segments_prefers_recommended_titles():
    segments = enrich_segments(
        [
            {"title": "学而第一", "text": "学而时习之，不亦说乎？"},
            {"title": "为政第二", "text": "为政以德，譬如北辰。"},
            {"title": "八佾第三", "text": "人而不仁，如礼何？"},
        ]
    )

    selected = pick_translation_segments(
        segments,
        translation_cache=[],
        strategy="recommended",
        recommended_titles=["为政"],
        max_segments=2,
    )

    assert len(selected) == 1
    assert selected[0]["title"] == "为政第二"


def test_merge_translation_cache_and_build_full_text():
    segments = enrich_segments(
        [
            {"title": "学而第一", "text": "学而时习之，不亦说乎？"},
            {"title": "为政第二", "text": "为政以德，譬如北辰。"},
        ]
    )
    cache = merge_translation_cache(
        [],
        [
            {"segment_index": 0, "title": "学而第一", "translated": "学习之后经常复习，不也是快乐的吗？"},
            {"segment_index": 1, "title": "为政第二", "translated": "用德行治理政事，就像北极星那样稳定。"},
        ],
    )

    translated_text = build_translated_text(segments, cache)
    progress = get_translation_progress(segments, cache)

    assert "学习之后经常复习" in translated_text
    assert "北极星" in translated_text
    assert progress["translated_segments"] == 2
    assert progress["is_complete"] is True
