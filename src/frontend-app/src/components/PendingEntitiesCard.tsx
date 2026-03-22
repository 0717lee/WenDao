import { useState } from 'react'

export interface PendingEntity {
    label: string
    group: string
    desc: string
    confidence: number
    similar_to?: { id: string; label: string; similarity: number }
}

interface PendingEntitiesCardProps {
    entities: PendingEntity[]
    onApprove: (entity: PendingEntity) => void
    onReject: (entity: PendingEntity) => void
    onApproveAll: () => void
}

const GROUP_COLORS: Record<string, { bg: string; border: string }> = {
    '人物': { bg: '#fce4c8', border: '#c97b2e' },
    '典籍': { bg: '#d1e5f0', border: '#5b8aab' },
    '历史事件': { bg: '#fadbd8', border: '#b03a3a' },
    '思想流派': { bg: '#d4edda', border: '#3c8a51' },
    '建筑': { bg: '#f0e6d2', border: '#a67c52' },
    '朝代': { bg: '#e8d5e8', border: '#8e5a8e' },
}

const DEFAULT_GROUP_COLOR = { bg: '#eeeeee', border: '#999999' }

export function PendingEntitiesCard({ entities, onApprove, onReject, onApproveAll }: PendingEntitiesCardProps) {
    const [expanded, setExpanded] = useState(false)
    const [processed, setProcessed] = useState<Set<string>>(new Set())

    if (entities.length === 0) return null

    const remaining = entities.filter(e => !processed.has(e.label))
    if (remaining.length === 0) return null

    const handleApprove = (entity: PendingEntity) => {
        onApprove(entity)
        setProcessed(prev => new Set([...prev, entity.label]))
    }

    const handleReject = (entity: PendingEntity) => {
        onReject(entity)
        setProcessed(prev => new Set([...prev, entity.label]))
    }

    const handleApproveAll = () => {
        remaining.forEach(e => setProcessed(prev => new Set([...prev, e.label])))
        onApproveAll()
    }

    return (
        <div
            className="mt-2 rounded-lg overflow-hidden"
            style={{
                border: '1px solid var(--gf-gold, #b8860b)',
                backgroundColor: 'var(--gf-bg-paper, #faf8f5)',
            }}
        >
            {/* Header - collapsed */}
            <button
                onClick={() => setExpanded(!expanded)}
                className="w-full flex items-center justify-between px-3 py-2 text-xs transition-colors hover:bg-white/50"
                style={{ color: 'var(--gf-text, #1a1e23)' }}
            >
                <span className="flex items-center gap-1.5">
                    <svg className="w-3.5 h-3.5" style={{ color: 'var(--gf-gold, #b8860b)' }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                    </svg>
                    <span style={{ fontFamily: '"Noto Serif SC", serif' }}>
                        发现 <strong>{remaining.length}</strong> 个新实体
                    </span>
                </span>
                <svg
                    className={`w-3.5 h-3.5 transition-transform ${expanded ? 'rotate-180' : ''}`}
                    fill="none" viewBox="0 0 24 24" stroke="currentColor"
                    style={{ opacity: 0.4 }}
                >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
            </button>

            {/* Expanded content */}
            {expanded && (
                <div className="px-3 pb-3 space-y-2">
                    {/* Bulk approve */}
                    {remaining.length > 1 && (
                        <button
                            onClick={handleApproveAll}
                            className="w-full py-1.5 text-[11px] rounded-md transition-colors"
                            style={{
                                backgroundColor: 'rgba(140,26,17,0.08)',
                                color: 'var(--gf-gugong-red, #8c1a11)',
                                border: '1px solid rgba(140,26,17,0.15)',
                            }}
                        >
                            全部批准
                        </button>
                    )}

                    {/* Entity list */}
                    {remaining.map((entity) => {
                        const gc = GROUP_COLORS[entity.group] || DEFAULT_GROUP_COLOR
                        const isLowConfidence = entity.confidence < 0.7
                        const hasDuplicate = !!entity.similar_to

                        return (
                            <div
                                key={entity.label}
                                className="flex items-start gap-2 p-2 rounded-md"
                                style={{ backgroundColor: 'rgba(255,255,255,0.6)', border: '1px solid rgba(26,30,35,0.06)' }}
                            >
                                {/* Entity info */}
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-1.5 flex-wrap">
                                        {/* Group badge */}
                                        <span
                                            className="inline-block px-1.5 py-0.5 text-[10px] rounded-full"
                                            style={{ backgroundColor: gc.bg, color: gc.border, border: `1px solid ${gc.border}30` }}
                                        >
                                            {entity.group}
                                        </span>
                                        {/* Label */}
                                        <span className="text-xs font-medium" style={{ color: 'var(--gf-text, #1a1e23)' }}>
                                            {entity.label}
                                        </span>
                                        {/* Low confidence warning */}
                                        {isLowConfidence && (
                                            <span
                                                className="flex items-center gap-0.5 text-[10px]"
                                                style={{ color: 'var(--gf-gold, #b8860b)' }}
                                                title="低置信度"
                                            >
                                                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
                                                </svg>
                                                低置信度
                                            </span>
                                        )}
                                    </div>
                                    {/* Description */}
                                    {entity.desc && (
                                        <p className="text-[11px] mt-0.5 leading-relaxed" style={{ color: 'rgba(26,30,35,0.5)' }}>
                                            {entity.desc}
                                        </p>
                                    )}
                                    {/* Duplicate warning */}
                                    {hasDuplicate && (
                                        <p
                                            className="text-[10px] mt-1 flex items-center gap-1"
                                            style={{ color: 'var(--gf-gold, #b8860b)' }}
                                        >
                                            <svg className="w-3 h-3 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                            </svg>
                                            疑似重复: "{entity.similar_to!.label}" (相似度 {Math.round(entity.similar_to!.similarity * 100)}%)
                                        </p>
                                    )}
                                </div>

                                {/* Action buttons */}
                                <div className="flex items-center gap-1 shrink-0 pt-0.5">
                                    <button
                                        onClick={() => handleApprove(entity)}
                                        className="px-2 py-1 text-[10px] rounded-md transition-colors text-white"
                                        style={{ backgroundColor: 'var(--gf-gugong-red, #8c1a11)' }}
                                        title="批准"
                                    >
                                        批准
                                    </button>
                                    <button
                                        onClick={() => handleReject(entity)}
                                        className="px-2 py-1 text-[10px] rounded-md transition-colors"
                                        style={{
                                            color: 'var(--gf-text, #1a1e23)',
                                            opacity: 0.5,
                                            border: '1px solid rgba(26,30,35,0.15)',
                                        }}
                                        title="拒绝"
                                    >
                                        拒绝
                                    </button>
                                </div>
                            </div>
                        )
                    })}
                </div>
            )}
        </div>
    )
}
