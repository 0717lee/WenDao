import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import DashboardHome from '../components/DashboardHome'

function installFetchMock() {
  ;(global.fetch as any).mockImplementation((url: string) => {
    if (url.includes('/api/v1/documents?limit=12')) {
      return Promise.resolve({
        ok: true,
        json: async () => ({
          documents: [
            {
              id: 'user-doc-1',
              title: '我的上传文档',
              preview: '这是我的上传内容摘要',
              has_processed: true,
              current_paragraph: 1,
              total_paragraphs: 3,
              source_type: 'user',
            },
          ],
        }),
      })
    }

    if (url.includes('/api/v1/documents?limit=8&source_type=sample')) {
      return Promise.resolve({
        ok: true,
        json: async () => ({
          documents: [
            {
              id: 'sample-1',
              title: '体验样例 · 《论语·学而》',
              preview: '学习后经常复习实践，不也是快乐的吗？',
              has_processed: true,
              current_paragraph: 0,
              total_paragraphs: 0,
              source_type: 'sample',
            },
          ],
        }),
      })
    }

    if (url.includes('/api/v1/reader/history')) {
      return Promise.resolve({ ok: true, json: async () => [] })
    }

    if (url.includes('/api/v1/reader/wordbook')) {
      return Promise.resolve({ ok: true, json: async () => ({ entries: [] }) })
    }

    if (url.includes('/api/v1/analytics/overview')) {
      return Promise.resolve({
        ok: true,
        json: async () => ({
          total_nodes: 12,
          total_edges: 8,
          top_entities: [{ id: 'kongzi', label: '孔子', count: 4 }],
        }),
      })
    }

    if (url.includes('/api/v1/documents/recommendations')) {
      return Promise.resolve({ ok: true, json: async () => ({ documents: [] }) })
    }

    if (url.includes('/api/v1/reader/study-overview')) {
      return Promise.resolve({
        ok: true,
        json: async () => ({
          sessions_count: 0,
          reviewed_documents_count: 0,
          completed_cards: 0,
          mastered_cards: 0,
          review_again_cards: 0,
          mastery_rate: 0,
          last_reviewed_document: null,
        }),
      })
    }

    return Promise.resolve({ ok: true, json: async () => ({ documents: [] }) })
  })
}

describe('DashboardHome', () => {
  const props = {
    onOpenDocument: vi.fn(),
    onAsk: vi.fn(),
    onSearch: vi.fn(),
    onOpenReaderHub: vi.fn(),
    onOpenBookshelf: vi.fn(),
    onOpenHistory: vi.fn(),
    onOpenWordbook: vi.fn(),
    onOpenCompare: vi.fn(),
    onContinueStudy: vi.fn(),
  }

  beforeEach(() => {
    vi.clearAllMocks()
    installFetchMock()
  })

  it('renders the new product positioning and sample entry', async () => {
    render(<DashboardHome {...props} />)

    expect(
      screen.getByRole('heading', {
        name: '帮你读懂古籍的第一步，不必先有一张扫描页',
      })
    ).toBeInTheDocument()
    expect(await screen.findByText('体验样例 · 《论语·学而》')).toBeInTheDocument()
  })

  it('routes sample cards and search topics to the right callbacks', async () => {
    render(<DashboardHome {...props} />)

    fireEvent.click(await screen.findByText('体验样例 · 《论语·学而》'))
    expect(props.onOpenDocument).toHaveBeenCalledWith('sample-1')

    const topicButtons = screen.getAllByRole('button', { name: /孔子怎样谈“仁”/ })
    fireEvent.click(topicButtons[0])
    expect(props.onSearch).toHaveBeenCalledWith('孔子怎样谈“仁”')
  })

  it('keeps sample entry available when one dashboard request fails', async () => {
    ;(global.fetch as any).mockImplementation((url: string) => {
      if (url.includes('/api/v1/documents?limit=12')) {
        return Promise.resolve({ ok: true, json: async () => ({ documents: [] }) })
      }
      if (url.includes('/api/v1/documents?limit=8&source_type=sample')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            documents: [
              {
                id: 'sample-1',
                title: '体验样例 · 《论语·学而》',
                preview: '学习后经常复习实践，不也是快乐的吗？',
                has_processed: true,
                current_paragraph: 0,
                total_paragraphs: 0,
                source_type: 'sample',
              },
            ],
          }),
        })
      }
      if (url.includes('/api/v1/documents/recommendations')) {
        return Promise.reject(new Error('network down'))
      }
      if (url.includes('/api/v1/reader/history')) {
        return Promise.resolve({ ok: true, json: async () => [] })
      }
      if (url.includes('/api/v1/reader/wordbook')) {
        return Promise.resolve({ ok: true, json: async () => ({ entries: [] }) })
      }
      if (url.includes('/api/v1/analytics/overview')) {
        return Promise.resolve({ ok: true, json: async () => null })
      }
      if (url.includes('/api/v1/reader/study-overview')) {
        return Promise.resolve({ ok: true, json: async () => null })
      }
      return Promise.resolve({ ok: true, json: async () => ({}) })
    })

    render(<DashboardHome {...props} />)

    expect(await screen.findByText('体验样例 · 《论语·学而》')).toBeInTheDocument()
  })

  it('routes stat cards to bookshelf and wordbook entry points', async () => {
    render(<DashboardHome {...props} />)

    fireEvent.click(await screen.findByRole('button', { name: /已读篇目/ }))
    expect(props.onOpenBookshelf).toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: /字词沉淀/i }))
    expect(props.onOpenWordbook).toHaveBeenCalled()
  })

  it('routes hotspot entities to chat question', async () => {
    render(<DashboardHome {...props} />)

    const hotspotButton = await screen.findByRole('button', { name: /孔子.*4 关联/i })
    fireEvent.click(hotspotButton)

    expect(props.onAsk).toHaveBeenCalled()
  })
})
