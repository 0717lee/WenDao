import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import BookshelfPanel from '../components/BookshelfPanel'

describe('BookshelfPanel', () => {
  const props = {
    onOpenDocument: vi.fn(),
    onToggleCompare: vi.fn(),
    comparedDocumentIds: [],
    onOpenCompare: vi.fn(),
  }

  beforeEach(() => {
    vi.clearAllMocks()
    ;(global.fetch as any).mockReset()
  })

  it('uses local demo bookshelf when document API is unavailable', async () => {
    ;(global.fetch as any).mockRejectedValue(new Error('network down'))

    render(<BookshelfPanel {...props} />)

    expect(await screen.findByText('体验样例 · 《论语·学而》')).toBeInTheDocument()
  })

  it('shows an empty continue-reading state for accounts with no reading history', async () => {
    ;(global.fetch as any).mockImplementation((url: string) => {
      if (url.includes('/api/v1/documents?limit=100')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            documents: [
              {
                id: 'corpus-1',
                title: '《论语》',
                preview: '学而时习之',
                has_processed: true,
                has_note: false,
                status: 'done',
                current_paragraph: 0,
                total_paragraphs: 6,
                source_type: 'corpus',
              },
            ],
            total: 1,
          }),
        })
      }

      if (url.includes('/api/v1/documents?limit=24&source_type=corpus')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            documents: [
              {
                id: 'corpus-1',
                title: '《论语》',
                preview: '学而时习之',
                has_processed: true,
                has_note: false,
                status: 'done',
                current_paragraph: 0,
                total_paragraphs: 6,
                source_type: 'corpus',
              },
            ],
            total: 1,
          }),
        })
      }

      if (url.includes('/api/v1/documents?limit=8&source_type=sample')) {
        return Promise.resolve({ ok: true, json: async () => ({ documents: [], total: 0 }) })
      }

      if (url.includes('/api/v1/reader/history')) {
        return Promise.resolve({ ok: true, json: async () => [] })
      }

      if (url.includes('/api/v1/documents/catalog?')) {
        return Promise.resolve({ ok: true, json: async () => ({ entries: [], total: 0 }) })
      }

      return Promise.resolve({ ok: true, json: async () => ({ documents: [], total: 0 }) })
    })

    render(<BookshelfPanel {...props} />)

    expect(await screen.findByText('还没有阅读记录，先从下面选一篇开始。')).toBeInTheDocument()
    expect(screen.queryByText(/最近阅读：/)).not.toBeInTheDocument()
  })
})
