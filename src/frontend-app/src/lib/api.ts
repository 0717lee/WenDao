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

function isLocalHost(hostname: string) {
  return ['localhost', '127.0.0.1', '0.0.0.0'].includes(hostname)
}

function shouldUseSameOriginProxy(apiBase: string) {
  if (typeof window === 'undefined') return false
  if (isLocalHost(window.location.hostname)) return false

  try {
    const apiHost = new URL(apiBase).hostname
    const isLegacyHost = legacyApiHostHints.some((hint) => apiHost === hint || apiBase.includes(hint))
    return isLegacyHost && apiHost !== window.location.hostname
  } catch {
    return false
  }
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
  const runtimeApiBase = readRuntimeApiBase()
  if (runtimeApiBase) {
    warnIfLegacyApiBase(runtimeApiBase)
    return runtimeApiBase
  }

  const explicitEnvApiBase = normalizeApiBase(envApiBase)
  if (explicitEnvApiBase) {
    if (shouldUseSameOriginProxy(explicitEnvApiBase)) {
      console.info('[WenDao] Using same-origin /api proxy for the legacy Railway backend host.')
      return ''
    }

    warnIfLegacyApiBase(explicitEnvApiBase)
    return explicitEnvApiBase
  }

  if (typeof window === 'undefined') {
    return 'http://localhost:8000'
  }

  return isLocalHost(window.location.hostname) ? 'http://localhost:8000' : ''
}

export const API_BASE = resolveApiBase()
