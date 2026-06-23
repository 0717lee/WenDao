/**
 * KnowledgeGraphPanel & EntityCard Tests
 * Coverage: panel rendering, API integration, entity selection, error/empty states
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { KnowledgeGraphPanel } from '../components/KnowledgeGraphPanel'
import { EntityCard, type GraphEntity, type GraphRelation } from '../components/EntityCard'

// Mock useAuthStore to avoid auth fetch complications in tests.
vi.mock('../store/useAuthStore', () => ({
  authFetchOptions: vi.fn((init?: RequestInit) => ({
    ...init,
    headers: { ...(init?.headers || {}), 'X-Test-Auth': '1' },
  })),
}))

// Mock API_BASE to a known value.
vi.mock('../lib/api', () => ({
  API_BASE: 'http://localhost:8000',
}))

const SAMPLE_EXTRACT_RESPONSE = {
  entities: [
    { id: 'kongzi', label: '孔子', group: '人物' },
    { id: 'lunyu', label: '论语', group: '典籍' },
  ],
  nodes: [
    { id: 'kongzi', label: '孔子', group: '人物', desc: '儒家创始人', era: '春秋', aliases: ['仲尼'] },
    { id: 'lunyu', label: '论语', group: '典籍', desc: '儒家经典', era: '春秋', aliases: [] },
    { id: 'ren', label: '仁', group: '概念', desc: '儒家核心概念', era: '先秦', aliases: [] },
  ],
  edges: [
    { source: 'kongzi', target: 'lunyu', relation: '著作', desc: '孔子言行记录成论语' },
    { source: 'kongzi', target: 'ren', relation: '倡导', desc: '孔子以仁为核心' },
  ],
  stats: { nodes: 3, edges: 2, matched_entities: 2 },
  loaded: true,
}

const SAMPLE_ENTITY_DETAIL = {
  entity: SAMPLE_EXTRACT_RESPONSE.nodes[0],
  relations: SAMPLE_EXTRACT_RESPONSE.edges,
  neighbors: [SAMPLE_EXTRACT_RESPONSE.nodes[1], SAMPLE_EXTRACT_RESPONSE.nodes[2]],
}

describe('KnowledgeGraphPanel', () => {
  beforeEach(() => {
    vi.mocked(global.fetch).mockReset()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('renders header and empty prompt when text is empty', () => {
    const { container } = render(<KnowledgeGraphPanel text="" />)
    expect(screen.getByText('知识图谱')).toBeTruthy()
    expect(screen.getByText('选中一句古文即可展示关联图谱')).toBeTruthy()
    // No graph SVG (role=img) should be rendered in the empty state.
    // The lucide Network icon is a separate SVG without role="img".
    expect(container.querySelector('svg[role="img"]')).toBeNull()
  })

  it('calls /api/v1/graph/extract with the provided text', async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce(
      new Response(JSON.stringify(SAMPLE_EXTRACT_RESPONSE), { status: 200 }),
    )

    render(<KnowledgeGraphPanel text="孔子编撰了论语" />)

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        'http://localhost:8000/api/v1/graph/extract',
        expect.objectContaining({ method: 'POST' }),
      )
    })

    const callBody = JSON.parse(vi.mocked(global.fetch).mock.calls[0][1]?.body as string)
    expect(callBody.text).toBe('孔子编撰了论语')
    expect(callBody.max_nodes).toBe(30)
  })

  it('renders SVG graph and entity card after successful load', async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce(
      new Response(JSON.stringify(SAMPLE_EXTRACT_RESPONSE), { status: 200 }),
    )

    const { container } = render(<KnowledgeGraphPanel text="孔子编撰了论语" />)

    await waitFor(() => {
      expect(container.querySelector('svg')).toBeTruthy()
    })

    // Entity card should show the auto-selected first entity (孔子).
    // Wait for the detail effect to build the card from the loaded subgraph.
    await waitFor(() => {
      expect(screen.getByText('儒家创始人')).toBeTruthy()
    })
    expect(screen.getByText('识别到 2 个实体')).toBeTruthy()
  })

  it('shows error message when extract fails', async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce(
      new Response('Internal Server Error', { status: 500 }),
    )

    render(<KnowledgeGraphPanel text="孔子" />)

    await waitFor(() => {
      expect(screen.getByText('图谱加载失败，请稍后再试')).toBeTruthy()
    })
  })

  it('shows empty state when no entities are matched', async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          entities: [],
          nodes: [],
          edges: [],
          stats: { nodes: 0, edges: 0, matched_entities: 0 },
          loaded: true,
        }),
        { status: 200 },
      ),
    )

    render(<KnowledgeGraphPanel text="今天天气很好" />)

    await waitFor(() => {
      expect(screen.getByText('当前文本未识别到已收录的实体')).toBeTruthy()
    })
  })

  it('renders legend with entity groups', async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce(
      new Response(JSON.stringify(SAMPLE_EXTRACT_RESPONSE), { status: 200 }),
    )

    render(<KnowledgeGraphPanel text="孔子" />)

    await waitFor(() => {
      expect(screen.getByText('人物')).toBeTruthy()
      expect(screen.getByText('典籍')).toBeTruthy()
      expect(screen.getByText('概念')).toBeTruthy()
    })
  })

  it('updates selected entity when a node is clicked', async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce(
      new Response(JSON.stringify(SAMPLE_EXTRACT_RESPONSE), { status: 200 }),
    )

    const { container } = render(<KnowledgeGraphPanel text="孔子" />)

    await waitFor(() => {
      expect(container.querySelector('svg')).toBeTruthy()
    })

    // Initially auto-selects the first entity (孔子).
    await waitFor(() => {
      expect(screen.getByText('儒家创始人')).toBeTruthy()
    })

    // Click on the 论语 node group (role=button with aria-label).
    const lunyuNode = screen.getByRole('button', { name: /实体：论语/ })
    fireEvent.click(lunyuNode)

    // Entity card should now show 论语 details.
    await waitFor(() => {
      expect(screen.getByText('儒家经典')).toBeTruthy()
    })
  })

  it('does not call fetch when text is only whitespace', () => {
    render(<KnowledgeGraphPanel text="   " />)
    expect(global.fetch).not.toHaveBeenCalled()
  })

  it('refresh button re-triggers extract', async () => {
    vi.mocked(global.fetch).mockResolvedValue(
      new Response(JSON.stringify(SAMPLE_EXTRACT_RESPONSE), { status: 200 }),
    )

    render(<KnowledgeGraphPanel text="孔子" />)

    await waitFor(() => {
      expect(screen.getByText('儒家创始人')).toBeTruthy()
    })

    const initialCallCount = vi.mocked(global.fetch).mock.calls.length

    fireEvent.click(screen.getByLabelText('刷新图谱'))

    await waitFor(() => {
      expect(vi.mocked(global.fetch).mock.calls.length).toBeGreaterThan(initialCallCount)
    })
  })

  it('does not issue duplicate extract requests when text changes after refresh', async () => {
    // Regression test: previously two useEffects both depended on `text`,
    // causing a duplicate /extract call after refresh. Now a single
    // useEffect handles both text changes and refresh.
    vi.mocked(global.fetch).mockResolvedValue(
      new Response(JSON.stringify(SAMPLE_EXTRACT_RESPONSE), { status: 200 }),
    )

    const { rerender } = render(<KnowledgeGraphPanel text="孔子" />)

    // Wait for initial load (1 extract request).
    await waitFor(() => {
      expect(screen.getByText('儒家创始人')).toBeTruthy()
    })
    const callsAfterInitial = vi.mocked(global.fetch).mock.calls.filter(
      (c) => c[0]?.toString().includes('/graph/extract'),
    ).length
    expect(callsAfterInitial).toBe(1)

    // Click refresh (1 more extract request).
    fireEvent.click(screen.getByLabelText('刷新图谱'))
    await waitFor(() => {
      const callsAfterRefresh = vi.mocked(global.fetch).mock.calls.filter(
        (c) => c[0]?.toString().includes('/graph/extract'),
      ).length
      expect(callsAfterRefresh).toBe(2)
    })

    // Now change text — should trigger exactly 1 more extract, not 2.
    rerender(<KnowledgeGraphPanel text="论语" />)

    await waitFor(() => {
      const callsAfterTextChange = vi.mocked(global.fetch).mock.calls.filter(
        (c) => c[0]?.toString().includes('/graph/extract'),
      ).length
      // Should be 3 total (1 initial + 1 refresh + 1 text change), not 4.
      expect(callsAfterTextChange).toBe(3)
    })
  })
})

describe('EntityCard', () => {
  const entity: GraphEntity = {
    id: 'kongzi',
    label: '孔子',
    group: '人物',
    desc: '儒家创始人',
    era: '春秋',
    aliases: ['仲尼', '孔丘'],
  }

  const relations: GraphRelation[] = [
    { source: 'kongzi', target: 'lunyu', relation: '著作', desc: '孔子言行记录成论语' },
    { source: 'mengzi', target: 'kongzi', relation: '师承', desc: '孟子私淑孔子' },
  ]

  const neighbors: GraphEntity[] = [
    { id: 'lunyu', label: '论语', group: '典籍', desc: '儒家经典', era: '春秋', aliases: [] },
    { id: 'mengzi', label: '孟子', group: '人物', desc: '儒家代表', era: '战国', aliases: [] },
  ]

  it('renders entity label, group, era, and aliases', () => {
    render(
      <EntityCard entity={entity} relations={relations} neighbors={neighbors} />,
    )
    expect(screen.getByText('孔子')).toBeTruthy()
    expect(screen.getByText('人物')).toBeTruthy()
    expect(screen.getByText('春秋')).toBeTruthy()
    expect(screen.getByText(/仲尼、孔丘/)).toBeTruthy()
  })

  it('renders outbound relations with neighbor labels', () => {
    render(
      <EntityCard entity={entity} relations={relations} neighbors={neighbors} />,
    )
    expect(screen.getByText('著作')).toBeTruthy()
    expect(screen.getByText('论语')).toBeTruthy()
  })

  it('renders inbound relations under 被引用 section', () => {
    render(
      <EntityCard entity={entity} relations={relations} neighbors={neighbors} />,
    )
    expect(screen.getByText('被引用')).toBeTruthy()
    expect(screen.getByText('孟子')).toBeTruthy()
    expect(screen.getByText('师承')).toBeTruthy()
  })

  it('calls onSelectNeighbor when a neighbor button is clicked', () => {
    const onSelect = vi.fn()
    render(
      <EntityCard entity={entity} relations={relations} neighbors={neighbors} onSelectNeighbor={onSelect} />,
    )
    // Click the 论语 neighbor button (appears in outbound relations).
    fireEvent.click(screen.getByText('论语'))
    expect(onSelect).toHaveBeenCalledWith('lunyu')
  })

  it('calls onClose when close button is clicked', () => {
    const onClose = vi.fn()
    render(
      <EntityCard entity={entity} relations={relations} neighbors={neighbors} onClose={onClose} />,
    )
    fireEvent.click(screen.getByLabelText('关闭实体卡片'))
    expect(onClose).toHaveBeenCalled()
  })

  it('shows empty hint when no relations exist', () => {
    render(<EntityCard entity={entity} relations={[]} neighbors={[]} />)
    expect(screen.getByText('暂未收录该实体的关联关系。')).toBeTruthy()
  })
})
