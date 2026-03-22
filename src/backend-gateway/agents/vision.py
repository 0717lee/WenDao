"""
AI 工具 7 · 智谱 GLM-4V 古建筑图像识别分析
──────────────────────────────────────────
用户上传古建筑照片，系统自动识别建筑类型、
构件特征、屋顶形制、年代等信息。
"""

import os
import base64
from typing import Dict, Any, Optional
from zhipuai import ZhipuAI

ANALYSIS_PROMPT = """你是一位中国古建筑专家。请分析这张建筑图片，识别并回答：
1. 建筑类型（宫殿/寺庙/民居/园林/桥梁/塔等）
2. 屋顶形制（庑殿/歇山/悬山/硬山/攒尖/卷棚等）
3. 主要可见构件（斗拱/柱/梁/枋/檩/彩画/琉璃瓦等）
4. 大致年代风格（唐/宋/元/明/清/近现代）
5. 建筑等级推断

请用简洁的中文回答，每项 1-2 句话，总计不超过 200 字。
如果图片不是古建筑，请说明图片内容并建议用户上传古建筑照片。"""


class VisionAgent:
    """基于 GLM-4V-Flash 的古建筑图像识别"""

    def __init__(self):
        api_key = os.getenv("ZHIPUAI_API_KEY", "")
        if not api_key:
            raise ValueError("ZHIPUAI_API_KEY 未配置")
        self.client = ZhipuAI(api_key=api_key)

    def analyze_image(self, image_base64: str, user_question: str = "") -> str:
        """
        分析古建筑图片
        image_base64: Base64 编码的图片数据
        user_question: 用户的附加问题（可选）
        """
        prompt = user_question if user_question else ANALYSIS_PROMPT

        try:
            response = self.client.chat.completions.create(
                model="glm-4v-flash",
                messages=[{
                    "role": "user",
                    "content": [
                        {"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{image_base64}"}},
                        {"type": "text", "text": prompt},
                    ]
                }],
                max_tokens=400,
                temperature=0.4,
            )
            return response.choices[0].message.content.strip()
        except Exception as e:
            print(f"[Vision] GLM-4V 调用失败: {e}")
            return f"图像分析服务暂时不可用: {e}"

    def analyze_from_url(self, image_url: str, user_question: str = "") -> str:
        """分析来自 URL 的图片"""
        prompt = user_question if user_question else ANALYSIS_PROMPT

        try:
            response = self.client.chat.completions.create(
                model="glm-4v-flash",
                messages=[{
                    "role": "user",
                    "content": [
                        {"type": "image_url", "image_url": {"url": image_url}},
                        {"type": "text", "text": prompt},
                    ]
                }],
                max_tokens=400,
                temperature=0.4,
            )
            return response.choices[0].message.content.strip()
        except Exception as e:
            print(f"[Vision] GLM-4V 调用失败: {e}")
            return f"图像分析服务暂时不可用: {e}"
