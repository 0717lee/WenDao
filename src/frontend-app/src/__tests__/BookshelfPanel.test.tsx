import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import BookshelfPanel from '../components/BookshelfPanel'

describe('BookshelfPanel', () => {
  const props = {
    onOpenDocument: vi.fn(),
    onToggleCompare: vi.fn(),
    comparedDocumentIds: [],
    onOpenCompare: vi.fn(),
  }

  beforeEach(() => {
    vi.clearAllMocks()
    ;(global.fetch as any).mockReset()
  })

  it('uses local demo bookshelf when document API is unavailable', async () => {
    ;(global.fetch as any).mockRejectedValue(new Error('network down'))

    render(<BookshelfPanel {...props} />)

    expect(await screen.findByText('体验样例 · 《论语·学而》')).toBeInTheDocument()
    expect(screen.getByText(/离线演示书架/)).toBeInTheDocument()
  })
})
