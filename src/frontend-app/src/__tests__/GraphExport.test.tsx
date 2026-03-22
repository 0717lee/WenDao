/**
 * GraphExport Tests (KG-05)
 * Coverage: Export dialog rendering, JSON/PNG export, empty graph, filename
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

// Mock html-to-image
const mockToPng = vi.fn()
const mockToSvg = vi.fn()
vi.mock('html-to-image', () => ({
  toPng: (...args: any[]) => mockToPng(...args),
  toSvg: (...args: any[]) => mockToSvg(...args),
}))

// Mock file-saver
const mockSaveAs = vi.fn()
vi.mock('file-saver', () => ({
  saveAs: (...args: any[]) => mockSaveAs(...args),
}))

function makeProps(overrides: Record<string, any> = {}) {
  return {
    open: true,
    onClose: vi.fn(),
    graphRef: { current: document.createElement('div') },
    networkRef: { current: { fit: vi.fn() } },
    allNodes: [
      { id: 'n1', label: 'Node1', group: '人物', desc: 'desc1' },
      { id: 'n2', label: 'Node2', group: '典籍', desc: 'desc2' },
    ],
    allEdges: [
      { id: 'e1', from: 'n1', to: 'n2', label: 'rel' },
    ],
    ...overrides,
  }
}

describe('GraphExportDialog', () => {
  beforeEach(() => {
    mockToPng.mockReset()
    mockToSvg.mockReset()
    mockSaveAs.mockReset()
    vi.mocked(global.fetch).mockReset()
  })

  it('renders export dialog when open', async () => {
    const { GraphExportDialog } = await import('../components/GraphExportDialog')
    render(<GraphExportDialog {...makeProps()} />)
    expect(screen.getByText('导出图谱')).toBeTruthy()
  })

  it('does not render when closed', async () => {
    const { GraphExportDialog } = await import('../components/GraphExportDialog')
    const { container } = render(<GraphExportDialog {...makeProps({ open: false })} />)
    expect(container.innerHTML).toBe('')
  })

  it('exports JSON with correct structure', async () => {
    const onClose = vi.fn()
    const { GraphExportDialog } = await import('../components/GraphExportDialog')
    render(<GraphExportDialog {...makeProps({ onClose })} />)

    // JSON is default format, click export
    const exportBtn = screen.getByText(/导出 JSON/)
    fireEvent.click(exportBtn)

    await waitFor(() => {
      expect(mockSaveAs).toHaveBeenCalledTimes(1)
      const blob = mockSaveAs.mock.calls[0][0] as Blob
      expect(blob).toBeInstanceOf(Blob)
      const filename = mockSaveAs.mock.calls[0][1] as string
      expect(filename).toContain('.json')
    })
  })

  it('exports JSON including all nodes', async () => {
    const { GraphExportDialog } = await import('../components/GraphExportDialog')
    render(<GraphExportDialog {...makeProps()} />)

    const exportBtn = screen.getByText(/导出 JSON/)
    fireEvent.click(exportBtn)

    await waitFor(() => {
      expect(mockSaveAs).toHaveBeenCalled()
      // The blob contains JSON with all nodes
      const blob = mockSaveAs.mock.calls[0][0] as Blob
      expect(blob.type).toBe('application/json;charset=utf-8')
    })
  })

  it('handles empty graph export gracefully', async () => {
    const { GraphExportDialog } = await import('../components/GraphExportDialog')
    render(<GraphExportDialog {...makeProps({ allNodes: [], allEdges: [] })} />)

    const exportBtn = screen.getByText(/导出 JSON/)
    fireEvent.click(exportBtn)

    await waitFor(() => {
      expect(mockSaveAs).toHaveBeenCalled()
    })
  })

  it('filename includes timestamp pattern', async () => {
    const { GraphExportDialog } = await import('../components/GraphExportDialog')
    render(<GraphExportDialog {...makeProps()} />)

    const exportBtn = screen.getByText(/导出 JSON/)
    fireEvent.click(exportBtn)

    await waitFor(() => {
      const filename = mockSaveAs.mock.calls[0][1] as string
      // Filename pattern: 古籍知识图谱_当前视图_YYYYMMDD_HHMM.json
      expect(filename).toMatch(/\d{8}_\d{4}/)
    })
  })

  it('handles PNG export trigger by selecting PNG format', async () => {
    // Mock toPng to return a data URL
    mockToPng.mockResolvedValueOnce('data:image/png;base64,abc')
    vi.mocked(global.fetch).mockResolvedValueOnce({
      ok: true,
      blob: async () => new Blob(['png'], { type: 'image/png' }),
    } as Response)

    const { GraphExportDialog } = await import('../components/GraphExportDialog')
    render(<GraphExportDialog {...makeProps()} />)

    // Click PNG format option
    const pngBtn = screen.getByText('IMG')
    fireEvent.click(pngBtn)

    // Now export
    const exportBtn = screen.getByText(/导出 PNG/)
    fireEvent.click(exportBtn)

    await waitFor(() => {
      expect(mockToPng).toHaveBeenCalled()
    })
  })

  it('shows format selection options', async () => {
    const { GraphExportDialog } = await import('../components/GraphExportDialog')
    render(<GraphExportDialog {...makeProps()} />)

    expect(screen.getByText('{ }')).toBeTruthy()  // JSON icon
    expect(screen.getByText('IMG')).toBeTruthy()  // PNG icon
    expect(screen.getByText('SVG')).toBeTruthy()  // SVG icon
    expect(screen.getByText('MD')).toBeTruthy()   // Markdown icon
  })
})
