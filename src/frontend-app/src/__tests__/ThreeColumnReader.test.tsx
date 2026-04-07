/**
 * ThreeColumnReader & WordPopover Tests
 * Coverage: Three-column layout, mobile/desktop mode, word popover
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { act } from 'react'
import { useDocumentStore } from '../store/useDocumentStore'

const mockGraphStoreState = {
  readerReturnTab: 'home',
  setActiveTab: vi.fn(),
}

vi.mock('../store/useGraphStore', () => ({
  useGraphStore: vi.fn((selector: any) => selector(mockGraphStoreState)),
}))

// Mock react-scroll-sync since it requires actual DOM scroll behavior
vi.mock('react-scroll-sync', () => ({
  ScrollSync: ({ children }: { children: React.ReactNode }) => <div data-testid="scroll-sync">{children}</div>,
  ScrollSyncPane: ({ children }: { children: React.ReactNode }) => <div data-testid="scroll-sync-pane">{children}</div>,
}))

describe('ThreeColumnReader', () => {
  let originalInnerWidth: number

  beforeEach(() => {
    originalInnerWidth = window.innerWidth
    useDocumentStore.getState().reset()
    vi.mocked(global.fetch).mockReset()
  })

  afterEach(() => {
    Object.defineProperty(window, 'innerWidth', {
      writable: true,
      configurable: true,
      value: originalInnerWidth,
    })
  })

  it('returns null when no document is loaded', async () => {
    const { ThreeColumnReader } = await import('../components/ThreeColumnReader')
    const { container } = render(<ThreeColumnReader />)
    expect(container.innerHTML).toBe('')
  })

  it('renders three columns on desktop (>=768px)', async () => {
    Object.defineProperty(window, 'innerWidth', {
      writable: true,
      configurable: true,
      value: 1024,
    })

    useDocumentStore.getState().setDocument({
      id: 'doc-1',
      title: 'test',
      originalText: 'original text here',
      punctuatedText: 'punctuated text here',
      translatedText: 'translated text here',
    })

    const { ThreeColumnReader } = await import('../components/ThreeColumnReader')
    const { container } = render(<ThreeColumnReader />)

    // Text is split into individual characters, so check for presence in DOM
    expect(container.textContent).toContain('original text here')
    expect(container.textContent).toContain('punctuated text here')
    expect(container.textContent).toContain('translated text here')

    // Verify three-column layout exists
    expect(screen.getByText('原文')).toBeTruthy()
    expect(screen.getByText('标点文')).toBeTruthy()
    expect(screen.getByText('白话疏解')).toBeTruthy()
    expect(screen.getAllByText('返回').length).toBeGreaterThan(0)
  })

  it('renders tab interface on mobile (<768px)', async () => {
    Object.defineProperty(window, 'innerWidth', {
      writable: true,
      configurable: true,
      value: 375,
    })

    useDocumentStore.getState().setDocument({
      id: 'doc-1',
      title: 'test',
      originalText: 'mobile original text',
      punctuatedText: 'mobile punctuated text',
      translatedText: 'mobile translated text',
    })

    const { ThreeColumnReader } = await import('../components/ThreeColumnReader')

    // Trigger resize event so component picks up new innerWidth
    render(<ThreeColumnReader />)
    act(() => {
      window.dispatchEvent(new Event('resize'))
    })

    // Tab buttons should be present
    const tabButtons = screen.getAllByRole('button')
    const tabTexts = tabButtons.map(b => b.textContent)
    expect(tabTexts).toContain('原文')
    expect(tabTexts).toContain('标点文')
    expect(tabTexts).toContain('白话疏解')
  })

  it('renders empty container when document has empty text fields', async () => {
    useDocumentStore.getState().setDocument({
      id: 'doc-empty',
      title: 'empty doc',
      originalText: '',
      punctuatedText: '',
      translatedText: '',
    })

    const { ThreeColumnReader } = await import('../components/ThreeColumnReader')
    const { container } = render(<ThreeColumnReader />)

    // Should render the layout with placeholder text for empty columns
    expect(screen.getByText('原文')).toBeTruthy()
    expect(screen.getByText('这篇内容还没有标点文')).toBeTruthy()
    expect(screen.getByText('这里还没有白话疏解')).toBeTruthy()
  })

  it('switches tabs on mobile viewport', async () => {
    Object.defineProperty(window, 'innerWidth', {
      writable: true,
      configurable: true,
      value: 375,
    })

    useDocumentStore.getState().setDocument({
      id: 'doc-tab',
      title: 'tab test',
      originalText: 'original tab content',
      punctuatedText: 'punctuated tab content',
      translatedText: 'translated tab content',
    })

    const { ThreeColumnReader } = await import('../components/ThreeColumnReader')
    const { container } = render(<ThreeColumnReader />)
    act(() => {
      window.dispatchEvent(new Event('resize'))
    })

    // Click the second tab (标点文)
    const tabButtons = screen.getAllByRole('button')
    const punctuatedTab = tabButtons.find(b => b.textContent === '标点文')
    if (punctuatedTab) {
      fireEvent.click(punctuatedTab)
    }

    // After clicking tab, the punctuated content should be visible
    expect(container.textContent).toContain('punctuated tab content')
  })

  it('returns to reader hub when opened from the reader tab', async () => {
    Object.defineProperty(window, 'innerWidth', {
      writable: true,
      configurable: true,
      value: 1024,
    })

    mockGraphStoreState.readerReturnTab = 'reader'
    useDocumentStore.getState().setDocument({
      id: 'doc-return',
      title: 'return test',
      originalText: '原文内容',
      punctuatedText: '原文内容。',
      translatedText: '解释内容',
    })

    const { ThreeColumnReader } = await import('../components/ThreeColumnReader')
    render(<ThreeColumnReader />)

    fireEvent.click(screen.getAllByText('返回')[0])

    expect(mockGraphStoreState.setActiveTab).toHaveBeenCalledWith('reader')
    expect(useDocumentStore.getState().currentDocument).toBeNull()
  })

  it('selects a sentence first and only opens AI explanation after explicit action', async () => {
    Object.defineProperty(window, 'innerWidth', {
      writable: true,
      configurable: true,
      value: 1024,
    })

    useDocumentStore.getState().setDocument({
      id: 'doc-select',
      title: 'selection test',
      originalText: '学而时习之',
      punctuatedText: '学而时习之。',
      translatedText: '学习后经常练习它。',
    })

    vi.mocked(global.fetch).mockImplementation(() => new Promise(() => {}))

    const { ThreeColumnReader } = await import('../components/ThreeColumnReader')
    const { container } = render(<ThreeColumnReader />)

    const explainButton = screen.getByRole('button', { name: /讲这句/ })
    expect(explainButton).toBeDisabled()

    fireEvent.click(screen.getByText('学而时习之'))

    expect(container.textContent).toContain('当前已选')
    expect(screen.queryByText('当前句子')).toBeNull()
    expect(screen.getByRole('button', { name: /讲这句/ })).not.toBeDisabled()

    fireEvent.click(screen.getByRole('button', { name: /讲这句/ }))

    expect(await screen.findByText('当前句子')).toBeInTheDocument()
  })
})

describe('WordPopover', () => {
  beforeEach(() => {
    vi.mocked(global.fetch).mockReset()
  })

  it('fetches and displays word explanation', async () => {
    vi.mocked(global.fetch).mockImplementation((input: any) => {
      const url = typeof input === 'string' ? input : input.url
      return Promise.resolve({
        ok: true,
        json: async () => ({
          meaning: 'the meaning of the word',
          allusion: 'a famous allusion',
          citations: [
            { title: 'Classic Text', source: 'Chapter 1' },
          ],
        }),
      } as Response)
    })

    const { WordPopover } = await import('../components/WordPopover')
    const onClose = vi.fn()
    render(<WordPopover word="test-word" onClose={onClose} position={{ x: 100, y: 200 }} />)

    await waitFor(() => {
      expect(screen.getByText('the meaning of the word')).toBeTruthy()
      expect(screen.getByText('a famous allusion')).toBeTruthy()
      expect(screen.getByText(/Classic Text/)).toBeTruthy()
    })
  })

  it('shows loading state', async () => {
    vi.mocked(global.fetch).mockImplementation(() => new Promise(() => {})) // never resolves

    const { WordPopover } = await import('../components/WordPopover')
    render(<WordPopover word="test" onClose={() => {}} position={{ x: 100, y: 200 }} />)

    expect(screen.getByText('正在查找释义...')).toBeTruthy()
  })

  it('calls onClose when close button is clicked', async () => {
    vi.mocked(global.fetch).mockImplementation((input: any) => {
      const url = typeof input === 'string' ? input : input.url
      return Promise.resolve({
        ok: true,
        json: async () => ({
          meaning: 'meaning',
          allusion: '',
          citations: [],
        }),
      } as Response)
    })

    const { WordPopover } = await import('../components/WordPopover')
    const onClose = vi.fn()
    render(<WordPopover word="test" onClose={onClose} position={{ x: 100, y: 200 }} />)

    await waitFor(() => {
      expect(screen.getByText('meaning')).toBeTruthy()
    })

    const closeButton = screen.getByRole('button', { name: /关闭/ })
    fireEvent.click(closeButton)
    expect(onClose).toHaveBeenCalled()
  })
})
