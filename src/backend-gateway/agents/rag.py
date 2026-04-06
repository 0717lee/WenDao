"""
T3.4.2 · 月之暗面 Kimi (Moonshot) 长文 RAG 知识检索代理
──────────────────────────────────────────────────────────
结合本地 FAISS (真实 Embedding) 做向量检索后，将相关文档段交由
Kimi 生成通俗化的古籍知识解读。
"""
import json
import logging
import os
from pathlib import Path
from typing import Dict, Any
from openai import OpenAI

logger = logging.getLogger(__name__)
INDEX_METADATA_FILE = "index.meta.json"

SYSTEM_PROMPT = """你是"古籍智解"系统的知识讲解员。
你的任务是根据提供的古籍原文片段，用通俗易懂的现代中文为用户讲解古籍内容的含义、背景与历史。
回答应控制在 150 字以内，语言生动，适合阅读理解。
如果相关文档片段为空，请基于你自身的古籍知识回答。"""


def _load_index_metadata(db_path: Path) -> dict[str, Any] | None:
    metadata_path = db_path / INDEX_METADATA_FILE
    if not metadata_path.exists():
        return None
    try:
        return json.loads(metadata_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        logger.warning("[RAGAgent] 索引元数据读取失败: %s", exc)
        return None


def inspect_faiss_index_compatibility() -> dict[str, Any]:
    from core.embeddings import WenDaoEmbeddings

    db_path = Path(os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "faiss_db")))
    index_file = db_path / "index.faiss"
    pkl_file = db_path / "index.pkl"
    metadata = _load_index_metadata(db_path)

    if not index_file.exists() or not pkl_file.exists():
        return {"status": "missing_index", "db_path": str(db_path)}

    if metadata is None:
        return {"status": "missing_metadata", "db_path": str(db_path)}

    expected_backend = metadata.get("embedding_backend")
    cache_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".embedding_cache"))
    try:
        embeddings = WenDaoEmbeddings(
            cache_dir=cache_dir,
            preferred_backend=expected_backend,
            strict_backend=bool(expected_backend),
        )
    except RuntimeError as exc:
        return {
            "status": "backend_unavailable",
            "db_path": str(db_path),
            "expected_backend": expected_backend,
            "reason": str(exc),
        }

    if embeddings.active_backend != expected_backend:
        return {
            "status": "backend_mismatch",
            "db_path": str(db_path),
            "expected_backend": expected_backend,
            "active_backend": embeddings.active_backend,
        }

    return {
        "status": "ok",
        "db_path": str(db_path),
        "expected_backend": expected_backend,
        "active_backend": embeddings.active_backend,
    }


class RAGAgent:
    """真实接入 Moonshot Kimi 的 RAG 知识代理"""

    def __init__(self):
        api_key = os.getenv("MOONSHOT_API_KEY", "")
        if not api_key:
            logger.warning("MOONSHOT_API_KEY 未配置，RAG功能将降级")
            self.client = None
        else:
            self.client = OpenAI(
                api_key=api_key,
                base_url="https://api.moonshot.cn/v1"
            )
        self._init_vectorstore()
        self._entity_extractor = None

    @property
    def entity_extractor(self):
        """Lazy-load EntityExtractor to avoid init failure if graph data missing."""
        if self._entity_extractor is None:
            try:
                from core.entity_extractor import EntityExtractor
                self._entity_extractor = EntityExtractor()
            except Exception as e:
                logger.warning("[RAGAgent] EntityExtractor init failed: %s", e)
                self._entity_extractor = None
        return self._entity_extractor

    def query_ancient_text(self, user_query: str) -> dict:
        """
        查询古籍知识并返回带引用的回答

        Args:
            user_query: 用户查询文本

        Returns:
            dict: {"answer": str, "citations": [{"title": str, "source": str}]}
        """
        try:
            # 1. 从向量库检索相关文档
            docs = []
            if getattr(self, "vectorstore", None) is not None:
                try:
                    docs = self.vectorstore.similarity_search(user_query, k=3)
                except Exception as e:
                    logger.warning("[RAGAgent] 检索失败: %s", e)

            # 2. 提取引用来源
            citations = []
            context_parts = []
            for doc in docs:
                context_parts.append(doc.page_content)
                metadata = getattr(doc, "metadata", {})
                if metadata.get("title") and metadata.get("source"):
                    citations.append({
                        "title": metadata["title"],
                        "source": metadata["source"],
                        "excerpt": doc.page_content[:120],
                    })

            context = "\n---\n".join(context_parts) if context_parts else ""

            # 3. 构建prompt并调用Kimi
            if self.client is None:
                return {
                    "answer": "RAG功能暂时不可用（缺少API密钥），请联系管理员配置MOONSHOT_API_KEY",
                    "citations": citations,
                    "related_entities": []
                }

            user_prompt = f"""用户提问：{user_query}

以下是从古籍知识库检索到的相关原文片段：
{context if context else "（未检索到相关原文，请基于自身知识回答）"}

请基于上述信息，为用户生成一段通俗易懂的讲解。"""

            response = self.client.chat.completions.create(
                model="moonshot-v1-8k",
                messages=[
                    {"role": "system", "content": SYSTEM_PROMPT},
                    {"role": "user", "content": user_prompt}
                ],
                temperature=0.7,
                max_tokens=300
            )

            answer = response.choices[0].message.content.strip()

            # Extract related entities from retrieved docs and query
            related_entities = self._extract_related_entities(docs, user_query)

            return {
                "answer": answer,
                "citations": citations,
                "related_entities": related_entities,
            }

        except Exception as e:
            logger.exception("[RAGAgent] 查询失败: %s", e)
            return {
                "answer": f'抱歉，知识检索服务暂时不可用。您询问的是关于"{user_query}"的问题，请稍后再试。',
                "citations": [],
                "related_entities": [],
            }

    def _extract_related_entities(self, docs, user_query: str) -> list:
        """Extract entity IDs from retrieved docs and user query."""
        if self.entity_extractor is None:
            return []
        entity_ids = set()
        for doc in docs:
            extracted = self.entity_extractor.extract_entities(doc.page_content)
            entity_ids.update(extracted)
        query_entities = self.entity_extractor.extract_entities(user_query)
        entity_ids.update(query_entities)
        return list(entity_ids)

    def _init_vectorstore(self):
        """加载本地 FAISS 向量库（使用真实 Embedding）"""
        try:
            import pickle, faiss as faiss_lib, numpy as np
            from langchain_community.vectorstores import FAISS
            from langchain_community.docstore.in_memory import InMemoryDocstore
            from core.embeddings import WenDaoEmbeddings

            db_path = Path(os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "faiss_db")))
            metadata = _load_index_metadata(db_path)
            expected_backend = metadata.get("embedding_backend") if metadata else None

            cache_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".embedding_cache"))
            try:
                self.embeddings = WenDaoEmbeddings(
                    cache_dir=cache_dir,
                    preferred_backend=expected_backend,
                    strict_backend=bool(expected_backend),
                )
            except RuntimeError as exc:
                logger.warning(
                    "[RAGAgent] FAISS 索引需要 embedding backend %s，但当前环境不可用：%s；将使用纯 LLM 模式",
                    expected_backend,
                    exc,
                )
                self.vectorstore = None
                return

            if metadata is None:
                logger.warning("[RAGAgent] FAISS 索引缺少 index.meta.json，已禁用向量检索，请先重建索引")
                self.vectorstore = None
                return
            elif self.embeddings.active_backend != expected_backend:
                logger.warning(
                    "[RAGAgent] 当前 embedding 后端 %s 与索引记录 %s 不一致，将使用纯 LLM 模式",
                    self.embeddings.active_backend,
                    expected_backend,
                )
                self.vectorstore = None
                return

            index_file = db_path / "index.faiss"
            pkl_file = db_path / "index.pkl"

            if os.path.exists(index_file) and os.path.exists(pkl_file):
                # 用 Python IO 读取，避免 FAISS C++ 路径编码问题
                with open(index_file, "rb") as f:
                    index = faiss_lib.deserialize_index(np.frombuffer(f.read(), dtype=np.uint8))
                if metadata and metadata.get("embedding_dim") and metadata["embedding_dim"] != index.d:
                    logger.warning(
                        "[RAGAgent] FAISS 维度 %s 与元数据记录 %s 不一致，将使用纯 LLM 模式",
                        index.d,
                        metadata["embedding_dim"],
                    )
                    self.vectorstore = None
                    return
                with open(pkl_file, "rb") as f:
                    docstore, index_to_docstore_id = pickle.load(f)
                self.vectorstore = FAISS(
                    embedding_function=self.embeddings,
                    index=index,
                    docstore=docstore,
                    index_to_docstore_id=index_to_docstore_id,
                )
                logger.info(
                    "[RAGAgent] FAISS 知识库加载成功 (embedding=%s)",
                    self.embeddings.active_backend or "unknown",
                )
            else:
                logger.warning("[RAGAgent] FAISS 索引文件不存在: %s，将使用纯 LLM 模式", db_path)
                self.vectorstore = None

        except Exception as e:
            logger.warning("[RAGAgent] 向量库加载失败，将使用纯 LLM 模式: %s", e)
            self.vectorstore = None

    def _retrieve_context(self, query: str, k: int = 3) -> str:
        """从 FAISS 检索最相关的文档片段"""
        if getattr(self, "vectorstore", None) is None:
            return ""
        try:
            docs = self.vectorstore.similarity_search(query, k=k)
            return "\n---\n".join([doc.page_content for doc in docs]) if docs else ""
        except Exception as e:
            logger.warning("[RAGAgent] 检索失败: %s", e)
            return ""
