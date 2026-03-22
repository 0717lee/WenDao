import asyncio, base64, json, time
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, HTTPException, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import Optional, List, AsyncGenerator
from slowapi import Limiter
from slowapi.util import get_remote_address
from agents.router import IntentRouter
from agents.rag import RAGAgent
from agents.speech import SpeechAgent
from models.schemas import ChatRequest

limiter = Limiter(key_func=get_remote_address)
from core.database import get_db

router = APIRouter()

# 实例化三大代理节点
intent_agent = IntentRouter()
rag_agent = RAGAgent()
speech_agent = SpeechAgent()

class SceneCommand(BaseModel):
    action: str
    target: Optional[str] = None
    position: Optional[List[float]] = None
    message: str

@router.websocket("/ws/chat")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    try:
        while True:
            # 兼容模式：既能接收前端的心跳/纯文本 JSON，也能处理附带 base64 语音流的 JSON 封装结构。
            data = await websocket.receive_json()
            
            # --- 阶段 0: 心跳包或闲杂指令过滤 ---
            if data.get("action") == "heartbeat":
                continue
                
            query_text = data.get("query", "")
            audio_base64 = data.get("audio", "")
            
            # --- 阶段 1: 语音转文本 (ASR Phase) ---
            if audio_base64:
                # 收到音频流，将 Base64 发给 ASR 代理
                query_text = await speech_agent.asr(base64.b64decode(audio_base64))
                # ASR 出了结果，先直接告诉前端上屏显示听写结果
                await websocket.send_json({"type": "transcript", "text": query_text})
            elif not query_text:
                continue

            # --- 阶段 2: 意图分析 (Router Phase) ---
            # 交由智谱 LLM 判断用户意图、提取 Action 以及明确是否必须走 RAG
            intent_data = await intent_agent.analyze_intent(query_text)
            action = intent_data.get("action", "idle")
            target = intent_data.get("target")

            # 🔥 [性能与体验优化 T5.2]: 并发解耦，让 3D 动作“秒回”
            # 不要等后面耗时极长的 RAG + TTS 完成，先立刻把 3D 动作指令踢给前端！
            early_cmd = SceneCommand(action=action, target=target, message="正在查询《营造法式》知识库中...")
            await websocket.send_json({
                "type": "command",
                "command": early_cmd.dict()
            })

            # --- 阶段 3: 知识检索 (RAG Phase) / 图像生成 ---
            reply_msg = f"收到指令：{query_text}"
            image_url = None
            if action == "generate_image":
                # 调用 CogView-3 生成概念图
                try:
                    from agents.image_gen import ImageGenAgent
                    img_agent = ImageGenAgent()
                    image_url = img_agent.generate(intent_data.get("prompt", query_text))
                    reply_msg = "已为您生成古建筑概念图。" if image_url else "图像生成失败，请稍后重试。"
                except Exception as e:
                    reply_msg = f"图像生成服务暂不可用: {e}"
            elif intent_data.get("need_rag"):
                reply_msg = await rag_agent.query_knowledge(intent_data, query_text)
            elif action == "idle":
                reply_msg = "您可以随时要求我拆解斗拱，或是分析承重梁的受力情况。"

            # --- 阶段 4: 语音合成 (TTS Phase) ---
            audio_bytes = await speech_agent.tts(reply_msg)
            
            # --- 阶段 5: 命令重装与发送 ---
            cmd = SceneCommand(
                action=action,
                target=target,
                message=reply_msg
            )
            
            payload = {
                "type": "command",
                "command": cmd.dict(),
                "audio_data": base64.b64encode(audio_bytes).decode('ascii')
            }
            if image_url:
                payload["image_url"] = image_url
            
            await websocket.send_json(payload)
            
    except WebSocketDisconnect:
        print("Client disconnected from /ws/chat")


# ========== SSE流式聊天API ==========


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


async def stream_chat_response(query: str, rag_agent: RAGAgent) -> AsyncGenerator[str, None]:
    """
    Generate SSE streaming response with reasoning events.

    Emits `event: reasoning` at each processing stage so the frontend can
    render a live reasoning timeline (retrieval -> entity extraction ->
    knowledge linking -> generation).
    """
    try:
        # -- Step 1: Retrieval --
        yield sse_reasoning("retrieval", "检索古籍知识库", "running", model="Kimi-32k")
        yield f'event: progress\ndata: {json.dumps({"status": "检索古籍..."}, ensure_ascii=False)}\n\n'
        t0 = time.time()
        result = rag_agent.query_ancient_text(query)
        answer = result["answer"]
        citations = result["citations"]
        yield sse_reasoning("retrieval", "检索古籍知识库", "complete", time.time() - t0, model="Kimi-32k")

        # -- Step 2: Entity extraction --
        yield sse_reasoning("entity_extraction", "抽取关联实体", "running", model="GLM-4-Flash")
        t0 = time.time()
        related_entities = result.get("related_entities", [])
        yield sse_reasoning("entity_extraction", "抽取关联实体", "complete", time.time() - t0, model="GLM-4-Flash")

        # -- Step 2b: Discover NEW entities (not in graph) --
        new_entities = []
        try:
            from core.entity_discovery import EntityDiscovery
            from routers.knowledge_graph import _get_graph

            graph_data = _get_graph()
            discovery = EntityDiscovery(graph_data)
            new_entities = discovery.discover_new_entities(answer, query)
        except Exception as disc_err:
            print(f"[ChatRouter] Entity discovery failed (non-critical): {disc_err}")

        # -- Step 3: Knowledge linking --
        yield sse_reasoning("knowledge_linking", "知识关联推理", "running", model="GraphRAG")
        t0 = time.time()
        # GraphRAG linking already performed inside query_ancient_text
        await asyncio.sleep(0.05)  # brief pause for visual feedback
        yield sse_reasoning("knowledge_linking", "知识关联推理", "complete", time.time() - t0, model="GraphRAG")

        # -- Step 4: Generation (streaming) --
        yield sse_reasoning("generation", "生成通俗解读", "running", model="Kimi-32k")
        yield f'event: progress\ndata: {json.dumps({"status": "生成回答..."}, ensure_ascii=False)}\n\n'
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

        # -- New entities discovered (for pending review) --
        if new_entities:
            yield f'event: new_entities\ndata: {json.dumps({"entities": new_entities}, ensure_ascii=False)}\n\n'

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
            print(f"[ChatRouter] 保存对话历史失败: {db_error}")

    except Exception as e:
        print(f"[ChatRouter] 流式响应生成失败: {e}")
        error_msg = f"抱歉，处理您的请求时发生错误：{str(e)}"
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
        print(f"[ChatRouter] 聊天API错误: {e}")
        raise HTTPException(status_code=500, detail=f"服务器错误：{str(e)}")
