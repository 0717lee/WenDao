import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAuthStore } from '../store/useAuthStore'

describe('useAuthStore', () => {
  beforeEach(() => {
    localStorage.clear()
    useAuthStore.setState({ token: null, username: null })
    vi.mocked(global.fetch).mockReset()
  })

  it('clears stored auth when /auth/me returns unauthorized', async () => {
    useAuthStore.setState({ token: null, username: 'tester' })

    vi.mocked(global.fetch).mockResolvedValueOnce({
      ok: false,
      status: 401,
      json: async () => ({ detail: '无效令牌' }),
    } as Response)

    const valid = await useAuthStore.getState().validateStoredAuth()

    expect(valid).toBe(false)
    expect(useAuthStore.getState().token).toBeNull()
    expect(useAuthStore.getState().username).toBeNull()
  })

  it('restores username from cookie-backed session without persisting token', async () => {
    useAuthStore.setState({ token: null, username: null })

    vi.mocked(global.fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ user_id: 'user-1', username: 'tester' }),
    } as Response)

    const valid = await useAuthStore.getState().validateStoredAuth()

    expect(valid).toBe(true)
    expect(useAuthStore.getState().token).toBe('__cookie_session__')
    expect(useAuthStore.getState().username).toBe('tester')
    expect(localStorage.getItem('wendao_username')).toBeNull()
    expect(localStorage.getItem('wendao_token')).toBeNull()
  })

  it('keeps local username on transient network failure', async () => {
    useAuthStore.setState({ token: null, username: 'tester' })

    vi.mocked(global.fetch).mockRejectedValueOnce(new Error('network down'))

    const valid = await useAuthStore.getState().validateStoredAuth()

    expect(valid).toBe(true)
    expect(useAuthStore.getState().username).toBe('tester')
  })
})
