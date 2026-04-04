import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
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
    onOpenWordbook: vi.fn(),
    onOpenCompare: vi.fn(),
    onContinueStudy: vi.fn(),
  }

  beforeEach(() => {
    vi.clearAllMocks()
    installFetchMock()
  })

  it('renders the reading-first positioning and sample entry', async () => {
    render(<DashboardHome {...props} />)

    expect(
      screen.getByRole('heading', {
        name: /先把古籍翻开/i,
      })
    ).toBeInTheDocument()
    expect(await screen.findByRole('button', { name: /先读一篇导读/ })).toBeInTheDocument()
    expect(screen.getByText('学习脉络')).toBeInTheDocument()
  })

  it('routes the primary reading and search entries to the right callbacks', async () => {
    render(<DashboardHome {...props} />)

    fireEvent.click(await screen.findByRole('button', { name: /先读一篇导读/ }))
    expect(props.onOpenDocument).toHaveBeenCalledWith('sample-1')

    fireEvent.click(screen.getByRole('button', { name: /先从一句话找起/ }))
    expect(props.onSearch).toHaveBeenCalledWith('孔子怎样谈“仁”')
  })

  it('keeps the primary reading entry available when one dashboard request fails', async () => {
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
      if (url.includes('/api/v1/reader/study-overview')) {
        return Promise.resolve({ ok: true, json: async () => null })
      }
      return Promise.resolve({ ok: true, json: async () => ({}) })
    })

    render(<DashboardHome {...props} />)

    expect(await screen.findByRole('button', { name: /先读一篇导读/ })).toBeInTheDocument()
  })

  it('routes overview cards and study CTA to the right entry points', async () => {
    render(<DashboardHome {...props} />)

    await screen.findByRole('button', { name: /转至续读/ })

    fireEvent.click(screen.getByRole('button', { name: /可读篇目/ }))
    expect(props.onOpenReaderHub).toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: '转至字词本' }))
    expect(props.onOpenWordbook).toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: /转至续读/ }))
    expect(props.onContinueStudy).toHaveBeenCalledWith('sample-1')
  })

  it('routes the OCR helper entry to reader hub', async () => {
    render(<DashboardHome {...props} />)

    fireEvent.click(await screen.findByRole('button', { name: /有图片时再走这里/ }))

    await waitFor(() => {
      expect(props.onOpenReaderHub).toHaveBeenCalled()
    })
  })
})
