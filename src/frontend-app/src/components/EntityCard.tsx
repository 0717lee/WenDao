import { useMemo } from 'react'
import { ArrowRight } from 'lucide-react'

export interface GraphEntity {
  id: string
  label: string
  group: string
  desc?: string
  era?: string
  aliases?: string[]
}

export interface GraphRelation {
  source: string
  target: string
  relation: string
  desc?: string
}

interface EntityCardProps {
  entity: GraphEntity
  relations: GraphRelation[]
  neighbors: GraphEntity[]
  onSelectNeighbor?: (entityId: string) => void
  onClose?: () => void
}

const GROUP_LABELS: Record<string, string> = {
  '人物': '人物',
  '典籍': '典籍',
  '概念': '概念',
  '篇章': '篇章',
  '典故': '典故',
}

const GROUP_COLORS: Record<string, string> = {
  '人物': 'var(--gf-gugong-red)',
  '典籍': 'var(--gf-gold)',
  '概念': '#3c8a51',
  '篇章': '#7a5a8c',
  '典故': '#b85c00',
}

export function EntityCard({ entity, relations, neighbors, onSelectNeighbor, onClose }: EntityCardProps) {
  const outbound = useMemo(
    () => relations.filter((r) => r.source === entity.id),
    [relations, entity.id],
  )
  const inbound = useMemo(
    () => relations.filter((r) => r.target === entity.id && r.source !== entity.id),
    [relations, entity.id],
  )

  const groupColor = GROUP_COLORS[entity.group] || 'rgba(26,30,35,0.6)'

  return (
    <div
      className="flex h-full flex-col rounded-[20px] p-4"
      style={{
        backgroundColor: 'rgba(255,255,255,0.78)',
        border: '1px solid rgba(26,30,35,0.06)',
      }}
      data-testid="entity-card"
    >
      <div className="mb-3 flex items-start justify-between gap-2">
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <span
              className="inline-block h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: groupColor }}
              aria-hidden
            />
            <h3
              className="text-lg font-medium"
              style={{ color: 'var(--gf-text)', fontFamily: '"Noto Serif SC", serif' }}
            >
              {entity.label}
            </h3>
            <span
              className="rounded-full px-2 py-0.5 text-[11px]"
              style={{ backgroundColor: 'rgba(26,30,35,0.06)', color: 'rgba(26,30,35,0.58)' }}
            >
              {GROUP_LABELS[entity.group] || entity.group}
            </span>
            {entity.era && (
              <span
                className="rounded-full px-2 py-0.5 text-[11px]"
                style={{ backgroundColor: 'rgba(201,160,99,0.12)', color: 'var(--gf-gold)' }}
              >
                {entity.era}
              </span>
            )}
          </div>
          {entity.aliases && entity.aliases.length > 0 && (
            <div className="mt-1 text-xs" style={{ color: 'rgba(26,30,35,0.45)' }}>
              别称：{entity.aliases.join('、')}
            </div>
          )}
        </div>
        {onClose && (
          <button
            onClick={onClose}
            aria-label="关闭实体卡片"
            className="rounded-lg px-2 py-1 text-xs transition-colors hover:bg-black/5"
            style={{ color: 'rgba(26,30,35,0.5)' }}
          >
            ✕
          </button>
        )}
      </div>

      {entity.desc && (
        <div
          className="mb-3 rounded-[14px] px-3 py-2 text-sm leading-7"
          style={{ backgroundColor: 'rgba(255,255,255,0.7)', color: 'rgba(26,30,35,0.72)' }}
        >
          {entity.desc}
        </div>
      )}

      {outbound.length > 0 && (
        <div className="mb-3">
          <div className="mb-1.5 text-[11px] tracking-[0.22em]" style={{ color: 'rgba(26,30,35,0.42)' }}>
            关联关系
          </div>
          <ul className="space-y-1.5">
            {outbound.map((rel, idx) => {
              const neighbor = neighbors.find((n) => n.id === rel.target)
              return (
                <li
                  key={`out-${idx}`}
                  className="flex items-center gap-2 rounded-[12px] px-2.5 py-1.5 text-xs"
                  style={{ backgroundColor: 'rgba(26,30,35,0.03)' }}
                >
                  <span
                    className="rounded-full px-2 py-0.5"
                    style={{ backgroundColor: 'rgba(140,26,17,0.08)', color: 'var(--gf-gugong-red)' }}
                  >
                    {rel.relation}
                  </span>
                  <ArrowRight className="h-3 w-3 shrink-0" style={{ color: 'rgba(26,30,35,0.3)' }} />
                  {neighbor ? (
                    <button
                      onClick={() => onSelectNeighbor?.(neighbor.id)}
                      className="font-medium transition-colors hover:underline"
                      style={{ color: 'var(--gf-text)' }}
                    >
                      {neighbor.label}
                    </button>
                  ) : (
                    <span style={{ color: 'rgba(26,30,35,0.6)' }}>{rel.target}</span>
                  )}
                  {rel.desc && (
                    <span className="ml-1 truncate" style={{ color: 'rgba(26,30,35,0.4)' }}>
                      · {rel.desc}
                    </span>
                  )}
                </li>
              )
            })}
          </ul>
        </div>
      )}

      {inbound.length > 0 && (
        <div className="mb-3">
          <div className="mb-1.5 text-[11px] tracking-[0.22em]" style={{ color: 'rgba(26,30,35,0.42)' }}>
            被引用
          </div>
          <ul className="space-y-1.5">
            {inbound.map((rel, idx) => {
              const neighbor = neighbors.find((n) => n.id === rel.source)
              return (
                <li
                  key={`in-${idx}`}
                  className="flex items-center gap-2 rounded-[12px] px-2.5 py-1.5 text-xs"
                  style={{ backgroundColor: 'rgba(26,30,35,0.03)' }}
                >
                  {neighbor ? (
                    <button
                      onClick={() => onSelectNeighbor?.(neighbor.id)}
                      className="font-medium transition-colors hover:underline"
                      style={{ color: 'var(--gf-text)' }}
                    >
                      {neighbor.label}
                    </button>
                  ) : (
                    <span style={{ color: 'rgba(26,30,35,0.6)' }}>{rel.source}</span>
                  )}
                  <ArrowRight className="h-3 w-3 shrink-0" style={{ color: 'rgba(26,30,35,0.3)' }} />
                  <span
                    className="rounded-full px-2 py-0.5"
                    style={{ backgroundColor: 'rgba(201,160,99,0.12)', color: 'var(--gf-gold)' }}
                  >
                    {rel.relation}
                  </span>
                </li>
              )
            })}
          </ul>
        </div>
      )}

      {relations.length === 0 && (
        <div className="mt-2 text-xs" style={{ color: 'rgba(26,30,35,0.4)' }}>
          暂未收录该实体的关联关系。
        </div>
      )}
    </div>
  )
}
