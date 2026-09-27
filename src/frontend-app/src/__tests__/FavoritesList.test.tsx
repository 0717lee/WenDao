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

  it('shows a folder load error and retries without showing an empty state', async () => {
    const fetchMock = global.fetch as any
    fetchMock.mockReset()
    fetchMock
      .mockResolvedValueOnce({ ok: false })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [{ id: 'folder-1', name: '默认收藏夹', created_at: '2026-04-10T20:00:00' }],
      })

    render(<FavoritesList />)

    expect(await screen.findByRole('alert')).toHaveTextContent('收藏分组加载失败')
    expect(screen.queryByText('还没有收藏的文章')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '重试加载收藏分组' }))

    expect(await screen.findByRole('button', { name: '默认收藏夹' })).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('shows a folder article load error and retries without showing an empty state', async () => {
    const fetchMock = global.fetch as any
    fetchMock.mockReset()
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [{ id: 'folder-1', name: '默认收藏夹', created_at: '2026-04-10T20:00:00' }],
      })
      .mockResolvedValueOnce({ ok: false })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [{ id: 'doc-1', title: '《论语》', created_at: '2026-04-10T20:00:00' }],
      })

    render(<FavoritesList />)

    fireEvent.click(await screen.findByRole('button', { name: '默认收藏夹' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('收藏文章加载失败')
    expect(screen.queryByText('这个分组里还没有收藏的文章')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '重试加载收藏文章' }))

    expect(await screen.findByRole('button', { name: '《论语》' })).toBeInTheDocument()
  })
})
