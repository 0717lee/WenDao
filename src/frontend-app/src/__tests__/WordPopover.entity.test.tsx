/**
 * WordPopover Tests
 * Coverage: 释义加载、错误兜底，以及移除知识图谱跳转后的界面行为
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'

// Mock lucide-react
vi.mock('lucide-react', () => ({
  X: () => <span data-testid="x-icon">X</span>,
  BookPlus: () => <span data-testid="bookplus-icon">+</span>,
}))

describe('WordPopover', () => {
  beforeEach(() => {
    vi.mocked(global.fetch).mockReset()
  })

  const defaultProps = {
    word: '孔子',
    position: { x: 100, y: 100 },
    onClose: vi.fn(),
  }

  function setupFetchMocks(options: {
    explanation?: object
    explainError?: boolean
  } = {}) {
    const {
      explanation = { meaning: '儒家创始人', allusion: '至圣先师', citations: [] },
      explainError = false,
    } = options

    vi.mocked(global.fetch).mockImplementation((url: any) => {
      const urlStr = typeof url === 'string' ? url : url.toString()
      if (urlStr.includes('/api/v1/documents/explain')) {
        if (explainError) return Promise.reject(new Error('explain failed'))
        return Promise.resolve({
          ok: true,
          json: async () => explanation,
        } as Response)
      }
      return Promise.reject(new Error(`Unexpected fetch: ${urlStr}`))
    })
  }

  it('renders explanation content without jump-out actions', async () => {
    setupFetchMocks()
    const { WordPopover } = await import('../components/WordPopover')
    render(<WordPopover {...defaultProps} />)

    await waitFor(() => {
      expect(screen.getByText('儒家创始人')).toBeTruthy()
      expect(screen.getByText('至圣先师')).toBeTruthy()
    })

    expect(screen.queryByText(/知识图谱/)).toBeNull()
  })

  it('shows fallback text when explanation request fails', async () => {
    setupFetchMocks({ explainError: true })
    const { WordPopover } = await import('../components/WordPopover')
    render(<WordPopover {...defaultProps} />)

    await waitFor(() => {
      expect(screen.getByText('无法取到这个词的释义，请换一个词再试')).toBeTruthy()
    })
  })
})
