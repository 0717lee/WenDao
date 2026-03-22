/**
 * WordPopover Entity Linking Tests (OCR-03 / UX-04)
 * Coverage: KG entity match detection, navigation button, graceful degradation
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

// Mock useGraphStore
const mockFocusEntityInGraph = vi.fn()
const mockSetActiveTab = vi.fn()

vi.mock('../store/useGraphStore', () => ({
  useGraphStore: Object.assign(
    vi.fn((selector: any) => selector({
      focusEntityInGraph: mockFocusEntityInGraph,
      setActiveTab: mockSetActiveTab,
    })),
    {
      getState: () => ({
        focusEntityInGraph: mockFocusEntityInGraph,
        setActiveTab: mockSetActiveTab,
      }),
    }
  ),
}))

// Mock lucide-react
vi.mock('lucide-react', () => ({
  X: () => <span data-testid="x-icon">X</span>,
}))

describe('WordPopover entity linking', () => {
  beforeEach(() => {
    vi.mocked(global.fetch).mockReset()
    mockFocusEntityInGraph.mockClear()
    mockSetActiveTab.mockClear()
  })

  const defaultProps = {
    word: '孔子',
    position: { x: 100, y: 100 },
    onClose: vi.fn(),
  }

  function setupFetchMocks(options: {
    explanation?: object
    kgNodes?: object[]
    kgError?: boolean
    explainError?: boolean
  } = {}) {
    const {
      explanation = { meaning: '儒家创始人', allusion: '至圣先师', citations: [] },
      kgNodes = [{ id: 'kongzi', label: '孔子', group: '人物', desc: '儒家创始人' }],
      kgError = false,
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
      if (urlStr.includes('/api/v1/knowledge-graph/search')) {
        if (kgError) return Promise.reject(new Error('kg search failed'))
        return Promise.resolve({
          ok: true,
          json: async () => ({ nodes: kgNodes, count: kgNodes.length }),
        } as Response)
      }
      return Promise.reject(new Error(`Unexpected fetch: ${urlStr}`))
    })
  }

  it('shows "在知识图谱中查看" button when word matches a KG entity', async () => {
    setupFetchMocks()
    const { WordPopover } = await import('../components/WordPopover')
    render(<WordPopover {...defaultProps} />)

    await waitFor(() => {
      expect(screen.getByText(/在知识图谱中查看/)).toBeTruthy()
    })
  })

  it('does not show entity button when word has no KG match', async () => {
    setupFetchMocks({ kgNodes: [] })
    const { WordPopover } = await import('../components/WordPopover')
    render(<WordPopover {...defaultProps} />)

    // Wait for explanation to load first
    await waitFor(() => {
      expect(screen.getByText('儒家创始人')).toBeTruthy()
    })

    // No entity button should appear
    expect(screen.queryByText(/在知识图谱中查看/)).toBeNull()
  })

  it('clicking the button calls focusEntityInGraph and setActiveTab("graph")', async () => {
    setupFetchMocks()
    const { WordPopover } = await import('../components/WordPopover')
    render(<WordPopover {...defaultProps} />)

    await waitFor(() => {
      expect(screen.getByText(/在知识图谱中查看/)).toBeTruthy()
    })

    fireEvent.click(screen.getByText(/在知识图谱中查看/))

    expect(mockFocusEntityInGraph).toHaveBeenCalledWith('kongzi')
    expect(mockSetActiveTab).toHaveBeenCalledWith('graph')
  })

  it('KG search failure does not break the popover (graceful degradation)', async () => {
    setupFetchMocks({ kgError: true })
    const { WordPopover } = await import('../components/WordPopover')
    render(<WordPopover {...defaultProps} />)

    // Explanation should still render fine
    await waitFor(() => {
      expect(screen.getByText('儒家创始人')).toBeTruthy()
    })

    // No entity button
    expect(screen.queryByText(/在知识图谱中查看/)).toBeNull()
  })
})
