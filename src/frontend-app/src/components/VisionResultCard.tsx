import type { VisionResult } from '../store/useStore'

interface VisionResultCardProps {
    result: VisionResult
}

const FIELD_LABELS = [
    { key: 'buildingType', label: '建筑类型' },
    { key: 'roofStyle', label: '屋顶形制' },
    { key: 'era', label: '年代风格' },
] as const

export function VisionResultCard({ result }: VisionResultCardProps) {
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

            {/* Follow-up hint */}
            <div className="px-3 pb-3">
                <div className="text-center space-y-1">
                    <p className="text-[11px]" style={{ color: 'rgba(26,30,35,0.4)' }}>
                        {result.matchedGraphNodes.length > 0
                            ? `识别到 ${result.matchedGraphNodes.length} 个相关术语，可继续在搜索或对话中追问`
                            : '可继续在搜索或对话中追问相关建筑背景'}
                    </p>
                    <p className="text-[10px]" style={{ color: 'var(--gf-gold, #b8860b)' }}>
                        例如：这种屋顶常见于什么年代？
                    </p>
                </div>
            </div>
        </div>
    )
}
