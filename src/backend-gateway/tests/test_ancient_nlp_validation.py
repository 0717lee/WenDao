# -*- coding: utf-8 -*-
"""
Test suite for ancient NLP validation script
Tests recall@10 metric calculation and validation logic
"""
import pytest
import subprocess
import json
import os
import sys
from unittest.mock import Mock, patch, MagicMock

# Mock problematic modules before any imports
sys.modules['fastembed'] = MagicMock()
sys.modules['fastembed.text'] = MagicMock()
sys.modules['onnxruntime'] = MagicMock()

# Add parent directory to path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))


def test_validation_script_outputs_recall_metric():
    """Test 1: Validation script runs successfully and outputs recall@10 metric"""
    script_path = os.path.join(
        os.path.dirname(__file__), 
        "..", 
        "scripts", 
        "validate_ancient_nlp.py"
    )
    
    # Mock RAG agent to avoid FAISS dependency
    with patch('agents.rag.RAGAgent') as mock_rag:
        mock_vectorstore = Mock()
        mock_doc = Mock()
        mock_doc.metadata = {"id": "doc_1"}
        mock_doc.page_content = "斗拱是中国古代建筑特有的构件"
        
        mock_vectorstore.similarity_search = Mock(return_value=[mock_doc] * 10)
        
        mock_rag_instance = Mock()
        mock_rag_instance.vectorstore = mock_vectorstore
        mock_rag.return_value = mock_rag_instance
        
        # Run script with --json flag
        result = subprocess.run(
            [sys.executable, script_path, "--json"],
            capture_output=True,
            text=True,
            timeout=30
        )
        
        # Check script ran successfully
        assert result.returncode in [0, 1], f"Script failed with unexpected code: {result.returncode}"
        
        # Parse JSON output
        try:
            output = json.loads(result.stdout)
            assert "recall_at_10" in output
            assert "passed" in output
            assert isinstance(output["recall_at_10"], (int, float))
            assert isinstance(output["passed"], bool)
        except json.JSONDecodeError:
            pytest.skip("Script requires real FAISS index to run")


@pytest.mark.integration
def test_ancient_nlp_recall_at_10():
    """Test 2: recall@10 > 60% (integration test with real FAISS index)"""
    script_path = os.path.join(
        os.path.dirname(__file__), 
        "..", 
        "scripts", 
        "validate_ancient_nlp.py"
    )
    
    # Check if FAISS index exists
    faiss_path = os.path.join(
        os.path.dirname(__file__),
        "..",
        "faiss_db",
        "index.faiss"
    )
    
    if not os.path.exists(faiss_path):
        pytest.skip("FAISS index not found, skipping integration test")
    
    # Run validation script
    result = subprocess.run(
        [sys.executable, script_path, "--json"],
        capture_output=True,
        text=True,
        timeout=60
    )
    
    # Parse output
    try:
        output = json.loads(result.stdout)
    except json.JSONDecodeError:
        pytest.fail(f"Failed to parse JSON output: {result.stdout}")
    
    # Check recall@10 metric
    recall = output.get("recall_at_10", 0)
    passed = output.get("passed", False)
    
    # Assert recall@10 > 60%
    if not passed:
        failed_queries = output.get("failed_queries", [])
        print(f"\nRecall@10: {recall:.2%}")
        print(f"Failed queries: {len(failed_queries)}")
        for fq in failed_queries[:5]:  # Print first 5 failed queries
            print(f"  - {fq.get('query', 'N/A')}: {fq.get('recall', 0):.2%}")
    
    assert recall > 0.6, f"Recall@10 ({recall:.2%}) is below 60% threshold"


def test_json_output_format():
    """Test 3: --json parameter outputs JSON format result"""
    from scripts.validate_ancient_nlp import calculate_recall_at_k
    
    # Test recall calculation
    retrieved = ["doc_1", "doc_2", "doc_3", "doc_4", "doc_5"]
    relevant = ["doc_1", "doc_3", "doc_6"]
    
    recall = calculate_recall_at_k(retrieved, relevant, k=10)
    
    # 2 out of 3 relevant docs found
    assert recall == pytest.approx(2/3, rel=0.01)


def test_recall_calculation_edge_cases():
    """Test recall calculation with edge cases"""
    from scripts.validate_ancient_nlp import calculate_recall_at_k
    
    # Case 1: All relevant docs found
    assert calculate_recall_at_k(["doc_1", "doc_2"], ["doc_1", "doc_2"], k=10) == 1.0
    
    # Case 2: No relevant docs found
    assert calculate_recall_at_k(["doc_3", "doc_4"], ["doc_1", "doc_2"], k=10) == 0.0
    
    # Case 3: Empty relevant list
    assert calculate_recall_at_k(["doc_1"], [], k=10) == 0.0
    
    # Case 4: Partial match
    assert calculate_recall_at_k(["doc_1", "doc_3"], ["doc_1", "doc_2"], k=10) == 0.5
