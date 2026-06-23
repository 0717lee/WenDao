"""
T3.4.2 · 月之暗面 Kimi (Moonshot) 长文 RAG 知识检索代理
──────────────────────────────────────────────────────────
结合本地 FAISS (真实 Embedding) 做向量检索后，将相关文档段交由
Kimi 生成通俗化的古籍知识解读。
"""
import json
import logging
import os
import re
from pathlib import Path
from typing import Dict, Any
from openai import OpenAI
import jieba
from core.runtime_checks import get_zhipu_api_key

logger = logging.getLogger(__name__)
INDEX_METADATA_FILE = "index.meta.json"
DEFAULT_CORPUS_INDEX_DIR = "faiss_db_corpus"
LEGACY_INDEX_DIR = "faiss_db"
RAG_NORMALIZE_PATTERN = re.compile(r"[\s，。！？；：、“”‘’「」『』（）()《》〈〉【】〔〕—…·,.!?:;\"'\-]+")
RAG_NOISE_TERMS = {"什么", "为何", "为什么", "如何", "怎么", "怎样", "到底", "请", "请问", "一下", "有关", "相关", "解释", "说明"}

SYSTEM_PROMPT = """你是"古籍智解"系统的知识讲解员。
你的任务是直接回答用户真正想问的问题，用通俗易懂、简洁、贴近初学者的现代中文解释古籍内容。
不要先罗列出处，不要复述检索到的原文，不要为了显示依据而堆砌书名或引文标签，除非用户明确要求。
回答尽量控制在 150 字以内，先说核心意思，再补一句背景或下一步建议。
如果检索片段和用户问题明显不相关，请忽略无关片段，优先直接回答用户真正的问题，不要硬套上下文。
如果用户问题过于笼统、缺少原句或明确对象，请先提示用户补一句原文、篇名、人物或典故线索。"""

RAG_PROVIDER_CONFIGS = {
    "moonshot": {
        "api_key_env": "MOONSHOT_API_KEY",
        "base_url": "https://api.moonshot.cn/v1",
        "model_env": "RAG_MOONSHOT_MODEL",
        "default_model": "moonshot-v1-8k",
    },
    "kimi": {
        "api_key_env": "MOONSHOT_API_KEY",
        "base_url": "https://api.moonshot.cn/v1",
        "model_env": "RAG_MOONSHOT_MODEL",
        "default_model": "moonshot-v1-8k",
    },
    "deepseek": {
        "api_key_env": "DEEPSEEK_API_KEY",
        "base_url": "https://api.deepseek.com",
        "model_env": "RAG_DEEPSEEK_MODEL",
        "default_model": "deepseek-chat",
    },
    "zhipu": {
        "api_key_env": "ZHIPUAI_API_KEY",
        "base_url": "https://open.bigmodel.cn/api/paas/v4",
        "model_env": "RAG_ZHIPU_MODEL",
        "default_model": "glm-4-flash",
    },
}


def _resolve_rag_provider_config() -> tuple[str, dict[str, str]]:
    requested = (os.getenv("RAG_PROVIDER") or "moonshot").strip().lower()
    if requested not in RAG_PROVIDER_CONFIGS:
        logger.warning("Unsupported RAG_PROVIDER=%s, fallback to moonshot", requested)
        requested = "moonshot"
    provider = "moonshot" if requested == "kimi" else requested
    config = RAG_PROVIDER_CONFIGS[requested]
    model = os.getenv(config["model_env"], config["default_model"])
    return provider, {**config, "model": model}


def _load_index_metadata(db_path: Path) -> dict[str, Any] | None:
    metadata_path = db_path / INDEX_METADATA_FILE
    if not metadata_path.exists():
        return None
    try:
        return json.loads(metadata_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        logger.warning("[RAGAgent] 索引元数据读取失败: %s", exc)
        return None


def _resolve_faiss_db_path() -> Path:
    base_dir = Path(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
    if (base_dir / "index.faiss").exists() and (base_dir / "index.pkl").exists():
        return base_dir
    explicit_dir = (os.getenv("FAISS_DB_DIR") or "").strip()
    candidates = [explicit_dir] if explicit_dir else [DEFAULT_CORPUS_INDEX_DIR, LEGACY_INDEX_DIR]

    for dirname in candidates:
        if not dirname:
            continue
        candidate = base_dir / dirname
        if (candidate / "index.faiss").exists() and (candidate / "index.pkl").exists():
            return candidate

    return base_dir / (explicit_dir or DEFAULT_CORPUS_INDEX_DIR)


def _normalize_rag_text(value: str) -> str:
    return RAG_NORMALIZE_PATTERN.sub("", value or "").lower()


def _extract_query_terms(query: str) -> list[str]:
    terms: list[str] = []
    for token in jieba.cut(query):
        cleaned = _normalize_rag_text(token)
        if not cleaned or cleaned in RAG_NOISE_TERMS:
            continue
        if token.strip() not in terms:
            terms.append(token.strip())
    return terms or [query.strip()]


def _doc_matches_query(doc: Any, query_terms: list[str]) -> bool:
    text = getattr(doc, "page_content", "") or ""
    metadata = getattr(doc, "metadata", {}) or {}
    haystack = "\n".join([text, str(metadata.get("title") or ""), str(metadata.get("source") or "")])
    normalized_haystack = _normalize_rag_text(haystack)
    for term in query_terms:
        normalized_term = _normalize_rag_text(term)
        if not normalized_term:
            continue
        if term in haystack or normalized_term in normalized_haystack:
            return True
    return False


def inspect_faiss_index_compatibility() -> dict[str, Any]:
    from core.embeddings import embedding_backend_available

    db_path = _resolve_faiss_db_path()
    index_file = db_path / "index.faiss"
    pkl_file = db_path / "index.pkl"
    metadata = _load_index_metadata(db_path)

    if not index_file.exists() or not pkl_file.exists():
        return {"status": "missing_index", "db_path": str(db_path)}

    if metadata is None:
        return {"status": "missing_metadata", "db_path": str(db_path)}

    expected_backend = metadata.get("embedding_backend")
    if not expected_backend:
        return {
            "status": "invalid_metadata",
            "db_path": str(db_path),
            "reason": "index.meta.json missing embedding_backend",
        }

    backend_available, reason = embedding_backend_available(expected_backend)
    if not backend_available:
        return {
            "status": "backend_unavailable",
            "db_path": str(db_path),
            "expected_backend": expected_backend,
            "reason": reason,
        }

    return {
        "status": "ok",
        "db_path": str(db_path),
        "expected_backend": expected_backend,
        "active_backend": expected_backend,
    }


class RAGAgent:
    """真实接入可配置 OpenAI 兼容 LLM 的 RAG 知识代理"""

    def __init__(self):
        self.provider, provider_config = _resolve_rag_provider_config()
        self.model = provider_config["model"]
        if provider_config["api_key_env"] == "ZHIPUAI_API_KEY":
            api_key = get_zhipu_api_key()
        else:
            api_key = os.getenv(provider_config["api_key_env"], "")
        if not api_key:
            logger.warning("%s 未配置，RAG功能将降级", provider_config["api_key_env"])
            self.client = None
        else:
            self.client = OpenAI(
                api_key=api_key,
                base_url=provider_config["base_url"]
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

    def query_ancient_text(self, user_query: str, include_related_entities: bool = True) -> dict:
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
                    query_terms = _extract_query_terms(user_query)
                    grounded_docs = [doc for doc in docs if _doc_matches_query(doc, query_terms)]
                    if grounded_docs:
                        docs = grounded_docs
                    elif query_terms:
                        logger.info("[RAGAgent] 检索结果与问题词面关联较弱，改为直接回答: %s", user_query)
                        docs = []
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
                    "answer": "RAG功能暂时不可用（缺少API密钥），请联系管理员配置对应的LLM API Key",
                    "citations": citations,
                    "related_entities": []
                }

            user_prompt = f"""用户提问：{user_query}

以下是从古籍知识库检索到的相关原文片段：
{context if context else "（未检索到相关原文，请基于自身知识回答）"}

请基于上述信息，为用户生成一段通俗易懂的讲解。"""

            response = self.client.chat.completions.create(
                model=self.model,
                messages=[
                    {"role": "system", "content": SYSTEM_PROMPT},
                    {"role": "user", "content": user_prompt}
                ],
                temperature=0.5,
                max_tokens=180
            )

            answer = response.choices[0].message.content.strip()

            # Extract related entities from retrieved docs and query
            related_entities = self._extract_related_entities(docs, user_query) if include_related_entities else []

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
            extracted = self.entity_extractor.extract_entities_fast(doc.page_content)
            entity_ids.update(extracted)
        query_entities = self.entity_extractor.extract_entities_fast(user_query)
        entity_ids.update(query_entities)
        return list(entity_ids)

    def _init_vectorstore(self):
        """加载本地 FAISS 向量库（使用真实 Embedding）"""
        try:
            import pickle, faiss as faiss_lib, numpy as np
            from langchain_community.vectorstores import FAISS
            from langchain_community.docstore.in_memory import InMemoryDocstore
            from core.embeddings import WenDaoEmbeddings

            db_path = _resolve_faiss_db_path()
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
