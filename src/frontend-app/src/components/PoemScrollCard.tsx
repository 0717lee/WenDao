import { useState } from 'react'
import { Play, Square } from 'lucide-react'
import type { PoemResult } from '../store/useStore'

interface PoemScrollCardProps {
    result: PoemResult
}

export function PoemScrollCard({ result }: PoemScrollCardProps) {
    const [isPlaying, setIsPlaying] = useState(false)
    const [audioEl, setAudioEl] = useState<HTMLAudioElement | null>(null)

    const handlePlayAudio = () => {
        if (!result.audioBase64) return

        if (isPlaying && audioEl) {
            audioEl.pause()
            audioEl.currentTime = 0
            setIsPlaying(false)
            return
        }

        const audio = new Audio(`data:audio/mp3;base64,${result.audioBase64}`)
        audio.onended = () => setIsPlaying(false)
        audio.onerror = () => setIsPlaying(false)
        audio.play()
        setAudioEl(audio)
        setIsPlaying(true)
    }

    const isLoading = !result.text

    return (
        <div
            className="rounded-xl overflow-hidden mt-2"
            style={{
                background: 'linear-gradient(to bottom, var(--gf-bg-paper, #faf8f5), #f0ead6)',
                border: '2px solid var(--gf-gold, #c4a35a)',
                maxWidth: '320px',
            }}
        >
            {/* CogView illustration */}
            {result.imageUrl && (
                <div className="relative" style={{ aspectRatio: '16/9' }}>
                    <img
                        src={result.imageUrl}
                        alt={`Poem illustration: ${result.topic}`}
                        className="w-full h-full object-cover"
                        loading="lazy"
                    />
                </div>
            )}
            {!result.imageUrl && result.text && (
                <div
                    className="flex items-center justify-center"
                    style={{
                        aspectRatio: '16/9',
                        background: 'linear-gradient(135deg, #e8dcc8 0%, #d4c4a8 100%)',
                    }}
                >
                    <span
                        className="text-3xl opacity-30"
                        style={{ fontFamily: "'Noto Serif SC', serif" }}
                    >
                        {result.topic.charAt(0) || ''}
                    </span>
                </div>
            )}

            {/* Poem text in vertical writing mode */}
            <div className="px-4 py-5 flex justify-center">
                {isLoading ? (
                    <div className="text-sm opacity-50" style={{ color: 'var(--gf-text, #1a1e23)' }}>
                        ...
                    </div>
                ) : (
                    <div
                        style={{
                            writingMode: 'vertical-rl',
                            fontFamily: "'Noto Serif SC', 'SimSun', serif",
                            color: 'var(--gf-text, #1a1e23)',
                            fontSize: '1.1rem',
                            lineHeight: '2.2',
                            letterSpacing: '0.15em',
                            minHeight: '200px',
                            maxHeight: '360px',
                            overflow: 'auto',
                        }}
                    >
                        {result.text}
                    </div>
                )}
            </div>

            {/* Audio play button */}
            {result.audioBase64 && (
                <div className="px-4 pb-3 flex justify-center">
                    <button
                        onClick={handlePlayAudio}
                        className="flex items-center gap-1.5 px-4 py-1.5 rounded-full text-sm transition-all"
                        style={{
                            backgroundColor: isPlaying
                                ? 'rgba(201,160,99,0.25)'
                                : 'rgba(201,160,99,0.12)',
                            color: 'var(--gf-gold, #c4a35a)',
                            border: '1px solid rgba(201,160,99,0.35)',
                        }}
                    >
                        {isPlaying ? (
                            <Square className="w-3.5 h-3.5" />
                        ) : (
                            <Play className="w-3.5 h-3.5" />
                        )}
                        <span>{isPlaying ? '停止' : '朗读'}</span>
                    </button>
                </div>
            )}

            {/* Topic label */}
            <div
                className="px-3 pb-2 text-right text-xs opacity-40"
                style={{
                    color: 'var(--gf-text, #1a1e23)',
                    fontFamily: "'Noto Serif SC', serif",
                }}
            >
                {result.topic}
            </div>
        </div>
    )
}
