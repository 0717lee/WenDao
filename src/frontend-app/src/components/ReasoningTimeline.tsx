import { useState } from 'react'
import { ChevronDown, ChevronUp } from 'lucide-react'

export interface ReasoningStep {
    step: string
    label: string
    status: 'pending' | 'running' | 'complete'
    duration?: number
    model?: string
    fallback?: boolean
}

interface ReasoningTimelineProps {
    steps: ReasoningStep[]
    defaultCollapsed?: boolean
}

const STATUS_STYLES = {
    pending: {
        dot: 'bg-[rgba(26,30,35,0.2)]',
        text: 'opacity-40',
        icon: null,
    },
    running: {
        dot: 'bg-[var(--gf-gugong-red)] animate-pulse',
        text: 'opacity-100',
        icon: null,
    },
    complete: {
        dot: 'bg-[#2d8a56]',
        text: 'opacity-80',
        icon: (
            <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
        ),
    },
} as const

export function ReasoningTimeline({ steps, defaultCollapsed = true }: ReasoningTimelineProps) {
    const [collapsed, setCollapsed] = useState(defaultCollapsed)

    // Don't render if no steps at all
    if (!steps || steps.length === 0) return null

    const hasAnyActivity = steps.some((s) => s.status !== 'pending')
    if (!hasAnyActivity) return null

    const totalDuration = steps
        .filter((s) => s.duration != null)
        .reduce((sum, s) => sum + (s.duration ?? 0), 0)

    return (
        <div className="mt-2">
            {/* Toggle button */}
            <button
                onClick={() => setCollapsed((v) => !v)}
                className="flex items-center gap-1.5 text-xs transition-colors hover:opacity-80"
                style={{ color: 'var(--gf-gold)' }}
            >
                {collapsed ? (
                    <ChevronDown className="w-3.5 h-3.5" />
                ) : (
                    <ChevronUp className="w-3.5 h-3.5" />
                )}
                <span>
                    {collapsed ? '查看推理过程' : '收起推理过程'}
                    {totalDuration > 0 && (
                        <span className="ml-1.5 opacity-60">({totalDuration.toFixed(2)}s)</span>
                    )}
                </span>
            </button>

            {/* Timeline panel */}
            <div
                className="overflow-hidden transition-all duration-300 ease-in-out"
                style={{
                    maxHeight: collapsed ? 0 : '300px',
                    opacity: collapsed ? 0 : 1,
                }}
            >
                <div
                    className="mt-2 rounded-lg px-3 py-2.5 space-y-0"
                    style={{
                        backgroundColor: 'rgba(255,255,255,0.5)',
                        border: '1px solid rgba(26,30,35,0.06)',
                    }}
                >
                    {steps.map((s, idx) => {
                        const style = STATUS_STYLES[s.status]
                        const isLast = idx === steps.length - 1

                        return (
                            <div key={s.step} className="flex items-stretch gap-3">
                                {/* Vertical line + dot */}
                                <div className="flex flex-col items-center w-4 shrink-0">
                                    <div
                                        className={`w-4 h-4 rounded-full flex items-center justify-center shrink-0 ${style.dot}`}
                                    >
                                        {style.icon}
                                    </div>
                                    {!isLast && (
                                        <div
                                            className="flex-1 w-px"
                                            style={{ backgroundColor: 'rgba(26,30,35,0.1)' }}
                                        />
                                    )}
                                </div>

                                {/* Content */}
                                <div className={`pb-2.5 ${style.text}`}>
                                    <div className="flex items-center gap-1.5">
                                        <span className="text-xs leading-4" style={{ color: 'var(--gf-text)' }}>
                                            {s.label}
                                        </span>
                                        {s.model && (
                                            <span
                                                className="text-xs px-1.5 py-0.5 rounded-full"
                                                style={{
                                                    backgroundColor: s.fallback ? 'rgba(234,179,8,0.15)' : 'rgba(26,30,35,0.08)',
                                                    color: s.fallback ? '#b45309' : 'rgba(26,30,35,0.6)',
                                                }}
                                            >
                                                {s.fallback ? `已降级 → ${s.model}` : s.model}
                                            </span>
                                        )}
                                    </div>
                                    {s.status === 'complete' && s.duration != null && (
                                        <span className="ml-2 text-[10px] opacity-50">
                                            {s.duration.toFixed(2)}s
                                        </span>
                                    )}
                                    {s.status === 'running' && (
                                        <span className="ml-2 text-[10px] opacity-50 animate-pulse">...</span>
                                    )}
                                </div>
                            </div>
                        )
                    })}
                </div>
            </div>
        </div>
    )
}
