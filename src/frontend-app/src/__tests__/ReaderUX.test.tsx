import { StrictMode } from 'react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { ThreeColumnReader } from '../components/ThreeColumnReader'
import { useDocumentStore } from '../store/useDocumentStore'

const viewportWidth = window.innerWidth
beforeEach(() => {
  useDocumentStore.getState().reset()
  vi.mocked(fetch).mockImplementation(async (input) => ({
    ok: true,
    json: async () => String(input).endsWith('/note') ? { note_text: '已保存的笔记' } : String(input).endsWith('/folders') ? [] : { status: 'ok' },
  }) as Response)
})
afterEach(() => Object.defineProperty(window, 'innerWidth', { configurable: true, value: viewportWidth }))

it('opens mobile chapters and a scrollable notes dialog with the saved note', async () => {
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: 390 })
  useDocumentStore.getState().setDocument({ id: 'book', title: '论语', originalText: '学而时习之', punctuatedText: '学而时习之。', chapterTitles: ['学而'] })
  render(<ThreeColumnReader />)
  fireEvent.click(screen.getByRole('button', { name: '目录' }))
  expect(within(screen.getByRole('dialog', { name: '章节目录' })).getByText('学而')).toBeInTheDocument()
  fireEvent.click(within(screen.getByRole('dialog', { name: '章节目录' })).getByRole('button', { name: '关闭抽屉' }))
  fireEvent.click(screen.getByRole('button', { name: '阅读笔记' }))
  expect(await within(screen.getByRole('dialog', { name: '阅读笔记' })).findByDisplayValue('已保存的笔记')).toBeInTheDocument()
})

it('keeps requested notes open and preserves resume progress in StrictMode', async () => {
  useDocumentStore.getState().setDocument({ id: 'book', title: '论语', originalText: '一\n二\n三', punctuatedText: '一。\n二。\n三。' })
  useDocumentStore.getState().setPendingReaderPanel('notes')
  useDocumentStore.getState().setPendingResumeParagraph(2)
  render(<StrictMode><ThreeColumnReader /></StrictMode>)
  expect(await screen.findByDisplayValue('已保存的笔记')).toBeInTheDocument()
  expect(fetch).toHaveBeenCalledWith(expect.stringContaining('/reader/progress'), expect.objectContaining({ body: expect.stringContaining('"current_paragraph":2') }))
})

it('loads the complete document before adding a partially loaded book to comparison', async () => {
  vi.mocked(fetch).mockImplementation(async (input) => ({ ok: true, json: async () => String(input).endsWith('/documents/book')
    ? { id: 'book', title: '论语', original_text: '开篇\n末章', punctuated_text: '开篇。\n末章。' } : { status: 'ok' },
  }) as Response)
  useDocumentStore.getState().setDocument({ id: 'book', title: '论语', originalText: '开篇', punctuatedText: '开篇。', readerContent: { offset: 0, limit: 1, returned: 1, loadedSegmentCount: 1, totalSegments: 2, nextOffset: 1, hasMore: true } })
  render(<ThreeColumnReader />)
  fireEvent.click(screen.getByRole('button', { name: '加入对照' }))
  await waitFor(() => expect(useDocumentStore.getState().comparisonDocuments[0]?.originalText).toContain('末章'))
})
