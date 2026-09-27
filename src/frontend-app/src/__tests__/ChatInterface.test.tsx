import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { ChatInterface } from '../components/ChatInterface'
import { useStore } from '../store/useStore'
import { useDocumentStore } from '../store/useDocumentStore'
import { useGraphStore } from '../store/useGraphStore'

vi.mock('../components/AudioRecorder', () => ({
  useVoiceRecorder: () => ({
    isRecording: false,
    isTranscribing: false,
    toggleRecording: vi.fn(),
  }),
}))

describe('ChatInterface', () => {
  beforeEach(() => {
    useStore.setState({
      messages: [],
      isLoading: false,
      currentProgress: '',
      draftMessage: '',
    })
    useDocumentStore.getState().reset()
    useGraphStore.setState({
      activeTab: 'chat',
      pendingSearchQuery: '',
      readerReturnTab: null,
    })
    vi.mocked(global.fetch).mockReset()
  })

  it('renders the reading guidance and quick prompts when empty', () => {
    render(<ChatInterface />)

    expect(screen.getByRole('heading', { name: '从一句原文问起' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '转到原文检索' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '解释：学而时习之，不亦说乎？' })).toBeInTheDocument()
    expect(screen.getAllByText(/Enter 发送，Shift \+ Enter 换行。/)).toHaveLength(1)
  })

  it('prefills the composer from draft message state', () => {
    useStore.setState({ draftMessage: '请解释这句话' })

    render(<ChatInterface />)

    expect(screen.getByPlaceholderText('贴一句原文，或提问人物、典故、概念')).toHaveValue('请解释这句话')
  })

  it('fills the composer when clicking a quick prompt', () => {
    render(<ChatInterface />)

    fireEvent.click(screen.getByRole('button', { name: '对比：孔孟之别' }))

    expect(screen.getByPlaceholderText('贴一句原文，或提问人物、典故、概念')).toHaveValue('对比：孔孟之别')
  })

  it('clears loading when a poem stream ends without a terminal event', async () => {
    const reader = { read: vi.fn().mockResolvedValue({ done: true }) }
    vi.mocked(global.fetch).mockResolvedValue({
      ok: true,
      body: { getReader: () => reader },
    } as unknown as Response)

    render(<ChatInterface />)
    fireEvent.change(screen.getByRole('textbox'), {
      target: { value: '生成诗词：春天' },
    })
    fireEvent.click(screen.getByRole('button', { name: '发送' }))

    expect(useStore.getState().isLoading).toBe(true)
    await waitFor(() => expect(useStore.getState().isLoading).toBe(false))
  })

  it('shows non-success response details and routes the search fallback', async () => {
    vi.mocked(global.fetch).mockResolvedValue({
      ok: false,
      status: 503,
      json: async () => ({ detail: '问答服务正在维护' }),
    } as unknown as Response)

    render(<ChatInterface />)
    fireEvent.change(screen.getByRole('textbox'), { target: { value: '学而时习之是什么意思？' } })
    fireEvent.click(screen.getByRole('button', { name: '发送' }))

    expect(await screen.findByText('问答服务正在维护')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '转到原文检索' }))

    expect(useGraphStore.getState().activeTab).toBe('search')
    expect(useGraphStore.getState().pendingSearchQuery).toBe('学而时习之是什么意思？')
  })

  it('retries the original prompt from the failure action', async () => {
    const successfulReader = {
      read: vi.fn()
        .mockResolvedValueOnce({
          done: false,
          value: new TextEncoder().encode('data: {"content":"重试成功"}\n\nevent: done\ndata: {}\n\n'),
        })
        .mockResolvedValueOnce({ done: true }),
    }
    vi.mocked(global.fetch)
      .mockResolvedValueOnce({
        ok: false,
        status: 503,
        json: async () => ({ detail: '暂时不可用' }),
      } as unknown as Response)
      .mockResolvedValueOnce({
        ok: true,
        body: { getReader: () => successfulReader },
      } as unknown as Response)

    render(<ChatInterface />)
    fireEvent.change(screen.getByRole('textbox'), { target: { value: '请再试一次' } })
    fireEvent.click(screen.getByRole('button', { name: '发送' }))
    await screen.findByText('暂时不可用')

    fireEvent.click(screen.getByRole('button', { name: '重新提问' }))

    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(2))
    expect(await screen.findByText('重试成功')).toBeInTheDocument()
  })

  it('allows a pending response to be cancelled and releases the request', async () => {
    let capturedInit: RequestInit | undefined
    const reader = {
      read: vi.fn(() => new Promise<never>(() => {})),
      cancel: vi.fn().mockResolvedValue(undefined),
    }
    vi.mocked(global.fetch).mockImplementation((_url, init) => {
      capturedInit = init
      return Promise.resolve({ ok: true, body: { getReader: () => reader } } as unknown as Response)
    })

    render(<ChatInterface />)
    fireEvent.change(screen.getByRole('textbox'), { target: { value: '请解释这句话' } })
    fireEvent.click(screen.getByRole('button', { name: '发送' }))

    const cancelButton = await screen.findByRole('button', { name: '取消生成' })
    fireEvent.click(cancelButton)

    expect((capturedInit?.signal as AbortSignal).aborted).toBe(true)
    expect(reader.cancel).toHaveBeenCalled()
    expect(useStore.getState().isLoading).toBe(false)
    expect(screen.getByText('已取消本次回答。')).toBeInTheDocument()
  })

  it('aborts an in-flight request when the chat view unmounts', async () => {
    let capturedInit: RequestInit | undefined
    const reader = {
      read: vi.fn(() => new Promise<never>(() => {})),
      cancel: vi.fn().mockResolvedValue(undefined),
    }
    vi.mocked(global.fetch).mockImplementation((_url, init) => {
      capturedInit = init
      return Promise.resolve({ ok: true, body: { getReader: () => reader } } as unknown as Response)
    })

    const view = render(<ChatInterface />)
    fireEvent.change(screen.getByRole('textbox'), { target: { value: '离开页面的问题' } })
    fireEvent.click(screen.getByRole('button', { name: '发送' }))
    await screen.findByRole('button', { name: '取消生成' })

    view.unmount()

    expect((capturedInit?.signal as AbortSignal).aborted).toBe(true)
    expect(reader.cancel).toHaveBeenCalled()
    expect(useStore.getState().isLoading).toBe(false)
    render(<ChatInterface />)
    expect(screen.getByText('已停止本次回答，可以重新提问。')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '重新提问' })).toBeEnabled()
  })

  it('turns an empty chat stream into a visible retry state', async () => {
    const reader = { read: vi.fn().mockResolvedValue({ done: true }) }
    vi.mocked(global.fetch).mockResolvedValue({
      ok: true,
      body: { getReader: () => reader },
    } as unknown as Response)

    render(<ChatInterface />)
    fireEvent.change(screen.getByRole('textbox'), { target: { value: '没有内容的问题' } })
    fireEvent.click(screen.getByRole('button', { name: '发送' }))

    expect(await screen.findByText('问答服务没有返回内容，请重试，或先改用原文检索。')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '重新提问' })).toBeInTheDocument()
  })

  it('marks a non-empty stream without done as interrupted', async () => {
    const reader = { read: vi.fn()
      .mockResolvedValueOnce({ done: false, value: new TextEncoder().encode('data: {"content":"半句回答"}\n\n') })
      .mockResolvedValueOnce({ done: true }) }
    vi.mocked(fetch).mockResolvedValue({ ok: true, body: { getReader: () => reader } } as unknown as Response)
    render(<ChatInterface />)
    fireEvent.change(screen.getByRole('textbox'), { target: { value: '回答这个问题' } })
    fireEvent.click(screen.getByRole('button', { name: '发送' }))
    expect(await screen.findByText('回答中断，内容可能不完整，请重新提问。')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '重新提问' })).toBeEnabled()
  })

  it('processes a final SSE content line without a trailing newline', async () => {
    const reader = {
      read: vi.fn()
        .mockResolvedValueOnce({
          done: false,
          value: new TextEncoder().encode('data: {"content":"尾部回答"}\n\nevent: done\ndata: {}'),
        })
        .mockResolvedValueOnce({ done: true }),
    }
    vi.mocked(global.fetch).mockResolvedValue({
      ok: true,
      body: { getReader: () => reader },
    } as unknown as Response)

    render(<ChatInterface />)
    fireEvent.change(screen.getByRole('textbox'), { target: { value: '尾部问题' } })
    fireEvent.click(screen.getByRole('button', { name: '发送' }))

    expect(await screen.findByText('尾部回答')).toBeInTheDocument()
  })
})
