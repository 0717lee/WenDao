import type { VisionResult } from '../store/useStore'

interface VisionResultCardProps {
    result: VisionResult
    onViewGraph?: (nodeIds: string[]) => void
}

const FIELD_LABELS = [
    { key: 'buildingType', label: '建筑类型' },
    { key: 'roofStyle', label: '屋顶形制' },
    { key: 'era', label: '年代风格' },
] as const

export function VisionResultCard({ result, onViewGraph }: VisionResultCardProps) {
    const nodeIds = result.matchedGraphNodes.map((n) => n.id)

    return (
        <div
            className="mt-2 rounded-xl overflow-hidden"
            style={{
                backgroundColor: 'rgba(255,255,255,0.6)',
                border: '1px solid rgba(26,30,35,0.08)',
                backdropFilter: 'blur(8px)',
            }}
        >
            {/* Header */}
            <div
                className="px-3 py-2 text-xs font-medium"
                style={{
                    backgroundColor: 'rgba(140,26,17,0.06)',
                    color: 'var(--gf-gugong-red, #8c1a11)',
                    fontFamily: '"Noto Serif SC", serif',
                    borderBottom: '1px solid rgba(26,30,35,0.06)',
                }}
            >
                古建筑识别结果
            </div>

            {/* Image thumbnail */}
            {result.imagePreview && (
                <div className="px-3 pt-3">
                    <img
                        src={result.imagePreview}
                        alt="Analyzed architecture"
                        className="w-full max-h-40 rounded-lg object-cover"
                        style={{ border: '1px solid rgba(26,30,35,0.06)' }}
                    />
                </div>
            )}

            {/* Structured fields */}
            <div className="px-3 py-2 space-y-1.5">
                {FIELD_LABELS.map(({ key, label }) => {
                    const value = result[key]
                    if (!value) return null
                    return (
                        <div key={key} className="flex items-start gap-2 text-xs">
                            <span
                                className="shrink-0 px-1.5 py-0.5 rounded text-[10px]"
                                style={{
                                    backgroundColor: 'rgba(201,160,99,0.12)',
                                    color: 'var(--gf-gold, #b8860b)',
                                    border: '1px solid rgba(201,160,99,0.2)',
                                }}
                            >
                                {label}
                            </span>
                            <span style={{ color: 'var(--gf-text, #1a1e23)' }}>{value}</span>
                        </div>
                    )
                })}

                {/* Components row */}
                {result.components.length > 0 && (
                    <div className="flex items-start gap-2 text-xs">
                        <span
                            className="shrink-0 px-1.5 py-0.5 rounded text-[10px]"
                            style={{
                                backgroundColor: 'rgba(201,160,99,0.12)',
                                color: 'var(--gf-gold, #b8860b)',
                                border: '1px solid rgba(201,160,99,0.2)',
                            }}
                        >
                            主要构件
                        </span>
                        <span style={{ color: 'var(--gf-text, #1a1e23)' }}>
                            {result.components.join('、')}
                        </span>
                    </div>
                )}
            </div>

            {/* Graph linking section */}
            <div className="px-3 pb-3">
                {nodeIds.length > 0 ? (
                    <button
                        onClick={() => onViewGraph?.(nodeIds)}
                        className="w-full flex items-center justify-center gap-1.5 py-2 text-xs rounded-lg transition-colors hover:opacity-90"
                        style={{
                            backgroundColor: 'var(--gf-gugong-red, #8c1a11)',
                            color: '#fff',
                        }}
                    >
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"
                            />
                        </svg>
                        查看相关图谱 ({nodeIds.length} 个关联节点)
                    </button>
                ) : (
                    <div className="text-center space-y-1">
                        <p className="text-[11px]" style={{ color: 'rgba(26,30,35,0.4)' }}>
                            暂无相关图谱节点
                        </p>
                        <p className="text-[10px]" style={{ color: 'var(--gf-gold, #b8860b)' }}>
                            在古籍中搜索相关记载
                        </p>
                    </div>
                )}
            </div>
        </div>
    )
}
