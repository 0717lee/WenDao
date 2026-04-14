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

    // Verify three-column layout exists
    expect(screen.getByText('原文')).toBeTruthy()
    expect(screen.getByText('标点文')).toBeTruthy()
    expect(screen.queryByText('白话解读')).toBeNull()
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
    expect(tabTexts).not.toContain('白话解读')
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

  it('does not render a translation column even if translated text is present', async () => {
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
      translatedText: '这里有翻译内容',
    })

    const { ThreeColumnReader } = await import('../components/ThreeColumnReader')
    render(<ThreeColumnReader />)

    expect(screen.getByText('原文')).toBeInTheDocument()
    expect(screen.getByText('标点文')).toBeInTheDocument()
    expect(screen.queryByText('白话解读')).toBeNull()
  })

  it('shows a sync-scroll toggle on desktop readers', async () => {
    Object.defineProperty(window, 'innerWidth', {
      writable: true,
      configurable: true,
      value: 1024,
    })

    useDocumentStore.getState().setDocument({
      id: 'doc-sync-toggle',
      title: 'sync toggle test',
      originalText: '第一段原文\n第二段原文',
      punctuatedText: '第一段原文。\n第二段原文。',
      translatedText: '',
    })

    const { ThreeColumnReader } = await import('../components/ThreeColumnReader')
    render(<ThreeColumnReader />)

    expect(screen.getByRole('button', { name: '同步滚动：开' })).toBeInTheDocument()
  })

  it('lets people add the current document to comparison from the reader page', async () => {
    Object.defineProperty(window, 'innerWidth', {
      writable: true,
      configurable: true,
      value: 1024,
    })

    useDocumentStore.getState().setDocument({
      id: 'doc-compare-entry',
      title: 'compare entry',
      originalText: '原文内容',
      punctuatedText: '原文内容。',
      translatedText: '',
    })

    const { ThreeColumnReader } = await import('../components/ThreeColumnReader')
    render(<ThreeColumnReader />)

    fireEvent.click(screen.getByRole('button', { name: '加入对照' }))

    expect(useDocumentStore.getState().comparisonDocuments.map((item) => item.id)).toContain('doc-compare-entry')
    expect(screen.getByText('这篇已加入对照，再选一篇就能并排阅读。')).toBeInTheDocument()
  })

  it('opens compare view from the reader page when comparison content exists', async () => {
    Object.defineProperty(window, 'innerWidth', {
      writable: true,
      configurable: true,
      value: 1024,
    })

    useDocumentStore.getState().setDocument({
      id: 'doc-compare-open',
      title: 'compare open',
      originalText: '当前文档原文',
      punctuatedText: '当前文档原文。',
      translatedText: '',
    })
    useDocumentStore.getState().toggleComparisonDocument({
      id: 'other-doc',
      title: 'other',
      originalText: '另一篇',
      punctuatedText: '另一篇。',
      translatedText: '',
    })

    const { ThreeColumnReader } = await import('../components/ThreeColumnReader')
    render(<ThreeColumnReader />)

    fireEvent.click(screen.getByRole('button', { name: '去对照阅读' }))

    expect(mockGraphStoreState.setActiveTab).toHaveBeenCalledWith('compare')
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

  it('only renders the initial visible slice for very large documents', async () => {
    Object.defineProperty(window, 'innerWidth', {
      writable: true,
      configurable: true,
      value: 1024,
    })

    const originalLines = Array.from({ length: 500 }, (_, index) => `原文段落-${index + 1}`)
    const punctuatedLines = Array.from({ length: 500 }, (_, index) => `标点段落-${index + 1}。`)

    useDocumentStore.getState().setDocument({
      id: 'doc-large',
      title: 'large doc',
      originalText: originalLines.join('\n'),
      punctuatedText: punctuatedLines.join('\n'),
      translatedText: '',
    })

    const { ThreeColumnReader } = await import('../components/ThreeColumnReader')
    render(<ThreeColumnReader />)

    await waitFor(() => {
      expect(screen.getAllByText('原文段落-1').length).toBeGreaterThan(0)
    })
    expect(screen.queryByText('原文段落-500')).toBeNull()
    expect(screen.queryByText('标点段落-500。')).toBeNull()
  })

  it('loads the next segment window when scrolling near the bottom of a lazy reader payload', async () => {
    Object.defineProperty(window, 'innerWidth', {
      writable: true,
      configurable: true,
      value: 1024,
    })

    vi.mocked(global.fetch).mockImplementation((input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString()
      if (url.includes('/reader/segments')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            segments: [
              { index: 2, title: '第三节', text: '后续独有内容甲。', line_count: 1, char_count: 7 },
              { index: 3, title: '第四节', text: '后续独有内容乙。', line_count: 1, char_count: 7 },
            ],
            original_text: '后续独有内容甲\n\n后续独有内容乙',
            punctuated_text: '后续独有内容甲。\n\n后续独有内容乙。',
            translated_text: '',
            reader_content: {
              offset: 2,
              limit: 2,
              returned: 2,
              loaded_segment_count: 4,
              total_segments: 4,
              next_offset: null,
              has_more: false,
            },
          }),
        } as Response)
      }

      return Promise.resolve({
        ok: true,
        json: async () => ({ status: 'ok' }),
      } as Response)
    })

    useDocumentStore.getState().setDocument({
      id: 'doc-lazy-reader',
      title: 'lazy reader',
      sourceType: 'corpus',
      originalText: '第一段原文\n第二段原文',
      punctuatedText: '第一段原文。\n第二段原文。',
      translatedText: '',
      readerContent: {
        offset: 0,
        limit: 2,
        returned: 2,
        loadedSegmentCount: 2,
        totalSegments: 4,
        nextOffset: 2,
        hasMore: true,
      },
      segments: [
        { index: 0, title: '第一节', text: '第一段原文。', excerpt: '第一段原文', summary: '第一节', lineCount: 1, charCount: 6 },
        { index: 1, title: '第二节', text: '第二段原文。', excerpt: '第二段原文', summary: '第二节', lineCount: 1, charCount: 6 },
        { index: 2, title: '第三节', text: '', excerpt: '后续独有内容甲', summary: '第三节', lineCount: 1, charCount: 7 },
        { index: 3, title: '第四节', text: '', excerpt: '后续独有内容乙', summary: '第四节', lineCount: 1, charCount: 7 },
      ],
    })

    const { ThreeColumnReader } = await import('../components/ThreeColumnReader')
    render(<ThreeColumnReader />)

    const originalColumn = screen.getByTestId('reader-column-original')
    Object.defineProperty(originalColumn, 'clientHeight', { configurable: true, value: 240 })
    Object.defineProperty(originalColumn, 'scrollHeight', { configurable: true, value: 1000 })
    Object.defineProperty(originalColumn, 'scrollTop', { configurable: true, writable: true, value: 780 })

    fireEvent.scroll(originalColumn)

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/v1/documents/doc-lazy-reader/reader/segments?offset=2&limit=2'),
        expect.anything(),
      )
    })

    await waitFor(() => {
      expect(useDocumentStore.getState().currentDocument?.readerContent?.loadedSegmentCount).toBe(4)
    })
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
