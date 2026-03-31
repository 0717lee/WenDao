# -*- coding: utf-8 -*-
"""
Dynamic Entity Discovery Service

Discovers NEW entities from AI responses that are NOT in the existing knowledge graph.
Uses GLM-4-flash for entity extraction (with fast-path fallback),
then checks semantic similarity against known entities for deduplication.
"""
import json
import logging
import os
import re
from typing import Any, Dict, List, Optional

logger = logging.getLogger(__name__)

# Path to graph data
_GRAPH_DATA_PATH = os.path.join(
    os.path.dirname(__file__), "..", "data", "ancient_texts_graph.json"
)

# Valid entity groups
VALID_GROUPS = {"人物", "典籍", "历史事件", "思想流派", "建筑", "朝代"}


def _env_flag_enabled(name: str) -> bool:
    """Treat common truthy strings as enabled feature flags."""
    return os.getenv(name, "").strip().lower() in {"1", "true", "yes", "on"}


class EntityDiscovery:
    """Discover NEW entities from AI responses (not in existing graph)."""

    def __init__(
        self,
        graph_data: Dict[str, Any],
        embeddings=None,
        enable_llm_extraction: Optional[bool] = None,
    ):
        self.known_labels = {n["label"] for n in graph_data.get("nodes", [])}
        self.known_ids = {n["id"] for n in graph_data.get("nodes", [])}
        self.known_nodes = {n["label"]: n for n in graph_data.get("nodes", [])}
        self.embeddings = embeddings
        self._label_embeddings: Dict[str, List[float]] = {}
        if enable_llm_extraction is None:
            enable_llm_extraction = _env_flag_enabled("ENTITY_DISCOVERY_USE_LLM")
        self.enable_llm_extraction = enable_llm_extraction

    def discover_new_entities(
        self, ai_answer: str, user_query: str
    ) -> List[Dict[str, Any]]:
        """
        Extract entities from AI answer that are NOT in the known graph.

        1. Call GLM-4-flash (or fast-path) to extract ALL entities from text
        2. Filter out entities whose label is in self.known_labels
        3. For remaining, compute embedding similarity against known entities
        4. If similarity > 0.8 with any known entity -> mark similar_to
        5. Return new entities with confidence scores

        Returns:
            List of dicts: [{label, group, desc, confidence, similar_to?}]
        """
        try:
            answer_text = ai_answer.strip()
            query_text = user_query.strip()
            if not answer_text:
                return []

            # Step 1: Extract all entities from text
            all_entities = self._extract_entities_from_text(answer_text, query_text)
            if not all_entities:
                return []

            # Step 2: Filter out known entities
            new_entities = []
            for entity in all_entities:
                label = entity.get("label", "").strip()
                if not label:
                    continue
                # Skip if already known
                if label in self.known_labels:
                    continue
                # Normalize group
                group = entity.get("group", "人物")
                if group not in VALID_GROUPS:
                    group = "人物"
                entity["group"] = group
                new_entities.append(entity)

            if not new_entities:
                return []

            # Step 3-4: Check semantic duplicates
            for entity in new_entities:
                similar = self._check_semantic_duplicate(
                    entity["label"], entity.get("desc", "")
                )
                if similar:
                    entity["similar_to"] = similar

            return new_entities

        except Exception as e:
            logger.warning("Entity discovery failed: %s", e)
            return []

    def _extract_entities_from_text(
        self, ai_answer: str, user_query: str
    ) -> List[Dict[str, Any]]:
        """Extract entities using GLM-4-flash or fast-path fallback."""
        # Live LLM extraction is opt-in so tests and demos stay deterministic.
        if self.enable_llm_extraction:
            extracted = self._extract_with_glm4(ai_answer, user_query)
            if extracted is not None:
                return extracted

        # Fallback: simple pattern-based extraction
        return self._extract_fast_path(ai_answer)

    def _extract_with_glm4(
        self, ai_answer: str, user_query: str
    ) -> Optional[List[Dict[str, Any]]]:
        """Use GLM-4-flash with structured JSON output for entity extraction."""
        api_key = os.getenv("ZHIPU_API_KEY", "") or os.getenv("ZHIPUAI_API_KEY", "")
        if not api_key:
            return None

        try:
            from zhipuai import ZhipuAI

            client = ZhipuAI(api_key=api_key)

            prompt = (
                "从以下古籍解读文本中，提取所有提到的实体"
                "（人物、典籍、历史事件、思想流派、建筑、朝代）。\n"
                "返回JSON数组，每个实体包含: label(名称), group(类型), "
                "desc(简短描述), confidence(0-1置信度)。\n"
                "仅提取明确提到的实体，不要推测。\n\n"
                f"文本: {ai_answer}\n"
                f"用户原始问题: {user_query}\n\n"
                '返回格式: [{"label":"xxx","group":"人物","desc":"xxx","confidence":0.9}]'
            )

            response = client.chat.completions.create(
                model="glm-4-flash",
                messages=[
                    {
                        "role": "system",
                        "content": (
                            "You are an entity extraction tool for Chinese ancient texts. "
                            "Return only a JSON array. No explanation."
                        ),
                    },
                    {"role": "user", "content": prompt},
                ],
                temperature=0.1,
                max_tokens=500,
            )

            raw = response.choices[0].message.content.strip()
            # Handle markdown code block wrapping
            if raw.startswith("```"):
                raw = raw.split("\n", 1)[-1].rsplit("```", 1)[0].strip()

            entities = json.loads(raw)
            if not isinstance(entities, list):
                return None

            # Validate structure
            valid = []
            for e in entities:
                if isinstance(e, dict) and "label" in e:
                    valid.append(
                        {
                            "label": str(e["label"]),
                            "group": str(e.get("group", "人物")),
                            "desc": str(e.get("desc", "")),
                            "confidence": float(e.get("confidence", 0.7)),
                        }
                    )
            return valid

        except Exception as e:
            logger.warning("GLM-4 entity extraction failed: %s", e)
            return None

    def _extract_fast_path(self, text: str) -> List[Dict[str, Any]]:
        """Simple pattern-based extraction as fallback.

        Looks for quoted terms, book title markers, and common name patterns.
        Returns entities with lower confidence (0.5).
        """
        text = text.strip()
        if not text:
            return []

        entities = []
        seen = set()

        # Pattern 1: Chinese book title markers <<xxx>> or 《xxx》
        for match in re.finditer(r"[《<]([^》>]{2,10})[》>]", text):
            label = match.group(1).strip()
            if label and label not in seen and label not in self.known_labels:
                seen.add(label)
                entities.append(
                    {
                        "label": label,
                        "group": "典籍",
                        "desc": f"文中提及的典籍",
                        "confidence": 0.5,
                    }
                )

        # Pattern 2: Quoted entities "xxx" or 「xxx」
        for match in re.finditer(r"[\"「]([^\"」]{2,8})[\"」]", text):
            label = match.group(1).strip()
            if label and label not in seen and label not in self.known_labels:
                seen.add(label)
                entities.append(
                    {
                        "label": label,
                        "group": "人物",
                        "desc": f"文中提及的实体",
                        "confidence": 0.4,
                    }
                )

        return entities

    def _check_semantic_duplicate(
        self, new_label: str, new_desc: str
    ) -> Optional[Dict[str, Any]]:
        """Check if new entity is semantically similar to existing one.

        Returns {id, label, similarity} if above 0.8 threshold, else None.
        """
        if not self.embeddings:
            # Without embeddings, do simple string similarity
            return self._check_string_similarity(new_label)

        try:
            # Embed new entity
            new_text = f"{new_label} {new_desc}" if new_desc else new_label
            new_vec = self.embeddings.embed_query(new_text)

            # Lazy compute known entity embeddings
            if not self._label_embeddings:
                labels = list(self.known_nodes.keys())
                if labels:
                    texts = [
                        f"{l} {self.known_nodes[l].get('desc', '')}" for l in labels
                    ]
                    vecs = self.embeddings.embed_documents(texts)
                    for label, vec in zip(labels, vecs):
                        self._label_embeddings[label] = vec

            # Find most similar
            best_sim = 0.0
            best_label = None
            for label, vec in self._label_embeddings.items():
                sim = self._cosine_similarity(new_vec, vec)
                if sim > best_sim:
                    best_sim = sim
                    best_label = label

            if best_sim > 0.8 and best_label:
                node = self.known_nodes[best_label]
                return {
                    "id": node.get("id", ""),
                    "label": best_label,
                    "similarity": round(best_sim, 3),
                }

        except Exception as e:
            logger.warning("Semantic duplicate check failed: %s", e)
            # Fall back to string similarity
            return self._check_string_similarity(new_label)

        return None

    def _check_string_similarity(self, new_label: str) -> Optional[Dict[str, Any]]:
        """Fallback: check if new label is very similar to a known label by substring."""
        for known_label, node in self.known_nodes.items():
            # Check if one contains the other (e.g., "孟子" vs "孟子(书)")
            if (
                new_label in known_label
                or known_label in new_label
            ) and new_label != known_label:
                return {
                    "id": node.get("id", ""),
                    "label": known_label,
                    "similarity": 0.85,
                }
        return None

    @staticmethod
    def _cosine_similarity(a: List[float], b: List[float]) -> float:
        """Compute cosine similarity between two vectors."""
        dot = sum(x * y for x, y in zip(a, b))
        norm_a = sum(x * x for x in a) ** 0.5
        norm_b = sum(x * x for x in b) ** 0.5
        if norm_a == 0 or norm_b == 0:
            return 0.0
        return dot / (norm_a * norm_b)
