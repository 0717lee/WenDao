import { create } from 'zustand'
import type { ReasoningStep } from '../components/ReasoningTimeline'

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
    messages: Message[]
    isLoading: boolean
    currentProgress: string
    draftMessage: string
    addMessage: (message: Message) => void
    updateLastMessage: (content: string) => void
    updateLastMessageReasoning: (steps: ReasoningStep[]) => void
    updateLastMessagePoem: (poem: Partial<PoemResult>) => void
    setLoading: (loading: boolean) => void
    setProgress: (progress: string) => void
    setDraftMessage: (message: string) => void
    clearMessages: () => void

    // TTS auto-read AI responses (default: off)
    ttsAutoRead: boolean
    setTtsAutoRead: (enabled: boolean) => void
}

export const useStore = create<AppState>((set) => ({
    messages: [],
    isLoading: false,
    currentProgress: '',
    draftMessage: '',
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
    setDraftMessage: (draftMessage) => set({ draftMessage }),
    clearMessages: () => set({ messages: [] }),

    ttsAutoRead: (() => {
        try { return localStorage.getItem('ttsAutoRead') === 'true' } catch { return false }
    })(),
    setTtsAutoRead: (enabled) => {
        try { localStorage.setItem('ttsAutoRead', String(enabled)) } catch {}
        set({ ttsAutoRead: enabled })
    },
}))
