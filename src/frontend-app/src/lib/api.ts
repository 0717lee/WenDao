declare global {
  interface Window {
    __WENDAO_API_URL__?: string
    __WENDAO_FETCH_FAILOVER_INSTALLED__?: boolean
  }
}

/** Shared API base URL — prefer runtime override, then Vite env, otherwise use same-origin in production and localhost during local development. */
const envApiBase = import.meta.env.VITE_API_URL?.trim()
const legacyApiHostHints = ['api.example.com']
const API_FAILOVER_TIMEOUT_MS = 2500

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

function resolveFallbackApiBase() {
  const runtimeApiBase = readRuntimeApiBase()
  if (runtimeApiBase) return ''

  const explicitEnvApiBase = normalizeApiBase(envApiBase)
  if (!explicitEnvApiBase) return ''
  return shouldUseSameOriginProxy(explicitEnvApiBase) ? explicitEnvApiBase : ''
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
export const API_FALLBACK_BASE = resolveFallbackApiBase()

function resolveRequestUrl(input: RequestInfo | URL) {
  if (typeof window === 'undefined') return ''
  if (typeof input === 'string') return new URL(input, window.location.origin).toString()
  if (input instanceof URL) return input.toString()
  return input.url
}

function shouldFailoverRequest(urlString: string) {
  if (!API_FALLBACK_BASE || typeof window === 'undefined') return false

  const url = new URL(urlString, window.location.origin)
  if (url.origin !== window.location.origin) return false

  return url.pathname === '/health' || url.pathname.startsWith('/health/') || url.pathname.startsWith('/api/')
}

function buildFallbackUrl(urlString: string) {
  const url = new URL(urlString, window.location.origin)
  return `${API_FALLBACK_BASE}${url.pathname}${url.search}`
}

function createTimedAbortSignal(originalSignal?: AbortSignal) {
  const controller = new AbortController()
  let didTimeout = false

  const abortFromOriginal = () => {
    controller.abort(originalSignal?.reason)
  }

  if (originalSignal) {
    if (originalSignal.aborted) {
      controller.abort(originalSignal.reason)
    } else {
      originalSignal.addEventListener('abort', abortFromOriginal, { once: true })
    }
  }

  const timeoutId = window.setTimeout(() => {
    didTimeout = true
    controller.abort(new DOMException('Timed out', 'AbortError'))
  }, API_FAILOVER_TIMEOUT_MS)

  return {
    signal: controller.signal,
    didTimeout: () => didTimeout,
    cleanup: () => {
      window.clearTimeout(timeoutId)
      if (originalSignal && !originalSignal.aborted) {
        originalSignal.removeEventListener('abort', abortFromOriginal)
      }
    },
  }
}

function shouldRetryWithFallback(error: unknown, didTimeout: boolean, originalSignal?: AbortSignal) {
  if (!API_FALLBACK_BASE) return false
  if (originalSignal?.aborted) return false

  if (didTimeout) return true

  return error instanceof TypeError
}

export function installApiFetchFailover() {
  if (typeof window === 'undefined') return
  if (window.__WENDAO_FETCH_FAILOVER_INSTALLED__) return
  if (!API_FALLBACK_BASE) return

  const originalFetch = window.fetch.bind(window)

  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const requestUrl = resolveRequestUrl(input)
    if (!shouldFailoverRequest(requestUrl)) {
      return originalFetch(input, init)
    }

    const originalSignal = init?.signal ?? undefined
    const timeout = createTimedAbortSignal(originalSignal)
    const firstInit: RequestInit | undefined = init ? { ...init, signal: timeout.signal } : { signal: timeout.signal }

    try {
      const firstInput = input instanceof Request ? input.clone() : input
      return await originalFetch(firstInput, firstInit)
    } catch (error) {
      if (!shouldRetryWithFallback(error, timeout.didTimeout(), originalSignal)) {
        throw error
      }

      const fallbackUrl = buildFallbackUrl(requestUrl)
      console.warn(`[WenDao] API request timed out via same-origin proxy, retrying direct backend: ${fallbackUrl}`)

      if (input instanceof Request) {
        return originalFetch(new Request(fallbackUrl, input.clone()), init)
      }

      return originalFetch(fallbackUrl, init)
    } finally {
      timeout.cleanup()
    }
  }

  window.__WENDAO_FETCH_FAILOVER_INSTALLED__ = true
}
