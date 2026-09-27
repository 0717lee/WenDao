import { Send, Mic, Loader2, Square } from 'lucide-react'
import React, { KeyboardEvent, useRef } from 'react'

interface MessageInputProps {
    value: string
    onChange: (value: string) => void
    onSend: () => void
    disabled: boolean
    onCancel?: () => void
    onVoiceToggle?: () => void
    isRecording?: boolean
    isTranscribing?: boolean
}

export function MessageInput({
    value,
    onChange,
    onSend,
    disabled,
    onCancel,
    onVoiceToggle,
    isRecording = false,
    isTranscribing = false,
}: MessageInputProps) {
    const isComposingRef = useRef(false)

    const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
        const nativeEvent = e.nativeEvent as KeyboardEvent<HTMLTextAreaElement>['nativeEvent'] & {
            isComposing?: boolean
            keyCode?: number
        }

        if (nativeEvent.isComposing || nativeEvent.keyCode === 229 || isComposingRef.current) {
            return
        }

        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault()
            if (value.trim() && !disabled) {
                onSend()
            }
        }
    }

    return (
        <div
            className="border-t px-4 py-3"
            role="group"
            aria-label="消息输入区域"
            style={{ borderColor: 'rgba(26,30,35,0.06)', backgroundColor: 'rgba(255,255,255,0.5)' }}
        >
            <div id="message-input-hint" className="mb-2 text-xs" style={{ color: 'rgba(26,30,35,0.42)' }}>
                贴一句原文，或直接提问。Enter 发送，Shift + Enter 换行。
            </div>
            <div className="flex items-end gap-2">
                <textarea
                    aria-label="消息输入"
                    aria-describedby="message-input-hint"
                    value={value}
                    onChange={(e) => onChange(e.target.value)}
                    onKeyDown={handleKeyDown}
                    onCompositionStart={() => {
                        isComposingRef.current = true
                    }}
                    onCompositionEnd={() => {
                        isComposingRef.current = false
                    }}
                    placeholder="贴一句原文，或提问人物、典故、概念"
                    disabled={disabled}
                    className="gf-input flex-1 resize-none rounded-xl px-4 py-2.5 disabled:opacity-50"
                    style={{
                        color: 'var(--gf-text)',
                        backgroundColor: 'rgba(255,255,255,0.7)',
                    } as React.CSSProperties}
                    rows={1}
                />
                <button
                    type="button"
                    onClick={() => {
                        if (disabled && onCancel) {
                            onCancel()
                        } else {
                            onSend()
                        }
                    }}
                    disabled={disabled ? !onCancel : !value.trim()}
                    aria-label={disabled && onCancel ? '取消生成' : '发送'}
                    className="flex items-center justify-center w-10 h-10 rounded-xl text-white transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                    style={{
                        backgroundColor:
                            (disabled && !onCancel) || (!disabled && !value.trim())
                                ? 'rgba(26,30,35,0.15)'
                                : 'var(--gf-gugong-red)',
                    }}
                >
                    {disabled && onCancel ? <Square className="w-4 h-4" /> : <Send className="w-5 h-5" />}
                </button>
                {/* Mic voice recording button */}
                {onVoiceToggle && (
                    <button
                        type="button"
                        onClick={onVoiceToggle}
                        disabled={disabled || isTranscribing}
                        aria-label={isRecording ? '结束录音' : isTranscribing ? '正在识别语音' : '语音输入'}
                        aria-pressed={isRecording}
                        aria-busy={isTranscribing}
                        className={`flex items-center justify-center w-10 h-10 rounded-xl transition-all disabled:opacity-30 disabled:cursor-not-allowed ${
                            isRecording
                                ? 'bg-red-500 text-white animate-pulse shadow-[0_0_12px_rgba(239,68,68,0.5)]'
                                : 'hover:bg-black/5'
                        }`}
                        style={!isRecording && !isTranscribing ? { color: 'rgba(26,30,35,0.45)' } : undefined}
                        title={isRecording ? '结束录音' : isTranscribing ? '正在识别语音' : '语音输入'}
                    >
                        {isTranscribing ? (
                            <Loader2 className="w-5 h-5 animate-spin" />
                        ) : (
                            <Mic className="w-5 h-5" />
                        )}
                    </button>
                )}
            </div>
            <span className="sr-only" role="status" aria-live="polite" aria-atomic="true">
                {isTranscribing ? '正在识别语音' : isRecording ? '正在录音' : ''}
            </span>
        </div>
    )
}
