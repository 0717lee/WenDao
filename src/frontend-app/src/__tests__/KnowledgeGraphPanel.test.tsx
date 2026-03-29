/**
 * KnowledgeGraphPanel Tests (KG-01)
 * Coverage: Graph visualization, node interactions, mode switching
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { act } from 'react'

// Mock react-graph-vis — canvas-based, not available in jsdom
const mockGetNetwork = vi.fn()
let capturedEvents: Record<string, Function> = {}
vi.mock('react-graph-vis', () => ({
  default: ({ graph, events, getNetwork }: any) => {
    // Capture events for testing
    capturedEvents = events || {}
    if (getNetwork) {
      mockGetNetwork()
      getNetwork({
        on: vi.fn(),
        setData: vi.fn(),
        fit: vi.fn(),
        destroy: vi.fn(),
        stabilize: vi.fn(),
        focus: vi.fn(),
        selectNodes: vi.fn(),
        setOptions: vi.fn(),
      })
    }
    return (
      <div data-testid="graph-vis">
        {graph?.nodes?.map((n: any) => (
          <span key={n.id} data-testid={`node-${n.id}`}>{n.label}</span>
        ))}
      </div>
    )
  },
}))

// Mock useStore
vi.mock('../store/useStore', () => ({
  useStore: vi.fn((selector: any) => {
    const state = {
      selectedNode: null,
      setHighlightedType: vi.fn(),
    }
    return selector(state)
  }),
}))

// Mock useGraphStore with zustand-like behavior
const mockGraphStoreState = {
  highlightedEntityIds: [] as string[],
  pendingGraphFocus: null as string | null,
  pendingReaderDocId: null,
  citationChainMode: false,
  citationChainRoot: null,
  citationChain: [],
  pendingNodes: [],
  selectedEntity: null,
  entityFrequencies: {} as Record<string, number>,
  clearGraphFocus: vi.fn(),
  setActiveTab: vi.fn(),
  exitCitationChain: vi.fn(),
  setHighlightedEntityIds: vi.fn(),
  setEntityFrequencies: vi.fn(),
}

vi.mock('../store/useGraphStore', () => ({
  useGraphStore: Object.assign(
    vi.fn((selector: any) => selector(mockGraphStoreState)),
    { getState: () => mockGraphStoreState }
  ),
}))

// Mock GraphExportDialog
vi.mock('../components/GraphExportDialog', () => ({
  GraphExportDialog: ({ open }: any) =>
    open ? <div data-testid="export-dialog">Export Dialog</div> : null,
}))

// Mock EntityDetailPanel
vi.mock('../components/EntityDetailPanel', () => ({
  EntityDetailPanel: ({ node, onClose }: any) =>
    node ? (
      <div data-testid="entity-detail">
        <span>{node.label}</span>
        <button onClick={onClose}>close</button>
      </div>
    ) : null,
}))

describe('KnowledgeGraphPanel', () => {
  beforeEach(() => {
    vi.mocked(global.fetch).mockReset()
    // Default: reject both fetches so fallback data is used.
    // Individual tests override the first call (knowledge-graph) as needed.
    vi.mocked(global.fetch).mockImplementation((url: any) => {
      if (typeof url === 'string' && url.includes('/api/v1/reader/entity-frequency')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ frequencies: [] }),
        } as Response)
      }
      // knowledge-graph: reject by default (tests override with mockResolvedValueOnce)
      return Promise.reject(new Error('no api'))
    })
    capturedEvents = {}
    mockGraphStoreState.highlightedEntityIds = []
    mockGraphStoreState.citationChainMode = false
    mockGraphStoreState.pendingNodes = []
  })

  it('renders without crashing', async () => {
    const { KnowledgeGraphPanel } = await import('../components/KnowledgeGraphPanel')
    const { container } = render(<KnowledgeGraphPanel />)
    expect(container.querySelector('[data-testid="graph-vis"]')).toBeTruthy()
  })

  it('renders with fallback nodes data when API fails', async () => {
    const { KnowledgeGraphPanel } = await import('../components/KnowledgeGraphPanel')
    render(<KnowledgeGraphPanel />)

    // Fallback data includes known nodes
    expect(screen.getByText('人物与典故线索')).toBeTruthy()
    expect(screen.getByTestId('graph-vis')).toBeTruthy()
  })

  it('loads data from API and renders nodes', async () => {
    vi.mocked(global.fetch).mockImplementation((url: any) => {
      if (typeof url === 'string' && url.includes('/api/v1/reader/entity-frequency')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ frequencies: [] }),
        } as Response)
      }
      return Promise.resolve({
        ok: true,
        json: async () => ({
          nodes: [
            { id: 'n1', label: 'TestNode', group: '人物', desc: 'A test' },
          ],
          edges: [],
          stats: { node_count: 1, edge_count: 0, groups: ['人物'] },
        }),
      } as Response)
    })

    const { KnowledgeGraphPanel } = await import('../components/KnowledgeGraphPanel')
    render(<KnowledgeGraphPanel />)

    await waitFor(() => {
      expect(screen.getByText('1 节点 / 0 关系')).toBeTruthy()
    })
  })

  it('handles empty graph state gracefully', async () => {
    vi.mocked(global.fetch).mockImplementation((url: any) => {
      if (typeof url === 'string' && url.includes('/api/v1/reader/entity-frequency')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ frequencies: [] }),
        } as Response)
      }
      return Promise.resolve({
        ok: true,
        json: async () => ({
          nodes: [],
          edges: [],
          stats: { node_count: 0, edge_count: 0, groups: [] },
        }),
      } as Response)
    })

    const { KnowledgeGraphPanel } = await import('../components/KnowledgeGraphPanel')
    const { container } = render(<KnowledgeGraphPanel />)
    await waitFor(() => {
      expect(screen.getByText('0 节点 / 0 关系')).toBeTruthy()
    })
  })

  it('calls Network constructor via getNetwork callback', async () => {
    const { KnowledgeGraphPanel } = await import('../components/KnowledgeGraphPanel')
    render(<KnowledgeGraphPanel />)
    expect(mockGetNetwork).toHaveBeenCalled()
  })

  it('handles node select event and shows entity detail', async () => {
    const { KnowledgeGraphPanel } = await import('../components/KnowledgeGraphPanel')
    render(<KnowledgeGraphPanel />)

    // Simulate node selection via captured events
    if (capturedEvents.select) {
      act(() => {
        capturedEvents.select({ nodes: ['kongzi'] })
      })
    }

    await waitFor(() => {
      expect(screen.getByTestId('entity-detail')).toBeTruthy()
    })
  })

  it('renders loading/stabilization state', async () => {
    const { KnowledgeGraphPanel } = await import('../components/KnowledgeGraphPanel')
    render(<KnowledgeGraphPanel />)

    // Component starts with stabilizing=true
    expect(screen.getByText(/图谱布局中/)).toBeTruthy()
  })

  it('opens export dialog when export button is clicked', async () => {
    const { KnowledgeGraphPanel } = await import('../components/KnowledgeGraphPanel')
    render(<KnowledgeGraphPanel />)

    const exportBtn = screen.getByTitle('导出图谱')
    fireEvent.click(exportBtn)

    await waitFor(() => {
      expect(screen.getByTestId('export-dialog')).toBeTruthy()
    })
  })
})
