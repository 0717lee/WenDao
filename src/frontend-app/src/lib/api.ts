/** Shared API base URL — prefer explicit env, otherwise use same-origin in production and localhost during local development. */
const rawApiBase = import.meta.env.VITE_API_URL?.trim()

function resolveApiBase() {
  if (rawApiBase) {
    return rawApiBase.replace(/\/$/, '')
  }

  if (typeof window === 'undefined') {
    return 'http://localhost:8000'
  }

  const localHosts = new Set(['localhost', '127.0.0.1', '0.0.0.0'])
  return localHosts.has(window.location.hostname) ? 'http://localhost:8000' : ''
}

export const API_BASE = resolveApiBase()
