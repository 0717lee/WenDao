import { useEffect, useState } from 'react'
import {
  ArrowRight,
  BookOpen,
  Sparkles,
} from 'lucide-react'
import { API_BASE } from '../lib/api'
import { authFetchOptions } from '../store/useAuthStore'

const DASHBOARD_WARM_RETRY_MAX = 4
const DASHBOARD_WARM_RETRY_DELAY_MS = 900

interface DashboardHomeProps {
  onOpenDocument: (documentId: string, options?: { readerPanel?: 'notes' | 'study' | null }) => void
  onAsk: (prompt: string) => void
  onOpenReaderHub: () => void
  onOpenReaderUpload: () => void
}

interface BookshelfItem {
  id: string
  title: string
  author?: string
  dynasty?: string
  category?: string
  chapter_count?: number
  preview: string
  has_processed: boolean
  current_paragraph: number
  total_paragraphs: number
  source_type?: string
}

interface HistoryItem {
  id: string
  title: string
  last_read_at: string
}

function formatTimeLabel(value?: string) {
  if (!value) return '刚刚整理'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '刚刚整理'
  return date.toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' })
}

export default function DashboardHome({
  onOpenDocument,
  onAsk,
  onOpenReaderHub,
  onOpenReaderUpload,
}: DashboardHomeProps) {
  const [corpusTotal, setCorpusTotal] = useState<number | null>(null)
  const [documentsTotal, setDocumentsTotal] = useState<number | null>(null)
  const [corpusDocuments, setCorpusDocuments] = useState<BookshelfItem[]>([])
  const [history, setHistory] = useState<HistoryItem[]>([])

  useEffect(() => {
    let cancelled = false
    let retryTimer: ReturnType<typeof setTimeout> | null = null

    async function load(attempt = 0) {
      const loadJson = async <T,>(url: string, fallback: T): Promise<{ ok: boolean; data: T }> => {
        try {
          const response = await fetch(url, authFetchOptions())
          if (!response.ok) return { ok: false, data: fallback }
          return { ok: true, data: (await response.json()) as T }
        } catch {
          return { ok: false, data: fallback }
        }
      }

      const [docsSnapshot, corpusSnapshot, historySnapshot] = await Promise.all([
        loadJson<{ documents: BookshelfItem[], total?: number }>(`${API_BASE}/api/v1/documents?limit=12`, { documents: [], total: 0 }),
        loadJson<{ documents: BookshelfItem[], total?: number }>(`${API_BASE}/api/v1/documents?limit=12&source_type=corpus`, { documents: [], total: 0 }),
        loadJson<HistoryItem[]>(`${API_BASE}/api/v1/reader/history`, []),
      ])

      if (cancelled) return

      const docsData = docsSnapshot.data
      const corpusData = corpusSnapshot.data
      const historyData = historySnapshot.data
      const allDocuments = Array.isArray(docsData.documents) ? docsData.documents : []
      const corpusList = Array.isArray(corpusData.documents) ? corpusData.documents : []
      const nextCorpusTotal = Math.max(Number(corpusData.total) || 0, corpusList.length)
      const nextDocumentsTotal = Math.max(Number(docsData.total) || 0, allDocuments.length)
      const shouldRetry =
        corpusSnapshot.ok &&
        nextCorpusTotal === 0 &&
        corpusList.length === 0 &&
        attempt < DASHBOARD_WARM_RETRY_MAX

      if (shouldRetry) {
        retryTimer = setTimeout(() => {
          if (!cancelled) {
            void load(attempt + 1)
          }
        }, DASHBOARD_WARM_RETRY_DELAY_MS)
      } else {
        setCorpusDocuments(corpusList)
        setCorpusTotal(nextCorpusTotal)
        setDocumentsTotal(nextDocumentsTotal)
        setHistory(Array.isArray(historyData) ? historyData : [])
      }
    }

    void load()
    return () => {
      cancelled = true
      if (retryTimer) clearTimeout(retryTimer)
    }
  }, [])

  const firstCorpus = corpusDocuments[0]
  const latestHistoryDocumentId = history[0]?.id ?? null
  const recommendedStart = firstCorpus ?? null
  const corpusCountLabel = corpusTotal === null ? '准备中' : corpusTotal
  const documentsCountLabel = documentsTotal === null ? '准备中' : documentsTotal

  const openRecommendedStart = () => {
    if (recommendedStart) {
      onOpenDocument(recommendedStart.id)
      return
    }
    onOpenReaderHub()
  }

  const continueReadingAction = () => {
    if (latestHistoryDocumentId) {
      onOpenDocument(latestHistoryDocumentId, { readerPanel: 'notes' })
      return
    }
    onOpenReaderHub()
  }

  const askFromSentencePrompt = firstCorpus
    ? `我只记得一句古文，请带我从一句话开始读《${firstCorpus.title}》：先用最简单的话解释，再告诉我下一步该读哪里。`
    : '我只记得一句古文，请带我从一句话开始：先用最简单的话解释，再告诉我下一步可以读什么。'

  const heroEntryWays = [
    {
      key: 'read',
      eyebrow: '直接阅读',
      title: recommendedStart ? '打开推荐内容' : '前往阅读页挑选',
      description: '适合先读一篇时使用。',
      action: openRecommendedStart,
      accent: 'var(--gf-gugong-red)',
      accentSoft: 'rgba(140,26,17,0.08)',
    },
    {
      key: 'ask',
      eyebrow: '解释一句',
      title: '先解释一句古文',
      description: '适合已经记得一句原文时使用。',
      action: () => onAsk(askFromSentencePrompt),
      accent: '#7b5b44',
      accentSoft: 'rgba(123,91,68,0.08)',
    },
    {
      key: 'scan',
      eyebrow: '上传图片',
      title: '先识别图片文字',
      description: '适合手头只有图片时使用。',
      action: onOpenReaderUpload,
      accent: 'var(--gf-gold)',
      accentSoft: 'rgba(201,160,99,0.12)',
    },
  ]

  return (
    <div className="relative h-full overflow-y-auto px-4 py-5 md:px-6 md:py-7" style={{ backgroundColor: 'var(--gf-bg)' }}>
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="ink-wash-blob absolute left-[6%] top-4 h-72 w-72" style={{ backgroundColor: 'rgba(201,160,99,0.14)' }} />
        <div className="ink-wash-blob absolute right-[10%] top-24 h-80 w-80" style={{ backgroundColor: 'rgba(140,26,17,0.10)', animationDelay: '-4s' }} />
        <div className="ink-wash-blob absolute left-[40%] bottom-[10%] h-64 w-64" style={{ backgroundColor: 'rgba(201,160,99,0.08)', animationDelay: '-8s' }} />
        <div className="absolute inset-x-0 top-0 h-48" style={{ background: 'linear-gradient(180deg, rgba(244,241,225,0.92), rgba(247,246,243,0))' }} />
      </div>

      <div className="relative mx-auto max-w-6xl space-y-6">
        <section
          className="relative overflow-hidden rounded-[38px] p-6 md:p-10"
          style={{
            background:
              'linear-gradient(135deg, rgba(255,255,255,0.88) 0%, rgba(249,244,230,0.96) 48%, rgba(247,246,243,0.98) 100%)',
            border: '1px solid rgba(26,30,35,0.06)',
            boxShadow: '0 28px 64px rgba(26,30,35,0.08)',
          }}
        >
          <div className="pointer-events-none absolute inset-0">
            <div className="absolute inset-y-8 left-8 w-px" style={{ background: 'linear-gradient(180deg, rgba(140,26,17,0), rgba(140,26,17,0.22), rgba(140,26,17,0))' }} />
            <div className="absolute -right-16 top-10 h-56 w-56 rounded-full blur-3xl" style={{ backgroundColor: 'rgba(201,160,99,0.18)' }} />
            <div className="absolute bottom-0 left-1/4 h-28 w-80 -translate-x-1/2 rounded-full blur-3xl" style={{ backgroundColor: 'rgba(140,26,17,0.09)' }} />
            <div
              className="absolute inset-0 opacity-40"
              style={{
                backgroundImage:
                  'repeating-linear-gradient(90deg, rgba(26,30,35,0.018) 0, rgba(26,30,35,0.018) 1px, transparent 1px, transparent 84px)',
              }}
            />
          </div>

          <div className="relative grid gap-8 lg:grid-cols-[1.16fr_0.84fr] lg:items-center">
            <div className="space-y-5">
              <div className="space-y-3">
                <span
                  className="inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-[11px] tracking-[0.28em]"
                  style={{ backgroundColor: 'rgba(140,26,17,0.09)', color: 'var(--gf-gugong-red)' }}
                >
                  <Sparkles className="h-3.5 w-3.5" />
                  开始使用
                </span>
                <div className="text-xs tracking-[0.36em]" style={{ color: 'rgba(26,30,35,0.34)' }}>
                  先选一种开始方式
                </div>
              </div>

              <div className="space-y-4">
                <h2
                  className="max-w-3xl text-4xl leading-[1.08] md:text-5xl"
                  style={{ fontFamily: '"ZCOOL XiaoWei", serif', color: 'var(--gf-text)' }}
                >
                  读不懂古文时，
                  <br className="hidden md:block" />
                  可以从这里开始
                </h2>
                <p className="max-w-2xl text-sm leading-7 md:text-base" style={{ color: 'rgba(26,30,35,0.62)' }}>
                  可以直接阅读一篇内容、解释一句古文，或上传图片识别。先选一种最适合当前情况的方式即可。
                </p>
              </div>

            </div>

            <div
              className="relative rounded-[30px] p-5 md:p-6"
              style={{
                backgroundColor: 'rgba(255,255,255,0.72)',
                border: '1px solid rgba(26,30,35,0.07)',
                boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.55)',
                backdropFilter: 'blur(10px)',
              }}
            >
              <div className="mb-5 flex items-center gap-2 text-sm" style={{ color: 'var(--gf-text)' }}>
                <BookOpen className="h-4 w-4" />
                请选择开始方式
              </div>
              <div className="space-y-4">
                {heroEntryWays.map((item, index) => (
                  <button
                    key={item.key}
                    onClick={item.action}
                    className="group relative flex w-full items-start gap-4 rounded-[24px] px-4 py-4 pr-12 text-left transition-all duration-300 hover:-translate-y-0.5"
                    style={{
                      backgroundColor: item.accentSoft,
                      border: '1px solid rgba(26,30,35,0.05)',
                    }}
                  >
                    <div
                      className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm"
                      style={{ backgroundColor: item.accent, color: '#fff' }}
                    >
                      {index + 1}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-[11px] tracking-[0.24em]" style={{ color: item.accent }}>
                        {item.eyebrow}
                      </div>
                      <div className="mt-1 text-base font-medium" style={{ color: 'var(--gf-text)' }}>
                        {item.title}
                      </div>
                      <div className="mt-1 text-sm leading-6" style={{ color: 'rgba(26,30,35,0.58)' }}>
                        {item.description}
                      </div>
                    </div>
                    <ArrowRight
                      className="absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 shrink-0 transition-transform duration-300 group-hover:translate-x-0.5"
                      style={{ color: item.accent }}
                    />
                  </button>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="grid gap-5 lg:grid-cols-2">
          <div
            className="rounded-[28px] p-4 md:p-5"
            style={{ backgroundColor: 'rgba(255,255,255,0.68)', border: '1px solid rgba(26,30,35,0.06)' }}
          >
            <div className="mb-4">
              <h3 className="text-base font-medium" style={{ color: 'var(--gf-text)' }}>
                继续上次阅读
              </h3>
              <p className="text-xs" style={{ color: 'rgba(26,30,35,0.45)' }}>
                如果之前读过，可以直接从上次停下的地方继续。
              </p>
            </div>

            <div
              className="rounded-[24px] px-4 py-4"
              style={{
                background: 'linear-gradient(180deg, rgba(255,255,255,0.84) 0%, rgba(237,244,247,0.96) 100%)',
                border: '1px solid rgba(26,30,35,0.06)',
                boxShadow: '0 10px 24px rgba(26,30,35,0.04)',
              }}
            >
              <div className="mb-2 text-[11px] tracking-[0.24em]" style={{ color: 'rgba(26,30,35,0.42)' }}>
                {history.length > 0 ? '上次读到' : '还没开始'}
              </div>
              <div className="text-base font-medium" style={{ color: 'var(--gf-text)' }}>
                {history[0]?.title || '还没有阅读记录'}
              </div>
              <div className="mt-2 text-sm leading-7" style={{ color: 'rgba(26,30,35,0.56)' }}>
                {history[0] ? `最近阅读：${formatTimeLabel(history[0].last_read_at)}` : '第一次使用时，也可以先打开推荐内容。'}
              </div>
              <button
                onClick={continueReadingAction}
                className="mt-4 inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm transition-all duration-300 hover:-translate-y-0.5"
                style={{ backgroundColor: 'rgba(140,26,17,0.08)', color: 'var(--gf-gugong-red)' }}
              >
                {history[0] ? '继续上次阅读' : '去阅读页看看'}
                <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          </div>

          <div
            className="rounded-[28px] p-4 md:p-5"
            style={{ backgroundColor: 'rgba(255,255,255,0.68)', border: '1px solid rgba(26,30,35,0.06)' }}
          >
            <div className="mb-4">
              <h3 className="text-base font-medium" style={{ color: 'var(--gf-text)' }}>
                还不知道读什么
              </h3>
              <p className="text-xs" style={{ color: 'rgba(26,30,35,0.45)' }}>
                不知道选哪篇时，可以先从推荐内容开始。
              </p>
            </div>

            <div
              className="rounded-[24px] px-4 py-4"
              style={{ backgroundColor: 'rgba(248,244,233,0.92)', border: '1px solid rgba(201,160,99,0.16)' }}
            >
              <div className="text-[11px] tracking-[0.24em]" style={{ color: 'rgba(26,30,35,0.42)' }}>
                先读这个
              </div>
              <div className="mt-2 text-base font-medium" style={{ color: 'var(--gf-text)' }}>
                {recommendedStart?.title || '先去阅读页挑一篇'}
              </div>
              <div className="mt-2 text-sm leading-7" style={{ color: 'rgba(26,30,35,0.56)' }}>
                {recommendedStart?.preview || '如果暂时没有明确目标，建议先从篇幅较短、容易进入的内容开始。'}
              </div>
              <div className="mt-3 flex flex-wrap gap-2 text-[11px]">
                <span className="rounded-full px-3 py-1" style={{ backgroundColor: 'rgba(255,255,255,0.72)', color: 'rgba(26,30,35,0.62)' }}>
                  古籍库 {corpusCountLabel}
                </span>
                <span className="rounded-full px-3 py-1" style={{ backgroundColor: 'rgba(255,255,255,0.72)', color: 'rgba(26,30,35,0.62)' }}>
                  现在能读 {documentsCountLabel}
                </span>
              </div>
              <div className="mt-4 flex flex-wrap gap-3">
                <button
                  onClick={openRecommendedStart}
                  className="inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm transition-all duration-300 hover:-translate-y-0.5"
                  style={{ backgroundColor: 'rgba(140,26,17,0.08)', color: 'var(--gf-gugong-red)' }}
                >
                  从这篇开始
                  <ArrowRight className="h-4 w-4" />
                </button>
                <button
                  onClick={onOpenReaderHub}
                  className="inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm transition-all duration-300 hover:-translate-y-0.5"
                  style={{ backgroundColor: 'rgba(255,255,255,0.78)', color: 'rgba(26,30,35,0.62)', border: '1px solid rgba(26,30,35,0.08)' }}
                >
                  去阅读页自己挑
                </button>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  )
}
