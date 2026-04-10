import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import DashboardHome from '../components/DashboardHome'

function installFetchMock() {
  ;(global.fetch as any).mockImplementation((url: string) => {
    if (url.includes('/api/v1/documents?limit=12&source_type=corpus')) {
      return Promise.resolve({
        ok: true,
        json: async () => ({
          documents: [
            {
              id: 'corpus-1',
              title: '《论语》',
              preview: '从熟悉的小段落开始，更容易进入状态。',
              has_processed: true,
              current_paragraph: 0,
              total_paragraphs: 0,
              source_type: 'corpus',
            },
          ],
          total: 40,
        }),
      })
    }

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
          total: 1,
        }),
      })
    }

    if (url.includes('/api/v1/documents?limit=8&source_type=corpus')) {
      return Promise.resolve({
        ok: true,
        json: async () => ({
          documents: [
            {
              id: 'corpus-1',
              title: '《论语》',
              preview: '从熟悉的小段落开始，更容易进入状态。',
              has_processed: true,
              current_paragraph: 0,
              total_paragraphs: 0,
              source_type: 'corpus',
            },
          ],
          total: 40,
        }),
      })
    }

    if (url.includes('/api/v1/reader/history')) {
      return Promise.resolve({ ok: true, json: async () => [] })
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

  it('renders the simplified three-card onboarding layout', async () => {
    render(<DashboardHome {...props} />)

    expect(
      screen.getByRole('heading', {
        name: /古人之言，今人可入/i,
      })
    ).toBeInTheDocument()
    expect(await screen.findByRole('button', { name: /打开推荐内容/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /先问一句原文/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /先识读图片/i })).toBeInTheDocument()
    expect(screen.getAllByText('推荐阅读')).toHaveLength(1)
    expect(screen.getAllByText('问一句')).toHaveLength(1)
    expect(screen.getAllByText('上传图片')).toHaveLength(1)
  })

  it('routes the first card to open the recommended text', async () => {
    render(<DashboardHome {...props} />)

    fireEvent.click(await screen.findByRole('button', { name: /打开推荐内容/i }))

    expect(props.onOpenDocument).toHaveBeenCalledWith('corpus-1')
  })

  it('routes the quote-first card to AI guidance', async () => {
    render(<DashboardHome {...props} />)

    fireEvent.click(await screen.findByRole('button', { name: /先问一句原文/i }))

    expect(props.onAsk).toHaveBeenCalled()
  })

  it('keeps the primary onboarding cards available when one dashboard request fails', async () => {
    ;(global.fetch as any).mockImplementation((url: string) => {
      if (url.includes('/api/v1/documents?limit=12')) {
        return Promise.resolve({ ok: false, json: async () => ({ documents: [], total: 0 }) })
      }
      if (url.includes('/api/v1/documents?limit=12&source_type=corpus')) {
        return Promise.resolve({ ok: false, json: async () => ({ documents: [], total: 0 }) })
      }
      if (url.includes('/api/v1/reader/history')) {
        return Promise.resolve({ ok: true, json: async () => [] })
      }
      return Promise.reject(new Error('network down'))
    })

    render(<DashboardHome {...props} />)

    expect(await screen.findByRole('button', { name: /先问一句原文/i })).toBeInTheDocument()
  })

  it('routes the lightweight continue and recommendation entries to the right actions', async () => {
    render(<DashboardHome {...props} />)

    await screen.findByRole('button', { name: /去阅读页看看/i })

    fireEvent.click(screen.getByRole('button', { name: /从这篇开始/i }))
    expect(props.onOpenDocument).toHaveBeenCalledWith('corpus-1')

    fireEvent.click(screen.getByRole('button', { name: /去阅读页看看/i }))
    expect(props.onOpenReaderHub).toHaveBeenCalled()
  })

  it('routes the image-first card to OCR upload flow', async () => {
    render(<DashboardHome {...props} />)

    fireEvent.click(await screen.findByRole('button', { name: /先识读图片/i }))

    await waitFor(() => {
      expect(props.onOpenReaderUpload).toHaveBeenCalled()
    })
  })

  it('shows a warmup placeholder instead of flashing zero corpus totals', async () => {
    let corpusAttempt = 0
    let documentAttempt = 0
    ;(global.fetch as any).mockImplementation((url: string) => {
      if (url.includes('/api/v1/documents?limit=12&source_type=corpus')) {
        corpusAttempt += 1
        return Promise.resolve({
          ok: true,
          json: async () =>
            corpusAttempt === 1
              ? { documents: [], total: 0 }
              : {
                  documents: [
                    {
                      id: 'corpus-1',
                      title: '《论语》',
                      preview: '从熟悉的小段落开始，更容易进入状态。',
                      has_processed: true,
                      current_paragraph: 0,
                      total_paragraphs: 0,
                      source_type: 'corpus',
                    },
                  ],
                  total: 100,
                },
        })
      }

      if (url.includes('/api/v1/documents?limit=12')) {
        documentAttempt += 1
        return Promise.resolve({
          ok: true,
          json: async () =>
            documentAttempt === 1
              ? { documents: [], total: 0 }
              : {
                  documents: [
                    {
                      id: 'corpus-1',
                      title: '《论语》',
                      preview: '从熟悉的小段落开始，更容易进入状态。',
                      has_processed: true,
                      current_paragraph: 0,
                      total_paragraphs: 0,
                      source_type: 'corpus',
                    },
                  ],
                  total: 100,
                },
        })
      }

      if (url.includes('/api/v1/reader/history')) {
        return Promise.resolve({ ok: true, json: async () => [] })
      }

      return Promise.resolve({ ok: true, json: async () => ({ documents: [] }) })
    })

    render(<DashboardHome {...props} />)

    expect(screen.getByText(/古籍库中 准备中/i)).toBeInTheDocument()
    expect(screen.getByText(/当前可读 准备中/i)).toBeInTheDocument()
  })
})
