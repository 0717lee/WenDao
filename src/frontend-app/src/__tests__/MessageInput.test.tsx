import { createEvent, fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { MessageInput } from '../components/MessageInput'

describe('MessageInput', () => {
  it('sends on Enter but not on Shift+Enter', () => {
    const onSend = vi.fn()

    render(
      <MessageInput
        value="请解释这句话"
        onChange={vi.fn()}
        onSend={onSend}
        disabled={false}
      />
    )

    const textarea = screen.getByPlaceholderText('贴一句原文，或提问人物、典故、概念')

    fireEvent.keyDown(textarea, { key: 'Enter' })
    fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: true })

    expect(onSend).toHaveBeenCalledTimes(1)
  })

  it('does not send while IME composition is active', () => {
    const onSend = vi.fn()

    render(
      <MessageInput
        value="学而时习之"
        onChange={vi.fn()}
        onSend={onSend}
        disabled={false}
      />
    )

    const textarea = screen.getByPlaceholderText('贴一句原文，或提问人物、典故、概念')

    fireEvent.compositionStart(textarea)
    const composingEnter = createEvent.keyDown(textarea, { key: 'Enter' })
    Object.defineProperty(composingEnter, 'isComposing', { value: true })
    fireEvent(textarea, composingEnter)
    fireEvent.compositionEnd(textarea)
    fireEvent.keyDown(textarea, { key: 'Enter' })

    expect(onSend).toHaveBeenCalledTimes(1)
  })

  it('exposes input instructions and live voice status', () => {
    render(
      <MessageInput
        value=""
        onChange={vi.fn()}
        onSend={vi.fn()}
        disabled={false}
        onVoiceToggle={vi.fn()}
        isTranscribing
      />
    )

    const textarea = screen.getByRole('textbox', { name: '消息输入' })
    expect(textarea).toHaveAttribute('aria-describedby', 'message-input-hint')

    const voiceButton = screen.getByRole('button', { name: '正在识别语音' })
    expect(voiceButton).toHaveAttribute('aria-busy', 'true')
    expect(screen.getByRole('status')).toHaveTextContent('正在识别语音')
  })

  it('exposes a cancel action while a response is pending', () => {
    const onCancel = vi.fn()

    render(
      <MessageInput
        value=""
        onChange={vi.fn()}
        onSend={vi.fn()}
        onCancel={onCancel}
        disabled
      />
    )

    fireEvent.click(screen.getByRole('button', { name: '取消生成' }))
    expect(onCancel).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('textbox')).toBeDisabled()
  })
})
