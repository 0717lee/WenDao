"""
自定义 Embedding 适配器
优先级链：智谱 API → fastembed (ONNX) → HuggingFace 推理 API → sklearn 兜底
带磁盘缓存，避免重复计算与 API 调用
"""

import os
import json
import math
import time
import hashlib
import logging
from typing import List, Optional
from pathlib import Path

import httpx
from langchain_core.embeddings import Embeddings

logger = logging.getLogger(__name__)

EMBED_DIM = 384  # 统一输出维度 (与 MiniLM-L12-v2 一致)


class WenDaoEmbeddings(Embeddings):
    """带缓存的多后端 Embedding 适配器"""

    def __init__(self, cache_dir: str = ".embedding_cache"):
        self.cache_dir = Path(cache_dir)
        self.cache_dir.mkdir(exist_ok=True)
        self._backends: list[str] = []
        self._zhipu_key: Optional[str] = None
        self._fastembed_model = None
        self._active_backend: Optional[str] = None
        self._init_backends()

    def _init_backends(self):
        """发现所有可用的 Embedding 后端"""
        # 方案 1: 智谱 API (embedding-3, 可配置维度)
        zhipu_key = os.getenv("ZHIPUAI_API_KEY", "")
        if zhipu_key:
            self._zhipu_key = zhipu_key
            self._backends.append("zhipuai")

        # 方案 2: fastembed (ONNX Runtime, 无需 PyTorch)
        try:
            from fastembed import TextEmbedding
            self._fastembed_model = TextEmbedding(
                "sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2"
            )
            self._backends.append("fastembed")
        except Exception as e:
            logger.info(f"[Embedding] fastembed 不可用: {e}")

        # 方案 3: HuggingFace 推理 API (需要 Token)
        hf_token = os.getenv("HF_TOKEN") or os.getenv("HUGGINGFACE_API_TOKEN", "")
        if hf_token:
            self._hf_token = hf_token
            self._backends.append("hf_inference")
        else:
            self._hf_token = None

        # 方案 4: sklearn 纯 Python 兜底 (基于 jieba 分词 + TF-IDF 哈希)
        # 始终可用，无需模型下载或外部 API
        self._backends.append("sklearn")

        self._active_backend = self._backends[0]
        logger.info(f"[Embedding] 可用后端: {self._backends}, 当前使用: {self._active_backend}")

    # ── 缓存 ──────────────────────────────────────────────

    def _cache_key(self, text: str) -> str:
        prefix = self._active_backend or "unknown"
        return hashlib.md5(f"{prefix}:{text}".encode("utf-8")).hexdigest()

    def _load_cache(self, key: str) -> list | None:
        path = self.cache_dir / f"{key}.json"
        if path.exists():
            return json.loads(path.read_text(encoding="utf-8"))
        return None

    def _save_cache(self, key: str, vec: list):
        path = self.cache_dir / f"{key}.json"
        path.write_text(json.dumps(vec), encoding="utf-8")

    # ── 后端实现 ──────────────────────────────────────────

    def _embed_zhipuai(self, texts: List[str]) -> List[List[float]]:
        """调用智谱 embedding-3 API，带重试"""
        import jwt

        api_key = self._zhipu_key
        key_id, secret = api_key.split(".")

        payload = {
            "api_key": key_id,
            "exp": int(time.time()) + 3600,
            "timestamp": int(time.time()),
        }
        token = jwt.encode(payload, secret, algorithm="HS256",
                           headers={"alg": "HS256", "sign_type": "SIGN"})

        results = []
        batch_size = 16
        for i in range(0, len(texts), batch_size):
            batch = texts[i:i + batch_size]

            for attempt in range(3):
                try:
                    resp = httpx.post(
                        "https://open.bigmodel.cn/api/paas/v4/embeddings",
                        headers={"Authorization": f"Bearer {token}"},
                        json={"model": "embedding-3", "input": batch,
                              "dimensions": EMBED_DIM},
                        timeout=30.0,
                    )
                    resp.raise_for_status()
                    data = resp.json()
                    batch_vecs = [item["embedding"] for item in data["data"]]
                    results.extend(batch_vecs)
                    break
                except httpx.HTTPStatusError as e:
                    if e.response.status_code == 429 and attempt < 2:
                        wait = 2 ** (attempt + 1)
                        logger.warning(f"[Embedding] 智谱 API 限流，等待 {wait}s 后重试...")
                        time.sleep(wait)
                    else:
                        raise

            if i + batch_size < len(texts):
                time.sleep(0.3)

        return results

    def _embed_fastembed(self, texts: List[str]) -> List[List[float]]:
        """使用 fastembed (ONNX Runtime) 本地推理"""
        vecs = list(self._fastembed_model.embed(texts))
        return [v.tolist() for v in vecs]

    def _embed_hf_inference(self, texts: List[str]) -> List[List[float]]:
        """调用 HuggingFace Inference API (需要 Token)"""
        url = "https://router.huggingface.co/hf-inference/models/sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2"
        headers = {"Authorization": f"Bearer {self._hf_token}"}

        results = []
        batch_size = 8
        for i in range(0, len(texts), batch_size):
            batch = texts[i:i + batch_size]

            for attempt in range(3):
                try:
                    resp = httpx.post(
                        url,
                        headers=headers,
                        json={"inputs": batch, "options": {"wait_for_model": True}},
                        timeout=60.0,
                    )
                    resp.raise_for_status()
                    data = resp.json()

                    for item in data:
                        if isinstance(item[0], list):
                            dim = len(item[0])
                            pooled = [
                                sum(item[j][k] for j in range(len(item))) / len(item)
                                for k in range(dim)
                            ]
                            results.append(pooled)
                        else:
                            results.append(item)
                    break
                except httpx.HTTPStatusError as e:
                    if e.response.status_code in (503, 429) and attempt < 2:
                        time.sleep(10 if e.response.status_code == 503 else 5)
                    else:
                        raise

            if i + batch_size < len(texts):
                time.sleep(0.5)

        return results

    def _embed_sklearn(self, texts: List[str]) -> List[List[float]]:
        """纯 Python 兜底：jieba 分词 + 字符/词哈希 → 稠密向量
        无需模型下载、无需 GPU、无需外部 API，始终可用。
        """
        results = []
        for text in texts:
            vec = self._text_to_hash_vec(text)
            results.append(vec)
        return results

    @staticmethod
    def _text_to_hash_vec(text: str) -> List[float]:
        """将文本转换为固定维度的稠密向量 (基于 n-gram 哈希)"""
        vec = [0.0] * EMBED_DIM

        # 分词: 优先 jieba，失败则用字符级 n-gram
        tokens = []
        try:
            import jieba
            tokens = list(jieba.cut(text))
        except Exception:
            # 字符级 2-gram 兜底
            tokens = [text[i:i + 2] for i in range(max(1, len(text) - 1))]

        # 生成 unigram + bigram 特征
        features = list(tokens)
        for i in range(len(tokens) - 1):
            features.append(f"{tokens[i]}_{tokens[i + 1]}")

        # 哈希到固定维度
        for feat in features:
            h = int(hashlib.md5(feat.encode("utf-8")).hexdigest(), 16)
            idx = h % EMBED_DIM
            sign = 1.0 if (h // EMBED_DIM) % 2 == 0 else -1.0
            vec[idx] += sign

        # L2 归一化
        norm = math.sqrt(sum(x * x for x in vec)) or 1.0
        return [x / norm for x in vec]

    # ── 降级调度 ──────────────────────────────────────────

    def _embed_with_fallback(self, texts: List[str]) -> List[List[float]]:
        """带降级的嵌入调用"""
        for i, backend in enumerate(self._backends):
            try:
                self._active_backend = backend
                if backend == "zhipuai":
                    return self._embed_zhipuai(texts)
                elif backend == "fastembed":
                    return self._embed_fastembed(texts)
                elif backend == "hf_inference":
                    return self._embed_hf_inference(texts)
                elif backend == "sklearn":
                    return self._embed_sklearn(texts)
            except Exception as e:
                next_backend = self._backends[i + 1] if i + 1 < len(self._backends) else "none"
                logger.info("[降级] RAGAgent: %s → %s, reason: %s", backend, next_backend, str(e))
                continue

        raise RuntimeError("所有 Embedding 后端均失败")

    # ── LangChain 接口 ───────────────────────────────────

    def embed_documents(self, texts: List[str]) -> List[List[float]]:
        """嵌入文档列表（带缓存）"""
        results = []
        uncached_texts = []
        uncached_indices = []

        for idx, text in enumerate(texts):
            key = self._cache_key(text)
            cached = self._load_cache(key)
            if cached is not None:
                results.append((idx, cached))
            else:
                uncached_texts.append(text)
                uncached_indices.append(idx)

        if uncached_texts:
            new_vecs = self._embed_with_fallback(uncached_texts)
            for i, vec in zip(uncached_indices, new_vecs):
                self._save_cache(self._cache_key(texts[i]), vec)
                results.append((i, vec))

        results.sort(key=lambda x: x[0])
        return [v for _, v in results]

    def embed_query(self, text: str) -> List[float]:
        """嵌入单条查询"""
        key = self._cache_key(text)
        cached = self._load_cache(key)
        if cached is not None:
            return cached

        vecs = self._embed_with_fallback([text])
        self._save_cache(key, vecs[0])
        return vecs[0]
