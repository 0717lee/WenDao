import { Send, Paperclip, Mic, Loader2 } from 'lucide-react'
import React, { KeyboardEvent } from 'react'

interface MessageInputProps {
    value: string
    onChange: (value: string) => void
    onSend: () => void
    disabled: boolean
    onAttachImage?: () => void
    onVoiceToggle?: () => void
    isRecording?: boolean
    isTranscribing?: boolean
}

export function MessageInput({
    value,
    onChange,
    onSend,
    disabled,
    onAttachImage,
    onVoiceToggle,
    isRecording = false,
    isTranscribing = false,
}: MessageInputProps) {
    const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault()
            if (value.trim() && !disabled) {
                onSend()
            }
        }
    }

    return (
        <div className="flex items-end gap-2 p-4 border-t" style={{ borderColor: 'rgba(26,30,35,0.06)', backgroundColor: 'rgba(255,255,255,0.5)' }}>
            {/* Paperclip image attach button */}
            {onAttachImage && (
                <button
                    onClick={onAttachImage}
                    disabled={disabled}
                    className="flex items-center justify-center w-10 h-10 rounded-xl transition-colors disabled:opacity-30 hover:bg-black/5"
                    style={{ color: 'rgba(26,30,35,0.45)' }}
                    title="Upload architecture image"
                >
                    <Paperclip className="w-5 h-5" />
                </button>
            )}
            <textarea
                value={value}
                onChange={(e) => onChange(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="输入问题，探索古籍知识..."
                disabled={disabled}
                className="flex-1 resize-none rounded-xl px-4 py-2.5 focus:outline-none focus:ring-2 disabled:opacity-50 transition-shadow"
                style={{
                    border: '1px solid rgba(26,30,35,0.1)',
                    backgroundColor: 'rgba(255,255,255,0.7)',
                    color: 'var(--gf-text)',
                    /* @ts-ignore */
                    '--tw-ring-color': 'rgba(140,26,17,0.2)',
                } as React.CSSProperties}
                rows={1}
            />
            <button
                onClick={onSend}
                disabled={disabled || !value.trim()}
                aria-label="发送"
                className="flex items-center justify-center w-10 h-10 rounded-xl text-white transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                style={{ backgroundColor: disabled || !value.trim() ? 'rgba(26,30,35,0.15)' : 'var(--gf-gugong-red)' }}
            >
                <Send className="w-5 h-5" />
            </button>
            {/* Mic voice recording button */}
            {onVoiceToggle && (
                <button
                    onClick={onVoiceToggle}
                    disabled={disabled || isTranscribing}
                    className={`flex items-center justify-center w-10 h-10 rounded-xl transition-all disabled:opacity-30 disabled:cursor-not-allowed ${
                        isRecording
                            ? 'bg-red-500 text-white animate-pulse shadow-[0_0_12px_rgba(239,68,68,0.5)]'
                            : 'hover:bg-black/5'
                    }`}
                    style={!isRecording && !isTranscribing ? { color: 'rgba(26,30,35,0.45)' } : undefined}
                    title={isRecording ? '停止录音' : isTranscribing ? '识别中...' : '语音输入'}
                >
                    {isTranscribing ? (
                        <Loader2 className="w-5 h-5 animate-spin" />
                    ) : (
                        <Mic className="w-5 h-5" />
                    )}
                </button>
            )}
        </div>
    )
}
