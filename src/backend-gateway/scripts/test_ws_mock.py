"""
INT-S4 · 真实大模型 API 链路端到端验证脚本
──────────────────────────────────────────
注: 此脚本仅发送文本指令测试智谱+Kimi链路。
    讯飞 ASR/TTS 需要有真实音频输入才会走到，
    文本链路验通即可证明架构正确。
"""
import sys, os
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from dotenv import load_dotenv
load_dotenv(os.path.join(os.path.dirname(__file__), '..', '.env'))

from fastapi.testclient import TestClient
from main import app

def test_text_command():
    """测试纯文本指令（智谱 FC + Kimi RAG 链路）"""
    client = TestClient(app)

    with client.websocket_connect("/ws/chat") as websocket:
        print("[OK] WebSocket Connected (Real API Mode)!")

        # 发送纯文本指令（不含音频，直接走 Router + RAG）
        websocket.send_json({
            "action": "ask",
            "query": "请为我拆解一下这个斗拱系统"
        })
        print("Sent text command: '请为我拆解一下这个斗拱系统'")

        # === 接收二次拆包响应 1：早期秒回帧 ===
        resp1 = websocket.receive_json()
        print(f"\n[Response 1 - Early] Type: {resp1.get('type')}")
        cmd1 = resp1.get("command", {})
        print(f"  Action: {cmd1.get('action')}")
        print(f"  Target: {cmd1.get('target')}")
        print(f"  Message: {cmd1.get('message', '')}")
        
        assert cmd1.get("action") in ["explode", "stress", "idle"]
        assert "知识库" in cmd1.get("message", "")
        # 此时尚无语音
        assert "audio_data" not in resp1
        print("[OK] 第一阶段：高速 3D 指令先行帧验证通过！")

        # === 接收二次拆包响应 2：终极结果帧 (包含语音和回答) ===
        resp2 = websocket.receive_json()
        print(f"\n[Response 2 - Final] Type: {resp2.get('type')}")
        cmd2 = resp2.get("command", {})
        print(f"  Action: {cmd2.get('action')}")
        print(f"  Message: {cmd2.get('message', '')[:50]}...")
        
        audio = resp2.get("audio_data", "")
        audio_preview = audio[:50] if isinstance(audio, str) else str(audio[:50])
        print(f"  Audio preview: {audio_preview}...")

        assert cmd2.get("action") == cmd1.get("action")
        assert len(cmd2.get("message", "")) > 10
        assert len(audio) > 100
        print("[OK] 第二阶段：RAG 生成与 TTS 合成帧验证通过！")


def test_health():
    """确认后端启动正常"""
    client = TestClient(app)
    resp = client.get("/health")
    assert resp.status_code == 200
    print("[OK] Health Check")


if __name__ == "__main__":
    test_health()
    print()
    test_text_command()
    print("\n[OK] INT-S4 真实 API 链路验证完成！")
