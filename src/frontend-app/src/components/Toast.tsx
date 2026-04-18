import { useEffect } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react'
import { useToastStore, type ToastItem, type ToastKind } from '../store/useToastStore'

const KIND_META: Record<ToastKind, { color: string; soft: string; Icon: typeof CheckCircle2; label: string }> = {
  success: {
    color: 'var(--gf-gold)',
    soft: 'rgba(201,160,99,0.14)',
    Icon: CheckCircle2,
    label: '成功',
  },
  error: {
    color: 'var(--gf-gugong-red)',
    soft: 'rgba(140,26,17,0.10)',
    Icon: AlertCircle,
    label: '出错',
  },
  info: {
    color: 'rgba(26,30,35,0.7)',
    soft: 'rgba(26,30,35,0.06)',
    Icon: Info,
    label: '提示',
  },
}

function ToastCard({ item }: { item: ToastItem }) {
  const dismiss = useToastStore((s: ReturnType<typeof useToastStore.getState>) => s.dismiss)
  const meta = KIND_META[item.kind]
  const Icon = meta.Icon

  useEffect(() => {
    const timer = setTimeout(() => dismiss(item.id), item.durationMs)
    return () => clearTimeout(timer)
  }, [dismiss, item.durationMs, item.id])

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 16, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -10, scale: 0.96 }}
      transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
      role={item.kind === 'error' ? 'alert' : 'status'}
      aria-live={item.kind === 'error' ? 'assertive' : 'polite'}
      className="glass-card flex items-start gap-3 rounded-2xl px-4 py-3 shadow-lg"
      style={{
        minWidth: 260,
        maxWidth: 420,
        borderLeft: `3px solid ${meta.color}`,
      }}
    >
      <div
        className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full"
        style={{ backgroundColor: meta.soft, color: meta.color }}
        aria-hidden="true"
      >
        <Icon className="h-3.5 w-3.5" />
      </div>
      <div className="flex-1 text-sm leading-6" style={{ color: 'var(--gf-text)' }}>
        {item.message}
      </div>
      <button
        type="button"
        aria-label="关闭通知"
        onClick={() => dismiss(item.id)}
        className="shrink-0 rounded p-1 transition-colors hover:bg-black/5"
        style={{ color: 'rgba(26,30,35,0.4)' }}
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </motion.div>
  )
}

export function ToastHost() {
  const toasts = useToastStore((s) => s.toasts)

  return (
    <div
      className="pointer-events-none fixed inset-x-0 bottom-4 z-[9999] flex flex-col items-center gap-2 px-4"
      aria-live="polite"
    >
      <AnimatePresence initial={false}>
        {toasts.map((item) => (
          <div key={item.id} className="pointer-events-auto w-full max-w-md">
            <ToastCard item={item} />
          </div>
        ))}
      </AnimatePresence>
    </div>
  )
}
