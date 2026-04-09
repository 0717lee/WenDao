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

    const textarea = screen.getByPlaceholderText('输入一句原文，或提问人物、典故、概念')

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

    const textarea = screen.getByPlaceholderText('输入一句原文，或提问人物、典故、概念')

    fireEvent.compositionStart(textarea)
    const composingEnter = createEvent.keyDown(textarea, { key: 'Enter' })
    Object.defineProperty(composingEnter, 'isComposing', { value: true })
    fireEvent(textarea, composingEnter)
    fireEvent.compositionEnd(textarea)
    fireEvent.keyDown(textarea, { key: 'Enter' })

    expect(onSend).toHaveBeenCalledTimes(1)
  })
})
