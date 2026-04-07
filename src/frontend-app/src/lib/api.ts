declare global {
  interface Window {
    __WENDAO_API_URL__?: string
  }
}

/** Shared API base URL — prefer runtime override, then Vite env, otherwise use same-origin in production and localhost during local development. */
const envApiBase = import.meta.env.VITE_API_URL?.trim()
const legacyApiHostHints = ['api.example.com']

function normalizeApiBase(value?: string | null) {
  const trimmed = value?.trim()
  if (!trimmed) return ''
  return trimmed.replace(/\/$/, '')
}

function readRuntimeApiBase() {
  if (typeof window === 'undefined') return ''
  return normalizeApiBase(window.__WENDAO_API_URL__)
}

function warnIfLegacyApiBase(apiBase: string) {
  if (typeof window === 'undefined') return
  const isLegacyHost = legacyApiHostHints.some((hint) => apiBase.includes(hint))
  if (!isLegacyHost) return

  console.warn(
    `[WenDao] API_BASE is using a TextTwin-named backend host: ${apiBase}. ` +
      'This is fine if intentional, but verify Cloudflare Pages VITE_API_URL if you expected a WenDao-specific domain.'
  )
}

function resolveApiBase() {
  const explicitApiBase = readRuntimeApiBase() || normalizeApiBase(envApiBase)
  if (explicitApiBase) {
    warnIfLegacyApiBase(explicitApiBase)
    return explicitApiBase
  }

  if (typeof window === 'undefined') {
    return 'http://localhost:8000'
  }

  const localHosts = new Set(['localhost', '127.0.0.1', '0.0.0.0'])
  return localHosts.has(window.location.hostname) ? 'http://localhost:8000' : ''
}

export const API_BASE = resolveApiBase()
