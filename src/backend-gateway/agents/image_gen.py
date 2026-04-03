"""
AI 工具 6 · 智谱 CogView-3 古建筑概念图生成
────────────────────────────────────────
根据用户描述或知识文本，生成古建筑场景的概念插画。
"""

from typing import Optional
from zhipuai import ZhipuAI

from core.runtime_checks import get_zhipu_api_key


class ImageGenAgent:
    """基于 CogView-3-Flash 的古建筑概念图生成"""

    def __init__(self):
        api_key = get_zhipu_api_key()
        if not api_key:
            raise ValueError("ZHIPUAI_API_KEY 未配置")
        self.client = ZhipuAI(api_key=api_key)

    def generate(self, prompt: str, size: str = "1024x1024") -> Optional[str]:
        """
        生成古建筑概念图
        返回图片 URL 或 None
        """
        # 加入领域风格前缀，提升生成质量
        styled_prompt = (
            f"中国传统古建筑水墨画风格，高质量建筑插画：{prompt}。"
            "画面精美，细节丰富，具有中国传统建筑美学特征。"
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
        except Exception as e:
            print(f"[ImageGen] CogView 调用失败: {e}")
            return None
