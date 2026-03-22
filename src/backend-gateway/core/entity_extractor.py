# -*- coding: utf-8 -*-
"""
Entity extractor for GraphRAG.
Identifies known entities from text chunks by matching against
the knowledge graph entity list (ancient_texts_graph.json).

Two paths:
  - Fast path: substring matching (no API needed)
  - Enhanced path: GLM-4 extraction with constrained entity list (when ZHIPU_API_KEY set)
"""
import json
import os
import logging
from typing import Dict, List, Optional

logger = logging.getLogger(__name__)

# Path to the knowledge graph data file
_GRAPH_DATA_PATH = os.path.join(
    os.path.dirname(__file__), "..", "data", "ancient_texts_graph.json"
)


class EntityExtractor:
    """Extract known entities from text using the knowledge graph entity list."""

    def __init__(self, graph_path: Optional[str] = None):
        self._label_to_id: Dict[str, str] = {}
        self._known_ids: set = set()
        self._load_entities(graph_path or _GRAPH_DATA_PATH)

    def _load_entities(self, path: str) -> None:
        """Load entity labels and IDs from graph JSON file."""
        try:
            abs_path = os.path.abspath(path)
            if not os.path.exists(abs_path):
                logger.warning("Graph data file not found: %s", abs_path)
                return
            with open(abs_path, "r", encoding="utf-8") as f:
                data = json.load(f)
            for node in data.get("nodes", []):
                label = node.get("label", "")
                node_id = node.get("id", "")
                if label and node_id:
                    self._label_to_id[label] = node_id
                    self._known_ids.add(node_id)
            logger.info(
                "EntityExtractor loaded %d entities from %s",
                len(self._label_to_id),
                abs_path,
            )
        except Exception as e:
            logger.warning("Failed to load graph data: %s", e)

    # ------------------------------------------------------------------
    # Fast path: substring matching
    # ------------------------------------------------------------------

    def _extract_fast(self, text: str) -> List[str]:
        """Extract entities via simple substring matching.

        Scans text for known entity labels, returns matching entity IDs.
        Longer labels are checked first to prefer specific matches.
        """
        found: List[str] = []
        # Sort labels by length descending to prefer longer (more specific) matches
        for label in sorted(self._label_to_id, key=len, reverse=True):
            if label in text:
                entity_id = self._label_to_id[label]
                if entity_id not in found:
                    found.append(entity_id)
        return found

    # ------------------------------------------------------------------
    # Enhanced path: GLM-4 extraction
    # ------------------------------------------------------------------

    def _extract_with_llm(self, text: str) -> Optional[List[str]]:
        """Use GLM-4 for more accurate entity extraction.

        Returns None if API unavailable or call fails (caller falls back to fast path).
        Only returns entity IDs that exist in the known entity list.
        """
        api_key = os.getenv("ZHIPU_API_KEY", "")
        if not api_key:
            return None

        try:
            from zhipuai import ZhipuAI

            client = ZhipuAI(api_key=api_key)

            # Build constrained entity list for the prompt
            entity_list_str = ", ".join(
                f"{label}({eid})" for label, eid in self._label_to_id.items()
            )

            prompt = (
                f"From the following text, identify all entities that match "
                f"the known entity list. Return ONLY a JSON array of entity IDs.\n\n"
                f"Known entities: {entity_list_str}\n\n"
                f"Text: {text}\n\n"
                f"Response format: [\"id1\", \"id2\"]"
            )

            response = client.chat.completions.create(
                model="glm-4-flash",
                messages=[
                    {
                        "role": "system",
                        "content": "You are an entity extraction tool. Return only a JSON array of entity IDs. No explanation.",
                    },
                    {"role": "user", "content": prompt},
                ],
                temperature=0.1,
                max_tokens=200,
            )

            raw = response.choices[0].message.content.strip()
            # Parse JSON array from response
            # Handle cases where LLM wraps in markdown code block
            if raw.startswith("```"):
                raw = raw.split("\n", 1)[-1].rsplit("```", 1)[0].strip()

            ids = json.loads(raw)
            if not isinstance(ids, list):
                return None

            # Filter to only known IDs
            return [eid for eid in ids if eid in self._known_ids]

        except Exception as e:
            logger.warning("GLM-4 entity extraction failed: %s", e)
            return None

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def extract_entities(self, text: str) -> List[str]:
        """Extract known entity IDs from text.

        Tries enhanced path (GLM-4) first if API key available,
        falls back to fast path (substring matching).

        Args:
            text: Input text to scan for entities.

        Returns:
            List of entity IDs found in the text.
        """
        if not text or not self._label_to_id:
            return []

        # Try enhanced path first
        enhanced = self._extract_with_llm(text)
        if enhanced is not None:
            return enhanced

        # Fall back to fast path
        return self._extract_fast(text)

    def extract_entities_batch(self, texts: List[str]) -> List[List[str]]:
        """Extract entities from multiple texts.

        Args:
            texts: List of input texts.

        Returns:
            List of entity ID lists, one per input text.
        """
        return [self.extract_entities(t) for t in texts]

    @property
    def known_entity_count(self) -> int:
        """Number of known entities loaded."""
        return len(self._label_to_id)
