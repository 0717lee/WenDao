import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import FavoritesList from '../components/FavoritesList'

describe('FavoritesList', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    ;(global.fetch as any).mockImplementation((url: string) => {
      if (url.includes('/api/v1/reader/folders')) {
        return Promise.resolve({
          ok: true,
          json: async () => [{ id: 'folder-1', name: '默认收藏夹', created_at: '2026-04-10T20:00:00' }],
        })
      }

      if (url.includes('/api/v1/reader/favorites/folder-1')) {
        return Promise.resolve({
          ok: true,
          json: async () => [{ id: 'doc-1', title: '《论语》', created_at: '2026-04-10T20:00:00' }],
        })
      }

      return Promise.resolve({ ok: true, json: async () => [] })
    })
  })

  it('opens the notes panel directly from a favorited article', async () => {
    const onNavigate = vi.fn()

    render(<FavoritesList onNavigate={onNavigate} />)

    fireEvent.click(await screen.findByRole('button', { name: '默认收藏夹' }))
    fireEvent.click(await screen.findByRole('button', { name: '阅读笔记' }))

    expect(onNavigate).toHaveBeenCalledWith('doc-1', { readerPanel: 'notes' })
  })
})
