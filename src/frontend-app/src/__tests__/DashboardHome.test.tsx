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
    onOpenReaderHub: vi.fn(),
    onOpenReaderUpload: vi.fn(),
  }

  beforeEach(() => {
    vi.clearAllMocks()
    installFetchMock()
  })

  it('renders the reading-first positioning and sample entry', async () => {
    render(<DashboardHome {...props} />)

    expect(
      screen.getByRole('heading', {
        name: /从一句看不懂的古文开始/i,
      })
    ).toBeInTheDocument()
    expect(await screen.findByRole('button', { name: /开始读懂这句/ })).toBeInTheDocument()
    expect(screen.getByText('继续上次阅读')).toBeInTheDocument()
  })

  it('routes the primary single-input action to AI guidance', async () => {
    render(<DashboardHome {...props} />)

    fireEvent.change(screen.getByPlaceholderText(/贴一句古文/i), {
      target: { value: '“学而时习之，不亦说乎？”是什么意思？' },
    })
    fireEvent.click(await screen.findByRole('button', { name: /开始读懂这句/ }))

    expect(props.onAsk).toHaveBeenCalled()
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

    expect(await screen.findByRole('button', { name: /开始读懂这句/ })).toBeInTheDocument()
  })

  it('routes the lightweight continue and recommendation entries to the right actions', async () => {
    render(<DashboardHome {...props} />)

    await screen.findByRole('button', { name: /去阅读页看看/ })

    fireEvent.click(screen.getByRole('button', { name: /从这篇开始/ }))
    expect(props.onOpenDocument).toHaveBeenCalledWith('sample-1')

    fireEvent.click(screen.getByRole('button', { name: /去阅读页看看/ }))
    expect(props.onOpenReaderHub).toHaveBeenCalled()
  })

  it('routes the OCR helper entry to reader hub', async () => {
    render(<DashboardHome {...props} />)

    fireEvent.click(await screen.findByRole('button', { name: /上传图片识别/ }))

    await waitFor(() => {
      expect(props.onOpenReaderUpload).toHaveBeenCalled()
    })
  })
})
