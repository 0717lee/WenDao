import { startTransition, useCallback, useEffect, useRef, useState } from 'react'
import { Loader2, Volume2, VolumeX } from 'lucide-react'
import { useStore } from '../store/useStore'
import { MessageList } from './MessageList'
import { MessageInput } from './MessageInput'
import { ImageUploadPreview } from './ImageUploadPreview'
import { useVoiceRecorder, playTTSAudio } from './AudioRecorder'
import { API_BASE } from '../lib/api'
import { useGraphStore } from '../store/useGraphStore'
import { useDocumentStore } from '../store/useDocumentStore'
import type { ReasoningStep } from './ReasoningTimeline'

// Default reasoning steps template
const INITIAL_REASONING_STEPS: ReasoningStep[] = [
    { step: 'retrieval', label: '检索古籍知识库', status: 'pending' },
    { step: 'entity_extraction', label: '抽取关联实体', status: 'pending' },
    { step: 'knowledge_linking', label: '知识关联推理', status: 'pending' },
    { step: 'generation', label: '生成通俗解读', status: 'pending' },
]

const QUICK_CHAT_PROMPTS = [
    '“学而时习之，不亦说乎？”到底在讲什么？',
    '孔子和孟子的思想有什么联系？',
    '请解释“逍遥游”里鲲鹏的寓意。',
]

export function ChatInterface() {
    const [inputValue, setInputValue] = useState('')
    const [attachedImage, setAttachedImage] = useState<File | null>(null)
    const [voiceError, setVoiceError] = useState('')
    const fileInputRef = useRef<HTMLInputElement>(null)
    const streamBufferRef = useRef('')
    const streamFlushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
    const assistantContentRef = useRef('')
    const { messages, isLoading, currentProgress, draftMessage, addMessage, updateLastMessage, updateLastMessageReasoning, updateLastMessagePoem, setLoading, setProgress, setDraftMessage, ttsAutoRead, setTtsAutoRead } = useStore()
    const { setDocument, setUploadStatus, setPendingAnchorText } = useDocumentStore()
    const setActiveTab = useGraphStore((state) => state.setActiveTab)
    const queueSearchQuery = useGraphStore((state) => state.queueSearchQuery)
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

    const handleCitationClick = useCallback(
        async (citation: { title: string; source: string; excerpt?: string }) => {
            try {
                const params = new URLSearchParams({
                    title: citation.title,
                    source: citation.source,
                })
                if (citation.excerpt) params.set('excerpt', citation.excerpt)

                const resolveRes = await fetch(`${API_BASE}/api/v1/documents/resolve-citation?${params.toString()}`)
                const resolveData = resolveRes.ok ? await resolveRes.json() : { match: null }

                if (resolveData.match?.document_id) {
                    const documentRes = await fetch(`${API_BASE}/api/v1/documents/${resolveData.match.document_id}`)
                    if (documentRes.ok) {
                        const data = await documentRes.json()
                        setDocument({
                            id: data.id,
                            title: data.title,
                            originalText: data.original_text,
                            punctuatedText: data.punctuated_text || '',
                            translatedText: data.translated_text || '',
                            confidence: data.ocr_confidence,
                            imageUrl: data.image_data || undefined,
                        })
                        setUploadStatus(data.punctuated_text ? 'done' : 'idle')
                        setPendingAnchorText(resolveData.match.anchor_text || citation.excerpt || citation.source)
                        setActiveTab('reader')
                        return
                    }
                }
            } catch (error) {
                console.error('Citation resolution failed:', error)
            }

            queueSearchQuery(`${citation.title} ${citation.source}`)
            setActiveTab('search')
        },
        [queueSearchQuery, setActiveTab, setDocument, setPendingAnchorText, setUploadStatus]
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

    // TTS auto-read: called after assistant message completes
    const triggerTTSAutoRead = useCallback(
        (text: string) => {
            if (ttsAutoRead && text && text.length > 0) {
                playTTSAudio(text)
            }
        },
        [ttsAutoRead]
    )

    const handleAttachImage = () => {
        fileInputRef.current?.click()
    }

    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (file && (file.type === 'image/jpeg' || file.type === 'image/png')) {
            if (file.size > 5 * 1024 * 1024) {
                alert('Image size must be under 5MB')
                return
            }
            setAttachedImage(file)
        }
        // Reset so same file can be selected again
        if (fileInputRef.current) {
            fileInputRef.current.value = ''
        }
    }

    const handleCancelImage = () => {
        setAttachedImage(null)
    }

    const readFileAsDataURL = (file: File): Promise<string> => {
        return new Promise((resolve, reject) => {
            const reader = new FileReader()
            reader.onloadend = () => resolve(reader.result as string)
            reader.onerror = reject
            reader.readAsDataURL(file)
        })
    }

    const sendVisionMessage = async (image: File) => {
        setLoading(true)
        setProgress('正在分析图片内容...')

        // Read image as data URL for preview
        const imagePreview = await readFileAsDataURL(image)

        // Add user message with image preview
        const userMessage = {
            id: Date.now().toString(),
            role: 'user' as const,
            content: inputValue.trim() || '请分析这张图片与相关文化信息',
            visionResult: { imagePreview, buildingType: '', roofStyle: '', components: [], era: '', rawText: '', matchedGraphNodes: [] },
            timestamp: Date.now(),
        }
        addMessage(userMessage)
        setInputValue('')
        setAttachedImage(null)

        // Add assistant placeholder
        addMessage({
            id: (Date.now() + 1).toString(),
            role: 'assistant',
            content: '',
            timestamp: Date.now(),
        })

        try {
            const formData = new FormData()
            formData.append('file', image)
            formData.append('question', userMessage.content)

            const response = await fetch(`${API_BASE}/api/v1/vision/analyze`, {
                method: 'POST',
                body: formData,
            })

            if (!response.ok) {
                const errBody = await response.json().catch(() => ({}))
                throw new Error(errBody.error || `Server error ${response.status}`)
            }

            const data = await response.json()
            const analysis = data.analysis || {}
            const matchedNodes = data.matched_graph_nodes || []

            // Update assistant message with vision result
            const currentMessages = useStore.getState().messages
            const lastMessage = currentMessages[currentMessages.length - 1]
            if (lastMessage && lastMessage.role === 'assistant') {
                lastMessage.content = analysis.raw_text || 'Analysis complete'
                lastMessage.visionResult = {
                    imagePreview,
                    buildingType: analysis.building_type || '',
                    roofStyle: analysis.roof_style || '',
                    components: analysis.components || [],
                    era: analysis.era || '',
                    rawText: analysis.raw_text || '',
                    matchedGraphNodes: matchedNodes,
                }
            }
            // Force re-render
            updateLastMessage(analysis.raw_text || 'Analysis complete')
        } catch (error) {
            console.error('Vision API error:', error)
            updateLastMessage('图片分析失败，请稍后重试。')
        } finally {
            setLoading(false)
            setProgress('')
        }
    }

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
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ topic }),
            })

            if (!response.ok) {
                throw new Error(`Server error ${response.status}`)
            }

            const reader = response.body?.getReader()
            const decoder = new TextDecoder()
            if (!reader) throw new Error('No response body')

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
                            updateLastMessage(event.message || 'Poetry generation failed')
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
            updateLastMessage('诗词生成失败，请稍后重试。')
            setLoading(false)
            setProgress('')
        }
    }

    const sendMessage = async () => {
        if (isLoading) return

        // If image is attached, use vision flow
        if (attachedImage) {
            await sendVisionMessage(attachedImage)
            return
        }

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
        setProgress('正在检索古籍...')

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
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ message: userMessage.content }),
            })

            if (!response.ok) {
                throw new Error('Network response was not ok')
            }

            const reader = response.body?.getReader()
            const decoder = new TextDecoder()

            if (!reader) {
                throw new Error('No response body')
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
                        } else if (currentEventType === 'citations') {
                            const currentMessages = useStore.getState().messages
                            const lastMessage = currentMessages[currentMessages.length - 1]
                            if (lastMessage && lastMessage.role === 'assistant') {
                                lastMessage.citations = Array.isArray(event) ? event : event.citations
                            }
                        } else if (currentEventType === 'done') {
                            flushStreamBuffer(true)
                            setLoading(false)
                            setProgress('')
                            // TTS auto-read when chat stream completes
                            if (assistantContentRef.current) triggerTTSAutoRead(assistantContentRef.current)
                        } else if (currentEventType === 'error') {
                            flushStreamBuffer(true)
                            console.error('Stream error:', event.message)
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
        } catch (error) {
            console.error('Failed to send message:', error)
            updateLastMessage('抱歉，当前对话暂时不可用，请稍后重试。')
            setLoading(false)
            setProgress('')
        }
    }

    return (
        <div className="flex flex-col h-full" style={{ backgroundColor: 'var(--gf-bg)' }}>
            {/* TTS auto-read toggle in top-right corner */}
            <div className="flex items-center justify-end px-4 py-2">
                <button
                    onClick={() => setTtsAutoRead(!ttsAutoRead)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs transition-colors"
                    style={{
                        color: ttsAutoRead ? 'var(--gf-gugong-red)' : 'rgba(26,30,35,0.4)',
                        backgroundColor: ttsAutoRead ? 'rgba(140,26,17,0.08)' : 'transparent',
                    }}
                    title="自动朗读AI回答"
                >
                    {ttsAutoRead ? (
                        <Volume2 className="w-4 h-4" />
                    ) : (
                        <VolumeX className="w-4 h-4" />
                    )}
                    <span>{ttsAutoRead ? '朗读开' : '朗读关'}</span>
                </button>
            </div>

            {/* Hidden file input for image upload */}
            <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png"
                onChange={handleFileSelect}
                className="hidden"
            />

            {/* Messages */}
            <MessageList messages={messages} onCitationClick={handleCitationClick} />

            {messages.length === 0 && (
                <div className="px-4 pb-2">
                    <div className="mx-auto flex max-w-3xl flex-wrap justify-center gap-2">
                        {QUICK_CHAT_PROMPTS.map((prompt) => (
                            <button
                                key={prompt}
                                onClick={() => setInputValue(prompt)}
                                className="rounded-full px-3 py-1.5 text-xs transition-colors hover:bg-[rgba(201,160,99,0.16)]"
                                style={{ border: '1px solid rgba(26,30,35,0.08)', color: 'var(--gf-text)' }}
                            >
                                {prompt}
                            </button>
                        ))}
                    </div>
                </div>
            )}

            {/* Loading indicator */}
            {isLoading && currentProgress && (
                <div className="flex items-center justify-center gap-2 px-4 py-2 text-sm" style={{ color: 'rgba(26,30,35,0.5)' }}>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>{currentProgress}</span>
                </div>
            )}

            {/* Voice recognition error message */}
            {voiceError && (
                <div className="flex items-center justify-center px-4 py-2 text-sm" style={{ color: 'var(--gf-gugong-red)' }}>
                    {voiceError}
                </div>
            )}

            {/* Image preview (above input) */}
            {attachedImage && (
                <ImageUploadPreview file={attachedImage} onCancel={handleCancelImage} />
            )}

            {/* Input */}
            <MessageInput
                value={inputValue}
                onChange={setInputValue}
                onSend={sendMessage}
                disabled={isLoading}
                onAttachImage={handleAttachImage}
                onVoiceToggle={handleVoiceToggle}
                isRecording={isRecording}
                isTranscribing={isTranscribing}
            />
        </div>
    )
}
