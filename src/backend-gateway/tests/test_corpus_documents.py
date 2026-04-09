# -*- coding: utf-8 -*-
import json

from core import corpus_documents


def test_iter_corpus_document_batches_yields_one_batch_per_file(tmp_path, monkeypatch):
    part1 = tmp_path / "kanripo_corpus.part01.json"
    part2 = tmp_path / "kanripo_corpus.part02.json"
    part1.write_text(json.dumps([{"id": "a"}, {"id": "b"}], ensure_ascii=False), encoding="utf-8")
    part2.write_text(json.dumps([{"id": "c"}], ensure_ascii=False), encoding="utf-8")

    monkeypatch.setattr(corpus_documents, "DATA_PATH", tmp_path / "kanripo_corpus.json")
    corpus_documents.load_corpus_documents.cache_clear()

    batches = list(corpus_documents.iter_corpus_document_batches())

    assert len(batches) == 2
    assert [item["id"] for item in batches[0]] == ["a", "b"]
    assert [item["id"] for item in batches[1]] == ["c"]
