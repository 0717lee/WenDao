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
  playTTSAudio: vi.fn(),
}))

describe('ChatInterface', () => {
  beforeEach(() => {
    useStore.setState({
      messages: [],
      isLoading: false,
      currentProgress: '',
      draftMessage: '',
      ttsAutoRead: false,
    })
    useDocumentStore.getState().reset()
    useGraphStore.setState({
      activeTab: 'chat',
      pendingReaderDocId: null,
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
})
