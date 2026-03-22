"""
T3.4.2 · 月之暗面 Kimi (Moonshot) 长文 RAG 知识检索代理
──────────────────────────────────────────────────────────
结合本地 FAISS (真实 Embedding) 做向量检索后，将相关文档段交由
Kimi 的 32k 长上下文窗口生成通俗化的古建筑知识解读。
"""
import os, asyncio, logging
from typing import Dict, Any
from openai import OpenAI

logger = logging.getLogger(__name__)

SYSTEM_PROMPT = """你是"古籍智解"系统的知识讲解员。
你的任务是根据提供的古籍原文片段，用通俗易懂的现代中文为用户讲解古籍内容的含义、背景与历史。
回答应控制在 150 字以内，语言生动，适合阅读理解。
如果相关文档片段为空，请基于你自身的古籍知识回答。"""


class RAGAgent:
    """真实接入 Moonshot Kimi 的 RAG 知识代理"""

    def __init__(self):
        api_key = os.getenv("MOONSHOT_API_KEY", "")
        if not api_key:
            raise ValueError("MOONSHOT_API_KEY 未配置，请检查 .env 文件")
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
                print(f"[RAGAgent] EntityExtractor init failed: {e}")
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
                    print(f"[RAGAgent] 检索失败: {e}")

            # 2. 提取引用来源
            citations = []
            context_parts = []
            for doc in docs:
                context_parts.append(doc.page_content)
                metadata = getattr(doc, "metadata", {})
                if metadata.get("title") and metadata.get("source"):
                    citations.append({
                        "title": metadata["title"],
                        "source": metadata["source"]
                    })

            context = "\n---\n".join(context_parts) if context_parts else ""

            # 3. 构建prompt并调用Kimi
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
            print(f"[RAGAgent] 查询失败: {e}")
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
            from core.embeddings import TextTwinEmbeddings

            db_path = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "faiss_db"))

            cache_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".embedding_cache"))
            self.embeddings = TextTwinEmbeddings(cache_dir=cache_dir)

            index_file = os.path.join(db_path, "index.faiss")
            pkl_file = os.path.join(db_path, "index.pkl")

            if os.path.exists(index_file) and os.path.exists(pkl_file):
                # 用 Python IO 读取，避免 FAISS C++ 路径编码问题
                with open(index_file, "rb") as f:
                    index = faiss_lib.deserialize_index(np.frombuffer(f.read(), dtype=np.uint8))
                with open(pkl_file, "rb") as f:
                    docstore, index_to_docstore_id = pickle.load(f)
                self.vectorstore = FAISS(
                    embedding_function=self.embeddings,
                    index=index,
                    docstore=docstore,
                    index_to_docstore_id=index_to_docstore_id,
                )
                print("[RAGAgent] FAISS 知识库加载成功 (真实 Embedding)")
            else:
                print(f"[RAGAgent] FAISS 索引文件不存在: {db_path}，将使用纯 LLM 模式")
                self.vectorstore = None

        except Exception as e:
            print(f"[RAGAgent] 向量库加载失败，将使用纯 LLM 模式: {e}")
            self.vectorstore = None

    def _retrieve_context(self, query: str, k: int = 3) -> str:
        """从 FAISS 检索最相关的文档片段"""
        if getattr(self, "vectorstore", None) is None:
            return ""
        try:
            docs = self.vectorstore.similarity_search(query, k=k)
            return "\n---\n".join([doc.page_content for doc in docs]) if docs else ""
        except Exception as e:
            print(f"[RAGAgent] 检索失败: {e}")
            return ""

    async def query_knowledge(self, intent_data: Dict[str, Any], original_text: str) -> str:
        """检索知识库 + Kimi 生成解读"""
        loop = asyncio.get_event_loop()
        result = await loop.run_in_executor(
            None, self._call_kimi, intent_data, original_text
        )
        return result

    def _call_kimi(self, intent_data: Dict[str, Any], original_text: str) -> str:
        """同步调用 Moonshot Kimi API"""
        # 1. 先从本地向量库检索相关段落
        context = self._retrieve_context(original_text)

        action = intent_data.get("action", "idle")
        action_desc = {
            "explode": "用户要求拆解查看构件结构",
            "stress": "用户要求查看应力受力分析",
            "idle": "用户在进行一般性提问"
        }.get(action, "一般性提问")

        user_prompt = f"""用户提问：{original_text}
当前场景动作：{action_desc}

以下是从《营造法式》知识库检索到的相关原文片段：
{context if context else "（未检索到相关原文，请基于自身知识回答）"}

请基于上述信息，为用户生成一段通俗易懂的讲解。"""

        try:
            response = self.client.chat.completions.create(
                model="moonshot-v1-8k",
                messages=[
                    {"role": "system", "content": SYSTEM_PROMPT},
                    {"role": "user", "content": user_prompt}
                ],
                temperature=0.7,
                max_tokens=300
            )
            return response.choices[0].message.content.strip()
        except Exception as e:
            logger.info("[降级] RAGAgent: Kimi-8k → 静态兜底回复, reason: %s", str(e))
            # 降级返回
            return f'抱歉，知识检索服务暂时不可用。您询问的是关于"{original_text}"的问题，请稍后再试。'
