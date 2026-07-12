"""
Creative content generation endpoints.
Poem generation with CogView illustration and TTS audio.
"""

import asyncio
import base64
import json
import logging
import os
from typing import AsyncGenerator

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from core.auth import require_auth
from core.rate_limit import limiter
from core.runtime_checks import get_zhipu_api_key

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/creative", tags=["creative"])
MEDIA_ENHANCEMENT_TIMEOUT = float(os.getenv("CREATIVE_MEDIA_TIMEOUT_SECONDS", "2.5"))
POEM_PROVIDER_TIMEOUT = float(os.getenv("CREATIVE_POEM_TIMEOUT_SECONDS", "30"))


class PoemRequest(BaseModel):
    topic: str = Field(max_length=500)


def _sse_event(event_type: str, data: dict) -> str:
    """Format a named SSE event."""
    return f"event: {event_type}\ndata: {json.dumps(data, ensure_ascii=False)}\n\n"


async def _generate_poem(topic: str) -> str:
    """Call GLM-4 to generate classical Chinese poetry on the given topic."""
    from zhipuai import ZhipuAI

    api_key = get_zhipu_api_key()
    if not api_key:
        raise ValueError("ZHIPUAI_API_KEY not configured")

    def _call_sync():
        client = ZhipuAI(api_key=api_key, timeout=POEM_PROVIDER_TIMEOUT, max_retries=0)
        try:
            return client.chat.completions.create(
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
        finally:
            client.close()

    response = await asyncio.wait_for(asyncio.to_thread(_call_sync), timeout=POEM_PROVIDER_TIMEOUT)
    return response.choices[0].message.content.strip()


async def _generate_image(topic: str) -> str | None:
    """Generate a CogView illustration for the poem topic."""
    from agents.image_gen import ImageGenAgent

    prompt = f"中国古典水墨画风格，诗意场景：{topic}，留白意境"

    def _call_sync():
        agent = ImageGenAgent(timeout=MEDIA_ENHANCEMENT_TIMEOUT, max_retries=0)
        try:
            return agent.generate(prompt)
        finally:
            agent.close()

    return await asyncio.to_thread(_call_sync)


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
        yield _sse_event("error", {"message": "诗词生成失败，请稍后重试"})
        return

    yield _sse_event("poem", {"text": poem_text})
    yield _sse_event("reasoning", {"step": "poem_gen", "status": "done"})

    # Step 2: Generate image and audio in parallel
    image_task = asyncio.create_task(_safe_generate_image(topic))
    audio_task = asyncio.create_task(_safe_generate_audio(poem_text))
    media_tasks = (image_task, audio_task)
    try:
        # Both optional enhancements share the same wall-clock timeout window.
        image_url, audio_bytes = await asyncio.gather(
            _await_optional_media(image_task, "poem_image"),
            _await_optional_media(audio_task, "poem_audio"),
        )
        if image_url:
            yield _sse_event("poem_image", {"url": image_url})

        if audio_bytes:
            audio_b64 = base64.b64encode(audio_bytes).decode()
            yield _sse_event("poem_audio", {"audio_base64": audio_b64})

        yield _sse_event("done", {})
    finally:
        for task in media_tasks:
            if not task.done():
                task.cancel()
        await asyncio.gather(*media_tasks, return_exceptions=True)


async def _await_optional_media(task: asyncio.Task, label: str):
    try:
        return await asyncio.wait_for(task, timeout=MEDIA_ENHANCEMENT_TIMEOUT)
    except asyncio.TimeoutError:
        logger.warning("%s generation timed out after %.1fs; skipping optional enhancement", label, MEDIA_ENHANCEMENT_TIMEOUT)
        task.cancel()
        return None


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
@limiter.limit("10/minute")
async def generate_poem(request: Request, payload: PoemRequest, _user: dict = Depends(require_auth)):
    """Generate classical Chinese poetry with illustration and audio via SSE."""
    if not payload.topic.strip():
        raise HTTPException(status_code=400, detail="Topic cannot be empty")

    return StreamingResponse(
        stream_poem_response(payload.topic.strip()),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
