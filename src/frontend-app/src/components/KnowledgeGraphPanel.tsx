import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Network, RefreshCw } from 'lucide-react'
import { API_BASE } from '../lib/api'
import { authFetchOptions } from '../store/useAuthStore'
import { EntityCard, type GraphEntity, type GraphRelation } from './EntityCard'

interface KnowledgeGraphPanelProps {
  /** Text used to extract entities (current sentence or paragraph). */
  text: string
  /** Document title for header context. */
  documentTitle?: string
}

interface ExtractResponse {
  entities: Array<{ id: string; label: string; group: string }>
  nodes: GraphEntity[]
  edges: GraphRelation[]
  stats: { nodes: number; edges: number; matched_entities: number }
  loaded?: boolean
}

interface EntityDetail {
  entity: GraphEntity
  relations: GraphRelation[]
  neighbors: GraphEntity[]
}

const GROUP_COLORS: Record<string, string> = {
  '人物': 'var(--gf-gugong-red)',
  '典籍': 'var(--gf-gold)',
  '概念': '#3c8a51',
  '篇章': '#8b6f47',
  '典故': '#b85c00',
}

const GROUP_FALLBACK_COLOR = 'rgba(26,30,35,0.5)'

function nodeColor(group: string): string {
  return GROUP_COLORS[group] || GROUP_FALLBACK_COLOR
}

/** Polar to cartesian coordinates for circular layout. */
function polarToCartesian(cx: number, cy: number, radius: number, angleRad: number) {
  return {
    x: cx + radius * Math.cos(angleRad),
    y: cy + radius * Math.sin(angleRad),
  }
}

const SVG_SIZE = 320
const SVG_CENTER = SVG_SIZE / 2
const SVG_RADIUS = 110
const NODE_RADIUS = 18

export function KnowledgeGraphPanel({ text, documentTitle }: KnowledgeGraphPanelProps) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [data, setData] = useState<ExtractResponse | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [detail, setDetail] = useState<EntityDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [refreshCounter, setRefreshCounter] = useState(0)

  // Single ref to hold the latest AbortController for extract requests,
  // so text changes and refresh share one in-flight request lifecycle.
  const extractControllerRef = useRef<AbortController | null>(null)

  /**
   * Unified extract request: used by both text changes and refresh button.
   * Cancels any previous in-flight request before starting a new one.
   */
  const runExtract = useCallback(async (extractText: string) => {
    // Cancel any previous request.
    extractControllerRef.current?.abort()
    const controller = new AbortController()
    extractControllerRef.current = controller

    setLoading(true)
    setError('')
    setSelectedId(null)
    setDetail(null)

    try {
      const response = await fetch(`${API_BASE}/api/v1/graph/extract`, {
        ...authFetchOptions({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        }),
        body: JSON.stringify({ text: extractText, max_nodes: 30 }),
        signal: controller.signal,
      })
      if (!response.ok) {
        throw new Error('extract failed')
      }
      const payload: ExtractResponse = await response.json()
      if (controller.signal.aborted) return
      setData(payload)
      // Auto-select the first matched entity to show detail immediately.
      if (payload.entities.length > 0) {
        setSelectedId(payload.entities[0].id)
      }
    } catch {
      if (controller.signal.aborted) return
      setError('图谱加载失败，请稍后再试')
      setData(null)
    } finally {
      if (!controller.signal.aborted) setLoading(false)
    }
  }, [])

  // Single useEffect for both text changes and refresh.
  // - text change: refreshCounter stays the same, text differs → triggers.
  // - refresh button: refreshCounter increments → triggers.
  // Both share the same runExtract function and AbortController ref,
  // so there is never a duplicate request.
  useEffect(() => {
    if (!text.trim()) {
      // Cancel any in-flight request when text becomes empty.
      extractControllerRef.current?.abort()
      setData(null)
      setError('')
      setSelectedId(null)
      setDetail(null)
      return
    }

    void runExtract(text)

    return () => {
      extractControllerRef.current?.abort()
    }
  }, [text, refreshCounter, runExtract])

  // Load entity detail when selection changes.
  useEffect(() => {
    if (!selectedId) {
      setDetail(null)
      return
    }

    // If the selected node is already in the subgraph, build detail locally
    // to avoid an extra round-trip. This covers the common sidebar flow.
    if (data) {
      const entity = data.nodes.find((n) => n.id === selectedId)
      if (entity) {
        const relations = data.edges.filter(
          (e) => e.source === selectedId || e.target === selectedId,
        )
        const neighborIds = new Set<string>()
        relations.forEach((r) => {
          if (r.source === selectedId) neighborIds.add(r.target)
          if (r.target === selectedId) neighborIds.add(r.source)
        })
        const neighbors = data.nodes.filter((n) => neighborIds.has(n.id))
        setDetail({ entity, relations, neighbors })
        return
      }
    }

    // Fallback: fetch entity detail from the API (e.g. when the node is not
    // in the current subgraph but the user navigates from a neighbor card).
    const controller = new AbortController()
    let active = true
    setDetailLoading(true)

    async function loadDetail() {
      try {
        const response = await fetch(`${API_BASE}/api/v1/graph/entity/${selectedId}`, {
          ...authFetchOptions(),
          signal: controller.signal,
        })
        if (!response.ok) throw new Error('entity fetch failed')
        const payload: EntityDetail = await response.json()
        if (!active) return
        setDetail(payload)
      } catch {
        if (!active) return
        setDetail(null)
      } finally {
        if (active) setDetailLoading(false)
      }
    }

    void loadDetail()

    return () => {
      active = false
      controller.abort()
    }
  }, [selectedId, data])

  const layout = useMemo(() => {
    if (!data || data.nodes.length === 0) return null
    const centerId = selectedId || data.entities[0]?.id
    const centerNode = data.nodes.find((n) => n.id === centerId) || data.nodes[0]
    const neighbors = data.nodes.filter((n) => n.id !== centerNode.id)
    const count = neighbors.length
    const positions = new Map<string, { x: number; y: number }>()
    positions.set(centerNode.id, { x: SVG_CENTER, y: SVG_CENTER })
    neighbors.forEach((node, index) => {
      const angle = count > 0 ? (2 * Math.PI * index) / count - Math.PI / 2 : 0
      positions.set(node.id, polarToCartesian(SVG_CENTER, SVG_CENTER, SVG_RADIUS, angle))
    })
    return { centerNode, neighbors, positions }
  }, [data, selectedId])

  const handleRefresh = () => {
    if (!text.trim()) return
    setRefreshCounter((c) => c + 1)
  }

  const handleNodeKeyDown = (e: React.KeyboardEvent, nodeId: string) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      setSelectedId(nodeId)
    }
  }

  const hasContent = Boolean(data && data.nodes.length > 0)
  const matchedCount = data?.stats.matched_entities ?? 0

  return (
    <div
      className="flex h-full min-h-0 flex-col rounded-[20px] p-4"
      style={{
        backgroundColor: 'rgba(255,255,255,0.72)',
        border: '1px solid rgba(26,30,35,0.06)',
      }}
      data-testid="knowledge-graph-panel"
    >
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Network className="h-4 w-4" style={{ color: 'var(--gf-gugong-red)' }} />
          <h3
            className="text-base font-medium"
            style={{ color: 'var(--gf-text)', fontFamily: '"Noto Serif SC", serif' }}
          >
            知识图谱
          </h3>
          {matchedCount > 0 && (
            <span
              className="rounded-full px-2 py-0.5 text-[11px]"
              style={{ backgroundColor: 'rgba(26,30,35,0.06)', color: 'rgba(26,30,35,0.58)' }}
            >
              识别到 {matchedCount} 个实体
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={handleRefresh}
          disabled={loading || !text.trim()}
          aria-label="刷新图谱"
          className="rounded-lg p-1.5 transition-colors hover:bg-black/5 disabled:opacity-40"
          style={{ color: 'rgba(26,30,35,0.5)' }}
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {documentTitle && (
        <div className="mb-2 truncate text-xs" style={{ color: 'rgba(26,30,35,0.45)' }}>
          当前文本：{documentTitle}
        </div>
      )}

      {loading && (
        <div className="flex flex-1 items-center justify-center py-10">
          <div className="text-sm" style={{ color: 'rgba(26,30,35,0.45)' }}>
            正在识别实体与关系...
          </div>
        </div>
      )}

      {!loading && error && (
        <div
          className="rounded-[14px] px-3 py-2 text-xs"
          style={{ backgroundColor: 'rgba(176,58,58,0.08)', color: '#b03a3a' }}
        >
          {error}
        </div>
      )}

      {!loading && !error && !hasContent && (
        <div className="flex flex-1 flex-col items-center justify-center py-10 text-center">
          <Network className="mb-2 h-8 w-8" style={{ color: 'rgba(26,30,35,0.2)' }} />
          <div className="text-sm" style={{ color: 'rgba(26,30,35,0.5)' }}>
            {text.trim() ? '当前文本未识别到已收录的实体' : '选中一句古文即可展示关联图谱'}
          </div>
        </div>
      )}

      {!loading && !error && hasContent && layout && data && (
        <div className="flex min-h-0 flex-1 flex-col">
          {/* SVG radial graph */}
          <div className="flex justify-center">
            <svg
              width={SVG_SIZE}
              height={SVG_SIZE}
              viewBox={`0 0 ${SVG_SIZE} ${SVG_SIZE}`}
              className="max-w-full"
              role="img"
              aria-label="实体关系图"
            >
              {/* Edges */}
              {data.edges.map((edge, idx) => {
                const sourcePos = layout.positions.get(edge.source)
                const targetPos = layout.positions.get(edge.target)
                if (!sourcePos || !targetPos) return null
                return (
                  <line
                    key={`edge-${idx}`}
                    x1={sourcePos.x}
                    y1={sourcePos.y}
                    x2={targetPos.x}
                    y2={targetPos.y}
                    stroke="rgba(26,30,35,0.18)"
                    strokeWidth={1.2}
                  />
                )
              })}
              {/* Nodes */}
              {[layout.centerNode, ...layout.neighbors].map((node) => {
                const pos = layout.positions.get(node.id)
                if (!pos) return null
                const isCenter = node.id === layout.centerNode.id
                const isSelected = node.id === selectedId
                const color = nodeColor(node.group)
                return (
                  <g
                    key={`node-${node.id}`}
                    onClick={() => setSelectedId(node.id)}
                    onKeyDown={(e) => handleNodeKeyDown(e, node.id)}
                    tabIndex={0}
                    style={{ cursor: 'pointer' }}
                    role="button"
                    aria-label={`实体：${node.label}，按 Enter 查看详情`}
                  >
                    <circle
                      cx={pos.x}
                      cy={pos.y}
                      r={isCenter ? NODE_RADIUS + 4 : NODE_RADIUS}
                      fill={color}
                      fillOpacity={isSelected ? 1 : 0.78}
                      stroke={isSelected ? '#fff' : 'rgba(255,255,255,0.5)'}
                      strokeWidth={isSelected ? 2.5 : 1.5}
                    />
                    <text
                      x={pos.x}
                      y={pos.y + NODE_RADIUS + 14}
                      textAnchor="middle"
                      style={{
                        fontSize: isCenter ? 13 : 11,
                        fontFamily: '"Noto Serif SC", serif',
                        fill: 'var(--gf-text)',
                        fontWeight: isCenter ? 500 : 400,
                      }}
                    >
                      {node.label}
                    </text>
                  </g>
                )
              })}
            </svg>
          </div>

          {/* Legend */}
          <div className="mt-1 mb-3 flex flex-wrap justify-center gap-2">
            {Object.entries(GROUP_COLORS).map(([group, color]) => (
              <div key={group} className="flex items-center gap-1">
                <span
                  className="inline-block h-2 w-2 rounded-full"
                  style={{ backgroundColor: color }}
                  aria-hidden
                />
                <span className="text-[10px]" style={{ color: 'rgba(26,30,35,0.5)' }}>
                  {group}
                </span>
              </div>
            ))}
          </div>

          {/* Entity detail card */}
          <div className="min-h-0 flex-1 overflow-y-auto">
            {detailLoading ? (
              <div className="py-6 text-center text-sm" style={{ color: 'rgba(26,30,35,0.45)' }}>
                正在加载实体详情...
              </div>
            ) : detail ? (
              <EntityCard
                entity={detail.entity}
                relations={detail.relations}
                neighbors={detail.neighbors}
                onSelectNeighbor={(id) => setSelectedId(id)}
              />
            ) : null}
          </div>
        </div>
      )}
    </div>
  )
}
