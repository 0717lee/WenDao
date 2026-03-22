"""
T3.4.3 · 科大讯飞流式 WebSocket ASR/TTS 代理
─────────────────────────────────────────────
ASR: 语音听写(流式版)  wss://iat-api.xfyun.cn/v2/iat
TTS: 在线语音合成(流式版) wss://tts-api.xfyun.cn/v2/tts
鉴权: HMAC-SHA256 签名 + RFC1123 时间戳
"""
import os, json, asyncio, base64, hashlib, hmac, time
from datetime import datetime
from urllib.parse import urlencode, urlparse
import websocket  # websocket-client 同步库


# ========================== 工具函数 ==========================

def _create_auth_url(api_key: str, api_secret: str, host: str, path: str) -> str:
    """生成讯飞 WebSocket 鉴权 URL（基于 HMAC-SHA256）"""
    from datetime import timezone
    now = datetime.now(timezone.utc)
    date = now.strftime('%a, %d %b %Y %H:%M:%S GMT')

    signature_origin = f"host: {host}\ndate: {date}\nGET {path} HTTP/1.1"
    signature_sha = hmac.new(
        api_secret.encode('utf-8'),
        signature_origin.encode('utf-8'),
        digestmod=hashlib.sha256
    ).digest()
    signature = base64.b64encode(signature_sha).decode('utf-8')

    authorization_origin = (
        f'api_key="{api_key}", '
        f'algorithm="hmac-sha256", '
        f'headers="host date request-line", '
        f'signature="{signature}"'
    )
    authorization = base64.b64encode(authorization_origin.encode('utf-8')).decode('utf-8')

    params = {
        "authorization": authorization,
        "date": date,
        "host": host
    }
    return f"wss://{host}{path}?{urlencode(params)}"


# ========================== ASR 实现 ==========================

def _run_asr(audio_bytes: bytes, app_id: str, api_key: str, api_secret: str) -> str:
    """
    同步调用讯飞 ASR(语音听写流式版)
    audio_bytes: PCM/WAV 原始音频（或 Base64 解码后的音频）
    返回识别出的完整文字
    """
    url = _create_auth_url(api_key, api_secret, "iat-api.xfyun.cn", "/v2/iat")
    result_text = []
    finished = False

    def on_message(ws, message):
        nonlocal finished
        try:
            data = json.loads(message)
            code = data.get("code", -1)
            if code != 0:
                print(f"[ASR] 错误码: {code}, 信息: {data.get('message')}")
                finished = True
                ws.close()
                return
            result = data.get("data", {}).get("result", {})
            ws_list = result.get("ws", [])
            for ws_item in ws_list:
                for cw in ws_item.get("cw", []):
                    result_text.append(cw.get("w", ""))
            if result.get("status") == 2:
                finished = True
                ws.close()
        except Exception as e:
            print(f"[ASR] on_message 异常: {e}")
            finished = True
            ws.close()

    def on_open(ws):
        """连接成功后分帧发送音频"""
        import threading
        def send_audio():
            frame_size = 8000  # 每帧 ~250ms (假设 16kHz/16bit)
            status = 0  # 0=第一帧, 1=中间帧, 2=最后一帧
            offset = 0
            while offset < len(audio_bytes):
                chunk = audio_bytes[offset:offset + frame_size]
                offset += frame_size
                if offset >= len(audio_bytes):
                    status = 2

                body = {
                    "common": {"app_id": app_id},
                    "business": {
                        "language": "zh_cn",
                        "domain": "iat",
                        "accent": "mandarin",
                        "vad_eos": 3000
                    },
                    "data": {
                        "status": status,
                        "format": "audio/L16;rate=16000",
                        "encoding": "raw",
                        "audio": base64.b64encode(chunk).decode('utf-8')
                    }
                }
                # 首帧完成后后续只发 business+data
                if status != 0:
                    body.pop("common", None)
                    body.pop("business", None)
                    body["data"]["status"] = status

                ws.send(json.dumps(body))
                if status == 0:
                    status = 1
                time.sleep(0.04)  # 控速，模拟实时发送
        threading.Thread(target=send_audio).start()

    def on_error(ws, error):
        nonlocal finished
        print(f"[ASR] WebSocket Error: {error}")
        finished = True

    ws = websocket.WebSocketApp(
        url,
        on_message=on_message,
        on_open=on_open,
        on_error=on_error,
        on_close=lambda ws, *a: None
    )
    ws.run_forever(ping_timeout=10)
    return "".join(result_text)


# ========================== TTS 实现 ==========================

def _run_tts(text: str, app_id: str, api_key: str, api_secret: str) -> bytes:
    """
    同步调用讯飞 TTS(在线语音合成流式版)
    返回合成后的 PCM 音频字节流
    """
    url = _create_auth_url(api_key, api_secret, "tts-api.xfyun.cn", "/v2/tts")
    audio_chunks = []
    finished = False

    def on_message(ws, message):
        nonlocal finished
        try:
            data = json.loads(message)
            code = data.get("code", -1)
            if code != 0:
                print(f"[TTS] 错误码: {code}, 信息: {data.get('message')}")
                finished = True
                ws.close()
                return
            audio_b64 = data.get("data", {}).get("audio")
            if audio_b64:
                audio_chunks.append(base64.b64decode(audio_b64))
            status = data.get("data", {}).get("status")
            if status == 2:
                finished = True
                ws.close()
        except Exception as e:
            print(f"[TTS] on_message 异常: {e}")
            finished = True
            ws.close()

    def on_open(ws):
        body = {
            "common": {"app_id": app_id},
            "business": {
                "aue": "lame",  # mp3 格式
                "auf": "audio/L16;rate=16000",
                "vcn": "xiaoyan",
                "tte": "UTF8",
                "speed": 50,
                "volume": 80,
                "pitch": 50
            },
            "data": {
                "status": 2,
                "text": base64.b64encode(text.encode('utf-8')).decode('utf-8')
            }
        }
        ws.send(json.dumps(body))

    def on_error(ws, error):
        nonlocal finished
        print(f"[TTS] WebSocket Error: {error}")
        finished = True

    ws = websocket.WebSocketApp(
        url,
        on_message=on_message,
        on_open=on_open,
        on_error=on_error,
        on_close=lambda ws, *a: None
    )
    ws.run_forever(ping_timeout=10)
    return b"".join(audio_chunks)


# ========================== 主代理类 ==========================

class SpeechAgent:
    """真实接入科大讯飞流式 ASR/TTS 的语音代理"""

    def __init__(self):
        # ASR 凭证
        self.asr_app_id = os.getenv("IFLYTEK_ASR_APP_ID", "")
        self.asr_api_key = os.getenv("IFLYTEK_ASR_API_KEY", "")
        self.asr_api_secret = os.getenv("IFLYTEK_ASR_API_SECRET", "")
        # TTS 凭证
        self.tts_app_id = os.getenv("IFLYTEK_TTS_APP_ID", "")
        self.tts_api_key = os.getenv("IFLYTEK_TTS_API_KEY", "")
        self.tts_api_secret = os.getenv("IFLYTEK_TTS_API_SECRET", "")

        if not all([self.asr_app_id, self.asr_api_key, self.asr_api_secret]):
            print("[SpeechAgent] ⚠️ 讯飞 ASR 凭证不完整，语音识别将不可用")
        if not all([self.tts_app_id, self.tts_api_key, self.tts_api_secret]):
            print("[SpeechAgent] ⚠️ 讯飞 TTS 凭证不完整，语音合成将不可用")

    async def asr(self, audio_data: bytes) -> str:
        """异步 ASR: 将音频字节流转为文字"""
        if not all([self.asr_app_id, self.asr_api_key, self.asr_api_secret]):
            return "（ASR 服务未配置）"
        loop = asyncio.get_event_loop()
        text = await loop.run_in_executor(
            None, _run_asr, audio_data,
            self.asr_app_id, self.asr_api_key, self.asr_api_secret
        )
        return text if text else "（未能识别语音内容）"

    async def tts(self, text: str) -> bytes:
        """异步 TTS: 将文字转为音频字节流"""
        if not all([self.tts_app_id, self.tts_api_key, self.tts_api_secret]):
            return b"TTS_NOT_CONFIGURED"
        loop = asyncio.get_event_loop()
        audio = await loop.run_in_executor(
            None, _run_tts, text,
            self.tts_app_id, self.tts_api_key, self.tts_api_secret
        )
        return audio if audio else b"TTS_EMPTY_RESULT"
