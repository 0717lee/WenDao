#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
重建 100 部古籍主库专用 FAISS 索引。

与 `rebuild_ancient_index.py` 不同，这个脚本面向线上实际产品检索：
- 数据源：本地 100 部古籍快照
- 粒度：段落 / 章节级
- 输出目录：faiss_db_corpus
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

from dotenv import load_dotenv
from langchain_community.vectorstores import FAISS
from langchain_core.documents import Document

load_dotenv()
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from core.corpus_documents import load_corpus_documents
from core.embeddings import WenDaoEmbeddings
from core.kanripo_source import CURATED_WORKS

MAX_SEGMENT_BODY_LENGTH = 320
MAX_FALLBACK_BODY_LENGTH = 420


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="重建 100 部古籍专用 FAISS 索引")
    parser.add_argument(
        "--backend",
        default=os.getenv("REBUILD_CORPUS_FAISS_BACKEND", "sklearn"),
        help="指定索引构建使用的 embedding backend，默认 sklearn",
    )
    parser.add_argument(
        "--strict",
        action="store_true",
        help="如果指定 backend 不可用则直接失败",
    )
    parser.add_argument(
        "--output-dir",
        default=os.getenv("REBUILD_CORPUS_FAISS_OUTPUT", "faiss_db_corpus"),
        help="索引输出目录，相对 backend 根目录",
    )
    return parser.parse_args()


def _format_segment_title(raw_title: str | None, index: int) -> str:
    title = (raw_title or "").strip()
    if not title:
        return f"第{index + 1}段"
    return title


def build_corpus_segment_documents() -> tuple[list[Document], int]:
    curated_repo_ids = {str(item.get("repo_id")) for item in CURATED_WORKS}
    corpus_documents = [
        item for item in load_corpus_documents()
        if str(item.get("repo_id") or "") in curated_repo_ids
    ]

    vector_docs: list[Document] = []
    for corpus_doc in corpus_documents:
        title = str(corpus_doc.get("title") or "")
        repo_id = str(corpus_doc.get("repo_id") or "")
        source_name = str(corpus_doc.get("source_name") or "Kanripo")
        category = str(corpus_doc.get("category") or "")
        dynasty = str(corpus_doc.get("dynasty") or "")
        author = str(corpus_doc.get("author") or "")
        segments = corpus_doc.get("segments") or []

        if not isinstance(segments, list) or not segments:
            fallback_text = str(corpus_doc.get("punctuated_text") or corpus_doc.get("original_text") or "").strip()
            if not fallback_text:
                continue
            excerpt = fallback_text[:120]
            vector_docs.append(
                Document(
                    page_content="\n".join(part for part in [title, excerpt, fallback_text[:MAX_FALLBACK_BODY_LENGTH]] if part),
                    metadata={
                        "id": f"{corpus_doc['id']}:0",
                        "document_id": str(corpus_doc["id"]),
                        "repo_id": repo_id,
                        "title": title,
                        "source": f"{source_name} · 全文",
                        "source_name": source_name,
                        "category": category,
                        "dynasty": dynasty,
                        "author": author,
                        "segment_title": "全文",
                        "segment_index": 0,
                        "anchor_text": excerpt,
                    },
                )
            )
            continue

        for index, segment in enumerate(segments):
            segment_title = _format_segment_title(segment.get("title"), index)
            segment_text = str(segment.get("text") or "").strip()
            segment_excerpt = str(segment.get("excerpt") or "").strip() or segment_text[:120]
            segment_summary = str(segment.get("summary") or "").strip()
            segment_body = segment_text[:MAX_SEGMENT_BODY_LENGTH]

            if not segment_text:
                continue

            page_content = "\n".join(
                part
                for part in [
                    title,
                    segment_title,
                    segment_excerpt,
                    segment_summary,
                    segment_body,
                ]
                if part
            )
            vector_docs.append(
                Document(
                    page_content=page_content,
                    metadata={
                        "id": f"{corpus_doc['id']}:{index}",
                        "document_id": str(corpus_doc["id"]),
                        "repo_id": repo_id,
                        "title": title,
                        "source": f"{source_name} · {segment_title}",
                        "source_name": source_name,
                        "category": category,
                        "dynasty": dynasty,
                        "author": author,
                        "segment_title": segment_title,
                        "segment_index": index,
                        "anchor_text": segment_excerpt,
                    },
                )
            )

    return vector_docs, len(corpus_documents)


def save_faiss_vectorstore(vectorstore: FAISS, output_dir: Path, metadata: dict[str, object]) -> None:
    import faiss
    import numpy as np
    import pickle

    output_dir.mkdir(parents=True, exist_ok=True)

    index_bytes = faiss.serialize_index(vectorstore.index)
    with open(output_dir / "index.faiss", "wb") as faiss_file:
        faiss_file.write(index_bytes)

    with open(output_dir / "index.pkl", "wb") as pickle_file:
        pickle.dump((vectorstore.docstore, vectorstore.index_to_docstore_id), pickle_file)

    (output_dir / "index.meta.json").write_text(
        json.dumps(metadata, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )


def main() -> int:
    args = parse_args()
    backend_root = Path(__file__).resolve().parents[1]
    output_dir = backend_root / args.output_dir

    print("=" * 60)
    print("重建 100 部古籍专用 FAISS 索引")
    print("=" * 60)

    print("\n[1/3] 加载古籍主库快照...")
    vector_docs, corpus_doc_count = build_corpus_segment_documents()
    if not vector_docs:
        print("  [ERROR] 没有可用于构建索引的主库段落")
        return 1
    print(f"  [OK] 主库文档数: {corpus_doc_count}")
    print(f"  [OK] 索引段落数: {len(vector_docs)}")

    print("\n[2/3] 初始化 Embedding...")
    try:
        embeddings = WenDaoEmbeddings(
            preferred_backend=args.backend,
            strict_backend=args.strict or bool(args.backend),
        )
    except Exception as exc:
        print(f"  [ERROR] Embedding 初始化失败: {exc}")
        return 1
    print(f"  [OK] 目标后端: {args.backend}，实际后端: {embeddings.active_backend}")

    print("\n[3/3] 构建并保存 FAISS...")
    try:
        vectorstore = FAISS.from_documents(vector_docs, embeddings)
        save_faiss_vectorstore(
            vectorstore,
            output_dir,
            {
                "embedding_backend": embeddings.active_backend,
                "embedding_dim": int(vectorstore.index.d),
                "created_at": datetime.now(timezone.utc).isoformat(),
                "document_count": corpus_doc_count,
                "segment_count": len(vector_docs),
                "index_scope": "curated_corpus_100",
                "index_granularity": "segment",
            },
        )
    except Exception as exc:
        print(f"  [ERROR] FAISS 构建失败: {exc}")
        return 1

    print(f"  [OK] 已写入 {output_dir}")
    print("\n完成。")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
