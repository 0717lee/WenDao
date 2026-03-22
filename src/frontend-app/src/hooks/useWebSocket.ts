import { useEffect, useRef, useCallback } from 'react'
import { useStore, SceneCommand } from '../store/useStore'

const WS_URL = import.meta.env.VITE_WS_URL || 'ws://localhost:8000/ws/chat'
const HEARTBEAT_INTERVAL = 5000
const RECONNECT_DELAY = 3000
const MAX_RECONNECT_ATTEMPTS = 10
const RECONNECT_BACKOFF_MULTIPLIER = 1.5

export function useWebSocket() {
    const wsRef = useRef<WebSocket | null>(null)
    const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null)
    const reconnectAttemptsRef = useRef(0)
    const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
    const setWsConnected = useStore((s) => s.setWsConnected)
    const setLastCommand = useStore((s) => s.setLastCommand)
    const setAudioPayload = useStore((s) => s.setAudioPayload)
    const addChatMessage = useStore((s) => s.addChatMessage)
    const setIsThinking = useStore((s) => s.setIsThinking)
    const setActiveCatalog = useStore((s) => s.setActiveCatalog)
    const setScaleLevel = useStore((s) => s.setScaleLevel)

    const connect = useCallback(() => {
        if (wsRef.current?.readyState === WebSocket.OPEN) return

        // 检查重连次数限制
        if (reconnectAttemptsRef.current >= MAX_RECONNECT_ATTEMPTS) {
            console.error('[WS] Max reconnection attempts reached')
            return
        }

        const ws = new WebSocket(WS_URL)
        wsRef.current = ws

        ws.onopen = () => {
            console.log('[WS] Connected to', WS_URL)
            setWsConnected(true)
            reconnectAttemptsRef.current = 0 // 重置重连计数

            // 启动心跳
            heartbeatRef.current = setInterval(() => {
                if (ws.readyState === WebSocket.OPEN) {
                    ws.send(JSON.stringify({ action: 'heartbeat', query: '' }))
                }
            }, HEARTBEAT_INTERVAL)
        }

        ws.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data)

                if (data.type === 'transcript') {
                    // 阶段 1：收到语音识别的文字结果，直接前台上屏
                    addChatMessage('user', data.text)
                } else if (data.type === 'command') {
                    // 阶段 5 或是早期立刻下发的 3D 指令：收到指令模型包，代表“思考”结束（至少破冰动作已结束）
                    setIsThinking(false)
                    console.log('[WS] Received Multimodal Command:', data.command)
                    
                    const cmd = data.command;
                    
                    // V2: 新增宏微观管控拦截 (T1.3.2)
                    if (cmd.action === 'generate_building') {
                        setScaleLevel('MACRO');
                        let catalogType = cmd.target || 'residential';
                        let bayCount = 3, depthCount = 2, roofType: any = 'yingshan';
                        
                        // 简易映射字典大类到预设骨架规格
                        if (catalogType === 'official') { bayCount = 5; depthCount = 3; roofType = 'xieshan'; }
                        else if (catalogType === 'imperial') { bayCount = 9; depthCount = 5; roofType = 'wudian'; }
                        else if (catalogType === 'bridge') { bayCount = 1; depthCount = 1; roofType = 'stone_arch'; }
                        
                        setActiveCatalog({ type: catalogType as any, bayCount, depthCount, roofType });
                    } else if (cmd.action === 'switch_lod') {
                        // 镜头迫近，切回原有的斗拱等细部微观视界
                        setScaleLevel('MICRO');
                        if (cmd.target === 'clear') setActiveCatalog(null);
                    }

                    setLastCommand(cmd)
                    if (data.audio_data) {
                        setAudioPayload(data.audio_data)
                    }
                } else {
                    // 兼容原来的只发 SceneCommand 的情况
                    const cmd: SceneCommand = data
                    console.log('[WS] Received Legacy SceneCommand:', cmd)
                    setLastCommand(cmd)
                }
            } catch (e) {
                console.warn('[WS] Failed to parse message:', event.data)
            }
        }

        ws.onclose = () => {
            setWsConnected(false)
            if (heartbeatRef.current) clearInterval(heartbeatRef.current)

            // 指数退避重连策略
            reconnectAttemptsRef.current++
            const delay = Math.min(
                RECONNECT_DELAY * Math.pow(RECONNECT_BACKOFF_MULTIPLIER, reconnectAttemptsRef.current - 1),
                30000 // 最大延迟 30 秒
            )

            console.log(
                `[WS] Disconnected, attempt ${reconnectAttemptsRef.current}/${MAX_RECONNECT_ATTEMPTS}, reconnecting in ${delay}ms`
            )

            reconnectTimeoutRef.current = setTimeout(connect, delay)
        }

        ws.onerror = (err) => {
            console.error('[WS] Error:', err)
            ws.close()
        }
    }, [setWsConnected, setLastCommand, setActiveCatalog, setScaleLevel])

    const sendMessage = useCallback(
        (query?: string, audioBase64?: string) => {
            // TODO: 在 S3 后端完全替换真 Agent 前的联调 Mock 拦截 (前置拦截，不依赖后端是否存活)
            if (query === '查看热力图') {
                addChatMessage('user', query)
                setIsThinking(true)
                setTimeout(() => {
                    setLastCommand({ action: 'stress', message: '已为您切至柔性力学应力热力图材质。' });
                    setIsThinking(false);
                }, 500);
                return;
            }
            if (query === '还原') {
                addChatMessage('user', query)
                setIsThinking(true)
                setTimeout(() => {
                    setLastCommand({ action: 'idle', message: '模型材质已还原。' });
                    setIsThinking(false);
                }, 500);
                return;
            }

            if (wsRef.current?.readyState === WebSocket.OPEN) {
                // 指令发出，立刻点亮交互提示灯
                setIsThinking(true)

                if (query && !audioBase64) {
                    addChatMessage('user', query)
                }
                wsRef.current.send(JSON.stringify({
                    action: 'ask',
                    query: query || '',
                    audio: audioBase64 || ''
                }))
            } else {
                console.warn('[WS] Not connected, cannot send message')
            }
        },
        [addChatMessage]
    )

    useEffect(() => {
        connect()
        return () => {
            if (heartbeatRef.current) clearInterval(heartbeatRef.current)
            if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current)
            wsRef.current?.close()
        }
    }, [connect])

    return { sendMessage }
}
