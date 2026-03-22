# -*- coding: utf-8 -*-
"""
输出质量校验器
对大模型输出进行结构化校验和幻觉检测
"""
import json
import logging
from typing import Optional

logger = logging.getLogger(__name__)


class OutputValidator:
    """Validate LLM outputs for hallucination prevention."""

    @staticmethod
    def validate_translation(original: str, result: dict) -> dict:
        """
        Validate translation output from translator agent.
        Returns: {"schema_valid": bool, "length_ratio": float, "warnings": [str]}
        """
        warnings = []
        schema_valid = (
            isinstance(result, dict)
            and "punctuated" in result
            and "translated" in result
            and isinstance(result.get("punctuated"), str)
            and isinstance(result.get("translated"), str)
        )
        if not schema_valid:
            warnings.append("翻译输出格式不符合预期schema")
            return {"schema_valid": False, "length_ratio": 0, "warnings": warnings}

        orig_len = len(original.strip())
        trans_len = len(result["translated"].strip())
        length_ratio = trans_len / orig_len if orig_len > 0 else 0

        if length_ratio > 5.0:
            warnings.append(f"翻译长度比例异常({length_ratio:.1f}:1)，可能存在幻觉发散")
            # Truncate to reasonable length
            max_len = orig_len * 5
            result["translated"] = result["translated"][:max_len] + "..."

        if length_ratio < 0.3:
            warnings.append(f"翻译长度过短({length_ratio:.1f}:1)，可能翻译不完整")

        return {"schema_valid": True, "length_ratio": round(length_ratio, 2), "warnings": warnings}

    @staticmethod
    def validate_entities(entity_ids: list, knowledge_graph: dict) -> dict:
        """
        Cross-validate extracted entities against knowledge graph.
        Returns: {"verified": int, "unverified": int, "total": int}
        """
        if not entity_ids or not knowledge_graph:
            return {"verified": 0, "unverified": 0, "total": 0}

        graph_ids = {n["id"] for n in knowledge_graph.get("nodes", [])}
        verified = [eid for eid in entity_ids if eid in graph_ids]
        unverified = [eid for eid in entity_ids if eid not in graph_ids]

        return {
            "verified": len(verified),
            "unverified": len(unverified),
            "total": len(entity_ids),
        }
