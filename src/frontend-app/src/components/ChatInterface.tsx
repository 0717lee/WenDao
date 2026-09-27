import { startTransition, useCallback, useEffect, useRef, useState } from 'react'
import { Search } from 'lucide-react'
import { useStore, type AnswerContextAction } from '../store/useStore'
import { MessageList } from './MessageList'
import { MessageInput } from './MessageInput'
import { useVoiceRecorder } from './AudioRecorder'
import { API_BASE } from '../lib/api'
import { authFetchOptions } from '../store/useAuthStore'
import { useGraphStore } from '../store/useGraphStore'
import { useDocumentStore } from '../store/useDocumentStore'
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

const EMPTY_RESPONSE_MESSAGE = '问答服务没有返回内容，请重试，或先改用原文检索。'

function failureActions(prompt: string): AnswerContextAction[] {
    return [
        {
            id: 'retry-chat',
            label: '重新提问',
            kind: 'chat',
            prompt,
        },
        {
            id: 'switch-search',
            label: '转到原文检索',
            kind: 'search',
            query: prompt,
        },
    ]
}

async function responseErrorMessage(response: Response, fallback: string): Promise<string> {
    try {
        const data = await response.json()
        if (typeof data === 'string' && data.trim()) return data.trim()
        if (data && typeof data === 'object') {
            const detail = data.detail ?? data.error ?? data.message
            if (typeof detail === 'string' && detail.trim()) return detail.trim()
        }
    } catch {
        try {
            const text = await response.text()
            if (text.trim()) return text.trim()
        } catch {
            // Keep the status-based fallback when the response has no readable body.
        }
    }

    return fallback
}

function requestFailureMessage(error: unknown, fallback: string): string {
    const message = error instanceof Error ? error.message : ''
    if (/failed to fetch|networkerror|load failed/i.test(message)) return fallback
    return message || fallback
}

export function ChatInterface() {
    const [inputValue, setInputValue] = useState('')
    const [voiceError, setVoiceError] = useState('')
    const streamBufferRef = useRef('')
    const streamFlushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
    const assistantContentRef = useRef('')
    const requestSequenceRef = useRef(0)
    const activeRequestRef = useRef<{ id: number; controller: AbortController; prompt: string } | null>(null)
    const readerRef = useRef<ReadableStreamDefaultReader<Uint8Array> | null>(null)
    const mountedRef = useRef(true)
    const voiceErrorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
    const { messages, isLoading, currentProgress, draftMessage, addMessage, updateLastMessage, updateLastMessageAnswerContext, updateLastMessageReasoning, updateLastMessagePoem, setLoading, setProgress, setDraftMessage } = useStore()
    const { setActiveTab, queueSearchQuery } = useGraphStore()
    const setPendingAnchorText = useDocumentStore((state) => state.setPendingAnchorText)
    const { isRecording, isTranscribing, toggleRecording } = useVoiceRecorder()

    useEffect(() => {
        if (draftMessage) {
            setInputValue(draftMessage)
            setDraftMessage('')
        }
    }, [draftMessage, setDraftMessage])

    useEffect(() => {
        mountedRef.current = true

        return () => {
            const request = activeRequestRef.current
            if (request) {
                const currentMessages = useStore.getState().messages
                const previous = currentMessages[currentMessages.length - 1]?.content || ''
                updateLastMessage(`${previous}${previous ? '\n\n' : ''}已停止本次回答，可以重新提问。`)
                updateLastMessageAnswerContext({ trustLabel: '未完成', trustPoints: [], citationCount: 0, relatedEntityCount: 0, suggestedActions: failureActions(request.prompt) })
            }
            mountedRef.current = false
            requestSequenceRef.current += 1
            activeRequestRef.current?.controller.abort()
            activeRequestRef.current = null
            void Promise.resolve(readerRef.current?.cancel()).catch(() => {})
            readerRef.current = null
            if (streamFlushTimerRef.current) {
                clearTimeout(streamFlushTimerRef.current)
                streamFlushTimerRef.current = null
            }
            if (voiceErrorTimerRef.current) {
                clearTimeout(voiceErrorTimerRef.current)
                voiceErrorTimerRef.current = null
            }
            streamBufferRef.current = ''
            assistantContentRef.current = ''
            setLoading(false)
            setProgress('')
        }
    }, [setLoading, setProgress])

    const isCurrentRequest = (requestId: number) =>
        mountedRef.current && activeRequestRef.current?.id === requestId

    const beginRequest = (prompt: string) => {
        const controller = new AbortController()
        const requestId = ++requestSequenceRef.current
        activeRequestRef.current = { id: requestId, controller, prompt }
        return { requestId, controller }
    }

    const clearStreamFlushTimer = () => {
        if (streamFlushTimerRef.current) {
            clearTimeout(streamFlushTimerRef.current)
            streamFlushTimerRef.current = null
        }
    }

    const finishRequest = (requestId: number) => {
        if (!isCurrentRequest(requestId)) return
        clearStreamFlushTimer()
        streamBufferRef.current = ''
        readerRef.current = null
        activeRequestRef.current = null
        setLoading(false)
        setProgress('')
    }

    const showFailure = (requestId: number, message: string, prompt: string) => {
        if (!isCurrentRequest(requestId)) return
        clearStreamFlushTimer()
        streamBufferRef.current = ''
        updateLastMessageReasoning([])
        updateLastMessageAnswerContext({
            trustLabel: '未完成',
            trustPoints: ['你可以重新提问，或先改用原文检索。'],
            citationCount: 0,
            relatedEntityCount: 0,
            suggestedActions: failureActions(prompt),
        })
        updateLastMessage(message)
    }

    const flushStreamBuffer = useCallback(
        (requestId: number, force = false) => {
            const applyFlush = () => {
                streamFlushTimerRef.current = null
                if (!isCurrentRequest(requestId) || !streamBufferRef.current) return
                assistantContentRef.current += streamBufferRef.current
                streamBufferRef.current = ''
                startTransition(() => {
                    updateLastMessage(assistantContentRef.current)
                })
            }

            if (force) {
                clearStreamFlushTimer()
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
                if (voiceErrorTimerRef.current) clearTimeout(voiceErrorTimerRef.current)
                voiceErrorTimerRef.current = setTimeout(() => {
                    voiceErrorTimerRef.current = null
                    if (mountedRef.current) setVoiceError('')
                }, 3000)
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
        if (activeRequestRef.current) return

        const { requestId, controller } = beginRequest(userContent)
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
                signal: controller.signal,
            })

            if (!response.ok) {
                throw new Error(await responseErrorMessage(response, `诗词生成请求失败（${response.status}）`))
            }

            const reader = response.body?.getReader()
            const decoder = new TextDecoder()
            if (!reader) throw new Error('诗词生成响应为空')
            readerRef.current = reader

            let buffer = ''
            let currentEventType = ''
            let poemText = ''
            let streamError = ''
            let completed = false

            while (true) {
                const { done, value } = await reader.read()
                if (!isCurrentRequest(requestId)) return
                if (done) {
                    buffer += decoder.decode()
                    if (buffer.trim()) {
                        buffer += '\n'
                    }
                } else {
                    buffer += decoder.decode(value, { stream: true })
                }

                const lines = buffer.split('\n')
                buffer = lines.pop() || ''

                for (const line of lines) {
                    const trimmed = line.trim()
                    if (!trimmed) { currentEventType = ''; continue }
                    if (streamError) continue

                    if (trimmed.startsWith('event:')) {
                        currentEventType = trimmed.slice(6).trim()
                        continue
                    }

                    if (!trimmed.startsWith('data:')) continue
                    const data = trimmed.slice(5).trim()

                    try {
                        const event = JSON.parse(data)

                        if (currentEventType === 'poem') {
                            poemText += event.text || ''
                            updateLastMessagePoem({ text: event.text })
                            updateLastMessage(event.text)
                        } else if (currentEventType === 'poem_image') {
                            updateLastMessagePoem({ imageUrl: event.url })
                        } else if (currentEventType === 'poem_audio') {
                            updateLastMessagePoem({ audioBase64: event.audio_base64 })
                        } else if (currentEventType === 'reasoning') {
                            setProgress(event.status === 'running' ? (event.label || 'AI...') : '')
                        } else if (currentEventType === 'done') {
                            completed = true
                            setProgress('')
                        } else if (currentEventType === 'error') {
                            console.error('Poem stream error:', event.message)
                            streamError = event.message || '诗词生成没有完成，请稍后再试'
                            showFailure(requestId, streamError, userContent)
                            void Promise.resolve(reader.cancel?.()).catch(() => {})
                            controller.abort()
                        }
                    } catch (e) {
                        console.error('Failed to parse poem SSE event:', e)
                    }
                    currentEventType = ''
                }

                if (done) break
            }
            if (!streamError && poemText.trim() && !completed) {
                showFailure(requestId, '诗词生成中断，请重新提问。', userContent)
            } else if (!streamError && !poemText.trim()) {
                showFailure(requestId, EMPTY_RESPONSE_MESSAGE, userContent)
            } else if (streamError) {
                showFailure(requestId, streamError, userContent)
            }
        } catch (error) {
            if (!isCurrentRequest(requestId)) return
            if (controller.signal.aborted || (error instanceof DOMException && error.name === 'AbortError')) return
            console.error('Poem API error:', error)
            showFailure(requestId, requestFailureMessage(error, '诗词生成没有完成，请稍后再试。'), userContent)
        } finally {
            finishRequest(requestId)
        }
    }

    const sendMessage = async (requestedInput?: string) => {
        if (isLoading || activeRequestRef.current) return

        const content = (requestedInput ?? inputValue).trim()
        if (!content) return

        // Check for poetry intent
        const poemTopic = detectPoemIntent(content)
        if (poemTopic) {
            await sendPoemMessage(poemTopic, content)
            return
        }

        const userMessage = {
            id: Date.now().toString(),
            role: 'user' as const,
            content,
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

        const { requestId, controller } = beginRequest(userMessage.content)

        try {
            const response = await fetch(`${API_BASE}/api/v1/chat`, {
                method: 'POST',
                ...authFetchOptions({ headers: { 'Content-Type': 'application/json' } }),
                body: JSON.stringify({ message: userMessage.content }),
                signal: controller.signal,
            })

            if (!response.ok) {
                throw new Error(await responseErrorMessage(response, `问答请求失败（${response.status}）`))
            }

            const reader = response.body?.getReader()
            const decoder = new TextDecoder()

            if (!reader) {
                throw new Error('问答响应为空')
            }
            readerRef.current = reader

            let buffer = ''
            let reasoningSteps: ReasoningStep[] = INITIAL_REASONING_STEPS.map((s) => ({ ...s }))
            assistantContentRef.current = ''
            streamBufferRef.current = ''

            // Initialize reasoning steps on the assistant message
            updateLastMessageReasoning(reasoningSteps)

            let streamError = ''
            let parseError = false
            let sawContent = false
            let completed = false
            let currentEventType = ''

            const processLine = (line: string) => {
                if (!isCurrentRequest(requestId)) return
                const trimmed = line.trim()
                if (!trimmed) {
                    currentEventType = ''
                    return
                }
                if (streamError) return

                if (trimmed.startsWith('event:')) {
                    currentEventType = trimmed.slice(6).trim()
                    return
                }

                if (!trimmed.startsWith('data:')) return

                const data = trimmed.slice(5).trim()
                if (data === '[DONE]') {
                    completed = true
                    flushStreamBuffer(requestId, true)
                    currentEventType = ''
                    return
                }

                try {
                    const event = JSON.parse(data)

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
                    } else if (currentEventType === 'entities' || currentEventType === 'new_entities') {
                        // Entity events are consumed by the graph store elsewhere.
                    } else if (currentEventType === 'progress') {
                        setProgress(event.status || event.text || '')
                    } else if (currentEventType === 'answer_context') {
                        updateLastMessageAnswerContext(event)
                    } else if (currentEventType === 'done') {
                        completed = true
                        flushStreamBuffer(requestId, true)
                        setProgress('')
                    } else if (currentEventType === 'error') {
                        streamError = event.message || '问答服务暂时不可用，请稍后再试。'
                        showFailure(requestId, streamError, userMessage.content)
                        void Promise.resolve(reader.cancel?.()).catch(() => {})
                        controller.abort()
                    } else if (event.content !== undefined) {
                        const contentChunk = String(event.content)
                        if (contentChunk) {
                            sawContent = true
                            streamBufferRef.current += contentChunk
                            flushStreamBuffer(requestId)
                        }
                    }
                } catch (error) {
                    parseError = true
                    console.error('Failed to parse SSE event:', error)
                }

                currentEventType = ''
            }

            while (true) {
                const { done, value } = await reader.read()
                if (!isCurrentRequest(requestId)) return
                if (done) {
                    buffer += decoder.decode()
                    if (buffer.trim()) buffer += '\n'
                } else {
                    buffer += decoder.decode(value, { stream: true })
                }
                const lines = buffer.split('\n')
                buffer = lines.pop() || ''

                for (const line of lines) {
                    processLine(line)
                }
                if (done) break
            }

            flushStreamBuffer(requestId, true)
            if (streamError) {
                showFailure(requestId, streamError, userMessage.content)
            } else if (parseError) {
                showFailure(requestId, '问答响应无法解析，请重试，或先改用原文检索。', userMessage.content)
            } else if (!sawContent && !assistantContentRef.current.trim()) {
                showFailure(requestId, EMPTY_RESPONSE_MESSAGE, userMessage.content)
            } else if (!completed) {
                showFailure(requestId, '回答中断，内容可能不完整，请重新提问。', userMessage.content)
            }
        } catch (error) {
            if (!isCurrentRequest(requestId)) return
            if (controller.signal.aborted || (error instanceof DOMException && error.name === 'AbortError')) return
            console.error('Failed to send message:', error)
            showFailure(
                requestId,
                requestFailureMessage(error, '当前问答服务暂时不可用，请稍后重试，或先改用原文检索。'),
                userMessage.content
            )
        }
        finally {
            finishRequest(requestId)
        }
    }

    const cancelRequest = useCallback(() => {
        const activeRequest = activeRequestRef.current
        if (!activeRequest) return

        requestSequenceRef.current += 1
        activeRequestRef.current = null
        activeRequest.controller.abort()
        void Promise.resolve(readerRef.current?.cancel()).catch(() => {})
        readerRef.current = null
        clearStreamFlushTimer()
        streamBufferRef.current = ''
        assistantContentRef.current = ''
        updateLastMessage('已取消本次回答。')
        updateLastMessageAnswerContext({
            trustLabel: '未完成',
            trustPoints: ['本次回答已取消。你可以重新提问，或先改用原文检索。'],
            citationCount: 0,
            relatedEntityCount: 0,
            suggestedActions: failureActions(activeRequest.prompt),
        })
        setLoading(false)
        setProgress('')
    }, [setLoading, setProgress, updateLastMessage, updateLastMessageAnswerContext])

    const handleAnswerContextAction = useCallback(
        (action: AnswerContextAction) => {
            const target = (action.prompt || action.query || '').trim()
            if (action.kind === 'search' && target) {
                queueSearchQuery(target)
                setActiveTab('search')
                return
            }

            if (action.kind === 'reader') {
                if (target) setPendingAnchorText(target)
                setActiveTab('reader')
                return
            }

            if (action.kind === 'chat' && target) {
                void sendMessage(target)
                return
            }

            if (target) setInputValue(target)
        },
        [queueSearchQuery, sendMessage, setActiveTab, setPendingAnchorText]
    )

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
            <MessageList
                messages={messages}
                loadingLabel={currentProgress}
                isLoading={isLoading}
                onAnswerContextAction={handleAnswerContextAction}
            />

            {/* Voice recognition error message */}
            {voiceError && (
                <div role="alert" className="flex items-center justify-center px-4 py-2 text-sm" style={{ color: 'var(--gf-gugong-red)' }}>
                    {voiceError}
                </div>
            )}

            {/* Input */}
            <MessageInput
                value={inputValue}
                onChange={setInputValue}
                onSend={sendMessage}
                disabled={isLoading}
                onCancel={cancelRequest}
                onVoiceToggle={handleVoiceToggle}
                isRecording={isRecording}
                isTranscribing={isTranscribing}
            />
        </div>
    )
}
