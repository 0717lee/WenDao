import { create } from 'zustand'
import type { ReasoningStep } from '../components/ReasoningTimeline'

/** Poetry generation result attached to message */
export interface PoemResult {
    text: string
    imageUrl?: string
    audioBase64?: string
    topic: string
}

export interface AnswerContextAction {
    id: string
    label: string
    kind: 'reader' | 'chat' | 'search' | 'study' | 'wordbook'
    prompt?: string
    query?: string
    documentId?: string | null
    citation?: { title: string; source: string; excerpt?: string }
}

export interface AnswerContext {
    trustLabel: string
    trustPoints: string[]
    citationCount: number
    relatedEntityCount: number
    primaryCitation?: { title: string; source: string; excerpt?: string }
    suggestedActions: AnswerContextAction[]
}

/** Chat message interface */
export interface Message {
    id: string
    role: 'user' | 'assistant'
    content: string
    citations?: Array<{ title: string; source: string; excerpt?: string }>
    answerContext?: AnswerContext
    entityIds?: string[]
    reasoningSteps?: ReasoningStep[]
    pendingEntities?: Array<{ label: string; group: string; desc: string; confidence: number; similar_to?: { id: string; label: string; similarity: number } }>
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
    updateLastMessageCitations: (citations: NonNullable<Message['citations']>) => void
    updateLastMessageAnswerContext: (answerContext: AnswerContext) => void
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
    updateLastMessageCitations: (citations) =>
        set((state) => {
            if (state.messages.length === 0) return state
            const updatedMessages = [...state.messages]
            updatedMessages[updatedMessages.length - 1] = {
                ...updatedMessages[updatedMessages.length - 1],
                citations,
            }
            return { messages: updatedMessages }
        }),
    updateLastMessageAnswerContext: (answerContext) =>
        set((state) => {
            if (state.messages.length === 0) return state
            const updatedMessages = [...state.messages]
            updatedMessages[updatedMessages.length - 1] = {
                ...updatedMessages[updatedMessages.length - 1],
                answerContext,
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
