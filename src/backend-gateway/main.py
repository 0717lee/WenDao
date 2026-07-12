from dotenv import load_dotenv

load_dotenv()  # 在所有业务模块之前加载 .env 中的 API Keys

from core.runtime_checks import log_startup_checks, prepare_runtime_environment
from core.rate_limit import RateLimitExceeded, limiter, rate_limit_exceeded_handler
from agents.rag import inspect_faiss_index_compatibility
from core.auth import DEFAULT_JWT_SECRET, get_jwt_secret

prepare_runtime_environment()

import asyncio
from contextlib import asynccontextmanager
from fastapi import FastAPI, HTTPException, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.exceptions import RequestValidationError
from routers import chat, search, document, reader, speech_api, creative, auth, graph
from core.database import count_corpus_documents, init_database
from core.pg_database import pg_lifespan, init_pg_database
import uvicorn
import logging
import os

# 配置日志
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


def _make_json_safe(value):
    if isinstance(value, dict):
        return {str(key): _make_json_safe(item) for key, item in value.items()}
    if isinstance(value, (list, tuple)):
        return [_make_json_safe(item) for item in value]
    if isinstance(value, (str, int, float, bool)) or value is None:
        return value
    return str(value)


async def _sync_sqlite_corpus_in_background() -> None:
    try:
        logger.info("后台开始同步 SQLite corpus 数据...")
        await init_database(seed_mode="auto")
        total = await count_corpus_documents()
        logger.info("后台 SQLite corpus 同步完成，当前 corpus 数量: %d", total)
    except Exception as exc:
        logger.exception("后台 SQLite corpus 同步失败: %s", exc)


def _track_background_task(app: FastAPI, task: asyncio.Task[None]) -> None:
    app.state.sqlite_corpus_sync_task = task

    def _clear_task_reference(done_task: asyncio.Task[None]) -> None:
        if getattr(app.state, "sqlite_corpus_sync_task", None) is done_task:
            app.state.sqlite_corpus_sync_task = None

    task.add_done_callback(_clear_task_reference)



def _sqlite_corpus_seed_mode() -> str:
    return os.getenv("SQLITE_CORPUS_SEED_MODE", "auto").strip().lower()


def _should_sync_sqlite_corpus(corpus_count: int) -> bool:
    return corpus_count == 0 and _sqlite_corpus_seed_mode() != "none"

def _resolve_pg_seed_mode(corpus_count: int) -> str | None:
    return "none" if corpus_count == 0 else None

@asynccontextmanager
async def combined_lifespan(app: FastAPI):
    """Combined lifespan: SQLite + PostgreSQL initialization."""
    jwt_secret = get_jwt_secret()
    if jwt_secret == DEFAULT_JWT_SECRET:
        logger.warning("JWT_SECRET 仍是默认值，当前仅适合开发/演示环境")
    log_startup_checks(logger)
    rag_probe = inspect_faiss_index_compatibility()
    if rag_probe["status"] == "ok":
        logger.info(
            "FAISS 索引兼容检查通过：backend=%s",
            rag_probe.get("active_backend"),
        )
    elif rag_probe["status"] == "missing_index":
        logger.warning("未找到 FAISS 索引文件，RAG 将降级为纯 LLM 模式: %s", rag_probe["db_path"])
    elif rag_probe["status"] == "missing_metadata":
        logger.warning("FAISS 索引缺少 index.meta.json，请重建索引: %s", rag_probe["db_path"])
    else:
        logger.warning(
            "FAISS 索引兼容检查失败(%s)，expected=%s active=%s reason=%s",
            rag_probe["status"],
            rag_probe.get("expected_backend"),
            rag_probe.get("active_backend"),
            rag_probe.get("reason"),
        )
    # 1. SQLite schema first, corpus sync later
    logger.info("初始化SQLite数据库基础结构...")
    await init_database(seed_mode="none")
    logger.info("SQLite数据库基础结构初始化完成")

    corpus_count = await count_corpus_documents()
    needs_sqlite_corpus_sync = _should_sync_sqlite_corpus(corpus_count)
    if corpus_count > 0:
        logger.info("SQLite 已存在 %d 条 corpus 文档，启动阶段跳过后台同步", corpus_count)
    else:
        if needs_sqlite_corpus_sync:
            logger.warning("SQLite 当前无 corpus 文档，将在服务就绪后后台分批同步，避免阻塞服务启动")
        else:
            logger.info("SQLite corpus 同步已由 SQLITE_CORPUS_SEED_MODE=none 关闭，将按需读取内置 JSON 快照")

    pg_seed_mode = _resolve_pg_seed_mode(corpus_count)

    # 2. PostgreSQL (Phase 2) — optional, graceful degradation
    try:
        async with pg_lifespan():
            await init_pg_database(seed_mode=pg_seed_mode)
            logger.info("PostgreSQL初始化完成")
            if needs_sqlite_corpus_sync:
                _track_background_task(app, asyncio.create_task(_sync_sqlite_corpus_in_background()))
            yield
    except Exception as e:
        logger.warning(f"PostgreSQL初始化失败，继续使用SQLite: {e}")
        if needs_sqlite_corpus_sync:
            _track_background_task(app, asyncio.create_task(_sync_sqlite_corpus_in_background()))
        yield
    finally:
        sync_task: asyncio.Task[None] | None = getattr(app.state, "sqlite_corpus_sync_task", None)
        if sync_task and not sync_task.done():
            sync_task.cancel()
            try:
                await sync_task
            except asyncio.CancelledError:
                logger.info("后台 SQLite corpus 同步任务已取消")


app = FastAPI(title="古籍智解（WenDao）API", version="0.1.0", lifespan=combined_lifespan)

# 挂载限流器
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, rate_limit_exceeded_handler)

# CORS: 生产环境通过环境变量限制来源域名，开发模式默认 localhost
ALLOWED_ORIGINS = os.getenv("CORS_ALLOWED_ORIGINS", "https://example.com,http://localhost:5173,http://localhost:3000,http://localhost").split(",")

# Vercel / Cloudflare 部署域名模式匹配
# 默认为空（不启用通配），必须通过环境变量显式配置精确域名
CORS_ALLOW_ORIGIN_REGEX = os.getenv("CORS_ALLOW_ORIGIN_REGEX", "")

# 限制 CORS 源，保障安全性
app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_origin_regex=CORS_ALLOW_ORIGIN_REGEX,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(chat.router)
app.include_router(search.router)
app.include_router(document.router)
app.include_router(reader.router)
app.include_router(speech_api.router)
app.include_router(creative.router)
app.include_router(graph.router)


@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException):
    detail = exc.detail if isinstance(exc.detail, str) else "请求失败"
    payload = {
        "error": detail,
        "message": detail,
        "detail": exc.detail,
        "path": str(request.url),
        "status_code": exc.status_code,
    }
    if not isinstance(exc.detail, str):
        payload["details"] = exc.detail
    return JSONResponse(status_code=exc.status_code, content=payload)

# 全局异常处理中间件
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    logger.error(f"未处理的异常: {exc}", exc_info=True)
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={
            "error": "服务器内部错误",
            "message": "服务器内部错误，请稍后重试",
            "detail": "服务器内部错误，请稍后重试",
            "path": str(request.url),
            "status_code": status.HTTP_500_INTERNAL_SERVER_ERROR,
        }
    )


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    details = _make_json_safe(exc.errors())
    logger.warning(f"验证错误: {details}")
    return JSONResponse(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        content={
            "error": "验证错误",
            "message": "验证错误",
            "detail": "验证错误",
            "details": details,
            "path": str(request.url),
            "status_code": status.HTTP_422_UNPROCESSABLE_ENTITY,
        }
    )


@app.get("/health")
async def health_check():
    return {"status": "ok"}


if __name__ == "__main__":
    port = int(os.getenv("PORT", 8000))
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=True)
