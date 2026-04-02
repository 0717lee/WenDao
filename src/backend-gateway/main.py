from dotenv import load_dotenv
load_dotenv()  # 在所有业务模块之前加载 .env 中的 API Keys

from contextlib import asynccontextmanager
from fastapi import FastAPI, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.exceptions import RequestValidationError
from routers import chat, search, document, reader, vision, speech_api, creative, auth
from core.database import init_database
from core.pg_database import pg_lifespan, init_pg_database
import uvicorn
import logging
import asyncio
import os

try:
    from slowapi import Limiter, _rate_limit_exceeded_handler
    from slowapi.errors import RateLimitExceeded
    from slowapi.util import get_remote_address
except ModuleNotFoundError:  # pragma: no cover - exercised indirectly in tests
    class RateLimitExceeded(Exception):
        pass

    class Limiter:  # type: ignore[override]
        def __init__(self, *args, **kwargs):
            pass

        def limit(self, *args, **kwargs):
            def decorator(func):
                return func
            return decorator

    def get_remote_address(request: Request) -> str:
        client = getattr(request, "client", None)
        return getattr(client, "host", "127.0.0.1")

    async def _rate_limit_exceeded_handler(request: Request, exc: Exception):
        return JSONResponse(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            content={"error": "请求过于频繁", "message": str(exc)},
        )

# 配置日志
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# 限流器（内存存储，竞赛场景足够）
limiter = Limiter(key_func=get_remote_address)


@asynccontextmanager
async def combined_lifespan(app: FastAPI):
    """Combined lifespan: SQLite + PostgreSQL initialization."""
    # 1. SQLite (Phase 1)
    logger.info("初始化SQLite数据库...")
    await init_database()
    logger.info("SQLite数据库初始化完成")

    # 2. PostgreSQL (Phase 2) — optional, graceful degradation
    try:
        async with pg_lifespan():
            await init_pg_database()
            logger.info("PostgreSQL初始化完成")
            yield
    except Exception as e:
        logger.warning(f"PostgreSQL初始化失败，继续使用SQLite: {e}")
        yield


app = FastAPI(title="古籍智解（WenDao）API", version="0.1.0", lifespan=combined_lifespan)

# 挂载限流器
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# CORS: 生产环境通过环境变量限制来源域名，开发模式默认 localhost
ALLOWED_ORIGINS = os.getenv("CORS_ALLOWED_ORIGINS", "http://localhost:5173,http://localhost:3000,http://localhost").split(",")

# Vercel / Cloudflare 部署域名模式匹配
CORS_ALLOW_ORIGIN_REGEX = os.getenv("CORS_ALLOW_ORIGIN_REGEX", r"https://.*\.(vercel\.app|pages\.dev)")

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
app.include_router(vision.router)
app.include_router(speech_api.router)
app.include_router(creative.router)

# 全局异常处理中间件
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    logger.error(f"未处理的异常: {exc}", exc_info=True)
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={
            "error": "服务器内部错误",
            "message": str(exc),
            "path": str(request.url)
        }
    )


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    logger.warning(f"验证错误: {exc.errors()}")
    return JSONResponse(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        content={
            "error": "验证错误",
            "details": exc.errors(),
            "path": str(request.url)
        }
    )


@app.get("/health")
async def health_check():
    return {"status": "ok"}


if __name__ == "__main__":
    port = int(os.getenv("PORT", 8000))
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=True)
