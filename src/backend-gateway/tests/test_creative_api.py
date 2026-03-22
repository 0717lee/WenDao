"""Tests for Creative API: poem generation with image and audio SSE streaming."""

import json
import base64
import pytest
from unittest.mock import patch, MagicMock, AsyncMock
from fastapi.testclient import TestClient


SAMPLE_POEM = "春风拂柳绿丝条\n细雨润花红满朝\n山色空蒙水如镜\n人间最美是春宵"
SAMPLE_IMAGE_URL = "https://example.com/cogview/spring_poem.png"
SAMPLE_AUDIO_BYTES = b"\x00\x01\x02\x03FAKE_AUDIO_DATA"


def _parse_sse_events(response_text: str) -> list[dict]:
    """Parse SSE response text into list of {event, data} dicts."""
    events = []
    current_event = None
    for line in response_text.split("\n"):
        line = line.strip()
        if line.startswith("event:"):
            current_event = line[6:].strip()
        elif line.startswith("data:"):
            data_str = line[5:].strip()
            try:
                data = json.loads(data_str)
            except json.JSONDecodeError:
                data = data_str
            events.append({"event": current_event, "data": data})
            current_event = None
        elif not line:
            current_event = None
    return events


@pytest.fixture
def client():
    """Create test client with mocked GLM-4, ImageGenAgent, and SpeechAgent."""
    # Mock GLM-4 (ZhipuAI)
    mock_zhipuai_cls = MagicMock()
    mock_client_instance = MagicMock()
    mock_response = MagicMock()
    mock_choice = MagicMock()
    mock_choice.message.content = SAMPLE_POEM
    mock_response.choices = [mock_choice]
    mock_client_instance.chat.completions.create.return_value = mock_response
    mock_zhipuai_cls.return_value = mock_client_instance

    # Mock ImageGenAgent
    mock_image_agent_cls = MagicMock()
    mock_image_instance = MagicMock()
    mock_image_instance.generate.return_value = SAMPLE_IMAGE_URL
    mock_image_agent_cls.return_value = mock_image_instance

    # Mock SpeechAgent
    mock_speech_agent_cls = MagicMock()
    mock_speech_instance = MagicMock()
    # SpeechAgent.tts is async, mock it properly
    mock_speech_instance.tts = AsyncMock(return_value=SAMPLE_AUDIO_BYTES)
    mock_speech_agent_cls.return_value = mock_speech_instance

    with patch("routers.creative.ZhipuAI", mock_zhipuai_cls, create=True), \
         patch("routers.creative.ImageGenAgent", mock_image_agent_cls, create=True), \
         patch("routers.creative.SpeechAgent", mock_speech_agent_cls, create=True):

        # Patch the lazy imports inside the helper functions
        with patch("routers.creative._generate_poem") as mock_gen_poem, \
             patch("routers.creative._safe_generate_image") as mock_gen_image, \
             patch("routers.creative._safe_generate_audio") as mock_gen_audio:

            mock_gen_poem.return_value = SAMPLE_POEM
            mock_gen_image.return_value = SAMPLE_IMAGE_URL
            mock_gen_audio.return_value = SAMPLE_AUDIO_BYTES

            # Make them proper coroutines
            mock_gen_poem.side_effect = None
            mock_gen_poem.return_value = SAMPLE_POEM

            from main import app
            yield TestClient(app)


@pytest.fixture
def client_image_fail():
    """Client where image generation fails but poem and audio succeed."""
    with patch("routers.creative._generate_poem", new_callable=AsyncMock, return_value=SAMPLE_POEM), \
         patch("routers.creative._safe_generate_image", new_callable=AsyncMock, return_value=None), \
         patch("routers.creative._safe_generate_audio", new_callable=AsyncMock, return_value=SAMPLE_AUDIO_BYTES):
        from main import app
        yield TestClient(app)


@pytest.fixture
def client_all_media_fail():
    """Client where both image and audio fail, but poem succeeds."""
    with patch("routers.creative._generate_poem", new_callable=AsyncMock, return_value=SAMPLE_POEM), \
         patch("routers.creative._safe_generate_image", new_callable=AsyncMock, return_value=None), \
         patch("routers.creative._safe_generate_audio", new_callable=AsyncMock, return_value=None):
        from main import app
        yield TestClient(app)


class TestPoemEndpoint:
    """Tests for POST /api/v1/creative/poem SSE endpoint."""

    def test_poem_endpoint_returns_sse_stream(self, client):
        """Poem endpoint returns SSE with correct content type."""
        response = client.post(
            "/api/v1/creative/poem",
            json={"topic": "spring"},
        )
        assert response.status_code == 200
        assert "text/event-stream" in response.headers.get("content-type", "")

    def test_poem_stream_contains_poem_event(self, client):
        """SSE stream includes poem event with text."""
        response = client.post(
            "/api/v1/creative/poem",
            json={"topic": "spring"},
        )
        events = _parse_sse_events(response.text)
        poem_events = [e for e in events if e["event"] == "poem"]
        assert len(poem_events) == 1
        assert "text" in poem_events[0]["data"]
        assert len(poem_events[0]["data"]["text"]) > 0

    def test_poem_stream_contains_image_event(self, client):
        """SSE stream includes poem_image event with URL."""
        response = client.post(
            "/api/v1/creative/poem",
            json={"topic": "spring"},
        )
        events = _parse_sse_events(response.text)
        image_events = [e for e in events if e["event"] == "poem_image"]
        assert len(image_events) == 1
        assert "url" in image_events[0]["data"]

    def test_poem_stream_contains_audio_event(self, client):
        """SSE stream includes poem_audio event with base64 audio."""
        response = client.post(
            "/api/v1/creative/poem",
            json={"topic": "spring"},
        )
        events = _parse_sse_events(response.text)
        audio_events = [e for e in events if e["event"] == "poem_audio"]
        assert len(audio_events) == 1
        assert "audio_base64" in audio_events[0]["data"]
        # Verify it's valid base64
        decoded = base64.b64decode(audio_events[0]["data"]["audio_base64"])
        assert len(decoded) > 0

    def test_poem_stream_ends_with_done(self, client):
        """SSE stream ends with done event."""
        response = client.post(
            "/api/v1/creative/poem",
            json={"topic": "spring"},
        )
        events = _parse_sse_events(response.text)
        assert events[-1]["event"] == "done"

    def test_poem_stream_contains_reasoning_events(self, client):
        """SSE stream includes reasoning events for UI timeline."""
        response = client.post(
            "/api/v1/creative/poem",
            json={"topic": "spring"},
        )
        events = _parse_sse_events(response.text)
        reasoning_events = [e for e in events if e["event"] == "reasoning"]
        assert len(reasoning_events) >= 2
        statuses = [e["data"]["status"] for e in reasoning_events]
        assert "running" in statuses
        assert "done" in statuses

    def test_empty_topic_returns_400(self, client):
        """Empty topic returns 400."""
        response = client.post(
            "/api/v1/creative/poem",
            json={"topic": ""},
        )
        assert response.status_code == 400

    def test_whitespace_topic_returns_400(self, client):
        """Whitespace-only topic returns 400."""
        response = client.post(
            "/api/v1/creative/poem",
            json={"topic": "   "},
        )
        assert response.status_code == 400


class TestGracefulDegradation:
    """Tests for graceful degradation when image or audio fails."""

    def test_stream_completes_when_image_fails(self, client_image_fail):
        """Stream still has poem text and done event when image generation fails."""
        response = client_image_fail.post(
            "/api/v1/creative/poem",
            json={"topic": "bamboo"},
        )
        events = _parse_sse_events(response.text)
        event_types = [e["event"] for e in events]
        assert "poem" in event_types
        assert "done" in event_types
        assert "poem_image" not in event_types

    def test_stream_completes_when_all_media_fail(self, client_all_media_fail):
        """Stream completes with poem text only when both image and audio fail."""
        response = client_all_media_fail.post(
            "/api/v1/creative/poem",
            json={"topic": "bamboo"},
        )
        events = _parse_sse_events(response.text)
        event_types = [e["event"] for e in events]
        assert "poem" in event_types
        assert "done" in event_types
        assert "poem_image" not in event_types
        assert "poem_audio" not in event_types
