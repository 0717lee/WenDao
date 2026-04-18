import type { ReactNode } from 'react'

export interface MyUploadsItemProps {
  title: string
  processed: boolean
  hasNote: boolean
  metaLine?: ReactNode
  preview: string
  progressLabel: string
  updatedAtLabel?: string
  compared: boolean
  onOpen: () => void
  onToggleCompare: () => void
}

export function MyUploadsItem({
  title,
  processed,
  hasNote,
  metaLine,
  preview,
  progressLabel,
  updatedAtLabel,
  compared,
  onOpen,
  onToggleCompare,
}: MyUploadsItemProps) {
  return (
    <div
      className="rounded-[22px] px-4 py-4"
      style={{ backgroundColor: 'rgba(255,255,255,0.76)', border: '1px solid rgba(26,30,35,0.07)' }}
    >
      <div className="flex items-start justify-between gap-4">
        <button className="min-w-0 flex-1 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--gf-gugong-red)]/40 rounded-lg" onClick={onOpen} aria-label={`打开《${title}》`}>
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium" style={{ color: 'var(--gf-text)' }}>
              {title}
            </span>
            <span
              className="rounded-full px-2 py-0.5 text-[11px]"
              style={{
                backgroundColor: processed ? 'rgba(201,160,99,0.14)' : 'rgba(26,30,35,0.06)',
                color: processed ? 'var(--gf-gold)' : 'rgba(26,30,35,0.45)',
              }}
            >
              {processed ? '已整理好' : '正在整理'}
            </span>
            {hasNote && (
              <span className="rounded-full px-2 py-0.5 text-[11px]" style={{ backgroundColor: 'rgba(60,138,81,0.12)', color: '#3c8a51' }}>
                有笔记
              </span>
            )}
          </div>
          {metaLine}
          <div className="line-clamp-2 text-sm leading-7" style={{ color: 'rgba(26,30,35,0.52)' }}>
            {preview || '翻开后可继续对照原文和标点文。'}
          </div>
          <div className="mt-2 text-xs" style={{ color: 'rgba(26,30,35,0.42)' }}>
            {progressLabel}
            {updatedAtLabel ? ` · 最近整理：${updatedAtLabel}` : ''}
          </div>
        </button>
        <button
          onClick={onToggleCompare}
          aria-pressed={compared}
          aria-label={compared ? '移出对照阅读' : '加入对照阅读'}
          className="shrink-0 rounded-[18px] px-3 py-2 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--gf-gold)]/40"
          style={{
            backgroundColor: compared ? 'rgba(201,160,99,0.15)' : 'rgba(26,30,35,0.05)',
            color: compared ? 'var(--gf-gold)' : 'rgba(26,30,35,0.55)',
          }}
        >
          {compared ? '已在对照中' : '加入对照'}
        </button>
      </div>
    </div>
  )
}
