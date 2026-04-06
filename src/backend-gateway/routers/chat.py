import asyncio, json, logging, time
from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import StreamingResponse
from typing import AsyncGenerator
from agents.rag import RAGAgent
from core.rate_limit import limiter
from core.lazy_proxy import LazyProxy
from models.schemas import ChatRequest
from core.database import get_db

router = APIRouter()
logger = logging.getLogger(__name__)
SMALL_TALK_TRIGGERS = {
    "你好", "您好", "嗨", "哈喽", "hello", "hi", "在吗", "在嘛", "有人吗", "谢谢", "多谢", "再见", "拜拜",
}

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
    citation_count = len(citations)
    primary_citation = citations[0] if citations else None
    trust_points: list[str] = []

    if citation_count > 0:
        trust_points.append(f"本次回答引用了 {citation_count} 条古籍片段，可继续点开原文核对。")
    else:
        trust_points.append("本次回答没有检索到直接引文，建议再回到原文或检索页核对。")

    if related_entities:
        trust_points.append(f"系统同时关联了 {len(related_entities)} 个知识实体，适合继续追人物、典故与背景。")

    if primary_citation:
        trust_points.append(f"优先依据《{primary_citation['title']}》中的片段展开讲解。")

    follow_prompt = (
        f"请把刚才关于“{query}”的解释再说得更白话一些，像老师给初学者讲课一样，并补一个生活化例子。"
    )
    entity_prompt = (
        f"请继续围绕“{query}”讲相关人物、典故和背景脉络，按容易理解的顺序展开。"
        if related_entities
        else f"请继续围绕“{query}”补充背景和前后文，让我更容易读懂原文。"
    )

    actions = []
    if primary_citation:
        actions.append({
            "id": "open-primary",
            "label": "定位原文",
            "kind": "reader",
            "citation": primary_citation,
        })

    actions.extend([
        {
            "id": "simplify-answer",
            "label": "换成更白话",
            "kind": "chat",
            "prompt": follow_prompt,
        },
        {
            "id": "follow-allusions",
            "label": "追人物典故",
            "kind": "chat",
            "prompt": entity_prompt,
        },
    ])

    return {
        "trustLabel": "有原文依据" if citation_count > 0 else "建议继续核对",
        "trustPoints": trust_points,
        "citationCount": citation_count,
        "relatedEntityCount": len(related_entities),
        "primaryCitation": primary_citation,
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
            for i, char in enumerate(small_talk_answer):
                yield f'data: {json.dumps({"content": char}, ensure_ascii=False)}\n\n'
                if (i + 1) % 12 == 0:
                    await asyncio.sleep(0.01)
            yield 'event: done\ndata: {}\n\n'
            return

        # -- Step 1: Retrieval --
        yield sse_reasoning("retrieval", "检索古籍知识库", "running", model="Kimi-32k")
        yield f'event: progress\ndata: {json.dumps({"status": "正在整理线索..."}, ensure_ascii=False)}\n\n'
        t0 = time.time()
        result = await asyncio.to_thread(rag_agent.query_ancient_text, query)
        answer = result["answer"]
        citations = result["citations"]
        yield sse_reasoning("retrieval", "检索古籍知识库", "complete", time.time() - t0, model="Kimi-32k")

        # -- Step 2: Entity extraction --
        yield sse_reasoning("entity_extraction", "抽取关联实体", "running", model="GLM-4-Flash")
        t0 = time.time()
        related_entities = result.get("related_entities", [])
        yield sse_reasoning("entity_extraction", "抽取关联实体", "complete", time.time() - t0, model="GLM-4-Flash")

        # -- Step 3: Knowledge linking --
        yield sse_reasoning("knowledge_linking", "知识关联推理", "running", model="GraphRAG")
        t0 = time.time()
        # GraphRAG linking already performed inside query_ancient_text
        await asyncio.sleep(0.05)  # brief pause for visual feedback
        yield sse_reasoning("knowledge_linking", "知识关联推理", "complete", time.time() - t0, model="GraphRAG")

        # -- Step 4: Generation (streaming) --
        yield sse_reasoning("generation", "生成通俗解读", "running", model="Kimi-32k")
        yield f'event: progress\ndata: {json.dumps({"status": "正在组织回答..."}, ensure_ascii=False)}\n\n'
        t0 = time.time()

        for i, char in enumerate(answer):
            yield f'data: {json.dumps({"content": char}, ensure_ascii=False)}\n\n'
            if (i + 1) % 10 == 0:
                await asyncio.sleep(0.01)

        yield sse_reasoning("generation", "生成通俗解读", "complete", time.time() - t0, model="Kimi-32k")

        # -- Citations --
        if citations:
            yield f'event: citations\ndata: {json.dumps(citations, ensure_ascii=False)}\n\n'

        # -- Related entities (GraphRAG) --
        if related_entities:
            yield f'event: entities\ndata: {json.dumps({"entity_ids": related_entities}, ensure_ascii=False)}\n\n'

        answer_context = _build_answer_context(query=query, citations=citations, related_entities=related_entities)
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
                    (query, answer, json.dumps(citations, ensure_ascii=False))
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
async def chat(request: Request, body: ChatRequest):
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
