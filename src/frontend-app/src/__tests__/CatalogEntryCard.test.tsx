import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { CatalogEntryCard } from '../components/bookshelf/CatalogEntryCard'

describe('CatalogEntryCard', () => {
  const baseProps = {
    title: '《论语》',
    metaLine: '经学 · 春秋 · 孔子',
    imported: false,
    importing: false,
  }

  it('keeps the import action enabled and opens the entry when clicked', () => {
    const onOpen = vi.fn()

    render(<CatalogEntryCard {...baseProps} onOpen={onOpen} />)

    const card = screen.getByRole('button', { name: '加入阅读并打开：《论语》' })
    expect(card).toBeEnabled()
    fireEvent.click(card)

    expect(onOpen).toHaveBeenCalledTimes(1)
    expect(screen.getByText('可加入阅读')).toBeInTheDocument()
  })

  it('disables the import action while showing progress and prevents duplicate opens', () => {
    const onOpen = vi.fn()

    render(<CatalogEntryCard {...baseProps} importing onOpen={onOpen} />)

    const card = screen.getByRole('button', { name: '正在加入阅读…：《论语》' })
    expect(card).toBeDisabled()
    expect(card).toHaveAttribute('aria-busy', 'true')
    expect(screen.getByRole('status')).toHaveTextContent('正在加入阅读…')

    fireEvent.click(card)
    expect(onOpen).not.toHaveBeenCalled()
  })

  it('keeps imported entries openable and exposes import errors', () => {
    const onOpen = vi.fn()

    render(
      <CatalogEntryCard
        {...baseProps}
        imported
        error="加入阅读没有成功，请稍后再试一次。"
        onOpen={onOpen}
      />,
    )

    const card = screen.getByRole('button', { name: '打开此篇：《论语》' })
    expect(card).toBeEnabled()
    expect(screen.getByRole('alert')).toHaveTextContent('加入阅读没有成功，请稍后再试一次。')

    fireEvent.click(card)
    expect(onOpen).toHaveBeenCalledTimes(1)
  })
})
