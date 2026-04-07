import { useEffect, useState } from 'react'
import {
  ArrowRight,
  Sparkles,
  ScrollText,
} from 'lucide-react'
import { API_BASE } from '../lib/api'
import { getDemoBookshelfDocuments } from '../data/demoDocuments'
import { authFetchOptions } from '../store/useAuthStore'

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
  const [homeInput, setHomeInput] = useState('')
  const [corpusTotal, setCorpusTotal] = useState(0)
  const [documentsTotal, setDocumentsTotal] = useState(0)

  const [corpusDocuments, setCorpusDocuments] = useState<BookshelfItem[]>([])
  const [sampleDocuments, setSampleDocuments] = useState<BookshelfItem[]>([])
  const [history, setHistory] = useState<HistoryItem[]>([])
  const [usingDemoSamples, setUsingDemoSamples] = useState(false)

  useEffect(() => {
    let cancelled = false

    async function load() {
      const loadJson = async <T,>(url: string, fallback: T): Promise<T> => {
        try {
          const response = await fetch(url, authFetchOptions())
          if (!response.ok) return fallback
          return (await response.json()) as T
        } catch {
          return fallback
        }
      }

      try {
        const [docsData, corpusData, sampleData, historyData] = await Promise.all([
          loadJson<{ documents: BookshelfItem[], total?: number }>(`${API_BASE}/api/v1/documents?limit=12`, { documents: [], total: 0 }),
          loadJson<{ documents: BookshelfItem[], total?: number }>(`${API_BASE}/api/v1/documents?limit=8&source_type=corpus`, { documents: [], total: 0 }),
          loadJson<{ documents: BookshelfItem[], total?: number }>(`${API_BASE}/api/v1/documents?limit=8&source_type=sample`, { documents: [], total: 0 }),
          loadJson<HistoryItem[]>(`${API_BASE}/api/v1/reader/history`, []),
        ])

        if (cancelled) return

        const allDocuments = Array.isArray(docsData.documents) ? docsData.documents : []
        const corpusList = Array.isArray(corpusData.documents) ? corpusData.documents : []
        const builtInSamples = Array.isArray(sampleData.documents) ? sampleData.documents : []
        const demoSamples = getDemoBookshelfDocuments()
        const resolvedSamples = builtInSamples.length > 0 ? builtInSamples : demoSamples

        setCorpusDocuments(corpusList)
        setCorpusTotal(corpusData.total || corpusList.length)
        setDocumentsTotal(docsData.total || allDocuments.length)
        setSampleDocuments(resolvedSamples)
        setUsingDemoSamples(builtInSamples.length === 0)
        setHistory(Array.isArray(historyData) ? historyData : [])
      } finally {
        // no-op: keep behavior explicit if this page needs a loading gate later
      }
    }

    load()
    return () => {
      cancelled = true
    }
  }, [])

  const firstCorpus = corpusDocuments[0]
  const firstSample = sampleDocuments[0]
  const latestHistoryDocumentId = history[0]?.id ?? null
  const continueReadingAction = () => {
    if (latestHistoryDocumentId) return onOpenDocument(latestHistoryDocumentId, { readerPanel: 'notes' })
    return onOpenReaderHub()
  }
  const aiOnboardingPrompt = firstCorpus
    ? `我第一次用古籍智解，请带我从《${firstCorpus.title}》开始：先用最简单的话告诉我这本书适合怎么读，再给我一句最适合入门的原文。`
    : '我第一次用古籍智解，请推荐一篇适合入门的古籍内容，并用最简单的话带我开始。'
  const openAiOnboarding = () => {
    onAsk(aiOnboardingPrompt)
  }
  const homeExamples = [
    '“学而时习之，不亦说乎？”到底在讲什么？',
    '请带我从《庄子》开始，告诉我第一篇该怎么读。',
    '解释“道法自然”原本是什么意思。',
  ]
  const startFromHomeInput = () => {
    const value = homeInput.trim()
    if (!value) {
      openAiOnboarding()
      return
    }
    onAsk(`请像古文陪读老师一样帮助我开始：先用最简单的话解释下面这句或这个问题，再告诉我下一步该读什么。\n\n${value}`)
  }
  const recommendedStart = firstCorpus ?? firstSample ?? null

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

          <div className="relative space-y-6">
            <div className="space-y-3">
              <span
                className="inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-[11px] tracking-[0.28em]"
                style={{ backgroundColor: 'rgba(140,26,17,0.09)', color: 'var(--gf-gugong-red)' }}
              >
                <Sparkles className="h-3.5 w-3.5" />
                陪你把一句读明白
              </span>
              <div className="text-xs tracking-[0.36em]" style={{ color: 'rgba(26,30,35,0.34)' }}>
                先贴一句，剩下的交给 WenDao
              </div>
            </div>

            <div className="space-y-4">
              <h2
                className="max-w-3xl text-4xl leading-[1.08] md:text-5xl"
                style={{ fontFamily: '"ZCOOL XiaoWei", serif', color: 'var(--gf-text)' }}
              >
                从一句看不懂的古文开始
              </h2>
              <p className="max-w-2xl text-sm leading-7 md:text-base" style={{ color: 'rgba(26,30,35,0.62)' }}>
                贴一句原文，输入一个问题，或者先上传一页图片。你不用先理解功能，先把卡住的地方说出来就行。
              </p>
            </div>

            <div
              className="rounded-[30px] p-5 md:p-6"
              style={{
                backgroundColor: 'rgba(255,255,255,0.74)',
                border: '1px solid rgba(26,30,35,0.07)',
                boxShadow: '0 18px 34px rgba(26,30,35,0.05)',
              }}
            >
              <div className="mb-3 text-sm" style={{ color: 'var(--gf-text)' }}>
                现在就开始：
              </div>
              <textarea
                value={homeInput}
                onChange={(event) => setHomeInput(event.target.value)}
                placeholder="贴一句古文、输入一个问题，或先想清楚你哪里读不懂"
                className="min-h-[120px] w-full rounded-[22px] px-4 py-4 text-sm leading-7 outline-none"
                style={{
                  backgroundColor: 'rgba(255,255,255,0.86)',
                  border: '1px solid rgba(26,30,35,0.08)',
                  color: 'var(--gf-text)',
                }}
              />
              <div className="mt-4 flex flex-wrap gap-3">
                <button
                  onClick={startFromHomeInput}
                  className="inline-flex items-center gap-2 rounded-full px-5 py-3 text-sm transition-all duration-300 hover:-translate-y-0.5"
                  style={{ backgroundColor: 'var(--gf-gugong-red)', color: '#fff', boxShadow: '0 14px 28px rgba(140,26,17,0.18)' }}
                >
                  开始读懂这句
                  <ArrowRight className="h-4 w-4" />
                </button>
                <button
                  onClick={onOpenReaderUpload}
                  className="inline-flex items-center gap-2 rounded-full px-5 py-3 text-sm transition-all duration-300 hover:-translate-y-0.5"
                  style={{ backgroundColor: 'rgba(255,255,255,0.78)', color: 'var(--gf-text)', border: '1px solid rgba(26,30,35,0.08)' }}
                >
                  上传图片识别
                  <ScrollText className="h-4 w-4" />
                </button>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                {homeExamples.map((item) => (
                  <button
                    key={item}
                    onClick={() => setHomeInput(item)}
                    className="rounded-full px-3 py-1.5 text-xs transition-all duration-300 hover:-translate-y-0.5"
                    style={{ backgroundColor: 'rgba(255,255,255,0.82)', border: '1px solid rgba(26,30,35,0.08)', color: 'rgba(26,30,35,0.62)' }}
                  >
                    {item}
                  </button>
                ))}
              </div>
              <div className="mt-3 text-xs leading-6" style={{ color: 'rgba(26,30,35,0.46)' }}>
                不想先提问也可以。下面保留了两个最轻的开始方式：继续上次阅读，或者从推荐篇目开始。
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
              <div>
                <h3 className="text-base font-medium" style={{ color: 'var(--gf-text)' }}>
                  继续上次阅读
                </h3>
                <p className="text-xs" style={{ color: 'rgba(26,30,35,0.45)' }}>
                  如果你不是第一次来，最省力的开始方式就是从上次停下的地方接着读。
                </p>
              </div>
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
                {history[0] ? `最近阅读：${formatTimeLabel(history[0].last_read_at)}` : '第一次来时，可以从右侧推荐篇目开始。'}
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
                  从推荐篇目开始
                </h3>
                <p className="text-xs" style={{ color: 'rgba(26,30,35,0.45)' }}>
                  如果你还没决定读什么，就先从一篇适合起步的内容开始。
                </p>
              </div>

            <div
              className="rounded-[24px] px-4 py-4"
              style={{ backgroundColor: 'rgba(248,244,233,0.92)', border: '1px solid rgba(201,160,99,0.16)' }}
            >
              <div className="text-[11px] tracking-[0.24em]" style={{ color: 'rgba(26,30,35,0.42)' }}>
                推荐起点
              </div>
              <div className="mt-2 text-base font-medium" style={{ color: 'var(--gf-text)' }}>
                {recommendedStart?.title || '先去阅读页挑一篇'}
              </div>
              <div className="mt-2 text-sm leading-7" style={{ color: 'rgba(26,30,35,0.56)' }}>
                {recommendedStart?.preview || '如果你还没有明确目标，推荐先从一篇短一点、容易起读的内容开始。'}
              </div>
              <div className="mt-3 flex flex-wrap gap-2 text-[11px]">
                <span className="rounded-full px-3 py-1" style={{ backgroundColor: 'rgba(255,255,255,0.72)', color: 'rgba(26,30,35,0.62)' }}>
                  古籍库 {corpusTotal}
                </span>
                <span className="rounded-full px-3 py-1" style={{ backgroundColor: 'rgba(255,255,255,0.72)', color: 'rgba(26,30,35,0.62)' }}>
                  可读文档 {documentsTotal}
                </span>
                {usingDemoSamples && (
                  <span className="rounded-full px-3 py-1" style={{ backgroundColor: 'rgba(255,255,255,0.72)', color: 'rgba(26,30,35,0.62)' }}>
                    离线样例可体验
                  </span>
                )}
              </div>
              <div className="mt-4 flex flex-wrap gap-3">
                <button
                  onClick={() => {
                    if (recommendedStart) {
                      onOpenDocument(recommendedStart.id)
                      return
                    }
                    onOpenReaderHub()
                  }}
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
