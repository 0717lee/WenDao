import asyncio, json, logging, re, time
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import StreamingResponse
from typing import AsyncGenerator
from agents.rag import RAGAgent
from core.rate_limit import limiter
from core.auth import require_auth
from core.lazy_proxy import LazyProxy
from models.schemas import ChatRequest
from core.database import get_db

router = APIRouter()
logger = logging.getLogger(__name__)
SMALL_TALK_TRIGGERS = {
    "你好", "您好", "嗨", "哈喽", "hello", "hi", "在吗", "在嘛", "有人吗", "谢谢", "多谢", "再见", "拜拜",
}
GUIDANCE_ONLY_PATTERNS = (
    "我只记得一句古文",
    "只记得一句古文",
    "带我从一句话开始",
    "从一句话开始",
    "下一步可以读什么",
    "下一步该读什么",
)
QUOTE_HINT_RE = re.compile(r"[“”「」『』《》]|[:：]")

def _create_rag_agent() -> RAGAgent:
    return RAGAgent()

rag_agent = LazyProxy(_create_rag_agent)

def sse_reasoning(step: str, label: str, status: str, duration: float = None, model: str = None, fallback: bool = False) -> str:
    """Generate an SSE reasoning event string."""
    data = {"step": step, "label": label, "status": status}
    if duration is not None:
        data["duration"] = round(duration, 2)
    if model:
        data["model"] = model
    if fallback:
        data["fallback"] = True
    return f'event: reasoning\ndata: {json.dumps(data, ensure_ascii=False)}\n\n'


def _build_answer_context(query: str, citations: list[dict], related_entities: list[str]) -> dict:
    trust_points: list[str] = ["这次回答优先直接解释你的问题，不再额外展示原文引用。"]

    follow_prompt = (
        f"请把刚才关于“{query}”的解释换个更容易理解的说法，并补一个生活化例子。"
    )
    entity_prompt = (
        f"请继续围绕“{query}”讲相关人物、典故和背景脉络，按容易理解的顺序展开。"
        if related_entities
        else f"请继续围绕“{query}”补充背景和前后文，让我更容易读懂原文。"
    )

    actions = [
        {
            "id": "simplify-answer",
            "label": "换个说法",
            "kind": "chat",
            "prompt": follow_prompt,
        },
        {
            "id": "follow-allusions",
            "label": "追人物典故",
            "kind": "chat",
            "prompt": entity_prompt,
        },
    ]

    return {
        "trustLabel": "直接解读",
        "trustPoints": trust_points,
        "citationCount": 0,
        "relatedEntityCount": len(related_entities),
        "primaryCitation": None,
        "suggestedActions": actions,
    }


def _small_talk_response(query: str) -> str | None:
    normalized = query.strip().lower()
    if not normalized:
        return None

    if normalized in {"你好", "您好", "嗨", "hello", "hi", "哈喽", "在吗", "在嘛", "有人吗"}:
        return "你好，我在这里。你可以直接发一句原文、一个人物、一个典故，或者问我某篇古文到底在讲什么。"
    if normalized in {"谢谢", "多谢"}:
        return "不客气。你如果愿意，可以继续发一句原文或一个典故，我会接着帮你讲明白。"
    if normalized in {"再见", "拜拜"}:
        return "好，回头你想继续读古文时，随时来找我。"
    return None


def _guidance_only_response(query: str) -> str | None:
    compact = query.strip()
    if not compact:
        return None
    if any(pattern in compact for pattern in GUIDANCE_ONLY_PATTERNS) and not QUOTE_HINT_RE.search(compact):
        return "可以。先把你记得的那一句原文直接贴给我，或者告诉我篇名、人物、典故中的任意一个线索，我再按那一句带你往下读。"
    return None


def _iter_answer_chunks(answer: str, chunk_size: int = 24) -> list[str]:
    if not answer:
        return []
    parts = [part for part in re.split(r"(?<=[。！？；!?；])", answer) if part]
    chunks: list[str] = []
    for part in parts:
        text = part.strip()
        if not text:
            continue
        if len(text) <= chunk_size:
            chunks.append(text)
            continue
        for start in range(0, len(text), chunk_size):
            chunks.append(text[start:start + chunk_size])
    return chunks or [answer]


async def stream_chat_response(query: str, rag_agent: RAGAgent) -> AsyncGenerator[str, None]:
    """
    Generate SSE streaming response with reasoning events.

    Emits `event: reasoning` at each processing stage so the frontend can
    render a live reasoning timeline (retrieval -> entity extraction ->
    knowledge linking -> generation).
    """
    try:
        small_talk_answer = _small_talk_response(query)
        if small_talk_answer:
            yield f'event: progress\ndata: {json.dumps({"status": "正在回应..."}, ensure_ascii=False)}\n\n'
            for chunk in _iter_answer_chunks(small_talk_answer):
                yield f'data: {json.dumps({"content": chunk}, ensure_ascii=False)}\n\n'
            yield 'event: done\ndata: {}\n\n'
            return

        guidance_only_answer = _guidance_only_response(query)
        if guidance_only_answer:
            yield f'event: progress\ndata: {json.dumps({"status": "先确认你记得的原句..."}, ensure_ascii=False)}\n\n'
            for chunk in _iter_answer_chunks(guidance_only_answer):
                yield f'data: {json.dumps({"content": chunk}, ensure_ascii=False)}\n\n'
            yield 'event: done\ndata: {}\n\n'
            return

        # -- Step 1: Retrieval --
        yield sse_reasoning("retrieval", "理解问题", "running", model="Kimi-8k")
        yield f'event: progress\ndata: {json.dumps({"status": "正在整理线索..."}, ensure_ascii=False)}\n\n'
        t0 = time.time()
        result = await asyncio.to_thread(rag_agent.query_ancient_text, query, False)
        answer = result["answer"]
        related_entities = result.get("related_entities", [])
        yield sse_reasoning("retrieval", "理解问题", "complete", time.time() - t0, model="Kimi-8k")

        # -- Step 2: Generation (streaming) --
        yield sse_reasoning("generation", "生成回答", "running", model="Kimi-8k")
        yield f'event: progress\ndata: {json.dumps({"status": "正在组织回答..."}, ensure_ascii=False)}\n\n'
        t0 = time.time()

        for chunk in _iter_answer_chunks(answer):
            yield f'data: {json.dumps({"content": chunk}, ensure_ascii=False)}\n\n'

        yield sse_reasoning("generation", "生成回答", "complete", time.time() - t0, model="Kimi-8k")

        answer_context = _build_answer_context(query=query, citations=[], related_entities=related_entities)
        yield f'event: answer_context\ndata: {json.dumps(answer_context, ensure_ascii=False)}\n\n'

        # -- Done --
        yield 'event: done\ndata: {}\n\n'

        # -- Persist conversation history --
        try:
            async with get_db() as db:
                await db.execute(
                    """INSERT INTO conversations
                       (user_message, ai_response, citations_json, timestamp)
                       VALUES (?, ?, ?, datetime('now'))""",
                    (query, answer, json.dumps([], ensure_ascii=False))
                )
                await db.commit()
        except Exception as db_error:
            logger.warning("[ChatRouter] 保存对话历史失败: %s", db_error)

    except Exception as e:
        logger.exception("[ChatRouter] 流式响应生成失败: %s", e)
        error_msg = "抱歉，处理您的请求时出现异常，请稍后重试。"
        yield f'event: error\ndata: {json.dumps({"message": error_msg}, ensure_ascii=False)}\n\n'


@router.post("/api/v1/chat")
@limiter.limit("10/minute")
async def chat(request: Request, body: ChatRequest, _user: dict = Depends(require_auth)):
    """
    SSE流式聊天API

    Args:
        request: 聊天请求（包含用户消息）

    Returns:
        StreamingResponse: SSE流式响应
    """
    try:
        return StreamingResponse(
            stream_chat_response(body.message, rag_agent),
            media_type="text/event-stream",
            headers={
                "Cache-Control": "no-cache",
                "Connection": "keep-alive",
                "X-Accel-Buffering": "no"
            }
        )
    except Exception as e:
        logger.exception("[ChatRouter] 聊天API错误: %s", e)
        raise HTTPException(status_code=500, detail="服务器错误，请稍后重试")
