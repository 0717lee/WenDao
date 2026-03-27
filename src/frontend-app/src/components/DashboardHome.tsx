import { useEffect, useState } from 'react'
import { BookOpen, Brain, Clock3, LibraryBig, Sparkles, Star } from 'lucide-react'
import { API_BASE } from '../lib/api'

interface DashboardHomeProps {
  onOpenDocument: (documentId: string) => void
  onAsk: (prompt: string) => void
  onOpenBookshelf: () => void
  onOpenWordbook: () => void
  onOpenCompare: () => void
}

interface BookshelfItem {
  id: string
  title: string
  preview: string
  has_processed: boolean
  current_paragraph: number
  total_paragraphs: number
}

interface HistoryItem {
  id: string
  title: string
  last_read_at: string
}

interface WordbookItem {
  id: string
  word: string
  meaning: string
}

interface AnalyticsOverview {
  total_nodes: number
  total_edges: number
  top_entities: Array<{ id: string; label: string; count: number }>
}

interface RecommendationItem {
  id: string
  title: string
  preview?: string
  reasons?: string[]
}

const SAMPLE_PROMPTS = [
  '“学而时习之”到底在讲什么？',
  '请用白话解释《道德经》第一章',
  '孔子和孟子的思想有什么联系？',
]

function formatTimeLabel(value?: string) {
  if (!value) return '刚刚整理'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '刚刚整理'
  return date.toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' })
}

export default function DashboardHome({
  onOpenDocument,
  onAsk,
  onOpenBookshelf,
  onOpenWordbook,
  onOpenCompare,
}: DashboardHomeProps) {
  const [loading, setLoading] = useState(true)
  const [documents, setDocuments] = useState<BookshelfItem[]>([])
  const [history, setHistory] = useState<HistoryItem[]>([])
  const [wordbook, setWordbook] = useState<WordbookItem[]>([])
  const [analytics, setAnalytics] = useState<AnalyticsOverview | null>(null)
  const [recommendations, setRecommendations] = useState<RecommendationItem[]>([])

  useEffect(() => {
    let cancelled = false

    async function load() {
      setLoading(true)
      try {
        const [docsRes, historyRes, wordbookRes, analyticsRes, recommendationRes] = await Promise.all([
          fetch(`${API_BASE}/api/v1/documents?limit=6`),
          fetch(`${API_BASE}/api/v1/reader/history`),
          fetch(`${API_BASE}/api/v1/reader/wordbook?limit=6`),
          fetch(`${API_BASE}/api/v1/analytics/overview`),
          fetch(`${API_BASE}/api/v1/documents/recommendations?limit=4`),
        ])

        const [docsData, historyData, wordbookData, analyticsData, recommendationData] = await Promise.all([
          docsRes.ok ? docsRes.json() : { documents: [] },
          historyRes.ok ? historyRes.json() : [],
          wordbookRes.ok ? wordbookRes.json() : { entries: [] },
          analyticsRes.ok ? analyticsRes.json() : null,
          recommendationRes.ok ? recommendationRes.json() : { documents: [] },
        ])

        if (cancelled) return
        setDocuments(Array.isArray(docsData.documents) ? docsData.documents : [])
        setHistory(Array.isArray(historyData) ? historyData : [])
        setWordbook(Array.isArray(wordbookData.entries) ? wordbookData.entries : [])
        setAnalytics(analyticsData && typeof analyticsData === 'object' ? analyticsData : null)
        setRecommendations(Array.isArray(recommendationData.documents) ? recommendationData.documents : [])
      } catch {
        if (cancelled) return
        setDocuments([])
        setHistory([])
        setWordbook([])
        setAnalytics(null)
        setRecommendations([])
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    return () => {
      cancelled = true
    }
  }, [])

  const statCards = [
    {
      label: '书架文档',
      value: documents.length,
      icon: LibraryBig,
      accent: 'var(--gf-gugong-red)',
    },
    {
      label: '图谱节点',
      value: analytics?.total_nodes ?? 0,
      icon: Brain,
      accent: 'var(--gf-gold)',
    },
    {
      label: '阅读记录',
      value: history.length,
      icon: Clock3,
      accent: '#5b8aab',
    },
    {
      label: '生词本',
      value: wordbook.length,
      icon: Star,
      accent: '#3c8a51',
    },
  ]

  return (
    <div className="h-full overflow-y-auto px-4 py-5 md:px-6 md:py-6" style={{ backgroundColor: 'var(--gf-bg)' }}>
      <div className="mx-auto max-w-6xl space-y-5">
        <section
          className="rounded-3xl p-6 md:p-8"
          style={{
            background:
              'linear-gradient(135deg, rgba(255,255,255,0.78) 0%, rgba(244,241,225,0.88) 100%)',
            border: '1px solid rgba(26,30,35,0.06)',
            boxShadow: '0 24px 48px rgba(26,30,35,0.06)',
          }}
        >
          <div className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
            <div className="space-y-3">
              <span
                className="inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs tracking-widest"
                style={{ backgroundColor: 'rgba(140,26,17,0.08)', color: 'var(--gf-gugong-red)' }}
              >
                <Sparkles className="h-3.5 w-3.5" />
                古籍书房
              </span>
              <div className="space-y-2">
                <h2
                  className="text-2xl md:text-3xl tracking-wider"
                  style={{ fontFamily: '"ZCOOL XiaoWei", serif', color: 'var(--gf-text)' }}
                >
                  把上传、阅读、追问和沉淀放进同一个书房
                </h2>
                <p className="max-w-2xl text-sm leading-7 md:text-base" style={{ color: 'rgba(26,30,35,0.62)' }}>
                  从 OCR 导入，到三栏阅读、生词积累、图谱探索，再到继续追问，所有主链路都可以从这里进入。
                </p>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                onClick={onOpenBookshelf}
                className="rounded-2xl px-4 py-2.5 text-sm text-white transition-colors"
                style={{ backgroundColor: 'var(--gf-gugong-red)' }}
              >
                打开书架
              </button>
              <button
                onClick={onOpenWordbook}
                className="rounded-2xl px-4 py-2.5 text-sm transition-colors"
                style={{
                  backgroundColor: 'rgba(26,30,35,0.04)',
                  color: 'var(--gf-text)',
                  border: '1px solid rgba(26,30,35,0.08)',
                }}
              >
                查看生词本
              </button>
              <button
                onClick={onOpenCompare}
                className="rounded-2xl px-4 py-2.5 text-sm transition-colors"
                style={{
                  backgroundColor: 'rgba(201,160,99,0.12)',
                  color: 'var(--gf-gold)',
                  border: '1px solid rgba(201,160,99,0.2)',
                }}
              >
                对照阅读
              </button>
            </div>
          </div>
        </section>

        <section className="grid gap-3 md:grid-cols-4">
          {statCards.map((item) => (
            <div
              key={item.label}
              className="rounded-2xl p-4"
              style={{
                backgroundColor: 'rgba(255,255,255,0.68)',
                border: '1px solid rgba(26,30,35,0.06)',
              }}
            >
              <div className="mb-3 flex items-center justify-between">
                <span className="text-xs tracking-wider" style={{ color: 'rgba(26,30,35,0.45)' }}>
                  {item.label}
                </span>
                <item.icon className="h-4 w-4" style={{ color: item.accent }} />
              </div>
              <div className="text-2xl" style={{ color: 'var(--gf-text)', fontFamily: '"ZCOOL XiaoWei", serif' }}>
                {loading ? '...' : item.value}
              </div>
            </div>
          ))}
        </section>

        <section className="grid gap-5 lg:grid-cols-[1.1fr_0.9fr]">
          <div
            className="rounded-2xl p-4 md:p-5"
            style={{ backgroundColor: 'rgba(255,255,255,0.68)', border: '1px solid rgba(26,30,35,0.06)' }}
          >
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h3 className="text-base font-medium" style={{ color: 'var(--gf-text)' }}>
                  推荐提问
                </h3>
                <p className="text-xs" style={{ color: 'rgba(26,30,35,0.45)' }}>
                  适合答辩演示和首次体验的稳定问题
                </p>
              </div>
            </div>
            <div className="space-y-2">
              {SAMPLE_PROMPTS.map((prompt) => (
                <button
                  key={prompt}
                  onClick={() => onAsk(prompt)}
                  className="w-full rounded-2xl px-4 py-3 text-left text-sm transition-colors hover:bg-[rgba(140,26,17,0.05)]"
                  style={{ border: '1px solid rgba(26,30,35,0.08)', color: 'var(--gf-text)' }}
                >
                  {prompt}
                </button>
              ))}
            </div>
          </div>

          <div
            className="rounded-2xl p-4 md:p-5"
            style={{ backgroundColor: 'rgba(255,255,255,0.68)', border: '1px solid rgba(26,30,35,0.06)' }}
          >
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h3 className="text-base font-medium" style={{ color: 'var(--gf-text)' }}>
                  图谱热点
                </h3>
                <p className="text-xs" style={{ color: 'rgba(26,30,35,0.45)' }}>
                  当前知识图谱中连接度最高的实体
                </p>
              </div>
            </div>
            <div className="space-y-2">
              {(analytics?.top_entities || []).slice(0, 5).map((entity) => (
                <div
                  key={entity.id}
                  className="flex items-center justify-between rounded-xl px-3 py-2 text-sm"
                  style={{ backgroundColor: 'rgba(26,30,35,0.03)', color: 'var(--gf-text)' }}
                >
                  <span>{entity.label}</span>
                  <span style={{ color: 'rgba(26,30,35,0.45)' }}>{entity.count} 关联</span>
                </div>
              ))}
              {!loading && (analytics?.top_entities || []).length === 0 && (
                <p className="text-sm" style={{ color: 'rgba(26,30,35,0.35)' }}>
                  暂无可展示数据
                </p>
              )}
            </div>
          </div>
        </section>

        <section className="grid gap-5 lg:grid-cols-2">
          <div
            className="rounded-2xl p-4 md:p-5"
            style={{ backgroundColor: 'rgba(255,255,255,0.68)', border: '1px solid rgba(26,30,35,0.06)' }}
          >
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h3 className="text-base font-medium" style={{ color: 'var(--gf-text)' }}>
                  最近文档
                </h3>
                <p className="text-xs" style={{ color: 'rgba(26,30,35,0.45)' }}>
                  从书架里继续打开已经处理过的古籍
                </p>
              </div>
            </div>
            <div className="space-y-2">
              {documents.slice(0, 4).map((doc) => (
                <button
                  key={doc.id}
                  onClick={() => onOpenDocument(doc.id)}
                  className="w-full rounded-2xl px-4 py-3 text-left transition-colors hover:bg-[rgba(26,30,35,0.03)]"
                  style={{ border: '1px solid rgba(26,30,35,0.08)' }}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-1">
                      <div className="text-sm font-medium" style={{ color: 'var(--gf-text)' }}>
                        {doc.title}
                      </div>
                      <div className="line-clamp-2 text-xs leading-6" style={{ color: 'rgba(26,30,35,0.48)' }}>
                        {doc.preview || '暂无摘要'}
                      </div>
                    </div>
                    <span className="shrink-0 text-[11px]" style={{ color: doc.has_processed ? 'var(--gf-gold)' : 'rgba(26,30,35,0.35)' }}>
                      {doc.has_processed ? '已处理' : '待处理'}
                    </span>
                  </div>
                </button>
              ))}
              {!loading && documents.length === 0 && (
                <p className="text-sm" style={{ color: 'rgba(26,30,35,0.35)' }}>
                  还没有文档，先去阅读页上传一张古籍图片。
                </p>
              )}
            </div>
          </div>

          <div
            className="rounded-2xl p-4 md:p-5"
            style={{ backgroundColor: 'rgba(255,255,255,0.68)', border: '1px solid rgba(26,30,35,0.06)' }}
          >
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h3 className="text-base font-medium" style={{ color: 'var(--gf-text)' }}>
                  最近沉淀
                </h3>
                <p className="text-xs" style={{ color: 'rgba(26,30,35,0.45)' }}>
                  阅读记录与生词本共同构成你的学习轨迹
                </p>
              </div>
            </div>
            <div className="space-y-3">
              <div>
                <div className="mb-2 flex items-center gap-2 text-sm" style={{ color: 'var(--gf-text)' }}>
                  <BookOpen className="h-4 w-4" />
                  最近阅读
                </div>
                <div className="space-y-2">
                  {history.slice(0, 3).map((item) => (
                    <button
                      key={item.id}
                      onClick={() => onOpenDocument(item.id)}
                      className="w-full rounded-xl px-3 py-2 text-left text-sm"
                      style={{ backgroundColor: 'rgba(26,30,35,0.03)', color: 'var(--gf-text)' }}
                    >
                      <span>{item.title}</span>
                      <span className="ml-2 text-xs" style={{ color: 'rgba(26,30,35,0.4)' }}>
                        {formatTimeLabel(item.last_read_at)}
                      </span>
                    </button>
                  ))}
                  {!loading && history.length === 0 && (
                    <p className="text-sm" style={{ color: 'rgba(26,30,35,0.35)' }}>
                      还没有阅读记录。
                    </p>
                  )}
                </div>
              </div>

              <div>
                <div className="mb-2 flex items-center gap-2 text-sm" style={{ color: 'var(--gf-text)' }}>
                  <Star className="h-4 w-4" />
                  最近生词
                </div>
                <div className="flex flex-wrap gap-2">
                  {wordbook.slice(0, 6).map((entry) => (
                    <button
                      key={entry.id}
                      onClick={() => onAsk(`请解释“${entry.word}”在古籍中的含义和用法`)}
                      className="rounded-full px-3 py-1.5 text-xs transition-colors hover:bg-[rgba(140,26,17,0.08)]"
                      style={{ border: '1px solid rgba(26,30,35,0.08)', color: 'var(--gf-text)' }}
                    >
                      {entry.word}
                    </button>
                  ))}
                  {!loading && wordbook.length === 0 && (
                    <p className="text-sm" style={{ color: 'rgba(26,30,35,0.35)' }}>
                      还没有生词，阅读时点词即可收藏。
                    </p>
                  )}
                </div>
              </div>
            </div>
          </div>
        </section>

        <section
          className="rounded-2xl p-4 md:p-5"
          style={{ backgroundColor: 'rgba(255,255,255,0.68)', border: '1px solid rgba(26,30,35,0.06)' }}
        >
          <div className="mb-4">
            <h3 className="text-base font-medium" style={{ color: 'var(--gf-text)' }}>
              推荐继续阅读
            </h3>
            <p className="text-xs" style={{ color: 'rgba(26,30,35,0.45)' }}>
              基于图谱实体、生词本和最近阅读生成的下一步建议
            </p>
          </div>

          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {recommendations.map((item) => (
              <button
                key={item.id}
                onClick={() => onOpenDocument(item.id)}
                className="rounded-2xl px-4 py-4 text-left transition-colors hover:bg-[rgba(26,30,35,0.03)]"
                style={{ border: '1px solid rgba(26,30,35,0.08)' }}
              >
                <div className="mb-2 text-sm font-medium" style={{ color: 'var(--gf-text)' }}>
                  {item.title}
                </div>
                <div className="line-clamp-2 text-xs leading-6" style={{ color: 'rgba(26,30,35,0.48)' }}>
                  {item.preview || '暂无摘要'}
                </div>
                {item.reasons && item.reasons.length > 0 && (
                  <div className="mt-2 text-[11px]" style={{ color: 'var(--gf-gold)' }}>
                    {item.reasons[0]}
                  </div>
                )}
              </button>
            ))}
            {!loading && recommendations.length === 0 && (
              <p className="text-sm" style={{ color: 'rgba(26,30,35,0.35)' }}>
                暂无推荐，先读一篇古籍试试看。
              </p>
            )}
          </div>
        </section>
      </div>
    </div>
  )
}
