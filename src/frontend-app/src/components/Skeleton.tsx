import type { CSSProperties } from 'react'

interface SkeletonProps {
  width?: number | string
  height?: number | string
  className?: string
  style?: CSSProperties
  rounded?: number | string
}

export function Skeleton({ width = '100%', height = 16, className = '', style, rounded = 10 }: SkeletonProps) {
  return (
    <div
      className={`skeleton-shimmer ${className}`}
      style={{
        width,
        height,
        borderRadius: typeof rounded === 'number' ? `${rounded}px` : rounded,
        ...style,
      }}
    />
  )
}

interface SkeletonTextProps {
  lines?: number
  className?: string
  lineHeight?: number
  gap?: number
  lastWidth?: string
}

export function SkeletonText({ lines = 3, className = '', lineHeight = 12, gap = 10, lastWidth = '60%' }: SkeletonTextProps) {
  return (
    <div className={className} style={{ display: 'flex', flexDirection: 'column', gap: `${gap}px` }}>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton key={i} height={lineHeight} width={i === lines - 1 ? lastWidth : '100%'} rounded={6} />
      ))}
    </div>
  )
}

interface SkeletonPageProps {
  label?: string
  variant?: 'reader' | 'list' | 'default'
}

export function SkeletonPage({ label, variant = 'default' }: SkeletonPageProps) {
  if (variant === 'reader') {
    return (
      <div
        className="h-full w-full overflow-hidden px-6 py-8"
        style={{ backgroundColor: 'var(--gf-bg)' }}
        role="status"
        aria-live="polite"
        aria-label={label || '正在加载内容'}
      >
        <div className="mx-auto max-w-3xl space-y-5">
          <Skeleton height={28} width="40%" />
          <Skeleton height={14} width="22%" />
          <div className="space-y-3 pt-4">
            <Skeleton height={14} />
            <Skeleton height={14} />
            <Skeleton height={14} width="85%" />
            <Skeleton height={14} width="92%" />
            <Skeleton height={14} width="78%" />
          </div>
        </div>
      </div>
    )
  }

  if (variant === 'list') {
    return (
      <div
        className="h-full w-full overflow-hidden px-4 py-5 md:px-6 md:py-7"
        style={{ backgroundColor: 'var(--gf-bg)' }}
        role="status"
        aria-live="polite"
        aria-label={label || '正在加载列表'}
      >
        <div className="mx-auto max-w-6xl space-y-4">
          <Skeleton height={48} rounded={18} />
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                className="rounded-[22px] p-4"
                style={{ backgroundColor: 'rgba(255,255,255,0.6)', border: '1px solid rgba(26,30,35,0.05)' }}
              >
                <Skeleton height={18} width="70%" />
                <div className="mt-3 space-y-2">
                  <Skeleton height={12} />
                  <Skeleton height={12} width="80%" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div
      className="flex h-full w-full items-center justify-center"
      style={{ backgroundColor: 'var(--gf-bg)' }}
      role="status"
      aria-live="polite"
      aria-label={label || '正在加载'}
    >
      <div className="w-full max-w-md space-y-3 px-6">
        <Skeleton height={22} width="50%" />
        <Skeleton height={14} />
        <Skeleton height={14} width="85%" />
        <Skeleton height={14} width="70%" />
      </div>
    </div>
  )
}
