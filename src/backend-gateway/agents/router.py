# -*- coding: utf-8 -*-
"""Intent Router - GLM-4 Function Calling Agent"""
import os
import json
from typing import Dict, Any
from zhipuai import ZhipuAI

SCENE_TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "generate_macro_building",
            "description": (
                "\u5f53\u7528\u6237\u8981\u6c42\u751f\u6210\u3001\u5efa\u9020\u3001\u5c55\u793a\u4e00\u6574\u5ea7\u53e4\u5efa\u7b51"
                "\uff08\u5982\u56db\u5408\u9662\u3001\u7687\u5bab\u5927\u6bbf\u3001\u5b98\u5e9c\u3001\u77f3\u62f1\u6865\uff09\u65f6\u8c03\u7528\u6b64\u5de5\u5177\u3002"
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "action": {
                        "type": "string",
                        "enum": ["generate_building"],
                        "description": "generate_building"
                    },
                    "target": {
                        "type": "string",
                        "description": "residential / official / imperial / bridge"
                    },
                    "need_rag": {
                        "type": "boolean",
                        "description": "\u662f\u5426\u9700\u8981\u67e5\u8be2\u77e5\u8bc6\u5e93"
                    }
                },
                "required": ["action", "target", "need_rag"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "control_3d_scene",
            "description": "\u6839\u636e\u7528\u6237\u6307\u4ee4\u63a7\u52363D\u573a\u666f\uff1a\u62c6\u89e3/\u5e94\u529b/\u5256\u5207/\u7f29\u653e/\u590d\u4f4d",
            "parameters": {
                "type": "object",
                "properties": {
                    "action": {
                        "type": "string",
                        "enum": ["explode", "stress", "dissect", "idle", "switch_lod"],
                        "description": "explode/stress/dissect/switch_lod/idle"
                    },
                    "target": {
                        "type": "string",
                        "description": "dougong / sunmao / micro / etc."
                    },
                    "need_rag": {
                        "type": "boolean",
                        "description": "\u662f\u5426\u9700\u8981\u77e5\u8bc6\u5e93\u56de\u7b54"
                    }
                },
                "required": ["action", "need_rag"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "generate_concept_image",
            "description": (
                "\u5f53\u7528\u6237\u8981\u6c42\u753b\u3001\u7ed8\u5236\u3001\u751f\u6210\u4e00\u5f20\u53e4\u5efa\u7b51\u7684\u6982\u5ff5\u56fe\u3001"
                "\u6548\u679c\u56fe\u3001\u63d2\u753b\u3001\u6d77\u62a5\u65f6\u8c03\u7528\u6b64\u5de5\u5177\u3002"
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "action": {
                        "type": "string",
                        "enum": ["generate_image"],
                        "description": "generate_image"
                    },
                    "prompt": {
                        "type": "string",
                        "description": "\u56fe\u50cf\u751f\u6210\u63cf\u8ff0\u6027\u63d0\u793a\u8bcd"
                    },
                    "need_rag": {
                        "type": "boolean",
                        "description": "\u662f\u5426\u540c\u65f6\u9700\u8981\u6587\u5b57\u8bb2\u89e3"
                    }
                },
                "required": ["action", "prompt", "need_rag"]
            }
        }
    }
]

SYSTEM_PROMPT = (
    "\u4f60\u662f\u201c\u89c2\u6728\u77e5\u5fae\u201d\u53e4\u5efa\u7b51\u6570\u5b57\u5b5e\u751f\u7cfb\u7edf\u7684\u667a\u80fd\u4e2d\u63a7\u5927\u8111(GLM-4)\u3002\n"
    "\u7528\u6237\u901a\u8fc7\u8bed\u97f3\u4e0e\u4f60\u4ea4\u4e92\u6765\u64cd\u4f5c\u53e4\u5efa\u7b51\u6570\u5b57\u7a7a\u95f4\u3002\n"
    "\u4f60\u7684\u6838\u5fc3\u4efb\u52a1\u662f\u51c6\u786e\u7406\u89e3\u7528\u6237\u610f\u56fe\u5e76\u8def\u7531\u51fa\u64cd\u4f5c\u6307\u4ee4\uff1a\n"
    "1. generate_macro_building: \u7528\u6237\u8981\u6c42\u5efa\u56db\u5408\u9662/\u7687\u5bab/\u5b98\u5e9c/\u6865\u6881\n"
    "2. control_3d_scene: \u7528\u6237\u8981\u6c42\u62c6\u89e3/\u5e94\u529b/\u5256\u5207/\u7f29\u653e/\u590d\u4f4d\n"
    "3. generate_concept_image: \u7528\u6237\u8981\u6c42\u753b\u56fe/\u751f\u6210\u63d2\u753b\n"
    "\u7eaf\u6307\u4ee4\u65f6 need_rag=false\uff0c\u95ee\u77e5\u8bc6\u65f6 need_rag=true\u3002"
)


class IntentRouter:
    """GLM-4 Function Calling intent router"""

    def __init__(self):
        api_key = os.getenv("ZHIPUAI_API_KEY", "")
        if not api_key:
            raise ValueError("ZHIPUAI_API_KEY not configured")
        self.client = ZhipuAI(api_key=api_key)

    async def analyze_intent(self, text: str) -> Dict[str, Any]:
        """Extract structured intent via GLM-4 Function Calling"""
        import asyncio
        loop = asyncio.get_event_loop()
        result = await loop.run_in_executor(None, self._call_glm, text)
        return result

    def _call_glm(self, text: str) -> Dict[str, Any]:
        try:
            response = self.client.chat.completions.create(
                model="glm-4-flash",
                messages=[
                    {"role": "system", "content": SYSTEM_PROMPT},
                    {"role": "user", "content": text}
                ],
                tools=SCENE_TOOLS,
                tool_choice="auto"
            )

            choice = response.choices[0]

            if choice.message.tool_calls:
                tool_call = choice.message.tool_calls[0]
                args = json.loads(tool_call.function.arguments)
                func_name = tool_call.function.name

                res = {
                    "action": args.get("action", "idle"),
                    "need_rag": args.get("need_rag", False)
                }

                if func_name == "generate_macro_building":
                    res["target"] = args.get("target", "residential")
                elif func_name == "generate_concept_image":
                    res["action"] = "generate_image"
                    res["prompt"] = args.get("prompt", "")
                    res["target"] = None
                else:
                    res["target"] = args.get("target", "dougong")

                return res

            return {"action": "idle", "target": None, "need_rag": True}

        except Exception as e:
            print(f"[IntentRouter] GLM-4 error: {e}")
            return {"action": "idle", "target": None, "need_rag": True}
