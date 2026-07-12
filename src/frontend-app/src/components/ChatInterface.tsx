import { startTransition, useCallback, useEffect, useRef, useState } from 'react'
import { Search } from 'lucide-react'
import { useStore, type AnswerContextAction } from '../store/useStore'
import { MessageList } from './MessageList'
import { MessageInput } from './MessageInput'
import { useVoiceRecorder } from './AudioRecorder'
import { API_BASE } from '../lib/api'
import { authFetchOptions } from '../store/useAuthStore'
import { useGraphStore } from '../store/useGraphStore'
import type { ReasoningStep } from './ReasoningTimeline'

// Default reasoning steps template
const INITIAL_REASONING_STEPS: ReasoningStep[] = [
    { step: 'retrieval', label: '理解问题', status: 'pending' },
    { step: 'generation', label: '生成回答', status: 'pending' },
]

const QUICK_CHAT_PROMPTS = [
    '解释：学而时习之，不亦说乎？',
    '对比：孔孟之别',
    '意象：鲲鹏之喻',
]

export function ChatInterface() {
    const [inputValue, setInputValue] = useState('')
    const [voiceError, setVoiceError] = useState('')
    const streamBufferRef = useRef('')
    const streamFlushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
    const assistantContentRef = useRef('')
    const { messages, isLoading, currentProgress, draftMessage, addMessage, updateLastMessage, updateLastMessageAnswerContext, updateLastMessageReasoning, updateLastMessagePoem, setLoading, setProgress, setDraftMessage } = useStore()
    const setActiveTab = useGraphStore((state) => state.setActiveTab)
    const { isRecording, isTranscribing, toggleRecording } = useVoiceRecorder()

    useEffect(() => {
        if (draftMessage) {
            setInputValue(draftMessage)
            setDraftMessage('')
        }
    }, [draftMessage, setDraftMessage])

    useEffect(() => {
        return () => {
            if (streamFlushTimerRef.current) {
                clearTimeout(streamFlushTimerRef.current)
            }
        }
    }, [])

    const flushStreamBuffer = useCallback(
        (force = false) => {
            const applyFlush = () => {
                streamFlushTimerRef.current = null
                if (!streamBufferRef.current) return
                assistantContentRef.current += streamBufferRef.current
                streamBufferRef.current = ''
                startTransition(() => {
                    updateLastMessage(assistantContentRef.current)
                })
            }

            if (force) {
                applyFlush()
                return
            }

            if (streamFlushTimerRef.current) return
            streamFlushTimerRef.current = setTimeout(applyFlush, 40)
        },
        [updateLastMessage]
    )

    const handleVoiceToggle = useCallback(() => {
        toggleRecording(
            (text) => {
                // ASR success: fill input box with transcription
                setInputValue((prev) => (prev ? prev + ' ' + text : text))
                setVoiceError('')
            },
            (errMsg) => {
                // ASR error: show message briefly
                setVoiceError(errMsg)
                setTimeout(() => setVoiceError(''), 3000)
            }
        )
    }, [toggleRecording])

    const detectPoemIntent = (text: string): string | null => {
        // Pattern: "生成诗词：春日" or "生成诗词:春日"
        const p1 = text.match(/^生成诗词[：:](.+)/)
        if (p1) return p1[1].trim()
        // Pattern: "写首关于春天的诗" or "写一首诗：春天"
        const p2 = text.match(/写.{0,4}(?:诗|词|诗词).*?[：:关于](.+)/)
        if (p2) return p2[1].replace(/的(?:诗|词|诗词)$/, '').trim()
        // Pattern: "作诗：春天" or "作首词：秋"
        const p3 = text.match(/作.{0,2}(?:诗|词).*?[：:关于](.+)/)
        if (p3) return p3[1].replace(/的(?:诗|词|诗词)$/, '').trim()
        return null
    }

    const sendPoemMessage = async (topic: string, userContent: string) => {
        setLoading(true)
        setProgress('AI...')

        addMessage({
            id: Date.now().toString(),
            role: 'user',
            content: userContent,
            timestamp: Date.now(),
        })
        setInputValue('')

        // Assistant placeholder with empty poemResult
        addMessage({
            id: (Date.now() + 1).toString(),
            role: 'assistant',
            content: '',
            poemResult: { text: '', topic },
            timestamp: Date.now(),
        })

        try {
            const response = await fetch(`${API_BASE}/api/v1/creative/poem`, {
                method: 'POST',
                ...authFetchOptions({ headers: { 'Content-Type': 'application/json' } }),
                body: JSON.stringify({ topic }),
            })

            if (!response.ok) {
                throw new Error(`诗词生成请求失败（${response.status}）`)
            }

            const reader = response.body?.getReader()
            const decoder = new TextDecoder()
            if (!reader) throw new Error('诗词生成响应为空')

            let buffer = ''
            let currentEventType = ''

            while (true) {
                const { done, value } = await reader.read()
                if (done) break

                buffer += decoder.decode(value, { stream: true })
                const lines = buffer.split('\n')
                buffer = lines.pop() || ''

                for (const line of lines) {
                    const trimmed = line.trim()
                    if (!trimmed) { currentEventType = ''; continue }

                    if (trimmed.startsWith('event:')) {
                        currentEventType = trimmed.slice(6).trim()
                        continue
                    }

                    if (!trimmed.startsWith('data:')) continue
                    const data = trimmed.slice(5).trim()

                    try {
                        const event = JSON.parse(data)

                        if (currentEventType === 'poem') {
                            updateLastMessagePoem({ text: event.text })
                            updateLastMessage(event.text)
                        } else if (currentEventType === 'poem_image') {
                            updateLastMessagePoem({ imageUrl: event.url })
                        } else if (currentEventType === 'poem_audio') {
                            updateLastMessagePoem({ audioBase64: event.audio_base64 })
                        } else if (currentEventType === 'reasoning') {
                            setProgress(event.status === 'running' ? (event.label || 'AI...') : '')
                        } else if (currentEventType === 'done') {
                            setLoading(false)
                            setProgress('')
                        } else if (currentEventType === 'error') {
                            console.error('Poem stream error:', event.message)
                            updateLastMessage(event.message || '诗词生成没有完成，请稍后再试')
                            setLoading(false)
                            setProgress('')
                        }
                    } catch (e) {
                        console.error('Failed to parse poem SSE event:', e)
                    }
                    currentEventType = ''
                }
            }
        } catch (error) {
            console.error('Poem API error:', error)
            updateLastMessage('诗词生成没有完成，请稍后再试。')
        } finally {
            setLoading(false)
            setProgress('')
        }
    }

    const sendMessage = async () => {
        if (isLoading) return

        if (!inputValue.trim()) return

        // Check for poetry intent
        const poemTopic = detectPoemIntent(inputValue.trim())
        if (poemTopic) {
            await sendPoemMessage(poemTopic, inputValue.trim())
            return
        }

        const userMessage = {
            id: Date.now().toString(),
            role: 'user' as const,
            content: inputValue.trim(),
            timestamp: Date.now(),
        }

        addMessage(userMessage)
        setInputValue('')
        setLoading(true)
        setProgress('正在整理问题...')

        // Add assistant message placeholder
        const assistantMessageId = (Date.now() + 1).toString()
        addMessage({
            id: assistantMessageId,
            role: 'assistant',
            content: '',
            timestamp: Date.now(),
        })

        try {
            const response = await fetch(`${API_BASE}/api/v1/chat`, {
                method: 'POST',
                ...authFetchOptions({ headers: { 'Content-Type': 'application/json' } }),
                body: JSON.stringify({ message: userMessage.content }),
            })

            if (!response.ok) {
                throw new Error(`问答请求失败（${response.status}）`)
            }

            const reader = response.body?.getReader()
            const decoder = new TextDecoder()

            if (!reader) {
                throw new Error('问答响应为空')
            }

            let buffer = ''
            let currentEventType = ''
            let reasoningSteps: ReasoningStep[] = INITIAL_REASONING_STEPS.map((s) => ({ ...s }))
            assistantContentRef.current = ''
            streamBufferRef.current = ''

            // Initialize reasoning steps on the assistant message
            updateLastMessageReasoning(reasoningSteps)

            while (true) {
                const { done, value } = await reader.read()
                if (done) break

                buffer += decoder.decode(value, { stream: true })
                const lines = buffer.split('\n')
                buffer = lines.pop() || ''

                for (const line of lines) {
                    const trimmed = line.trim()
                    if (!trimmed) {
                        currentEventType = ''
                        continue
                    }

                    // Handle named event type lines (e.g., "event: entities")
                    if (trimmed.startsWith('event:')) {
                        currentEventType = trimmed.slice(6).trim()
                        continue
                    }

                    if (!trimmed.startsWith('data:')) continue

                    const data = trimmed.slice(5).trim()
                    if (data === '[DONE]') {
                        flushStreamBuffer(true)
                        setLoading(false)
                        setProgress('')
                        continue
                    }

                    try {
                        const event = JSON.parse(data)

                        // Handle reasoning events
                        if (currentEventType === 'reasoning') {
                            reasoningSteps = reasoningSteps.map((s) =>
                                s.step === event.step
                                    ? {
                                          ...s,
                                          status: event.status,
                                          duration: event.duration ?? s.duration,
                                          model: event.model ?? s.model,
                                          fallback: event.fallback ?? s.fallback,
                                      }
                                    : s
                            )
                            updateLastMessageReasoning([...reasoningSteps])
                            currentEventType = ''
                            continue
                        }

                        if (currentEventType === 'entities' || currentEventType === 'new_entities') {
                            currentEventType = ''
                            continue
                        }

                        // Handle regular data events (type-based or content-based)
                        if (currentEventType === 'progress') {
                            setProgress(event.status || event.text || '')
                        } else if (currentEventType === 'answer_context') {
                            updateLastMessageAnswerContext(event)
                        } else if (currentEventType === 'done') {
                            flushStreamBuffer(true)
                            setLoading(false)
                            setProgress('')
                        } else if (currentEventType === 'error') {
                            flushStreamBuffer(true)
                            console.error('Stream error:', event.message)
                            updateLastMessage(event.message || '问答服务暂时不可用，请稍后再试')
                            setLoading(false)
                            setProgress('')
                        } else if (event.content !== undefined) {
                            streamBufferRef.current += event.content
                            flushStreamBuffer()
                        }
                    } catch (e) {
                        console.error('Failed to parse SSE event:', e)
                    }

                    currentEventType = ''
                }
            }
            flushStreamBuffer(true)
            setLoading(false)
            setProgress('')
        } catch (error) {
            console.error('Failed to send message:', error)
            const failedActions: AnswerContextAction[] = [
                {
                    id: 'retry-chat',
                    label: '重新提问',
                    kind: 'chat',
                    prompt: userMessage.content,
                },
                {
                    id: 'switch-search',
                    label: '转到原文检索',
                    kind: 'search',
                    query: userMessage.content,
                },
            ]
            updateLastMessageReasoning([])
            updateLastMessageAnswerContext({
                trustLabel: '未完成',
                trustPoints: ['当前问答服务暂时不可用，请稍后重试，或先改用原文检索。'],
                citationCount: 0,
                relatedEntityCount: 0,
                suggestedActions: failedActions,
            })
            updateLastMessage('当前问答服务暂时不可用，请稍后重试，或先改用原文检索。')
            setLoading(false)
            setProgress('')
        }
    }

    return (
        <div className="flex flex-col h-full" style={{ backgroundColor: 'var(--gf-bg)' }}>
            {messages.length === 0 && (
                <div className="px-4 pb-4">
                    <div
                        className="mx-auto max-w-4xl glass-card rounded-[28px] px-5 py-5 relative overflow-hidden"
                    >
                        <div className="ink-wash-blob w-36 h-36 -top-8 -right-8 bg-[var(--gf-gold)] opacity-[0.06]"></div>
                        <div className="flex flex-wrap items-start justify-between gap-3">
                            <div className="max-w-2xl">
                                <div className="mb-2 text-[11px] tracking-[0.26em]" style={{ color: 'var(--gf-gold)' }}>
                                    AI问答
                                </div>
                                <h2 className="text-lg font-medium" style={{ color: 'var(--gf-text)' }}>
                                    从一句原文问起
                                </h2>
                                <p className="mt-2 text-sm leading-7" style={{ color: 'rgba(26,30,35,0.48)' }}>
                                    不知道怎么开口也没关系。贴一句原文，或直接提一个问题，都可以开始。
                                </p>
                            </div>
                            <button
                                onClick={() => setActiveTab('search')}
                                className="inline-flex min-w-[7.5rem] justify-center items-center gap-1.5 rounded-full px-3 py-1.5 text-xs transition-all duration-300 hover:-translate-y-0.5"
                                style={{ backgroundColor: 'rgba(26,30,35,0.05)', color: 'rgba(26,30,35,0.66)' }}
                            >
                                <Search className="h-3.5 w-3.5" />
                                转到原文检索
                            </button>
                        </div>

                        <div className="mt-4 flex flex-wrap gap-2">
                            {QUICK_CHAT_PROMPTS.map((prompt) => (
                                <button
                                    key={prompt}
                                    onClick={() => setInputValue(prompt)}
                                    className="rounded-full px-3 py-1.5 text-xs transition-colors hover:bg-[rgba(201,160,99,0.16)]"
                                    style={{ border: '1px solid rgba(26,30,35,0.08)', color: 'var(--gf-text)', backgroundColor: 'rgba(255,255,255,0.76)' }}
                                >
                                    {prompt}
                                </button>
                            ))}
                        </div>

                    </div>
                </div>
            )}

            {/* Messages */}
            <MessageList messages={messages} loadingLabel={currentProgress} />

            {/* Voice recognition error message */}
            {voiceError && (
                <div className="flex items-center justify-center px-4 py-2 text-sm" style={{ color: 'var(--gf-gugong-red)' }}>
                    {voiceError}
                </div>
            )}

            {/* Input */}
            <MessageInput
                value={inputValue}
                onChange={setInputValue}
                onSend={sendMessage}
                disabled={isLoading}
                onVoiceToggle={handleVoiceToggle}
                isRecording={isRecording}
                isTranscribing={isTranscribing}
            />
        </div>
    )
}
