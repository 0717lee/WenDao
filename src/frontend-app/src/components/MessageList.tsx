import { useEffect, useRef } from 'react'
import { Message } from '../store/useStore'
import { CitationCard } from './CitationCard'
import { ReasoningTimeline } from './ReasoningTimeline'
import { VisionResultCard } from './VisionResultCard'
import { PoemScrollCard } from './PoemScrollCard'

interface MessageListProps {
    messages: Message[]
    onCitationClick?: (citation: { title: string; source: string }) => void
}

export function MessageList({ messages, onCitationClick }: MessageListProps) {
    const endRef = useRef<HTMLDivElement>(null)

    useEffect(() => {
        endRef.current?.scrollIntoView({ behavior: 'smooth' })
    }, [messages])

    return (
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {messages.length === 0 && (
                <div className="flex flex-col items-center justify-center h-full gap-3 opacity-40">
                    <svg className="w-12 h-12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                    </svg>
                    <p className="text-sm" style={{ color: 'var(--gf-text)' }}>输入古籍原句、人物或典故，开始阅读与追问...</p>
                </div>
            )}
            {messages.map((message) => (
                <div
                    key={message.id}
                    className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                    <div
                        className="max-w-[75%] rounded-xl px-4 py-2.5 shadow-sm"
                        style={
                            message.role === 'user'
                                ? { backgroundColor: 'var(--gf-gugong-red)', color: '#fff' }
                                : { backgroundColor: 'rgba(255,255,255,0.8)', color: 'var(--gf-text)', border: '1px solid rgba(26,30,35,0.06)' }
                        }
                    >
                        {/* User message: show image thumbnail if vision result */}
                        {message.role === 'user' && message.visionResult?.imagePreview && (
                            <img
                                src={message.visionResult.imagePreview}
                                alt="Uploaded"
                                className="w-full max-h-32 rounded-lg object-cover mb-2"
                                style={{ border: '1px solid rgba(255,255,255,0.2)' }}
                            />
                        )}

                        {/* Poem scroll card (replaces plain text for poetry messages) */}
                        {message.role === 'assistant' && message.poemResult ? (
                            <PoemScrollCard result={message.poemResult} />
                        ) : (
                            <div className="whitespace-pre-wrap leading-relaxed">{message.content}</div>
                        )}

                        {/* Assistant message: reasoning timeline */}
                        {message.role === 'assistant' && message.reasoningSteps && (
                            <ReasoningTimeline steps={message.reasoningSteps} />
                        )}

                        {/* Citations */}
                        {message.citations && message.citations.length > 0 && (
                            <div className="mt-2 space-y-1">
                                {message.citations.map((citation, idx) => (
                                    <CitationCard
                                        key={idx}
                                        title={citation.title}
                                        source={citation.source}
                                        onClick={() => onCitationClick?.(citation)}
                                    />
                                ))}
                            </div>
                        )}

                        {/* Vision result card */}
                        {message.role === 'assistant' && message.visionResult && (
                            <VisionResultCard result={message.visionResult} />
                        )}
                    </div>
                </div>
            ))}
            <div ref={endRef} />
        </div>
    )
}
