import { beforeEach, describe, expect, it } from 'vitest'
import { useStore } from '../store/useStore'

describe('useStore', () => {
  beforeEach(() => {
    useStore.setState({
      messages: [],
      isLoading: false,
      currentProgress: '',
      draftMessage: '',
      ttsAutoRead: false,
    })
  })

  it('adds a message to the store', () => {
    useStore.getState().addMessage({
      id: 'msg-1',
      role: 'user',
      content: '测试消息',
      timestamp: Date.now(),
    })

    expect(useStore.getState().messages).toHaveLength(1)
    expect(useStore.getState().messages[0].content).toBe('测试消息')
  })

  it('updates only the last message during streaming', () => {
    useStore.getState().addMessage({
      id: 'msg-1',
      role: 'user',
      content: '提问',
      timestamp: Date.now(),
    })
    useStore.getState().addMessage({
      id: 'msg-2',
      role: 'assistant',
      content: '',
      timestamp: Date.now(),
    })

    useStore.getState().updateLastMessage('流式回答')

    expect(useStore.getState().messages).toHaveLength(2)
    expect(useStore.getState().messages[0].content).toBe('提问')
    expect(useStore.getState().messages[1].content).toBe('流式回答')
  })

  it('stores answer context and progress state', () => {
    useStore.getState().addMessage({
      id: 'msg-1',
      role: 'assistant',
      content: '回答',
      timestamp: Date.now(),
    })

    useStore.getState().updateLastMessageAnswerContext({
      trustLabel: '有原文依据',
      trustPoints: ['引用了 1 条古籍片段'],
      citationCount: 1,
      relatedEntityCount: 2,
      primaryCitation: { title: '论语', source: '学而篇' },
      suggestedActions: [],
    })
    useStore.getState().setProgress('正在检索古籍...')

    expect(useStore.getState().messages[0].answerContext?.trustLabel).toBe('有原文依据')
    expect(useStore.getState().currentProgress).toBe('正在检索古籍...')
  })
})
