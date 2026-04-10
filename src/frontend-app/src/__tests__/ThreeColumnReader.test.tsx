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
    vi.useRealTimers()
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
    expect(screen.getByText('白话解读')).toBeTruthy()
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
    expect(tabTexts).toContain('白话解读')
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
    expect(screen.getByText('这篇内容还没整理出标点文')).toBeTruthy()
    expect(screen.queryByText('白话解读')).toBeNull()
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

  it('hides the translation column when there is no full translated text', async () => {
    Object.defineProperty(window, 'innerWidth', {
      writable: true,
      configurable: true,
      value: 1024,
    })

    useDocumentStore.getState().setDocument({
      id: 'doc-no-translation',
      title: 'no translation',
      originalText: '原文内容',
      punctuatedText: '原文内容。',
      translatedText: '',
    })

    const { ThreeColumnReader } = await import('../components/ThreeColumnReader')
    render(<ThreeColumnReader />)

    expect(screen.getByText('原文')).toBeInTheDocument()
    expect(screen.getByText('标点文')).toBeInTheDocument()
    expect(screen.queryByText('白话解读')).toBeNull()
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

  it('persists initial reading progress when a document opens', async () => {
    vi.useFakeTimers()
    Object.defineProperty(window, 'innerWidth', {
      writable: true,
      configurable: true,
      value: 1024,
    })

    vi.mocked(global.fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ status: 'ok' }),
    } as Response)

    useDocumentStore.getState().setDocument({
      id: 'doc-progress',
      title: 'progress test',
      originalText: '原文内容',
      punctuatedText: '原文内容。',
      translatedText: '解释内容',
    })

    const { ThreeColumnReader } = await import('../components/ThreeColumnReader')
    render(<ThreeColumnReader />)

    act(() => {
      vi.advanceTimersByTime(250)
    })

    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/v1/reader/progress'),
      expect.objectContaining({ method: 'POST' }),
    )
  })

  it('scrolls to the saved paragraph when resuming reading', async () => {
    Object.defineProperty(window, 'innerWidth', {
      writable: true,
      configurable: true,
      value: 1024,
    })

    const scrollSpy = vi.spyOn(Element.prototype, 'scrollIntoView')

    useDocumentStore.getState().setPendingResumeParagraph(2)
    useDocumentStore.getState().setDocument({
      id: 'doc-resume',
      title: 'resume test',
      originalText: '第一段原文\n第二段原文\n第三段原文',
      punctuatedText: '第一段原文。\n第二段原文。\n第三段原文。',
      translatedText: '第一段白话。\n第二段白话。\n第三段白话。',
    })

    const { ThreeColumnReader } = await import('../components/ThreeColumnReader')
    render(<ThreeColumnReader />)

    await waitFor(() => {
      expect(scrollSpy).toHaveBeenCalled()
    })

    scrollSpy.mockRestore()
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

    const explainButton = screen.getByRole('button', { name: /讲解此句/ })
    expect(explainButton).toBeDisabled()

    fireEvent.click(screen.getByText('学而时习之'))

    expect(container.textContent).toContain('当前选中')
    expect(screen.queryByText('当前句子')).toBeNull()
    expect(screen.getByRole('button', { name: /讲解此句/ })).not.toBeDisabled()

    fireEvent.click(screen.getByRole('button', { name: /讲解此句/ }))

    expect(await screen.findByText('当前句子')).toBeInTheDocument()
  })

  it('keeps reader text selectable for drag lookup', async () => {
    Object.defineProperty(window, 'innerWidth', {
      writable: true,
      configurable: true,
      value: 1024,
    })

    useDocumentStore.getState().setDocument({
      id: 'doc-selectable',
      title: 'selectable test',
      originalText: '子曰学而时习之',
      punctuatedText: '子曰：学而时习之。',
      translatedText: '孔子说，学习后经常温习它。',
    })

    const { ThreeColumnReader } = await import('../components/ThreeColumnReader')
    render(<ThreeColumnReader />)

    const originalSentence = screen.getByText('子曰学而时习之')
    expect(originalSentence).toHaveStyle({
      userSelect: 'text',
      WebkitUserSelect: 'text',
      cursor: 'text',
    })
  })

  it('keeps the study cards action visible in the reader guide area', async () => {
    Object.defineProperty(window, 'innerWidth', {
      writable: true,
      configurable: true,
      value: 1024,
    })

    useDocumentStore.getState().setDocument({
      id: 'doc-study',
      title: 'study test',
      originalText: '原文内容',
      punctuatedText: '原文内容。',
      translatedText: '解释内容',
    })

    const { ThreeColumnReader } = await import('../components/ThreeColumnReader')
    render(<ThreeColumnReader />)

    expect(screen.getByRole('button', { name: '学习卡片' })).toBeInTheDocument()
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
    })
  })

  it('shows loading state', async () => {
    vi.mocked(global.fetch).mockImplementation(() => new Promise(() => {})) // never resolves

    const { WordPopover } = await import('../components/WordPopover')
    render(<WordPopover word="test" onClose={() => {}} position={{ x: 100, y: 200 }} />)

    expect(screen.getByText('正在查找这个词的释义...')).toBeTruthy()
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
