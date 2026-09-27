import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
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

  it('shows a visible corpus error and retry action when document API is unavailable', async () => {
    ;(global.fetch as any).mockRejectedValue(new Error('network down'))

    render(<BookshelfPanel {...props} />)

    expect(await screen.findByText('古籍库暂时无法加载，请重试。')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '重试加载精选篇目' })).toBeInTheDocument()
  })

  it('shows an empty continue-reading state for accounts with no reading history', async () => {
    ;(global.fetch as any).mockImplementation((url: string) => {
      if (url.includes('/api/v1/documents?limit=120&source_type=corpus')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            documents: [
              {
                id: 'corpus-1',
                title: '《论语》',
                preview: '学而时习之',
                has_processed: true,
                has_note: false,
                status: 'done',
                current_paragraph: 0,
                total_paragraphs: 6,
                source_type: 'corpus',
              },
            ],
            total: 1,
          }),
        })
      }

      if (url.includes('/api/v1/reader/history')) {
        return Promise.resolve({ ok: true, json: async () => [] })
      }

      if (url.includes('/api/v1/documents/catalog?')) {
        return Promise.resolve({ ok: true, json: async () => ({ entries: [], total: 0 }) })
      }

      return Promise.resolve({ ok: true, json: async () => ({ documents: [], total: 0 }) })
    })

    render(<BookshelfPanel {...props} />)

    expect(await screen.findByText('精选篇目')).toBeInTheDocument()
    expect(screen.queryByText(/最近阅读：/)).not.toBeInTheDocument()
    expect(screen.queryByText('第一次使用时，可以先打开推荐内容；遇到不懂的地方，再逐句查看解释。')).not.toBeInTheDocument()
  })

  it('uses the top starting cards and secondary quick links as real actions', async () => {
    ;(global.fetch as any).mockImplementation((url: string) => {
      if (url.includes('/api/v1/documents?limit=120&source_type=corpus')) {
        return Promise.resolve({ ok: true, json: async () => ({ documents: [], total: 0 }) })
      }

      if (url.includes('/api/v1/reader/history')) {
        return Promise.resolve({
          ok: true,
          json: async () => [
            { id: 'history-doc-1', title: '《庄子》', current_paragraph: 3, total_paragraphs: 9, last_read_at: '2026-04-07T00:00:00Z' },
          ],
        })
      }

      if (url.includes('/api/v1/documents/catalog?')) {
        return Promise.resolve({ ok: true, json: async () => ({ entries: [], total: 0 }) })
      }

      return Promise.resolve({ ok: true, json: async () => ({ documents: [], total: 0 }) })
    })

    render(<BookshelfPanel {...props} comparedDocumentIds={['user-doc-1']} />)

    fireEvent.click(await screen.findByRole('button', { name: /回到上次进度/i }))
    expect(props.onOpenDocument).toHaveBeenCalledWith('history-doc-1', { resumeParagraph: 3 })

    fireEvent.click(screen.getByRole('button', { name: /^对照阅读$/ }))
    expect(props.onOpenCompare).toHaveBeenCalled()
  })

  it('keeps the most recent history item visible inside 最近读过 when there are multiple records', async () => {
    ;(global.fetch as any).mockImplementation((url: string) => {
      if (url.includes('/api/v1/documents?limit=120&source_type=corpus')) {
        return Promise.resolve({ ok: true, json: async () => ({ documents: [], total: 0 }) })
      }

      if (url.includes('/api/v1/reader/history')) {
        return Promise.resolve({
          ok: true,
          json: async () => [
            { id: 'history-doc-1', title: '《世说新语》', current_paragraph: 8, total_paragraphs: 20, last_read_at: '2026-04-14T00:00:00Z' },
            { id: 'history-doc-2', title: '《神仙传》', current_paragraph: 3, total_paragraphs: 11, last_read_at: '2026-04-12T00:00:00Z' },
          ],
        })
      }

      if (url.includes('/api/v1/documents/catalog?')) {
        return Promise.resolve({ ok: true, json: async () => ({ entries: [], total: 0 }) })
      }

      return Promise.resolve({ ok: true, json: async () => ({ documents: [], total: 0 }) })
    })

    render(<BookshelfPanel {...props} />)

    expect(await screen.findByText('《世说新语》')).toBeInTheDocument()
    expect(screen.getByText('最近读过')).toBeInTheDocument()
    expect(screen.getByText('《神仙传》')).toBeInTheDocument()
  })

  it('keeps featured picks diverse for 全部 and narrows after selecting a category', async () => {
    ;(global.fetch as any).mockImplementation((url: string) => {
      if (url.includes('/api/v1/documents?limit=120&source_type=corpus')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            documents: [
              { id: 'a', title: '《玉台新咏》', category: '文学总集', difficulty: '入门', preview: '宫体诗文选本', has_processed: true, has_note: false, status: 'done', current_paragraph: 0, total_paragraphs: 6, source_type: 'corpus' },
              { id: 'b', title: '《国秀集》', category: '文学总集', difficulty: '进阶', preview: '唐诗总集', has_processed: true, has_note: false, status: 'done', current_paragraph: 0, total_paragraphs: 6, source_type: 'corpus' },
              { id: 'c', title: '《史记》', category: '史书', difficulty: '入门', preview: '人物传记', has_processed: true, has_note: false, status: 'done', current_paragraph: 0, total_paragraphs: 6, source_type: 'corpus' },
              { id: 'd', title: '《论语》', category: '四书', difficulty: '入门', preview: '儒家入门', has_processed: true, has_note: false, status: 'done', current_paragraph: 0, total_paragraphs: 6, source_type: 'corpus' },
              { id: 'e', title: '《道德经》', category: '道家', difficulty: '入门', preview: '道家短章', has_processed: true, has_note: false, status: 'done', current_paragraph: 0, total_paragraphs: 6, source_type: 'corpus' },
            ],
            total: 5,
          }),
        })
      }
      if (url.includes('/api/v1/reader/history')) {
        return Promise.resolve({ ok: true, json: async () => [] })
      }
      return Promise.resolve({ ok: true, json: async () => ({ documents: [], total: 0 }) })
    })

    render(<BookshelfPanel {...props} />)

    expect(await screen.findByText('《史记》')).toBeInTheDocument()

    fireEvent.change(screen.getByDisplayValue('全部门类'), { target: { value: '集部' } })

    expect(await screen.findByText('《国秀集》')).toBeInTheDocument()
    expect(screen.queryByText('《史记》')).not.toBeInTheDocument()
  })

  it('does not fetch more sources until the panel is expanded', async () => {
    ;(global.fetch as any).mockImplementation((url: string) => {
      if (url.includes('/api/v1/documents?limit=120&source_type=corpus')) {
        return Promise.resolve({ ok: true, json: async () => ({ documents: [], total: 0 }) })
      }
      if (url.includes('/api/v1/reader/history')) {
        return Promise.resolve({ ok: true, json: async () => [] })
      }
      return Promise.resolve({ ok: true, json: async () => ({ documents: [], total: 0 }) })
    })

    render(<BookshelfPanel {...props} />)
    await screen.findByText('精选篇目')

    expect((global.fetch as any).mock.calls.some(([url]: [string]) => url.includes('/api/v1/documents/catalog?'))).toBe(false)
    expect((global.fetch as any).mock.calls.some(([url]: [string]) => url.includes('/api/v1/documents?limit=24&source_type=user'))).toBe(false)
  })

  it('does not render the duplicate section jump pills anymore', async () => {
    ;(global.fetch as any).mockImplementation((url: string) => {
      if (url.includes('/api/v1/documents?limit=100')) {
        return Promise.resolve({ ok: false, json: async () => ({ documents: [], total: 0 }) })
      }
      if (url.includes('/api/v1/documents?limit=120&source_type=corpus')) {
        return Promise.resolve({ ok: false, json: async () => ({ documents: [], total: 0 }) })
      }
      if (url.includes('/api/v1/reader/history')) {
        return Promise.resolve({ ok: true, json: async () => [] })
      }
      if (url.includes('/api/v1/documents/catalog?')) {
        return Promise.resolve({ ok: true, json: async () => ({ entries: [], total: 0 }) })
      }
      return Promise.resolve({ ok: true, json: async () => ({ documents: [], total: 0 }) })
    })

    render(<BookshelfPanel {...props} />)

    expect(screen.queryByRole('button', { name: /^精选篇目$/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^我的上传$/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^图片识读$/ })).not.toBeInTheDocument()
  })

  it('requests the next catalog page when clicking 下一页 in 更多篇目', async () => {
    ;(global.fetch as any).mockImplementation((url: string) => {
      if (url.includes('/api/v1/documents?limit=120&source_type=corpus')) {
        return Promise.resolve({ ok: true, json: async () => ({ documents: [], total: 0 }) })
      }
      if (url.includes('/api/v1/reader/history')) {
        return Promise.resolve({ ok: true, json: async () => [] })
      }
      if (url.includes('/api/v1/documents/catalog?')) {
        const params = new URL(url, 'https://example.com').searchParams
        const offset = params.get('offset') || '0'
        return Promise.resolve({
          ok: true,
          json: async () => ({
            entries: [
              {
                repo_id: `repo-${offset}`,
                title: `目录-${offset}`,
                family: '史部',
                imported: false,
              },
            ],
            total: 72,
          }),
        })
      }
      return Promise.resolve({ ok: true, json: async () => ({ documents: [], total: 0 }) })
    })

    render(<BookshelfPanel {...props} />)

    fireEvent.click(await screen.findByRole('button', { name: /更多来源与工具/i }))
    await screen.findByText('目录-0')

    fireEvent.click(screen.getByRole('button', { name: '下一页' }))

    await waitFor(() => {
      expect((global.fetch as any).mock.calls.some(([url]: [string]) => url.includes('offset=36'))).toBe(true)
    })
  })

  it('uses the same family mapping for 更多篇目 labels as 精选篇目 filters', async () => {
    ;(global.fetch as any).mockImplementation((url: string) => {
      if (url.includes('/api/v1/documents?limit=120&source_type=corpus')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            documents: [
              { id: 'd', title: '《论语》', category: '四书', difficulty: '入门', preview: '儒家入门', has_processed: true, has_note: false, status: 'done', current_paragraph: 0, total_paragraphs: 6, source_type: 'corpus' },
            ],
            total: 1,
          }),
        })
      }
      if (url.includes('/api/v1/reader/history')) {
        return Promise.resolve({ ok: true, json: async () => [] })
      }
      if (url.includes('/api/v1/documents/catalog?')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            entries: [
              {
                repo_id: 'repo-1',
                title: '《大学衍义》',
                category: '四书',
                imported: false,
              },
            ],
            total: 1,
          }),
        })
      }
      return Promise.resolve({ ok: true, json: async () => ({ documents: [], total: 0 }) })
    })

    render(<BookshelfPanel {...props} />)

    fireEvent.click(await screen.findByRole('button', { name: /更多来源与工具/i }))

    expect(await screen.findAllByText('经学')).not.toHaveLength(0)
  })

  it('shows a catalog error with a retry action instead of an empty catalog', async () => {
    let catalogCalls = 0
    ;(global.fetch as any).mockImplementation((url: string) => {
      if (url.includes('/api/v1/documents?limit=120&source_type=corpus')) {
        return Promise.resolve({ ok: true, json: async () => ({ documents: [{ id: 'corpus-1', title: '《论语》' }], total: 1 }) })
      }
      if (url.includes('/api/v1/reader/history')) {
        return Promise.resolve({ ok: true, json: async () => [] })
      }
      if (url.includes('/api/v1/documents/catalog?')) {
        catalogCalls += 1
        return Promise.reject(new Error('catalog down'))
      }
      return Promise.resolve({ ok: true, json: async () => ({ documents: [], total: 0 }) })
    })

    render(<BookshelfPanel {...props} />)
    fireEvent.click(await screen.findByRole('button', { name: /更多来源与工具/i }))

    expect(await screen.findByText('更多篇目暂时无法加载，请重试。')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '重试加载更多篇目' }))

    await waitFor(() => expect(catalogCalls).toBeGreaterThan(1))
  })

  it('disables catalog import cards and prevents duplicate imports while one is running', async () => {
    let resolveImport: ((value: unknown) => void) | undefined
    const importPromise = new Promise((resolve) => {
      resolveImport = resolve
    })
    ;(global.fetch as any).mockImplementation((url: string) => {
      if (url.includes('/api/v1/documents?limit=120&source_type=corpus')) {
        return Promise.resolve({ ok: true, json: async () => ({ documents: [{ id: 'corpus-1', title: '《论语》' }], total: 1 }) })
      }
      if (url.includes('/api/v1/reader/history')) {
        return Promise.resolve({ ok: true, json: async () => [] })
      }
      if (url.includes('/api/v1/documents/catalog?')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ entries: [{ repo_id: 'repo-1', title: '《大学》', imported: false }], total: 1 }),
        })
      }
      if (url.includes('/api/v1/documents/catalog/import/repo-1')) {
        return importPromise
      }
      return Promise.resolve({ ok: true, json: async () => ({ documents: [], total: 0 }) })
    })

    render(<BookshelfPanel {...props} />)
    fireEvent.click(await screen.findByRole('button', { name: /更多来源与工具/i }))
    const importButton = await screen.findByRole('button', { name: /加入阅读并打开： 《大学》|加入阅读并打开：/i })

    fireEvent.click(importButton)
    expect(importButton).toBeDisabled()
    fireEvent.click(importButton)
    expect((global.fetch as any).mock.calls.filter(([url]: [string]) => url.includes('/catalog/import/repo-1'))).toHaveLength(1)

    resolveImport?.({ ok: true, json: async () => ({ document: { id: 'doc-1' } }) })
    await waitFor(() => expect(props.onOpenDocument).toHaveBeenCalledWith('doc-1'))
  })

  it('shows rejected file feedback without starting an upload', async () => {
    ;(global.fetch as any).mockImplementation((url: string) => {
      if (url.includes('/api/v1/documents?limit=120&source_type=corpus')) {
        return Promise.resolve({ ok: true, json: async () => ({ documents: [{ id: 'corpus-1', title: '《论语》' }], total: 1 }) })
      }
      if (url.includes('/api/v1/reader/history')) {
        return Promise.resolve({ ok: true, json: async () => [] })
      }
      return Promise.resolve({ ok: true, json: async () => ({ documents: [], total: 0 }) })
    })

    const { container } = render(<BookshelfPanel {...props} />)
    fireEvent.click(await screen.findByRole('button', { name: /更多来源与工具/i }))
    const input = container.querySelector('input[type="file"]') as HTMLInputElement
    fireEvent.change(input, { target: { files: [new File(['text'], 'notes.pdf', { type: 'application/pdf' })] } })

    expect(await screen.findByText(/这类文件暂不支持/)).toBeInTheDocument()
    expect((global.fetch as any).mock.calls.some(([url]: [string]) => url.includes('/api/v1/documents/upload'))).toBe(false)
  })

  it('preserves an intelligible backend upload error detail', async () => {
    ;(global.fetch as any).mockImplementation((url: string) => {
      if (url.includes('/api/v1/documents?limit=120&source_type=corpus')) {
        return Promise.resolve({ ok: true, json: async () => ({ documents: [{ id: 'corpus-1', title: '《论语》' }], total: 1 }) })
      }
      if (url.includes('/api/v1/reader/history')) {
        return Promise.resolve({ ok: true, json: async () => [] })
      }
      if (url.includes('/api/v1/documents/upload')) {
        return Promise.resolve({ ok: false, status: 413, json: async () => ({ detail: '图片超过服务端大小限制，请压缩后重试。' }) })
      }
      return Promise.resolve({ ok: true, json: async () => ({ documents: [], total: 0 }) })
    })

    const { container } = render(<BookshelfPanel {...props} />)
    fireEvent.click(await screen.findByRole('button', { name: /更多来源与工具/i }))
    const input = container.querySelector('input[type="file"]') as HTMLInputElement
    fireEvent.change(input, { target: { files: [new File(['image'], 'page.png', { type: 'image/png' })] } })

    expect(await screen.findByText('图片超过服务端大小限制，请压缩后重试。')).toBeInTheDocument()
  })
})
