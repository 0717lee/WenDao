import type { ReactNode } from 'react'

export type EmptyIllustration = 'scroll' | 'bookshelf' | 'search' | 'toc' | 'compare' | 'generic'

interface EmptyStateProps {
  illustration?: EmptyIllustration
  title: string
  description?: string
  action?: ReactNode
  compact?: boolean
}

function Illustration({ kind }: { kind: EmptyIllustration }) {
  const size = 120
  const stroke = 'rgba(140,26,17,0.55)'
  const soft = 'rgba(201,160,99,0.22)'
  const ink = 'rgba(26,30,35,0.35)'

  if (kind === 'scroll') {
    return (
      <svg width={size} height={size} viewBox="0 0 120 120" fill="none" aria-hidden="true">
        <ellipse cx="60" cy="96" rx="36" ry="4" fill={soft} />
        <rect x="30" y="28" width="60" height="64" rx="6" fill="#fffdf6" stroke={stroke} strokeWidth="1.4" />
        <path d="M30 28 Q60 18 90 28" stroke={stroke} strokeWidth="1.2" fill="none" />
        <line x1="40" y1="46" x2="80" y2="46" stroke={ink} strokeWidth="1" strokeLinecap="round" />
        <line x1="40" y1="56" x2="75" y2="56" stroke={ink} strokeWidth="1" strokeLinecap="round" />
        <line x1="40" y1="66" x2="80" y2="66" stroke={ink} strokeWidth="1" strokeLinecap="round" />
        <line x1="40" y1="76" x2="68" y2="76" stroke={ink} strokeWidth="1" strokeLinecap="round" />
      </svg>
    )
  }

  if (kind === 'bookshelf') {
    return (
      <svg width={size} height={size} viewBox="0 0 120 120" fill="none" aria-hidden="true">
        <rect x="20" y="36" width="80" height="56" rx="3" fill="#fffdf6" stroke={stroke} strokeWidth="1.4" />
        <rect x="28" y="44" width="10" height="40" rx="1" fill={soft} stroke={stroke} strokeWidth="1" />
        <rect x="42" y="48" width="10" height="36" rx="1" fill="#fffdf6" stroke={stroke} strokeWidth="1" />
        <rect x="56" y="44" width="10" height="40" rx="1" fill={soft} stroke={stroke} strokeWidth="1" />
        <rect x="70" y="52" width="10" height="32" rx="1" fill="#fffdf6" stroke={stroke} strokeWidth="1" />
        <line x1="20" y1="92" x2="100" y2="92" stroke={stroke} strokeWidth="1.4" strokeLinecap="round" />
      </svg>
    )
  }

  if (kind === 'search') {
    return (
      <svg width={size} height={size} viewBox="0 0 120 120" fill="none" aria-hidden="true">
        <rect x="28" y="24" width="52" height="62" rx="5" fill="#fffdf6" stroke={stroke} strokeWidth="1.4" />
        <line x1="38" y1="40" x2="70" y2="40" stroke={ink} strokeWidth="1" strokeLinecap="round" />
        <line x1="38" y1="50" x2="66" y2="50" stroke={ink} strokeWidth="1" strokeLinecap="round" />
        <line x1="38" y1="60" x2="70" y2="60" stroke={ink} strokeWidth="1" strokeLinecap="round" />
        <circle cx="80" cy="76" r="14" fill={soft} stroke={stroke} strokeWidth="1.6" />
        <line x1="90" y1="86" x2="100" y2="96" stroke={stroke} strokeWidth="2.2" strokeLinecap="round" />
      </svg>
    )
  }

  if (kind === 'toc') {
    return (
      <svg width={size} height={size} viewBox="0 0 120 120" fill="none" aria-hidden="true">
        <rect x="26" y="22" width="68" height="76" rx="4" fill="#fffdf6" stroke={stroke} strokeWidth="1.4" />
        <circle cx="36" cy="38" r="2" fill={stroke} />
        <line x1="42" y1="38" x2="82" y2="38" stroke={ink} strokeWidth="1" strokeLinecap="round" />
        <circle cx="36" cy="52" r="2" fill={stroke} />
        <line x1="42" y1="52" x2="76" y2="52" stroke={ink} strokeWidth="1" strokeLinecap="round" />
        <circle cx="36" cy="66" r="2" fill={stroke} />
        <line x1="42" y1="66" x2="80" y2="66" stroke={ink} strokeWidth="1" strokeLinecap="round" />
        <circle cx="36" cy="80" r="2" fill={stroke} />
        <line x1="42" y1="80" x2="70" y2="80" stroke={ink} strokeWidth="1" strokeLinecap="round" />
      </svg>
    )
  }

  if (kind === 'compare') {
    return (
      <svg width={size} height={size} viewBox="0 0 120 120" fill="none" aria-hidden="true">
        <rect x="16" y="28" width="40" height="64" rx="4" fill="#fffdf6" stroke={stroke} strokeWidth="1.4" />
        <rect x="64" y="28" width="40" height="64" rx="4" fill={soft} stroke={stroke} strokeWidth="1.4" />
        <line x1="22" y1="44" x2="50" y2="44" stroke={ink} strokeWidth="1" strokeLinecap="round" />
        <line x1="22" y1="54" x2="46" y2="54" stroke={ink} strokeWidth="1" strokeLinecap="round" />
        <line x1="22" y1="64" x2="50" y2="64" stroke={ink} strokeWidth="1" strokeLinecap="round" />
        <line x1="70" y1="44" x2="98" y2="44" stroke={ink} strokeWidth="1" strokeLinecap="round" />
        <line x1="70" y1="54" x2="94" y2="54" stroke={ink} strokeWidth="1" strokeLinecap="round" />
        <line x1="70" y1="64" x2="98" y2="64" stroke={ink} strokeWidth="1" strokeLinecap="round" />
      </svg>
    )
  }

  return (
    <svg width={size} height={size} viewBox="0 0 120 120" fill="none" aria-hidden="true">
      <circle cx="60" cy="60" r="42" fill={soft} />
      <circle cx="60" cy="60" r="32" fill="#fffdf6" stroke={stroke} strokeWidth="1.4" />
      <path d="M46 60 h28 M60 46 v28" stroke={stroke} strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  )
}

export function EmptyState({ illustration = 'generic', title, description, action, compact = false }: EmptyStateProps) {
  return (
    <div
      className={`flex flex-col items-center justify-center text-center ${compact ? 'py-8' : 'py-12'}`}
      role="status"
    >
      {!compact && <Illustration kind={illustration} />}
      <p className="mt-4 text-base" style={{ color: 'var(--gf-text)', fontFamily: '"Noto Serif SC", serif' }}>
        {title}
      </p>
      {description && (
        <p className="mt-2 max-w-sm text-sm leading-7" style={{ color: 'rgba(26,30,35,0.5)' }}>
          {description}
        </p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}
