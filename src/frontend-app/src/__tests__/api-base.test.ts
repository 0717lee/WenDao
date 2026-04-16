import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

describe('API_BASE resolution', () => {
  const originalUrl = window.location.href

  beforeEach(() => {
    vi.resetModules()
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    window.history.replaceState({}, '', originalUrl)
  })

  it('uses same-origin proxy on non-local hosts when build-time API points at legacy Railway', async () => {
    window.history.replaceState({}, '', 'https://example.com/')
    vi.stubEnv('VITE_API_URL', 'https://api.example.com')

    const mod = await import('../lib/api')

    expect(mod.API_BASE).toBe('')
  })

  it('keeps explicit local API target during local development', async () => {
    window.history.replaceState({}, '', 'http://localhost:5173/')
    vi.stubEnv('VITE_API_URL', 'http://localhost:8000')

    const mod = await import('../lib/api')

    expect(mod.API_BASE).toBe('http://localhost:8000')
  })
})
