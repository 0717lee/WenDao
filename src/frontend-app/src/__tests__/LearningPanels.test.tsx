import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { StudyCardsPanel } from '../components/StudyCardsPanel'
import WordbookPanel from '../components/WordbookPanel'
import { ReaderNotesPanel } from '../components/ReaderNotesPanel'
import { WordPopover } from '../components/WordPopover'

const ok = (data: unknown) => ({ ok: true, json: async () => data }) as Response
const failed = () => ({ ok: false, json: async () => ({ detail: 'failed' }) }) as Response

describe('learning panels', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(global.fetch).mockReset()
  })

  it('tracks each study card once, completes the round, and resets counters explicitly', async () => {
    const progressPosts: Array<Record<string, unknown>> = []
    vi.mocked(global.fetch).mockImplementation(async (input, init) => {
      const url = String(input)
      if (url.includes('/study-cards')) return ok({
        cards: [
          { id: 'card-1', front: '第一句', back: '译文一', hint: '提示一' },
          { id: 'card-2', front: '第二句', back: '译文二', hint: '提示二' },
        ],
        quiz: [],
      })
      if (url.includes('/study-progress') && init?.method === 'POST') {
        progressPosts.push(JSON.parse(String(init.body)))
        return ok({})
      }
      if (url.includes('/study-progress')) return ok({ sessions_count: 0, mastery_rate: 0, last_reviewed_at: null })
      return failed()
    })

    render(<StudyCardsPanel documentId="doc-1" />)
    expect(await screen.findByText('卡片 1 / 2')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '我已掌握' }))
    expect(await screen.findByText('卡片 2 / 2')).toBeInTheDocument()
    expect(screen.getByText(/本轮已完成 1 \/ 2 张/)).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '需要复习' }))
    expect(await screen.findByText('这一轮复习完成了')).toBeInTheDocument()
    expect(progressPosts).toHaveLength(1)
    expect(progressPosts[0]).toEqual({
      session_id: expect.any(String),
      completed_cards: 2,
      total_cards: 2,
      mastered_cards: 1,
      review_again_cards: 1,
    })
    expect(progressPosts[0].session_id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    )

    fireEvent.click(screen.getByRole('button', { name: '再复习一遍' }))
    expect(await screen.findByText('卡片 1 / 2')).toBeInTheDocument()
    expect(screen.getByText(/本轮已完成 0 \/ 2 张/)).toBeInTheDocument()
  })

  it('surfaces a failed study save and retries the same card totals', async () => {
    let postAttempts = 0
    const progressPosts: Array<Record<string, unknown>> = []
    vi.mocked(global.fetch).mockImplementation(async (input, init) => {
      const url = String(input)
      if (url.includes('/study-cards')) return ok({ cards: [{ id: 'card-1', front: '第一句', back: '译文一', hint: '提示一' }], quiz: [] })
      if (url.includes('/study-progress') && init?.method === 'POST') {
        postAttempts += 1
        progressPosts.push(JSON.parse(String(init.body)))
        return postAttempts === 1 ? failed() : ok({})
      }
      if (url.includes('/study-progress')) return ok({ sessions_count: 0, mastery_rate: 0, last_reviewed_at: null })
      return failed()
    })

    render(<StudyCardsPanel documentId="doc-1" />)
    fireEvent.click(await screen.findByRole('button', { name: '我已掌握' }))
    expect(await screen.findByText('本轮结果没有保存成功，请重试。')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '重试保存' }))
    expect(await screen.findByText('这一轮复习完成了')).toBeInTheDocument()
    expect(postAttempts).toBe(2)
    expect(progressPosts[0].session_id).toBe(progressPosts[1].session_id)
  })

  it('shows wordbook load and delete failures instead of emptying the view', async () => {
    let shouldLoad = false
    vi.mocked(global.fetch).mockImplementation(async (input, init) => {
      const url = String(input)
      if (url.includes('/api/v1/reader/wordbook?')) return shouldLoad
        ? ok({ entries: [{ id: 'entry-1', word: '仁', meaning: '仁爱', allusion: '', citations: [] }] })
        : failed()
      if (url.includes('/api/v1/reader/wordbook/entry-1') && init?.method === 'DELETE') return failed()
      return failed()
    })

    render(<WordbookPanel onAskAboutWord={vi.fn()} />)
    expect(await screen.findByText('字词记录加载失败，请重试。')).toBeInTheDocument()

    shouldLoad = true
    fireEvent.click(screen.getByRole('button', { name: '重试加载' }))
    expect(await screen.findByText('仁')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '删除仁' }))
    expect(await screen.findByText('删除没有成功，请重试。')).toBeInTheDocument()
    expect(screen.getByText('仁')).toBeInTheDocument()
  })

  it('keeps notes read-only until loaded and reports save failures', async () => {
    let shouldLoad = false
    vi.mocked(global.fetch).mockImplementation(async (input, init) => {
      const url = String(input)
      if (url.includes('/api/v1/documents/doc-1/note') && init?.method === 'PUT') return failed()
      if (url.includes('/api/v1/documents/doc-1/note')) return shouldLoad ? ok({ note_text: '已有笔记' }) : failed()
      if (url.includes('/api/v1/reader/folders')) return ok([])
      return failed()
    })

    render(<ReaderNotesPanel documentId="doc-1" documentTitle="论语" />)
    const textbox = screen.getByRole('textbox')
    expect(textbox).toBeDisabled()
    expect(await screen.findByText('阅读笔记加载失败，暂时不能编辑，请重试。')).toBeInTheDocument()

    shouldLoad = true
    fireEvent.click(screen.getByRole('button', { name: '重试加载' }))
    expect(await screen.findByDisplayValue('已有笔记')).toBeEnabled()

    fireEvent.change(screen.getByRole('textbox'), { target: { value: '新的笔记' } })
    fireEvent.click(screen.getByRole('button', { name: '保存笔记' }))
    await waitFor(() => expect(screen.getByText('笔记没保存成功，请稍后再试一次')).toBeInTheDocument())
  })

  it('reports wordbook save failures and closes the popover with Escape', async () => {
    const onClose = vi.fn()
    vi.mocked(global.fetch).mockImplementation(async (input) => {
      const url = String(input)
      if (url.includes('/api/v1/documents/explain')) return ok({ meaning: '仁爱', allusion: '', citations: [] })
      if (url.includes('/api/v1/reader/wordbook')) return failed()
      return failed()
    })

    render(<WordPopover word="仁" position={{ x: 20, y: 20 }} onClose={onClose} />)
    expect(await screen.findByText('仁爱')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '加入字词记录' }))
    expect(await screen.findByText('加入字词记录没有成功，请重试。')).toBeInTheDocument()

    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalled()
  })
})
