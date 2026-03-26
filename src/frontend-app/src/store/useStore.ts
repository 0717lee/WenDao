import { create } from 'zustand'
import type { ReasoningStep } from '../components/ReasoningTimeline'

type LegacyBuildingConfig = {
    type: 'residential' | 'official' | 'imperial' | 'bridge'
    bayCount: number
    depthCount: number
    roofType: 'wudian' | 'xieshan' | 'yingshan' | 'stone_arch'
}

type LegacyBuildingEntry = {
    id: string
    label: string
    subtitle: string
    description: string
    category: string
    renderType: 'glb' | 'parametric'
    glbUrl?: string
    hasAnimation?: boolean
    parametricConfig?: LegacyBuildingConfig
    dynasty?: string
    style?: string
    features?: string[]
}

/** 后端通过 WebSocket 下发的场景指令 */
export interface SceneCommand {
    action: string       // idle | explode | stress | instantiate | moveTo
    target?: string | null
    position?: number[] | null
    message: string
    [key: string]: any   // 容纳 `width_bays`, `depth_bays`, `roof` 等动态参数
}

/** Vision recognition result attached to message */
export interface VisionResult {
    imagePreview: string      // base64 data URL for thumbnail
    buildingType: string
    roofStyle: string
    components: string[]
    era: string
    rawText: string
    matchedGraphNodes: Array<{ id: string; label: string }>
}

/** Poetry generation result attached to message */
export interface PoemResult {
    text: string
    imageUrl?: string
    audioBase64?: string
    topic: string
}

/** Chat message interface */
export interface Message {
    id: string
    role: 'user' | 'assistant'
    content: string
    citations?: Array<{ title: string; source: string }>
    entityIds?: string[]
    reasoningSteps?: ReasoningStep[]
    pendingEntities?: Array<{ label: string; group: string; desc: string; confidence: number; similar_to?: { id: string; label: string; similarity: number } }>
    visionResult?: VisionResult
    poemResult?: PoemResult
    timestamp: number
}

interface AppState {
    // WebSocket 连接状态
    wsConnected: boolean
    setWsConnected: (v: boolean) => void

    // AI 思考状态 (UI 提示)
    isThinking: boolean
    setIsThinking: (v: boolean) => void

    // 最新一条后端指令
    lastCommand: SceneCommand | null
    setLastCommand: (cmd: SceneCommand) => void

    // 接收到的最新模拟TTS音频 (MOCK_AUDIO_PAYLOAD...)
    audioPayload: string | null
    setAudioPayload: (payload: string | null) => void

    // 当前从 3D 场景中点击拾取选中的结构节点名称
    selectedNode: string | null
    setSelectedNode: (node: string | null) => void

    // (互动A) 从知识图谱面板点选的构件类型，用于驱动3D场景高亮
    highlightedType: string | null
    setHighlightedType: (type: string | null) => void

    // 聊天消息历史 (旧版，保留向后兼容)
    chatHistory: Array<{ role: 'user' | 'ai'; text: string }>
    addChatMessage: (role: 'user' | 'ai', text: string) => void

    // 新版聊天状态
    messages: Message[]
    isLoading: boolean
    currentProgress: string
    addMessage: (message: Message) => void
    updateLastMessage: (content: string) => void
    updateLastMessageReasoning: (steps: ReasoningStep[]) => void
    updateLastMessagePoem: (poem: Partial<PoemResult>) => void
    setLoading: (loading: boolean) => void
    setProgress: (progress: string) => void
    clearMessages: () => void

    // (V2) 渲染参数骨架预制类型
    activeCatalog: LegacyBuildingConfig | null
    setActiveCatalog: (config: LegacyBuildingConfig | null) => void

    // (V2) 核心主状态机，控制双态显示面板
    scaleLevel: 'MACRO' | 'MICRO'
    setScaleLevel: (level: 'MACRO' | 'MICRO') => void

    // (V3) 模型画廊：当前展示的古建筑模型 ID
    activeModelId: string
    setActiveModelId: (id: string) => void

    // (V4) 沉浸式展厅：当前选中建筑条目
    activeBuilding: LegacyBuildingEntry | null
    setActiveBuilding: (entry: LegacyBuildingEntry | null) => void

    // (V4) 画廊分类筛选
    galleryFilter: string
    setGalleryFilter: (filter: string) => void

    // (V4) 侧边抽屉
    leftDrawerOpen: boolean
    setLeftDrawerOpen: (open: boolean) => void
    rightDrawerOpen: boolean
    setRightDrawerOpen: (open: boolean) => void

    // TTS auto-read AI responses (default: off)
    ttsAutoRead: boolean
    setTtsAutoRead: (enabled: boolean) => void
}

export const useStore = create<AppState>((set) => ({
    wsConnected: false,
    setWsConnected: (v) => set({ wsConnected: v }),

    isThinking: false,
    setIsThinking: (v) => set({ isThinking: v }),

    lastCommand: null,
    setLastCommand: (cmd) =>
        set((state) => ({
            lastCommand: cmd,
            chatHistory: [...state.chatHistory, { role: 'ai', text: cmd.message }],
        })),

    audioPayload: null,
    setAudioPayload: (p) => set({ audioPayload: p }),

    selectedNode: null,
    setSelectedNode: (n) => set({ selectedNode: n }),

    highlightedType: null,
    setHighlightedType: (n) => set({ highlightedType: n }),

    chatHistory: [],
    addChatMessage: (role, text) =>
        set((state) => ({
            chatHistory: [...state.chatHistory, { role, text }],
        })),

    // 新版聊天状态实现
    messages: [],
    isLoading: false,
    currentProgress: '',
    addMessage: (message) =>
        set((state) => ({
            messages: [...state.messages, message],
        })),
    updateLastMessage: (content) =>
        set((state) => {
            if (state.messages.length === 0) return state
            const updatedMessages = [...state.messages]
            updatedMessages[updatedMessages.length - 1] = {
                ...updatedMessages[updatedMessages.length - 1],
                content,
            }
            return { messages: updatedMessages }
        }),
    updateLastMessageReasoning: (steps) =>
        set((state) => {
            if (state.messages.length === 0) return state
            const updatedMessages = [...state.messages]
            updatedMessages[updatedMessages.length - 1] = {
                ...updatedMessages[updatedMessages.length - 1],
                reasoningSteps: steps,
            }
            return { messages: updatedMessages }
        }),
    updateLastMessagePoem: (poem) =>
        set((state) => {
            if (state.messages.length === 0) return state
            const updatedMessages = [...state.messages]
            const last = updatedMessages[updatedMessages.length - 1]
            updatedMessages[updatedMessages.length - 1] = {
                ...last,
                poemResult: { ...last.poemResult, ...poem } as PoemResult,
            }
            return { messages: updatedMessages }
        }),
    setLoading: (loading) => set({ isLoading: loading }),
    setProgress: (progress) => set({ currentProgress: progress }),
    clearMessages: () => set({ messages: [] }),

    activeCatalog: null,
    setActiveCatalog: (config) => set({ activeCatalog: config }),

    scaleLevel: 'MACRO',
    setScaleLevel: (level) => set({ scaleLevel: level }),

    activeModelId: 'dougong',
    setActiveModelId: (id) => set({ activeModelId: id }),

    activeBuilding: null,
    setActiveBuilding: (entry) =>
        set(() => {
            if (!entry) {
                return {
                    activeBuilding: null,
                    activeModelId: 'dougong',
                    activeCatalog: null,
                    scaleLevel: 'MICRO' as const,
                    selectedNode: null,
                }
            }
            if (entry.renderType === 'glb') {
                return {
                    activeBuilding: entry,
                    activeModelId: entry.id === 'siheyuan_glb' ? 'siheyuan' : entry.id,
                    activeCatalog: null,
                    scaleLevel: 'MICRO' as const,
                    selectedNode: null,
                }
            }
            return {
                activeBuilding: entry,
                activeModelId: '',
                    activeCatalog: entry.parametricConfig as LegacyBuildingConfig | null,
                scaleLevel: 'MACRO' as const,
                selectedNode: null,
            }
        }),

    galleryFilter: 'all',
    setGalleryFilter: (filter) => set({ galleryFilter: filter }),

    leftDrawerOpen: false,
    setLeftDrawerOpen: (open) => set({ leftDrawerOpen: open }),
    rightDrawerOpen: false,
    setRightDrawerOpen: (open) => set({ rightDrawerOpen: open }),

    ttsAutoRead: (() => {
        try { return localStorage.getItem('ttsAutoRead') === 'true' } catch { return false }
    })(),
    setTtsAutoRead: (enabled) => {
        try { localStorage.setItem('ttsAutoRead', String(enabled)) } catch {}
        set({ ttsAutoRead: enabled })
    },
}))
