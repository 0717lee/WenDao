import { beforeEach, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { OCRPreview } from '../components/OCRPreview'
import { useDocumentStore } from '../store/useDocumentStore'

beforeEach(() => {
  vi.mocked(fetch).mockReset()
  vi.mocked(EventSource).mockClear()
  useDocumentStore.getState().reset()
  useDocumentStore.getState().setDocument({ id: 'scan', title: '影印页', originalText: '学而时习之' })
})

it('leaving during save cancels the request and preserves an editable retry state', async () => {
  let finishSave!: (response: Response) => void
  vi.mocked(fetch).mockImplementation(() => new Promise(resolve => { finishSave = resolve }))
  const view = render(<OCRPreview />)
  fireEvent.change(screen.getByRole('textbox', { name: '校对识别文字' }), { target: { value: '学而时习之，不亦说乎？' } })
  fireEvent.click(screen.getByRole('button', { name: '继续整理这篇内容' }))
  const signal = vi.mocked(fetch).mock.calls[0][1]?.signal
  view.unmount()
  expect(signal?.aborted).toBe(true)
  await act(async () => finishSave({ ok: true } as Response))
  expect(EventSource).not.toHaveBeenCalled()
  render(<OCRPreview />)
  expect(screen.getByRole('textbox')).toHaveValue('学而时习之，不亦说乎？')
  expect(screen.getByRole('button', { name: '重新整理这篇内容' })).toBeEnabled()
})

it('closes a live processing stream on navigation and enables retry on return', async () => {
  const close = vi.fn()
  vi.mocked(EventSource).mockImplementation(function () {
    return { addEventListener: vi.fn(), close } as unknown as EventSource
  })
  vi.mocked(fetch).mockResolvedValue({ ok: true } as Response)
  const view = render(<OCRPreview />)
  await act(async () => fireEvent.click(screen.getByRole('button', { name: '继续整理这篇内容' })))
  expect(EventSource).toHaveBeenCalledTimes(1)
  view.unmount()
  expect(close).toHaveBeenCalledTimes(1)
  render(<OCRPreview />)
  expect(screen.getByRole('button', { name: '重新整理这篇内容' })).toBeEnabled()
  expect(screen.getByRole('alert')).toHaveTextContent('整理连接已关闭')
})
