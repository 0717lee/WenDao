import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { MessageList } from '../components/MessageList'
import type { Message } from '../store/useStore'

const assistantMessage = (overrides: Partial<Message> = {}): Message => ({
  id: 'assistant-1',
  role: 'assistant',
  content: '回答内容',
  timestamp: 1,
  ...overrides,
})

describe('MessageList', () => {
  it('renders answer context actions and forwards the selected action', () => {
    const onAnswerContextAction = vi.fn()
    const action = {
      id: 'search-source',
      label: '查看原文',
      kind: 'search' as const,
      query: '学而时习之',
    }

    render(
      <MessageList
        messages={[
          assistantMessage({
            answerContext: {
              trustLabel: '有依据',
              trustPoints: ['已找到相关原文'],
              citationCount: 1,
              relatedEntityCount: 0,
              suggestedActions: [action],
            },
          }),
        ]}
        onAnswerContextAction={onAnswerContextAction}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: '查看原文' }))

    expect(screen.getByText('回答依据')).toBeInTheDocument()
    expect(onAnswerContextAction).toHaveBeenCalledWith(action)
  })

  it('keeps the loading status flexible inside a narrow message bubble', () => {
    render(
      <MessageList
        loadingLabel="正在查找原文..."
        messages={[assistantMessage({ content: '' })]}
      />
    )

    const status = screen.getByRole('status')
    expect(status).toHaveTextContent('正在查找原文...')
    expect(status.parentElement).toHaveClass('w-full', 'min-w-0')
    expect(status.parentElement).not.toHaveClass('min-w-[18rem]')
    expect(screen.getByRole('log')).toHaveAttribute('aria-busy', 'true')
  })
})
