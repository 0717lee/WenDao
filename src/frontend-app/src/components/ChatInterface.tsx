import { startTransition, useCallback, useEffect, useRef, useState } from 'react'
import { Loader2, Search, Volume2, VolumeX } from 'lucide-react'
import { useStore, type AnswerContextAction } from '../store/useStore'
import { MessageList } from './MessageList'
import { MessageInput } from './MessageInput'
import { ImageUploadPreview } from './ImageUploadPreview'
import { useVoiceRecorder, playTTSAudio } from './AudioRecorder'
import { API_BASE } from '../lib/api'
import { authFetchOptions } from '../store/useAuthStore'
import { useGraphStore } from '../store/useGraphStore'
import { useDocumentStore } from '../store/useDocumentStore'
import type { ReasoningStep } from './ReasoningTimeline'
import { buildDemoChatResponse, resolveDemoCitation, getDemoDocumentById, toReaderDocument } from '../data/demoDocuments'

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
    const { messages, isLoading, currentProgress, draftMessage, addMessage, updateLastMessage, updateLastMessageCitations, updateLastMessageAnswerContext, updateLastMessageReasoning, updateLastMessagePoem, setLoading, setProgress, setDraftMessage, ttsAutoRead, setTtsAutoRead } = useStore()
    const { setDocument, setUploadStatus, setPendingAnchorText, setPendingReaderPanel } = useDocumentStore()
    const setActiveTab = useGraphStore((state) => state.setActiveTab)
    const setReaderReturnTab = useGraphStore((state) => state.setReaderReturnTab)
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

                const resolveRes = await fetch(`${API_BASE}/api/v1/documents/resolve-citation?${params.toString()}`, authFetchOptions())
                const resolveData = resolveRes.ok ? await resolveRes.json() : { match: null }

                if (resolveData.match?.document_id) {
                    const documentRes = await fetch(`${API_BASE}/api/v1/documents/${resolveData.match.document_id}`, authFetchOptions())
                    if (documentRes.ok) {
                        const data = await documentRes.json()
                        setDocument({
                            id: data.id,
                            title: data.title,
                            author: data.author ?? undefined,
                            dynasty: data.dynasty ?? undefined,
                            category: data.category ?? undefined,
                            sourceName: data.source_name ?? undefined,
                            sourceUrl: data.source_url ?? undefined,
                            chapterTitles: data.chapter_titles ?? undefined,
                            chapterCount: data.chapter_count ?? undefined,
                            featuredExcerpt: data.featured_excerpt ?? undefined,
                            difficulty: data.difficulty ?? undefined,
                            guideSummary: data.guide_summary ?? undefined,
                            readingTip: data.reading_tip ?? undefined,
                            recommendedChapters: data.recommended_chapters ?? undefined,
                            segmentGuides: data.segment_guides ?? undefined,
                            translationCache: data.translation_cache ?? undefined,
                            translationStatus: data.translation_status ?? undefined,
                            originalText: data.original_text,
                            punctuatedText: data.punctuated_text || '',
                            translatedText: data.translated_text || '',
                            confidence: data.ocr_confidence,
                            imageUrl: data.image_data || undefined,
                            sourceType: data.source_type || 'user',
                        })
                        setUploadStatus(data.punctuated_text ? 'done' : 'idle')
                        setPendingAnchorText(resolveData.match.anchor_text || citation.excerpt || citation.source)
                        setReaderReturnTab('chat')
                        setActiveTab('reader')
                        return
                    }
                }
            } catch (error) {
                console.error('Citation resolution failed:', error)
            }

            const demoMatch = resolveDemoCitation(citation)
            if (demoMatch) {
                const demoDocument = getDemoDocumentById(demoMatch.documentId)
                if (demoDocument) {
                    setDocument(toReaderDocument(demoDocument))
                    setUploadStatus('done')
                    setPendingAnchorText(demoMatch.anchorText)
                    setReaderReturnTab('chat')
                    setActiveTab('reader')
                    return
                }
            }

            queueSearchQuery(`${citation.title} ${citation.source}`)
            setActiveTab('search')
        },
        [queueSearchQuery, setActiveTab, setDocument, setPendingAnchorText, setReaderReturnTab, setUploadStatus]
    )

    const openDocumentById = useCallback(
        async (documentId: string, panel?: 'study' | null) => {
            try {
                const documentRes = await fetch(`${API_BASE}/api/v1/documents/${documentId}`, authFetchOptions())
                if (!documentRes.ok) return false
                const data = await documentRes.json()
                setDocument({
                    id: data.id,
                    title: data.title,
                    author: data.author ?? undefined,
                    dynasty: data.dynasty ?? undefined,
                    category: data.category ?? undefined,
                    sourceName: data.source_name ?? undefined,
                    sourceUrl: data.source_url ?? undefined,
                    chapterTitles: data.chapter_titles ?? undefined,
                    chapterCount: data.chapter_count ?? undefined,
                    featuredExcerpt: data.featured_excerpt ?? undefined,
                    difficulty: data.difficulty ?? undefined,
                    guideSummary: data.guide_summary ?? undefined,
                    readingTip: data.reading_tip ?? undefined,
                    recommendedChapters: data.recommended_chapters ?? undefined,
                    segmentGuides: data.segment_guides ?? undefined,
                    translationCache: data.translation_cache ?? undefined,
                    translationStatus: data.translation_status ?? undefined,
                    originalText: data.original_text,
                    punctuatedText: data.punctuated_text || '',
                    translatedText: data.translated_text || '',
                    confidence: data.ocr_confidence,
                    imageUrl: data.image_data || undefined,
                    sourceType: data.source_type || 'user',
                })
                setUploadStatus(data.punctuated_text ? 'done' : 'idle')
                if (panel) {
                    setPendingReaderPanel(panel)
                }
                setReaderReturnTab('chat')
                setActiveTab('reader')
                return true
            } catch {
                return false
            }
        },
        [setActiveTab, setDocument, setPendingReaderPanel, setReaderReturnTab, setUploadStatus]
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
                alert('图片大小不能超过 5MB')
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
                ...authFetchOptions({ method: 'POST' }),
                body: formData,
            })

            if (!response.ok) {
                const errBody = await response.json().catch(() => ({}))
                throw new Error(errBody.error || `图片识别失败（${response.status}）`)
            }

            const data = await response.json()
            const analysis = data.analysis || {}
            const matchedNodes = data.matched_graph_nodes || []

            // Update assistant message with vision result (immutable)
            useStore.setState((state) => {
                if (state.messages.length === 0) return state
                const last = state.messages[state.messages.length - 1]
                if (!last || last.role !== 'assistant') return state
                const updatedMessages = [...state.messages]
                updatedMessages[updatedMessages.length - 1] = {
                    ...last,
                    content: analysis.raw_text || '图片解析完成',
                    visionResult: {
                        imagePreview,
                        buildingType: analysis.building_type || '',
                        roofStyle: analysis.roof_style || '',
                        components: analysis.components || [],
                        era: analysis.era || '',
                        rawText: analysis.raw_text || '',
                        matchedGraphNodes: matchedNodes,
                    },
                }
                return { messages: updatedMessages }
            })
        } catch (error) {
            console.error('Vision API error:', error)
            updateLastMessage('图片分析没有完成，请稍后再试，或先改用文字提问。')
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
            setLoading(false)
            setProgress('')
        }
    }

    const handleAnswerAction = useCallback(
        (action: AnswerContextAction) => {
            if (action.citation) {
                void handleCitationClick(action.citation)
                return
            }

            if (action.kind === 'reader' && action.documentId) {
                void openDocumentById(action.documentId)
                return
            }

            if (action.kind === 'search' && action.query) {
                queueSearchQuery(action.query)
                setActiveTab('search')
                return
            }

            if (action.kind === 'wordbook') {
                setActiveTab('wordbook')
                return
            }

            if (action.kind === 'study' && action.documentId) {
                void openDocumentById(action.documentId, 'study')
                return
            }

            if (action.prompt) {
                setInputValue(action.prompt)
            }
        },
        [handleCitationClick, openDocumentById, queueSearchQuery, setActiveTab]
    )

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

        const applyDemoFallback = () => {
            const fallback = buildDemoChatResponse(userMessage.content)
            const fallbackActions: AnswerContextAction[] = []
            if (fallback.citations[0]) {
                fallbackActions.push({
                    id: 'demo-open-citation',
                    label: '定位原文',
                    kind: 'reader',
                    citation: fallback.citations[0],
                })
            }
            fallbackActions.push({
                id: 'demo-follow-chat',
                label: '继续追问',
                kind: 'chat',
                prompt: `请继续围绕“${userMessage.content}”做更白话的讲解。`,
            })
            const demoReasoning: ReasoningStep[] = [
                { step: 'retrieval', label: '检索体验样例', status: 'complete', duration: 0.02, model: '离线演示', fallback: true },
                { step: 'entity_extraction', label: '抽取关联实体', status: 'complete', duration: 0.01, model: '离线演示', fallback: true },
                { step: 'knowledge_linking', label: '知识关联推理', status: 'complete', duration: 0.01, model: '离线演示', fallback: true },
                { step: 'generation', label: '生成通俗解读', status: 'complete', duration: 0.02, model: '离线演示', fallback: true },
            ]

            updateLastMessageReasoning(demoReasoning)
            updateLastMessageCitations(fallback.citations)
            updateLastMessageAnswerContext({
                trustLabel: '离线演示',
                trustPoints: ['当前回答来自离线体验样例，建议上线环境核对真实引文。'],
                citationCount: fallback.citations.length,
                relatedEntityCount: 0,
                primaryCitation: fallback.citations[0],
                suggestedActions: fallbackActions,
            })
            updateLastMessage(fallback.content)
            setLoading(false)
            setProgress('')
        }

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
                        } else if (currentEventType === 'citations') {
                            const citationData = Array.isArray(event) ? event : event.citations
                            if (citationData) {
                                updateLastMessageCitations(citationData)
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
            applyDemoFallback()
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

            {messages.length === 0 && (
                <div className="px-4 pb-4">
                    <div
                        className="mx-auto max-w-4xl glass-card rounded-[28px] px-5 py-5 relative overflow-hidden"
                    >
                        <div className="ink-wash-blob w-36 h-36 -top-8 -right-8 bg-[var(--gf-gold)] opacity-[0.06]"></div>
                        <div className="flex flex-wrap items-start justify-between gap-3">
                            <div className="max-w-2xl">
                                <div className="mb-2 text-[11px] tracking-[0.26em]" style={{ color: 'var(--gf-gold)' }}>
                                    问道解疑
                                </div>
                                <h2 className="text-lg font-medium" style={{ color: 'var(--gf-text)' }}>
                                    问道解疑
                                </h2>
                                <p className="mt-2 text-sm leading-7" style={{ color: 'rgba(26,30,35,0.48)' }}>
                                    义理辨析与典故参照。
                                </p>
                            </div>
                            <button
                                onClick={() => setActiveTab('search')}
                                className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs transition-all duration-300 hover:-translate-y-0.5"
                                style={{ backgroundColor: 'rgba(26,30,35,0.05)', color: 'rgba(26,30,35,0.66)' }}
                            >
                                <Search className="h-3.5 w-3.5" />
                                转至寻章摘句
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
            <MessageList messages={messages} onCitationClick={handleCitationClick} onAnswerAction={handleAnswerAction} />

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
