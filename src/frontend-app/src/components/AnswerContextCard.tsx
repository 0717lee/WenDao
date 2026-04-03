import { BookText, Compass, Sparkles } from 'lucide-react'
import type { AnswerContext, AnswerContextAction } from '../store/useStore'

interface AnswerContextCardProps {
  context: AnswerContext
  onAction?: (action: AnswerContextAction) => void
}

export function AnswerContextCard({ context, onAction }: AnswerContextCardProps) {
  return (
    <div
      className="mt-3 rounded-[18px] px-3 py-3"
      style={{ backgroundColor: 'rgba(248,244,233,0.78)', border: '1px solid rgba(201,160,99,0.18)' }}
    >
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div className="inline-flex items-center gap-1.5 text-xs" style={{ color: 'rgba(26,30,35,0.58)' }}>
          <BookText className="h-3.5 w-3.5" />
          回答依据
        </div>
        <span
          className="rounded-full px-2.5 py-1 text-[11px]"
          style={{ backgroundColor: 'rgba(140,26,17,0.08)', color: 'var(--gf-gugong-red)' }}
        >
          {context.trustLabel}
        </span>
      </div>

      <div className="flex flex-wrap gap-2 text-[11px]">
        <span className="rounded-full px-2.5 py-1" style={{ backgroundColor: 'rgba(255,255,255,0.8)', color: 'rgba(26,30,35,0.6)' }}>
          引文 {context.citationCount}
        </span>
        <span className="rounded-full px-2.5 py-1" style={{ backgroundColor: 'rgba(255,255,255,0.8)', color: 'rgba(26,30,35,0.6)' }}>
          实体 {context.relatedEntityCount}
        </span>
      </div>

      {context.trustPoints.length > 0 && (
        <div className="mt-3 space-y-1.5 text-xs leading-6" style={{ color: 'rgba(26,30,35,0.58)' }}>
          {context.trustPoints.map((point) => (
            <div key={point}>· {point}</div>
          ))}
        </div>
      )}

      {context.primaryCitation && (
        <div
          className="mt-3 rounded-[16px] px-3 py-3 text-xs"
          style={{ backgroundColor: 'rgba(255,255,255,0.76)', border: '1px solid rgba(26,30,35,0.05)' }}
        >
          <div className="mb-1 inline-flex items-center gap-1.5" style={{ color: 'rgba(26,30,35,0.46)' }}>
            <Compass className="h-3.5 w-3.5" />
            优先核对
          </div>
          <div className="font-medium" style={{ color: 'var(--gf-text)' }}>
            {context.primaryCitation.title}
          </div>
          <div className="mt-1" style={{ color: 'rgba(26,30,35,0.52)' }}>
            {context.primaryCitation.source}
          </div>
          {context.primaryCitation.excerpt && (
            <div className="mt-2 line-clamp-3 leading-6" style={{ color: 'rgba(26,30,35,0.6)' }}>
              {context.primaryCitation.excerpt}
            </div>
          )}
        </div>
      )}

      {context.suggestedActions.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {context.suggestedActions.map((action) => (
            <button
              key={action.id}
              onClick={() => onAction?.(action)}
              className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs transition-all duration-300 hover:-translate-y-0.5"
              style={{
                backgroundColor: action.kind === 'chat' ? 'rgba(140,26,17,0.08)' : 'rgba(255,255,255,0.8)',
                color: action.kind === 'chat' ? 'var(--gf-gugong-red)' : 'rgba(26,30,35,0.62)',
                border: action.kind === 'chat' ? '1px solid rgba(140,26,17,0.10)' : '1px solid rgba(26,30,35,0.08)',
              }}
            >
              {action.kind === 'chat' && <Sparkles className="h-3.5 w-3.5" />}
              {action.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
