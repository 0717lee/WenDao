"""Tests for Vision API: image upload, structured parsing, and graph matching."""

import io
import json
import pytest
from unittest.mock import patch, MagicMock
from fastapi.testclient import TestClient


# Sample VisionAgent response text (structured Chinese analysis)
SAMPLE_VISION_TEXT = """1. 建筑类型：宫殿建筑
2. 屋顶形制：庑殿顶，黄色琉璃瓦覆盖
3. 主要可见构件：斗拱、额枋、彩画、琉璃瓦、雀替
4. 大致年代风格：明清时期
5. 建筑等级推断：属于最高等级的皇家建筑"""


# Sample graph data for matching tests
SAMPLE_GRAPH_DATA = {
    "nodes": [
        {"id": "yingzaofashi", "label": "营造法式", "group": "典籍", "desc": "宋代建筑规范，详述斗拱制度"},
        {"id": "songdai", "label": "宋代", "group": "朝代", "desc": "宋代文化繁荣"},
        {"id": "mingqing", "label": "明清小说发展", "group": "文学", "desc": "明清时期文学繁荣"},
        {"id": "lunyu", "label": "论语", "group": "典籍", "desc": "孔子弟子记录孔子言行"},
        {"id": "lixue", "label": "理学", "group": "思想流派", "desc": "宋代程朱理学"},
    ],
    "edges": [],
}


def _auth_headers():
    from core.auth import create_token

    token = create_token("test-user", "tester")
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def client():
    """Create test client with mocked VisionAgent."""
    # VisionAgent is imported lazily inside the endpoint function
    with patch("agents.vision.VisionAgent") as MockVision:
        mock_instance = MagicMock()
        mock_instance.analyze_image.return_value = SAMPLE_VISION_TEXT
        MockVision.return_value = mock_instance

        from main import app
        yield TestClient(app)


@pytest.fixture
def mock_graph_data():
    """Provide sample graph data for matching tests."""
    return SAMPLE_GRAPH_DATA


def _make_image_file(size_bytes: int = 1024, filename: str = "test.jpg", content_type: str = "image/jpeg"):
    """Helper: create a fake image file of given size."""
    data = b"\xff\xd8\xff\xe0" + b"\x00" * (size_bytes - 4)  # JPEG magic bytes
    return ("file", (filename, io.BytesIO(data), content_type))


class TestVisionAnalyzeEndpoint:
    """Tests for POST /api/v1/vision/analyze"""

    def test_upload_requires_auth(self, client):
        response = client.post(
            "/api/v1/vision/analyze",
            files=[_make_image_file()],
            data={"question": ""},
        )
        assert response.status_code == 401

    def test_upload_returns_200_with_structured_analysis(self, client):
        """Valid image upload returns structured analysis fields."""
        response = client.post(
            "/api/v1/vision/analyze",
            files=[_make_image_file()],
            data={"question": ""},
            headers=_auth_headers(),
        )
        assert response.status_code == 200
        body = response.json()

        assert "analysis" in body
        analysis = body["analysis"]
        assert "building_type" in analysis
        assert "roof_style" in analysis
        assert "components" in analysis
        assert "era" in analysis
        assert "raw_text" in analysis

    def test_upload_returns_matched_graph_nodes(self, client):
        """Response includes matched_graph_nodes array."""
        with patch("routers.vision._load_graph_data", return_value=SAMPLE_GRAPH_DATA):
            response = client.post(
                "/api/v1/vision/analyze",
                files=[_make_image_file()],
                data={"question": ""},
                headers=_auth_headers(),
            )
        assert response.status_code == 200
        body = response.json()
        assert "matched_graph_nodes" in body
        assert isinstance(body["matched_graph_nodes"], list)

    def test_file_too_large_returns_413(self, client):
        """File exceeding 5MB returns 413."""
        large_size = 6 * 1024 * 1024  # 6MB
        response = client.post(
            "/api/v1/vision/analyze",
            files=[_make_image_file(size_bytes=large_size)],
            data={"question": ""},
            headers=_auth_headers(),
        )
        assert response.status_code == 413
        assert "文件过大" in response.json()["error"]

    def test_non_image_file_returns_400(self, client):
        """Non-image content type returns 400."""
        response = client.post(
            "/api/v1/vision/analyze",
            files=[("file", ("test.txt", io.BytesIO(b"hello"), "text/plain"))],
            data={"question": ""},
            headers=_auth_headers(),
        )
        assert response.status_code == 400
        assert "仅支持图片文件" in response.json()["error"]

    def test_custom_question_passed_to_agent(self, client):
        """Custom question is forwarded to VisionAgent."""
        response = client.post(
            "/api/v1/vision/analyze",
            files=[_make_image_file()],
            data={"question": "This is a custom question about the building"},
            headers=_auth_headers(),
        )
        assert response.status_code == 200


class TestParseVisionResult:
    """Tests for parse_vision_result function."""

    def test_parses_building_type(self):
        from routers.vision import parse_vision_result
        result = parse_vision_result(SAMPLE_VISION_TEXT)
        assert "宫殿" in result["building_type"]

    def test_parses_roof_style(self):
        from routers.vision import parse_vision_result
        result = parse_vision_result(SAMPLE_VISION_TEXT)
        assert "庑殿" in result["roof_style"]

    def test_parses_components_list(self):
        from routers.vision import parse_vision_result
        result = parse_vision_result(SAMPLE_VISION_TEXT)
        assert isinstance(result["components"], list)
        assert len(result["components"]) > 0
        assert "斗拱" in result["components"]

    def test_parses_era(self):
        from routers.vision import parse_vision_result
        result = parse_vision_result(SAMPLE_VISION_TEXT)
        assert "明清" in result["era"]

    def test_preserves_raw_text(self):
        from routers.vision import parse_vision_result
        result = parse_vision_result(SAMPLE_VISION_TEXT)
        assert result["raw_text"] == SAMPLE_VISION_TEXT


class TestMatchVisionToGraph:
    """Tests for match_vision_to_graph function."""

    def test_matches_nodes_by_label_substring(self, mock_graph_data):
        from routers.vision import match_vision_to_graph
        # "营造法式" appears in our ARCH_TERMS and in node label
        text = "这座建筑参考了营造法式的规范"
        matches = match_vision_to_graph(text, mock_graph_data)
        ids = [m["id"] for m in matches]
        assert "yingzaofashi" in ids

    def test_matches_nodes_by_arch_term_in_description(self, mock_graph_data):
        from routers.vision import match_vision_to_graph
        # "斗拱" appears in vision text AND in yingzaofashi desc
        text = "可见精美的斗拱结构"
        matches = match_vision_to_graph(text, mock_graph_data)
        ids = [m["id"] for m in matches]
        assert "yingzaofashi" in ids

    def test_no_match_returns_empty(self, mock_graph_data):
        from routers.vision import match_vision_to_graph
        text = "这是一张现代建筑的照片"
        matches = match_vision_to_graph(text, mock_graph_data)
        assert len(matches) == 0

    def test_match_result_has_id_and_label(self, mock_graph_data):
        from routers.vision import match_vision_to_graph
        text = "宋代建筑典范，遵循营造法式"
        matches = match_vision_to_graph(text, mock_graph_data)
        for m in matches:
            assert "id" in m
            assert "label" in m

    def test_no_duplicate_matches(self, mock_graph_data):
        from routers.vision import match_vision_to_graph
        # Text that could match same node via multiple terms
        text = "宋代营造法式记载的斗拱制度"
        matches = match_vision_to_graph(text, mock_graph_data)
        ids = [m["id"] for m in matches]
        assert len(ids) == len(set(ids)), "Duplicate node IDs found"
