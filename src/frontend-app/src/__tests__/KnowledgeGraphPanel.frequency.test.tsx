/**
 * KnowledgeGraphPanel Frequency-Based Node Scaling Tests (UX-04)
 * Coverage: entityFrequencies store state, frequency fetch, node size scaling
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { act } from 'react'

// Mock react-graph-vis — capture graph data for size assertions
let capturedGraphData: { nodes: any[]; edges: any[] } = { nodes: [], edges: [] }
vi.mock('react-graph-vis', () => ({
  default: ({ graph, events, getNetwork }: any) => {
    capturedGraphData = graph || { nodes: [], edges: [] }
    if (getNetwork) {
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
          <span key={n.id} data-testid={`node-${n.id}`} data-size={n.size}>{n.label}</span>
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

// Mock useGraphStore with frequency state
const mockGraphStoreState: Record<string, any> = {
  highlightedEntityIds: [],
  pendingGraphFocus: null,
  pendingReaderDocId: null,
  citationChainMode: false,
  citationChainRoot: null,
  citationChain: [],
  pendingNodes: [],
  selectedEntity: null,
  entityFrequencies: {},
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

describe('useGraphStore entityFrequencies', () => {
  it('entityFrequencies defaults to empty object', async () => {
    // Directly test the real store
    vi.resetModules()

    // Import real store (not mocked)
    const storeModule = await vi.importActual<typeof import('../store/useGraphStore')>('../store/useGraphStore')
    const store = storeModule.useGraphStore

    expect(store.getState().entityFrequencies).toEqual({})
  })

  it('setEntityFrequencies updates the store correctly', async () => {
    vi.resetModules()

    const storeModule = await vi.importActual<typeof import('../store/useGraphStore')>('../store/useGraphStore')
    const store = storeModule.useGraphStore

    act(() => {
      store.getState().setEntityFrequencies({ kongzi: 5, lunyu: 2 })
    })

    expect(store.getState().entityFrequencies).toEqual({ kongzi: 5, lunyu: 2 })
  })
})

describe('KnowledgeGraphPanel frequency-based node scaling', () => {
  beforeEach(() => {
    vi.mocked(global.fetch).mockReset()
    capturedGraphData = { nodes: [], edges: [] }
    mockGraphStoreState.highlightedEntityIds = []
    mockGraphStoreState.citationChainMode = false
    mockGraphStoreState.pendingNodes = []
    mockGraphStoreState.entityFrequencies = {}
  })

  it('fetches frequency data on mount', async () => {
    // First call: KG data, Second call: frequency data
    vi.mocked(global.fetch).mockImplementation((url: any) => {
      const urlStr = typeof url === 'string' ? url : url.toString()
      if (urlStr.includes('/api/v1/knowledge-graph') && !urlStr.includes('search') && !urlStr.includes('entity-frequency')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            nodes: [
              { id: 'kongzi', label: '孔子', group: '人物', desc: 'test' },
              { id: 'lunyu', label: '论语', group: '典籍', desc: 'test' },
            ],
            edges: [],
            stats: { node_count: 2, edge_count: 0, groups: ['人物', '典籍'] },
          }),
        } as Response)
      }
      if (urlStr.includes('/api/v1/reader/entity-frequency')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            frequencies: [
              { entity_id: 'kongzi', count: 5 },
              { entity_id: 'lunyu', count: 2 },
            ],
          }),
        } as Response)
      }
      return Promise.reject(new Error(`Unexpected: ${urlStr}`))
    })

    const { KnowledgeGraphPanel } = await import('../components/KnowledgeGraphPanel')
    render(<KnowledgeGraphPanel />)

    await waitFor(() => {
      // Verify fetch was called for frequency endpoint
      const calls = vi.mocked(global.fetch).mock.calls.map(c => String(c[0]))
      expect(calls.some(c => c.includes('/api/v1/reader/entity-frequency'))).toBe(true)
    })
  })

  it('nodes with higher frequency get larger size', async () => {
    // Set frequency data in the mock store
    mockGraphStoreState.entityFrequencies = { kongzi: 5, lunyu: 2 }

    vi.mocked(global.fetch).mockImplementation((url: any) => {
      const urlStr = typeof url === 'string' ? url : url.toString()
      if (urlStr.includes('/api/v1/knowledge-graph') && !urlStr.includes('search') && !urlStr.includes('entity-frequency')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            nodes: [
              { id: 'kongzi', label: '孔子', group: '人物', desc: 'test' },
              { id: 'lunyu', label: '论语', group: '典籍', desc: 'test' },
              { id: 'laozi', label: '老子', group: '人物', desc: 'no freq' },
            ],
            edges: [
              { id: 'e1', from: 'kongzi', to: 'lunyu', label: '著作' },
            ],
            stats: { node_count: 3, edge_count: 1, groups: ['人物', '典籍'] },
          }),
        } as Response)
      }
      if (urlStr.includes('/api/v1/reader/entity-frequency')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ frequencies: [] }),
        } as Response)
      }
      return Promise.reject(new Error(`Unexpected: ${urlStr}`))
    })

    const { KnowledgeGraphPanel } = await import('../components/KnowledgeGraphPanel')
    render(<KnowledgeGraphPanel />)

    await waitFor(() => {
      expect(screen.getByText('3 节点 / 1 关系')).toBeTruthy()
    })

    // Check captured graph data for size differences
    const kongziNode = capturedGraphData.nodes.find((n: any) => n.id === 'kongzi')
    const lunyuNode = capturedGraphData.nodes.find((n: any) => n.id === 'lunyu')

    // kongzi has higher frequency than lunyu, so it should render larger in compact mode too
    expect(kongziNode).toBeTruthy()
    expect(lunyuNode).toBeTruthy()
    expect(kongziNode.size).toBeGreaterThan(lunyuNode.size)
  })
})
