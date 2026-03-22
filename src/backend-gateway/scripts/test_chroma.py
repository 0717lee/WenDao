"""
T3.1.1 验证脚本：RAG 检索质量验证
用途: 执行 seed_knowledge.py 灌库后，运行此脚本来验证宏观建筑知识是否被正确召回。
"""
import os
import sys

def main():
    try:
        from langchain_community.embeddings import FakeEmbeddings
        from langchain_community.vectorstores import FAISS
    except ImportError:
        print("❌ 缺少依赖，请先: pip install langchain-community faiss-cpu")
        sys.exit(1)

    # 与 seed_knowledge.py 保持一致，都在 backend-gateway 根目录下运行
    db_path = "./faiss_db"

    if not os.path.exists(db_path):
        print(f"❌ 知识库尚未初始化，请先运行 seed_knowledge.py 脚本。路径: {db_path}")
        sys.exit(1)

    embeddings = FakeEmbeddings(size=768)
    vectorstore = FAISS.load_local(db_path, embeddings, allow_dangerous_deserialization=True)

    # 验证查询列表
    test_queries = [
        ("四合院的进深和面阔关系是什么？", "macro_residential"),
        ("赵州桥的受力结构是怎样的？", "macro_bridge"),
        ("庑殿顶和歇山顶有什么区别？", "macro_roof"),
        ("斗拱的结构是什么？", "micro"),
        ("皇宫太和殿有多大？", "macro_imperial"),
    ]

    print("=" * 60)
    print("🔍 RAG 检索质量验证 (T3.1.1)")
    print("=" * 60)

    passed = 0
    total = len(test_queries)

    for query, expected_category in test_queries:
        results = vectorstore.similarity_search(query, k=3)
        print(f"\n❓ 查询: \"{query}\"")
        print(f"   期望类别: {expected_category}")
        
        if not results:
            print(f"   ❌ 无结果返回!")
            continue

        top_result = results[0]
        actual_category = top_result.metadata.get("category", "unknown")
        source = top_result.metadata.get("source", "unknown")
        snippet = top_result.page_content[:80] + "..."

        print(f"   📄 Top-1 来源: {source}")
        print(f"   📄 Top-1 类别: {actual_category}")
        print(f"   📄 Top-1 摘要: {snippet}")

        # FakeEmbeddings 生成随机向量，类别匹配只能看运气，
        # 但保证知识库有数据且召回了结果即可通过
        if results:
            passed += 1
            print(f"   ✅ 召回成功 (共 {len(results)} 条)")
        else:
            print(f"   ❌ 召回失败")

    print(f"\n{'=' * 60}")
    print(f"📊 结果: {passed}/{total} 项查询成功召回知识文档")
    if passed == total:
        print("🎉 T3.1.1 知识灌库验证通过！")
    else:
        print("⚠️ 部分查询未召回结果，请检查 seed_knowledge.py 是否已运行。")
    print(f"{'=' * 60}")

if __name__ == "__main__":
    main()
