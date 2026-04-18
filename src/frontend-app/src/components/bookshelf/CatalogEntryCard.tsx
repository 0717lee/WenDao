import { ArrowRight, Loader2 } from 'lucide-react'

export interface CatalogEntryCardProps {
  title: string
  metaLine: string
  imported: boolean
  importing: boolean
  onOpen: () => void
}

export function CatalogEntryCard({ title, metaLine, imported, importing, onOpen }: CatalogEntryCardProps) {
  const statusLabel = importing ? '正在加入' : imported ? '已加入' : '可加入阅读'
  const actionLabel = imported ? '打开此篇' : '加入阅读并打开'

  return (
    <button
      onClick={onOpen}
      aria-label={`${actionLabel}：${title}`}
      className="rounded-[22px] px-4 py-4 text-left transition-all duration-300 hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--gf-gugong-red)]/40"
      style={{ backgroundColor: 'rgba(255,255,255,0.76)', border: '1px solid rgba(26,30,35,0.07)' }}
    >
      <div className="mb-2 flex items-center justify-between gap-3">
        <span className="text-sm font-medium" style={{ color: 'var(--gf-text)' }}>
          {title}
        </span>
        <span
          className="rounded-full px-2 py-0.5 text-[11px]"
          style={{
            backgroundColor: imported ? 'rgba(201,160,99,0.14)' : 'rgba(26,30,35,0.06)',
            color: imported ? 'var(--gf-gold)' : 'rgba(26,30,35,0.55)',
          }}
        >
          {statusLabel}
        </span>
      </div>
      <div className="text-xs leading-6" style={{ color: 'rgba(26,30,35,0.45)' }}>
        {metaLine}
      </div>
      <div className="mt-3 flex items-center gap-2 text-xs" style={{ color: 'rgba(26,30,35,0.5)' }}>
        {importing ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />}
        <span>{actionLabel}</span>
      </div>
    </button>
  )
}
