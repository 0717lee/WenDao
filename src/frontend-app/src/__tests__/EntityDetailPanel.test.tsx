/**
 * EntityDetailPanel Tests (KG-02)
 * Coverage: Node detail display, type badges, related entities, close action
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

// Mock useGraphStore
vi.mock('../store/useGraphStore', () => ({
  useGraphStore: Object.assign(
    vi.fn((selector: any) => selector({
      enterCitationChain: vi.fn(),
    })),
    {
      getState: () => ({
        enterCitationChain: vi.fn(),
      }),
    }
  ),
}))

describe('EntityDetailPanel', () => {
  beforeEach(() => {
    vi.mocked(global.fetch).mockReset()
  })

  it('renders nothing when no node is selected', async () => {
    const { EntityDetailPanel } = await import('../components/EntityDetailPanel')
    const { container } = render(
      <EntityDetailPanel node={null} onClose={vi.fn()} />
    )
    expect(container.innerHTML).toBe('')
  })

  it('renders node name and description', async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ node: {}, edges: [], neighbors: [] }),
    } as Response)

    const { EntityDetailPanel } = await import('../components/EntityDetailPanel')
    render(
      <EntityDetailPanel
        node={{ id: 'kongzi', label: '孔子', group: '人物', desc: '儒家学派创始人' }}
        onClose={vi.fn()}
      />
    )

    expect(screen.getByText('孔子')).toBeTruthy()
    expect(screen.getByText('儒家学派创始人')).toBeTruthy()
  })

  it('renders node type badge for person', async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ node: {}, edges: [], neighbors: [] }),
    } as Response)

    const { EntityDetailPanel } = await import('../components/EntityDetailPanel')
    render(
      <EntityDetailPanel
        node={{ id: 'kongzi', label: '孔子', group: '人物', desc: 'test' }}
        onClose={vi.fn()}
      />
    )

    expect(screen.getByText('人物')).toBeTruthy()
  })

  it('renders node type badge for book', async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ node: {}, edges: [], neighbors: [] }),
    } as Response)

    const { EntityDetailPanel } = await import('../components/EntityDetailPanel')
    render(
      <EntityDetailPanel
        node={{ id: 'lunyu', label: '论语', group: '典籍', desc: '经典' }}
        onClose={vi.fn()}
      />
    )

    expect(screen.getByText('典籍')).toBeTruthy()
  })

  it('renders related entities list from API', async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        node: { id: 'kongzi', label: '孔子', group: '人物' },
        edges: [
          { id: 'e1', from: 'kongzi', to: 'lunyu', label: '著作' },
        ],
        neighbors: [
          { id: 'lunyu', label: '论语', group: '典籍' },
        ],
      }),
    } as Response)

    const { EntityDetailPanel } = await import('../components/EntityDetailPanel')
    render(
      <EntityDetailPanel
        node={{ id: 'kongzi', label: '孔子', group: '人物' }}
        onClose={vi.fn()}
      />
    )

    await waitFor(() => {
      expect(screen.getByText('论语')).toBeTruthy()
      expect(screen.getByText('著作')).toBeTruthy()
    })
  })

  it('handles close button click', async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ node: {}, edges: [], neighbors: [] }),
    } as Response)

    const onClose = vi.fn()
    const { EntityDetailPanel } = await import('../components/EntityDetailPanel')
    render(
      <EntityDetailPanel
        node={{ id: 'test', label: 'Test', group: '人物' }}
        onClose={onClose}
      />
    )

    // Find close button (svg x icon)
    const buttons = screen.getAllByRole('button')
    // The close button is the first one in the header
    fireEvent.click(buttons[0])
    expect(onClose).toHaveBeenCalled()
  })

  it('renders with missing optional fields gracefully', async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ node: {}, edges: [], neighbors: [] }),
    } as Response)

    const { EntityDetailPanel } = await import('../components/EntityDetailPanel')
    // No desc field
    const { container } = render(
      <EntityDetailPanel
        node={{ id: 'test', label: 'NoDesc', group: '历史事件' }}
        onClose={vi.fn()}
      />
    )

    expect(screen.getByText('NoDesc')).toBeTruthy()
    expect(screen.getByText('历史事件')).toBeTruthy()
    // Should not crash without desc
    expect(container.innerHTML).not.toBe('')
  })

  it('displays node group with correct Chinese label', async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ node: {}, edges: [], neighbors: [] }),
    } as Response)

    const { EntityDetailPanel } = await import('../components/EntityDetailPanel')
    render(
      <EntityDetailPanel
        node={{ id: 'test', label: 'Test', group: '思想流派' }}
        onClose={vi.fn()}
      />
    )

    expect(screen.getByText('思想流派')).toBeTruthy()
  })
})
