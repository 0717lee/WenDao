# -*- coding: utf-8 -*-
"""
Entity extractor for reading cues.
Identifies known entities from text chunks by matching against
the internal entity lexicon used by recommendations and reader hints.

Two paths:
  - Fast path: substring matching (no API needed)
  - Enhanced path: GLM-4 extraction with constrained entity list (when ZHIPUAI_API_KEY set)
"""
import json
import os
import logging
from typing import Dict, List, Optional

from core.runtime_checks import get_zhipu_api_key

logger = logging.getLogger(__name__)

# Preferred entity lexicon path, with legacy graph-shaped data as fallback.
_ENTITY_DATA_PATH = os.path.join(
    os.path.dirname(__file__), "..", "data", "reading_entities.json"
)
_LEGACY_ENTITY_DATA_PATH = os.path.join(
    os.path.dirname(__file__), "..", "data", "ancient_texts_graph.json"
)


class EntityExtractor:
    """Extract known entities from text using the internal entity lexicon."""

    def __init__(self, graph_path: Optional[str] = None):
        self._label_to_id: Dict[str, str] = {}
        self._known_ids: set = set()
        self._load_entities(graph_path or _ENTITY_DATA_PATH, allow_legacy_fallback=graph_path is None)

    def _load_entities(self, path: str, allow_legacy_fallback: bool = True) -> None:
        """Load entity labels and IDs from an entity lexicon JSON file."""
        try:
            abs_path = os.path.abspath(path)
            if not os.path.exists(abs_path):
                legacy_path = os.path.abspath(_LEGACY_ENTITY_DATA_PATH)
                if allow_legacy_fallback and os.path.exists(legacy_path):
                    abs_path = legacy_path
                else:
                    logger.warning("Entity lexicon file not found: %s", abs_path)
                    return
            with open(abs_path, "r", encoding="utf-8") as f:
                data = json.load(f)

            if isinstance(data, dict):
                raw_entities = data.get("entities")
                if not isinstance(raw_entities, list):
                    raw_entities = data.get("nodes", [])
            else:
                raw_entities = []

            for node in raw_entities:
                if not isinstance(node, dict):
                    continue
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
            logger.warning("Failed to load entity lexicon: %s", e)

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
        api_key = get_zhipu_api_key()
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

            # Filter to only known IDs and preserve first-seen order.
            filtered: List[str] = []
            for eid in ids:
                if eid in self._known_ids and eid not in filtered:
                    filtered.append(eid)
            return filtered

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
