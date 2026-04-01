import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAuthStore } from '../store/useAuthStore'

describe('useAuthStore', () => {
  beforeEach(() => {
    localStorage.clear()
    useAuthStore.setState({ token: null, username: null })
    vi.mocked(global.fetch).mockReset()
  })

  it('clears stored auth when /auth/me returns unauthorized', async () => {
    localStorage.setItem('wendao_token', 'bad-token')
    localStorage.setItem('wendao_username', 'tester')
    useAuthStore.setState({ token: 'bad-token', username: 'tester' })

    vi.mocked(global.fetch).mockResolvedValueOnce({
      ok: false,
      status: 401,
      json: async () => ({ detail: '无效令牌' }),
    } as Response)

    const valid = await useAuthStore.getState().validateStoredAuth()

    expect(valid).toBe(false)
    expect(useAuthStore.getState().token).toBeNull()
    expect(useAuthStore.getState().username).toBeNull()
    expect(localStorage.getItem('wendao_token')).toBeNull()
    expect(localStorage.getItem('wendao_username')).toBeNull()
  })

  it('keeps local auth on transient network failure', async () => {
    localStorage.setItem('wendao_token', 'good-token')
    localStorage.setItem('wendao_username', 'tester')
    useAuthStore.setState({ token: 'good-token', username: 'tester' })

    vi.mocked(global.fetch).mockRejectedValueOnce(new Error('network down'))

    const valid = await useAuthStore.getState().validateStoredAuth()

    expect(valid).toBe(true)
    expect(useAuthStore.getState().token).toBe('good-token')
    expect(useAuthStore.getState().username).toBe('tester')
  })
})
