"""Speech API: ASR transcription and TTS synthesis endpoints."""

import base64
import io
import logging

from fastapi import APIRouter, UploadFile, File
from pydantic import BaseModel

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/speech", tags=["speech"])


class TTSRequest(BaseModel):
    text: str


def _convert_to_pcm(audio_bytes: bytes, source_format: str = "webm") -> bytes:
    """
    Convert audio bytes from browser format (webm/wav/mp3) to raw PCM 16kHz mono 16-bit.
    iFlytek ASR requires audio/L16;rate=16000 format.
    """
    try:
        from pydub import AudioSegment

        audio = AudioSegment.from_file(io.BytesIO(audio_bytes), format=source_format)
        audio = audio.set_frame_rate(16000).set_channels(1).set_sample_width(2)
        return audio.raw_data
    except Exception as e:
        logger.warning(f"Audio conversion failed ({source_format}): {e}, using raw bytes")
        return audio_bytes


def _detect_audio_format(filename: str, content_type: str) -> str:
    """Detect audio format from filename extension or content type."""
    if filename:
        ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
        if ext in ("webm", "wav", "mp3", "ogg", "flac"):
            return ext
    if "webm" in content_type:
        return "webm"
    if "wav" in content_type:
        return "wav"
    if "mp3" in content_type or "mpeg" in content_type:
        return "mp3"
    if "ogg" in content_type:
        return "ogg"
    return "webm"  # Default: browser MediaRecorder outputs webm


@router.post("/asr")
async def speech_asr(file: UploadFile = File(...)):
    """
    Transcribe audio to text via iFlytek ASR.
    Accepts audio files (webm/wav/mp3) from browser MediaRecorder.
    Returns { "text": "..." } on success, { "text": "", "error": "..." } on failure.
    """
    try:
        audio_bytes = await file.read()

        if not audio_bytes:
            return {"text": "", "error": "No audio data received"}

        # Detect format and convert to PCM for iFlytek
        source_format = _detect_audio_format(file.filename or "", file.content_type or "")
        pcm_data = _convert_to_pcm(audio_bytes, source_format)

        # Lazy import to avoid startup failure when API keys missing
        from agents.speech import SpeechAgent

        agent = SpeechAgent()
        transcribed = await agent.asr(pcm_data)

        # SpeechAgent returns placeholder text on config error
        if not transcribed or transcribed.startswith("（"):
            return {"text": "", "error": "未能识别，请重新录音"}

        return {"text": transcribed}

    except Exception as e:
        logger.error(f"ASR endpoint error: {e}", exc_info=True)
        return {"text": "", "error": "未能识别，请重新录音"}


@router.post("/tts")
async def speech_tts(request: TTSRequest):
    """
    Synthesize text to speech via iFlytek TTS.
    Returns { "audio_base64": "..." } with base64-encoded audio bytes.
    """
    if not request.text or not request.text.strip():
        return {"audio_base64": "", "error": "No text provided"}

    try:
        from agents.speech import SpeechAgent

        agent = SpeechAgent()
        audio_data = await agent.tts(request.text.strip())

        # SpeechAgent returns sentinel values on error
        if not audio_data or audio_data in (b"TTS_NOT_CONFIGURED", b"TTS_EMPTY_RESULT"):
            return {"audio_base64": "", "error": "语音合成服务不可用"}

        audio_b64 = base64.b64encode(audio_data).decode("utf-8")
        return {"audio_base64": audio_b64}

    except Exception as e:
        logger.error(f"TTS endpoint error: {e}", exc_info=True)
        return {"audio_base64": "", "error": "语音合成失败，请重试"}
