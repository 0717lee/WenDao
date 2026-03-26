#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
古文NLP检索质量验证脚本
测试jieba分词+智谱Embedding在古文上的检索质量
目标：recall@10 > 60%
"""
import os
import sys
import json
import argparse
import io
from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv()

# Add parent directory to path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from agents.rag import RAGAgent


def _configure_output_streams() -> None:
    """Fix Windows GBK issues without mutating streams during module import."""
    if sys.platform != "win32":
        return
    for name in ("stdout", "stderr"):
        stream = getattr(sys, name, None)
        buffer = getattr(stream, "buffer", None)
        if buffer is None:
            continue
        setattr(sys, name, io.TextIOWrapper(buffer, encoding="utf-8"))


def load_test_samples(samples_path: str) -> list:
    """加载测试样本"""
    with open(samples_path, 'r', encoding='utf-8') as f:
        return json.load(f)


def calculate_recall_at_k(retrieved_ids: list, relevant_ids: list, k: int = 10) -> float:
    """计算recall@k指标"""
    retrieved_set = set(retrieved_ids[:k])
    relevant_set = set(relevant_ids)
    
    if not relevant_set:
        return 0.0
    
    hits = len(retrieved_set & relevant_set)
    return hits / len(relevant_set)


def validate_nlp_quality(samples_path: str, verbose: bool = False, json_output: bool = False):
    """验证古文NLP检索质量"""
    # Load test samples
    samples = load_test_samples(samples_path)
    
    # Initialize RAG agent
    try:
        rag_agent = RAGAgent()
    except Exception as e:
        error_msg = f"Failed to initialize RAG agent: {e}"
        if json_output:
            print(json.dumps({"error": error_msg, "passed": False}))
        else:
            print(f"错误: {error_msg}")
        sys.exit(1)
    
    if not rag_agent.vectorstore:
        error_msg = "FAISS vectorstore not available"
        if json_output:
            print(json.dumps({"error": error_msg, "passed": False}))
        else:
            print("错误: FAISS向量库未加载")
        sys.exit(1)
    
    # Run validation
    total_hits = 0
    total_relevant = 0
    failed_queries = []
    
    for sample in samples:
        query = sample["query"]
        relevant_docs = sample["relevant_docs"]
        
        try:
            # Retrieve top-10 results
            results = rag_agent.vectorstore.similarity_search(query, k=10)
            retrieved_ids = []
            for i, doc in enumerate(results):
                if hasattr(doc, 'metadata') and isinstance(doc.metadata, dict):
                    doc_id = doc.metadata.get("id", f"doc_{i}")
                else:
                    doc_id = f"doc_{i}"
                retrieved_ids.append(doc_id)

            # Calculate recall@10
            recall = calculate_recall_at_k(retrieved_ids, relevant_docs, k=10)
            hits = int(recall * len(relevant_docs))
            
            total_hits += hits
            total_relevant += len(relevant_docs)
            
            if verbose:
                print(f"\nQuery: {query}")
                print(f"  Relevant docs: {relevant_docs}")
                print(f"  Retrieved (top-10): {retrieved_ids[:10]}")
                print(f"  Recall@10: {recall:.2%} ({hits}/{len(relevant_docs)})")
            
            if recall < 0.5:  # Less than 50% recall
                failed_queries.append({
                    "query": query,
                    "recall": recall,
                    "relevant": relevant_docs,
                    "retrieved": retrieved_ids[:10]
                })
        
        except Exception as e:
            if verbose:
                print(f"\nQuery failed: {query}")
                print(f"  Error: {e}")
            failed_queries.append({
                "query": query,
                "error": str(e)
            })
    
    # Calculate overall recall@10
    overall_recall = total_hits / total_relevant if total_relevant > 0 else 0.0
    passed = overall_recall > 0.6
    
    # Output results
    if json_output:
        result = {
            "recall_at_10": overall_recall,
            "passed": passed,
            "total_hits": total_hits,
            "total_relevant": total_relevant,
            "failed_queries": failed_queries
        }
        print(json.dumps(result, ensure_ascii=False, indent=2))
    else:
        print("\n" + "="*60)
        print("古文NLP检索质量验证报告")
        print("="*60)
        print(f"\n总体 Recall@10: {overall_recall:.2%} ({total_hits}/{total_relevant})")
        print(f"验收标准: > 60%")
        print(f"结果: {'✓ 通过' if passed else '✗ 未通过'}")
        
        if failed_queries:
            print(f"\n失败查询数: {len(failed_queries)}/{len(samples)}")
            if verbose:
                print("\n失败查询详情:")
                for fq in failed_queries:
                    print(f"  - {fq['query']}")
                    if 'recall' in fq:
                        print(f"    Recall: {fq['recall']:.2%}")
        
        if not passed:
            print("\n建议:")
            print("  1. 考虑切换到字符级Embedding")
            print("  2. 调整混合检索权重（增加BM25权重）")
            print("  3. 扩充自定义词典")
    
    return 0 if passed else 1


def main():
    _configure_output_streams()
    parser = argparse.ArgumentParser(description="验证古文NLP检索质量")
    parser.add_argument(
        "--samples",
        default=os.path.join(os.path.dirname(__file__), "..", "data", "ancient_test_samples.json"),
        help="测试样本文件路径"
    )
    parser.add_argument("--verbose", "-v", action="store_true", help="显示详细信息")
    parser.add_argument("--json", action="store_true", help="输出JSON格式结果")
    
    args = parser.parse_args()
    
    if not os.path.exists(args.samples):
        print(f"错误: 测试样本文件不存在: {args.samples}")
        sys.exit(1)
    
    sys.exit(validate_nlp_quality(args.samples, args.verbose, args.json))


if __name__ == "__main__":
    main()
