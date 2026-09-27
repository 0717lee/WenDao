import { useEffect, useRef } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import type { AnswerContextAction, Message } from '../store/useStore'
import { AnswerContextCard } from './AnswerContextCard'
import { PoemScrollCard } from './PoemScrollCard'

interface MessageListProps {
    messages: Message[]
    loadingLabel?: string
    onAnswerContextAction?: (action: AnswerContextAction) => void
    isLoading?: boolean
}

export function MessageList({ messages, loadingLabel, onAnswerContextAction, isLoading = false }: MessageListProps) {
    const reduceMotion = useReducedMotion()
    const endRef = useRef<HTMLDivElement>(null)
    const hasPendingResponse = messages.some(
        (message) => message.role === 'assistant' && !message.content && !message.poemResult?.text
    )

    useEffect(() => {
        endRef.current?.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth' })
    }, [messages])

    return (
        <div
            className="flex-1 min-w-0 overflow-y-auto p-4 space-y-4"
            role="log"
            aria-label="对话消息"
            aria-live="polite"
            aria-busy={hasPendingResponse}
        >
            {messages.length === 0 && (
                <div className="flex flex-col items-center justify-center h-full gap-3 opacity-40" role="status">
                    <svg className="w-12 h-12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1} aria-hidden="true">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                    </svg>
                    <p className="text-sm" style={{ color: 'var(--gf-text)' }}>可从一句原文、一个人物或一则典故问起。</p>
                </div>
            )}
            {messages.map((message) => (
                <motion.div
                    key={message.id}
                    initial={{ opacity: 0, y: 15 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.3 }}
                    className={`flex min-w-0 ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
                    role="article"
                    aria-label={message.role === 'user' ? '你的消息' : 'AI 回答'}
                >
                    <div
                        className="min-w-0 max-w-[75%] rounded-xl px-4 py-2.5 shadow-sm"
                        style={
                            message.role === 'user'
                                ? { backgroundColor: 'var(--gf-gugong-red)', color: '#fff' }
                                : { backgroundColor: 'rgba(255,255,255,0.8)', color: 'var(--gf-text)', border: '1px solid rgba(26,30,35,0.06)' }
                        }
                    >
                        {/* Poem scroll card (replaces plain text for poetry messages) */}
                        {message.role === 'assistant' && message.poemResult && message.poemResult.text ? (
                            <PoemScrollCard result={message.poemResult} />
                        ) : message.role === 'assistant' && !message.content ? (
                            <div className="w-full min-w-0 space-y-3">
                                <div
                                    className="flex items-center gap-2 text-sm"
                                    role="status"
                                    aria-live="polite"
                                    aria-atomic="true"
                                    style={{ color: 'rgba(26,30,35,0.54)' }}
                                >
                                    <span
                                        className="inline-flex h-2.5 w-2.5 rounded-full animate-pulse"
                                        style={{ backgroundColor: 'var(--gf-gugong-red)' }}
                                    />
                                    {loadingLabel || '正在整理回答...'}
                                </div>
                                <div className="space-y-2">
                                    <div className="h-3 rounded-full skeleton-shimmer" />
                                    <div className="h-3 w-5/6 rounded-full skeleton-shimmer" />
                                    <div className="h-3 w-2/3 rounded-full skeleton-shimmer" />
                                </div>
                            </div>
                        ) : (
                            <div className="whitespace-pre-wrap break-words leading-relaxed">{message.content}</div>
                        )}

                        {message.poemResult?.text && message.answerContext?.trustLabel === '未完成' && (
                            <p role="alert" className="mt-3 text-sm text-[var(--gf-gugong-red)]">{message.content}</p>
                        )}

                        {message.role === 'assistant' && message.answerContext && (
                            <AnswerContextCard
                                context={message.answerContext}
                                onAction={onAnswerContextAction}
                                chatPending={isLoading}
                            />
                        )}

                    </div>
                </motion.div>
            ))}
            <div ref={endRef} />
        </div>
    )
}
