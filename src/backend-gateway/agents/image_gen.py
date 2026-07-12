"""
AI 工具 6 · 智谱 CogView-3 古风意境图生成
──────────────────────────────────────
根据用户主题或诗词内容，生成通用古风场景插画。
"""

import logging
from typing import Optional

from zhipuai import ZhipuAI

from core.runtime_checks import get_zhipu_api_key

logger = logging.getLogger(__name__)


class ImageGenAgent:
    """基于 CogView-3-Flash 的古风意境图生成"""

    def __init__(self, *, timeout: float | None = None, max_retries: int | None = None):
        api_key = get_zhipu_api_key()
        if not api_key:
            raise ValueError("ZHIPUAI_API_KEY 未配置")
        client_options = {}
        if timeout is not None:
            client_options["timeout"] = timeout
        if max_retries is not None:
            client_options["max_retries"] = max_retries
        self.client = ZhipuAI(api_key=api_key, **client_options)

    def close(self) -> None:
        """Release the SDK HTTP client."""
        self.client.close()

    def generate(self, prompt: str, size: str = "1024x1024") -> Optional[str]:
        """
        生成古风插画
        返回图片 URL 或 None
        """
        # 加入通用古风风格前缀，避免收敛到旧建筑项目语境
        styled_prompt = (
            f"中国古典水墨画风格，高质量古风意境插画：{prompt}。"
            "画面含蓄、留白自然、具有诗意与东方审美。"
        )
        try:
            response = self.client.images.generations(
                model="cogview-3-flash",
                prompt=styled_prompt,
                size=size,
            )
            if response.data and len(response.data) > 0:
                return response.data[0].url
            return None
        except Exception as exc:
            logger.warning("CogView image generation failed: %s", exc)
            return None
