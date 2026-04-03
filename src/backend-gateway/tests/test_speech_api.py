"""Tests for Speech API: ASR transcription and TTS synthesis endpoints."""

import io
import json
import base64
import pytest
from unittest.mock import patch, AsyncMock, MagicMock
from fastapi.testclient import TestClient


def _auth_headers():
    from core.auth import create_token

    token = create_token("test-user", "tester")
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def client():
    """Create test client with mocked SpeechAgent."""
    with patch("agents.speech.SpeechAgent") as MockSpeech:
        mock_instance = MagicMock()
        # Default: ASR returns known text
        mock_instance.asr = AsyncMock(return_value="Hello test transcription")
        # Default: TTS returns known bytes
        mock_instance.tts = AsyncMock(return_value=b"\x00\x01\x02\x03AUDIO_DATA")
        MockSpeech.return_value = mock_instance

        from main import app
        yield TestClient(app)


@pytest.fixture
def client_asr_fail():
    """Create test client where ASR returns empty text (failure)."""
    with patch("agents.speech.SpeechAgent") as MockSpeech:
        mock_instance = MagicMock()
        mock_instance.asr = AsyncMock(return_value="")
        MockSpeech.return_value = mock_instance

        from main import app
        yield TestClient(app)


@pytest.fixture
def client_asr_exception():
    """Create test client where ASR raises an exception."""
    with patch("agents.speech.SpeechAgent") as MockSpeech:
        mock_instance = MagicMock()
        mock_instance.asr = AsyncMock(side_effect=Exception("ASR service unavailable"))
        MockSpeech.return_value = mock_instance

        from main import app
        yield TestClient(app)


@pytest.fixture
def client_tts_fail():
    """Create test client where TTS returns sentinel value."""
    with patch("agents.speech.SpeechAgent") as MockSpeech:
        mock_instance = MagicMock()
        mock_instance.tts = AsyncMock(return_value=b"TTS_NOT_CONFIGURED")
        MockSpeech.return_value = mock_instance

        from main import app
        yield TestClient(app)


def _make_audio_file(size_bytes: int = 512, filename: str = "recording.webm", content_type: str = "audio/webm"):
    """Helper: create a fake audio file."""
    data = b"\x1a\x45\xdf\xa3" + b"\x00" * (size_bytes - 4)  # webm magic bytes
    return ("file", (filename, io.BytesIO(data), content_type))


class TestASREndpoint:
    """Tests for POST /api/v1/speech/asr"""

    def test_asr_requires_auth(self, client):
        response = client.post(
            "/api/v1/speech/asr",
            files=[_make_audio_file()],
        )
        assert response.status_code == 401

    @patch("routers.speech_api._convert_to_pcm", return_value=b"\x00" * 1024)
    def test_asr_returns_transcription(self, mock_convert, client):
        """Valid audio upload returns transcribed text."""
        response = client.post(
            "/api/v1/speech/asr",
            files=[_make_audio_file()],
            headers=_auth_headers(),
        )
        assert response.status_code == 200
        data = response.json()
        assert "text" in data
        assert data["text"] == "Hello test transcription"
        assert "error" not in data

    @patch("routers.speech_api._convert_to_pcm", return_value=b"\x00" * 1024)
    def test_asr_failure_returns_friendly_error(self, mock_convert, client_asr_fail):
        """ASR returning empty text yields friendly Chinese error message."""
        response = client_asr_fail.post(
            "/api/v1/speech/asr",
            files=[_make_audio_file()],
            headers=_auth_headers(),
        )
        assert response.status_code == 200
        data = response.json()
        assert data["text"] == ""
        assert data["error"] == "未能识别，请重新录音"

    @patch("routers.speech_api._convert_to_pcm", return_value=b"\x00" * 1024)
    def test_asr_exception_returns_error(self, mock_convert, client_asr_exception):
        """ASR raising exception returns friendly error without crashing."""
        response = client_asr_exception.post(
            "/api/v1/speech/asr",
            files=[_make_audio_file()],
            headers=_auth_headers(),
        )
        assert response.status_code == 200
        data = response.json()
        assert data["text"] == ""
        assert "error" in data

    @patch("routers.speech_api._convert_to_pcm", return_value=b"\x00" * 1024)
    def test_asr_accepts_wav_format(self, mock_convert, client):
        """ASR accepts WAV audio files."""
        response = client.post(
            "/api/v1/speech/asr",
            files=[_make_audio_file(filename="test.wav", content_type="audio/wav")],
            headers=_auth_headers(),
        )
        assert response.status_code == 200
        data = response.json()
        assert data["text"] == "Hello test transcription"

    @patch("routers.speech_api._convert_to_pcm", return_value=b"\x00" * 1024)
    def test_asr_accepts_mp3_format(self, mock_convert, client):
        """ASR accepts MP3 audio files."""
        response = client.post(
            "/api/v1/speech/asr",
            files=[_make_audio_file(filename="test.mp3", content_type="audio/mpeg")],
            headers=_auth_headers(),
        )
        assert response.status_code == 200
        data = response.json()
        assert data["text"] == "Hello test transcription"


class TestTTSEndpoint:
    """Tests for POST /api/v1/speech/tts"""

    def test_tts_requires_auth(self, client):
        response = client.post(
            "/api/v1/speech/tts",
            json={"text": "Hello test"},
        )
        assert response.status_code == 401

    def test_tts_returns_audio_base64(self, client):
        """Valid text returns base64-encoded audio."""
        response = client.post(
            "/api/v1/speech/tts",
            json={"text": "Hello test"},
            headers=_auth_headers(),
        )
        assert response.status_code == 200
        data = response.json()
        assert "audio_base64" in data
        assert len(data["audio_base64"]) > 0
        # Verify it's valid base64
        decoded = base64.b64decode(data["audio_base64"])
        assert len(decoded) > 0

    def test_tts_empty_text_returns_error(self, client):
        """Empty text returns error without calling TTS."""
        response = client.post(
            "/api/v1/speech/tts",
            json={"text": ""},
            headers=_auth_headers(),
        )
        assert response.status_code == 200
        data = response.json()
        assert data["audio_base64"] == ""
        assert "error" in data

    def test_tts_whitespace_text_returns_error(self, client):
        """Whitespace-only text returns error."""
        response = client.post(
            "/api/v1/speech/tts",
            json={"text": "   "},
            headers=_auth_headers(),
        )
        assert response.status_code == 200
        data = response.json()
        assert data["audio_base64"] == ""
        assert "error" in data

    def test_tts_failure_returns_friendly_error(self, client_tts_fail):
        """TTS returning sentinel value yields friendly error."""
        response = client_tts_fail.post(
            "/api/v1/speech/tts",
            json={"text": "Test text for TTS"},
            headers=_auth_headers(),
        )
        assert response.status_code == 200
        data = response.json()
        assert data["audio_base64"] == ""
        assert "error" in data


class TestAudioFormatDetection:
    """Tests for _detect_audio_format helper."""

    def test_detect_webm_from_filename(self):
        from routers.speech_api import _detect_audio_format
        assert _detect_audio_format("recording.webm", "audio/webm") == "webm"

    def test_detect_wav_from_filename(self):
        from routers.speech_api import _detect_audio_format
        assert _detect_audio_format("test.wav", "audio/wav") == "wav"

    def test_detect_mp3_from_content_type(self):
        from routers.speech_api import _detect_audio_format
        assert _detect_audio_format("", "audio/mpeg") == "mp3"

    def test_default_to_webm(self):
        from routers.speech_api import _detect_audio_format
        assert _detect_audio_format("", "application/octet-stream") == "webm"
