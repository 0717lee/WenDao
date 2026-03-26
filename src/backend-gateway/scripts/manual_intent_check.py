"""Manual intent inspection script.

The formal automated tests live under ``src/backend-gateway/tests``.
"""

import asyncio
import os
import sys
import json

# 把上级目录加入 sys.path 以便 import agents
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from agents.router import IntentRouter

async def test_build_intent():
    router = IntentRouter()
    
    test_cases = [
        "咱们来建一座面阔七间、进深四间的庑殿顶大殿吧",
        "把这个斗拱给我拆开看看内部构造",
        "这座建筑受力是怎么样的",
        "给我恢复原样"
    ]
    
    results = {}
    for text in test_cases:
        print(f"正在测试意图: {text}")
        result = await router.analyze_intent(text)
        results[text] = result
    
    out_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "test_out.json")
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(results, f, ensure_ascii=False, indent=2)
    print(f"[{out_path}] 写入成功！")

if __name__ == "__main__":
    from dotenv import load_dotenv
    # 加载 .env
    dotenv_path = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), '.env')
    load_dotenv(dotenv_path)
    
    asyncio.run(test_build_intent())
