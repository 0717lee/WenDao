import { create } from 'zustand'

export type ToastKind = 'success' | 'error' | 'info'

export interface ToastItem {
  id: string
  kind: ToastKind
  message: string
  durationMs: number
}

interface ToastState {
  toasts: ToastItem[]
  push: (kind: ToastKind, message: string, durationMs?: number) => string
  dismiss: (id: string) => void
  success: (message: string, durationMs?: number) => string
  error: (message: string, durationMs?: number) => string
  info: (message: string, durationMs?: number) => string
}

let toastSeq = 0

export const useToastStore = create<ToastState>((set, get) => ({
  toasts: [],
  push: (kind, message, durationMs = 3200) => {
    toastSeq += 1
    const id = `t-${Date.now().toString(36)}-${toastSeq}`
    set((state) => ({ toasts: [...state.toasts, { id, kind, message, durationMs }] }))
    return id
  },
  dismiss: (id) => set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) })),
  success: (message, durationMs): string => get().push('success', message, durationMs),
  error: (message, durationMs): string => get().push('error', message, durationMs ?? 4200),
  info: (message, durationMs): string => get().push('info', message, durationMs),
}))

export const toast = {
  success: (msg: string, d?: number) => useToastStore.getState().success(msg, d),
  error: (msg: string, d?: number) => useToastStore.getState().error(msg, d),
  info: (msg: string, d?: number) => useToastStore.getState().info(msg, d),
}
