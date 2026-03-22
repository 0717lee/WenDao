"""
Creative content generation endpoints.
Poem generation with CogView illustration and TTS audio.
"""

import asyncio
import base64
import json
import logging
from typing import AsyncGenerator

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/creative", tags=["creative"])


class PoemRequest(BaseModel):
    topic: str


def _sse_event(event_type: str, data: dict) -> str:
    """Format a named SSE event."""
    return f"event: {event_type}\ndata: {json.dumps(data, ensure_ascii=False)}\n\n"


async def _generate_poem(topic: str) -> str:
    """Call GLM-4 to generate classical Chinese poetry on the given topic."""
    from zhipuai import ZhipuAI
    import os

    api_key = os.getenv("ZHIPUAI_API_KEY", "")
    if not api_key:
        raise ValueError("ZHIPUAI_API_KEY not configured")

    client = ZhipuAI(api_key=api_key)
    response = client.chat.completions.create(
        model="glm-4-flash",
        messages=[
            {
                "role": "system",
                "content": (
                    "你是一位精通格律的古典诗词大师。"
                    "根据用户提供的主题，创作一首五言或七言古风诗。"
                    "只输出诗词正文，不要标题不要解释。"
                ),
            },
            {"role": "user", "content": topic},
        ],
    )
    return response.choices[0].message.content.strip()


async def _generate_image(topic: str) -> str | None:
    """Generate a CogView illustration for the poem topic."""
    from agents.image_gen import ImageGenAgent

    agent = ImageGenAgent()
    prompt = f"中国古典水墨画风格，诗意场景：{topic}，留白意境"
    return agent.generate(prompt)


async def _generate_audio(poem_text: str) -> bytes | None:
    """Generate TTS audio for the poem text."""
    from agents.speech import SpeechAgent

    agent = SpeechAgent()
    audio = await agent.tts(poem_text)
    if audio in (b"TTS_NOT_CONFIGURED", b"TTS_EMPTY_RESULT"):
        return None
    return audio


async def stream_poem_response(topic: str) -> AsyncGenerator[str, None]:
    """Stream poem generation as SSE events: poem -> poem_image -> poem_audio -> done."""

    # Step 1: Generate poem text
    yield _sse_event("reasoning", {"step": "poem_gen", "label": "AI\u4f5c\u8bd7", "status": "running"})

    try:
        poem_text = await _generate_poem(topic)
    except Exception as e:
        logger.error(f"Poem generation failed: {e}")
        yield _sse_event("error", {"message": f"Poem generation failed: {str(e)}"})
        return

    yield _sse_event("poem", {"text": poem_text})
    yield _sse_event("reasoning", {"step": "poem_gen", "status": "done"})

    # Step 2: Generate image and audio in parallel
    image_task = asyncio.create_task(_safe_generate_image(topic))
    audio_task = asyncio.create_task(_safe_generate_audio(poem_text))

    # Wait for image
    image_url = await image_task
    if image_url:
        yield _sse_event("poem_image", {"url": image_url})

    # Wait for audio
    audio_bytes = await audio_task
    if audio_bytes:
        audio_b64 = base64.b64encode(audio_bytes).decode()
        yield _sse_event("poem_audio", {"audio_base64": audio_b64})

    yield _sse_event("done", {})


async def _safe_generate_image(topic: str) -> str | None:
    """Wrapper that catches exceptions from image generation."""
    try:
        return await _generate_image(topic)
    except Exception as e:
        logger.warning(f"Image generation failed (graceful skip): {e}")
        return None


async def _safe_generate_audio(poem_text: str) -> bytes | None:
    """Wrapper that catches exceptions from audio generation."""
    try:
        return await _generate_audio(poem_text)
    except Exception as e:
        logger.warning(f"Audio generation failed (graceful skip): {e}")
        return None


@router.post("/poem")
async def generate_poem(request: PoemRequest):
    """Generate classical Chinese poetry with illustration and audio via SSE."""
    if not request.topic.strip():
        raise HTTPException(status_code=400, detail="Topic cannot be empty")

    return StreamingResponse(
        stream_poem_response(request.topic.strip()),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
