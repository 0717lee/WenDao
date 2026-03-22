"""AI 工具 REST 接口 — 图像生成 & 建筑识别"""

from fastapi import APIRouter, UploadFile, File, Form
from pydantic import BaseModel
import base64

router = APIRouter(prefix="/api/v1/ai", tags=["ai-tools"])


class ImageGenRequest(BaseModel):
    prompt: str
    size: str = "1024x1024"


class VisionURLRequest(BaseModel):
    image_url: str
    question: str = ""


@router.post("/generate-image")
async def generate_image(req: ImageGenRequest):
    """CogView-3 古建筑概念图生成"""
    from agents.image_gen import ImageGenAgent
    agent = ImageGenAgent()
    url = agent.generate(req.prompt, req.size)
    if url:
        return {"status": "ok", "image_url": url}
    return {"status": "error", "message": "图像生成失败，请稍后重试"}


@router.post("/analyze-image")
async def analyze_image(
    file: UploadFile = File(...),
    question: str = Form(""),
):
    """GLM-4V 古建筑图像识别（上传文件）"""
    from agents.vision import VisionAgent
    agent = VisionAgent()
    image_bytes = await file.read()
    image_b64 = base64.b64encode(image_bytes).decode("utf-8")
    result = agent.analyze_image(image_b64, question)
    return {"status": "ok", "analysis": result}


@router.post("/analyze-image-url")
async def analyze_image_url(req: VisionURLRequest):
    """GLM-4V 古建筑图像识别（URL）"""
    from agents.vision import VisionAgent
    agent = VisionAgent()
    result = agent.analyze_from_url(req.image_url, req.question)
    return {"status": "ok", "analysis": result}
