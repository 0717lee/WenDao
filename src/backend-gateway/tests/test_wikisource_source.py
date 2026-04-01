# -*- coding: utf-8 -*-
"""Tests for the Wikisource supplement source adapter."""

from unittest.mock import patch

from core.wikisource_source import build_wikisource_record, search_wikisource_catalog


def test_search_wikisource_catalog_dedupes_root_titles():
    mock_payload = {
        "query": {
            "search": [
                {"title": "孟子"},
                {"title": "孟子/告子上"},
                {"title": "古文觀止"},
            ]
        }
    }

    with patch("core.wikisource_source._request_json", return_value=mock_payload):
        entries = search_wikisource_catalog("孟子", limit=5)

    assert entries[0]["repo_id"] == "WS:孟子"
    assert entries[1]["repo_id"] == "WS:古文觀止"
    assert len(entries) == 2


def test_search_wikisource_catalog_retries_with_traditional_query():
    mock_payloads = [
        {"query": {"search": []}},
        {"query": {"search": [{"title": "古文觀止"}]}},
    ]

    fake_converter = type("FakeConverter", (), {"convert": lambda self, text: "古文觀止"})

    with patch("core.wikisource_source.OpenCC", return_value=fake_converter()), \
         patch("core.wikisource_source._request_json", side_effect=mock_payloads):
        entries = search_wikisource_catalog("古文观止", limit=5)

    assert len(entries) == 1
    assert entries[0]["repo_id"] == "WS:古文觀止"


def test_build_wikisource_record_creates_segmented_document():
    def fake_request(params):
        if params.get("prop") == "revisions":
            return {
                "query": {
                    "pages": [
                        {
                            "revisions": [
                                {
                                    "slots": {
                                        "main": {
                                            "content": "*[[/學而第一|學而第一]]\n*[[/為政第二|為政第二]]"
                                        }
                                    }
                                }
                            ]
                        }
                    ]
                }
            }
        if params.get("prop") == "extracts" and params.get("titles") == "論語/學而第一":
            return {"query": {"pages": [{"extract": "註疏\n\n子曰：「學而時習之，不亦說乎？」"}]}}
        if params.get("prop") == "extracts" and params.get("titles") == "論語/為政第二":
            return {"query": {"pages": [{"extract": "註疏\n\n子曰：「為政以德，譬如北辰。」"}]}}
        raise AssertionError(f"Unexpected params: {params}")

    with patch("core.wikisource_source._request_json", side_effect=fake_request):
        record = build_wikisource_record({"page_title": "論語", "title": "《论语》"})

    assert record["repo_id"] == "WS:論語"
    assert record["source_name"] == "Wikisource"
    assert record["chapter_count"] == 2
    assert record["segment_guides"][0]["title"] == "學而第一"
    assert "學而時習之" in record["punctuated_text"]
