import { useEffect, useState } from 'react'
import {
  ArrowRight,
  BookOpen,
  Clock3,
  LibraryBig,
  Search,
  Sparkles,
  Star,
  ScrollText,
} from 'lucide-react'
import { API_BASE } from '../lib/api'
import { getDemoBookshelfDocuments } from '../data/demoDocuments'

interface DashboardHomeProps {
  onOpenDocument: (documentId: string) => void
  onAsk: (prompt: string) => void
  onSearch: (query: string) => void
  onOpenReaderHub: () => void
  onOpenWordbook: () => void
  onOpenCompare: () => void
  onContinueStudy: (documentId: string) => void
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

interface WordbookItem {
  id: string
  word: string
  meaning: string
}

interface RecommendationItem {
  id: string
  title: string
  preview?: string
  reasons?: string[]
}

interface StudyOverview {
  sessions_count: number
  reviewed_documents_count: number
  completed_cards: number
  mastered_cards: number
  review_again_cards: number
  mastery_rate: number
  last_reviewed_document?: { document_id: string; title: string; created_at?: string } | null
}

const QUICK_QUESTION_PROMPTS = [
  '“学而时习之”到底在讲什么？',
  '请用白话解释《道德经》第一章',
  '孔子和孟子的思想有什么联系？',
]

const SEARCH_TOPICS = [
  '孔子怎样谈“仁”',
  '“学而时习之”怎么理解',
  '《逍遥游》里的“大鹏”',
  '孟子为什么说“舍生取义”',
  '《道德经》第一章',
  '“关关雎鸠”讲的是什么',
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
  onSearch,
  onOpenReaderHub,
  onOpenWordbook,
  onOpenCompare,
  onContinueStudy,
}: DashboardHomeProps) {
  const [loading, setLoading] = useState(true)
  const [corpusDocuments, setCorpusDocuments] = useState<BookshelfItem[]>([])
  const [documents, setDocuments] = useState<BookshelfItem[]>([])
  const [sampleDocuments, setSampleDocuments] = useState<BookshelfItem[]>([])
  const [history, setHistory] = useState<HistoryItem[]>([])
  const [wordbook, setWordbook] = useState<WordbookItem[]>([])
  const [recommendations, setRecommendations] = useState<RecommendationItem[]>([])
  const [studyOverview, setStudyOverview] = useState<StudyOverview | null>(null)
  const [usingDemoSamples, setUsingDemoSamples] = useState(false)

  useEffect(() => {
    let cancelled = false

    async function load() {
      setLoading(true)
      const loadJson = async <T,>(url: string, fallback: T): Promise<T> => {
        try {
          const response = await fetch(url)
          if (!response.ok) return fallback
          return (await response.json()) as T
        } catch {
          return fallback
        }
      }

      try {
        const [docsData, corpusData, sampleData, historyData, wordbookData, recommendationData, studyData] = await Promise.all([
          loadJson<{ documents: BookshelfItem[] }>(`${API_BASE}/api/v1/documents?limit=12`, { documents: [] }),
          loadJson<{ documents: BookshelfItem[] }>(`${API_BASE}/api/v1/documents?limit=8&source_type=corpus`, { documents: [] }),
          loadJson<{ documents: BookshelfItem[] }>(`${API_BASE}/api/v1/documents?limit=8&source_type=sample`, { documents: [] }),
          loadJson<HistoryItem[]>(`${API_BASE}/api/v1/reader/history`, []),
          loadJson<{ entries: WordbookItem[] }>(`${API_BASE}/api/v1/reader/wordbook?limit=6`, { entries: [] }),
          loadJson<{ documents: RecommendationItem[] }>(`${API_BASE}/api/v1/documents/recommendations?limit=4`, { documents: [] }),
          loadJson<StudyOverview | null>(`${API_BASE}/api/v1/reader/study-overview`, null),
        ])

        if (cancelled) return

        const allDocuments = Array.isArray(docsData.documents) ? docsData.documents : []
        const corpusList = Array.isArray(corpusData.documents) ? corpusData.documents : []
        const builtInSamples = Array.isArray(sampleData.documents) ? sampleData.documents : []
        const demoSamples = getDemoBookshelfDocuments()
        const resolvedSamples = builtInSamples.length > 0 ? builtInSamples : demoSamples

        setCorpusDocuments(corpusList)
        setDocuments(allDocuments.filter((item: BookshelfItem) => item.source_type !== 'sample'))
        setSampleDocuments(resolvedSamples)
        setUsingDemoSamples(builtInSamples.length === 0)
        setHistory(Array.isArray(historyData) ? historyData : [])
        setWordbook(Array.isArray(wordbookData.entries) ? wordbookData.entries : [])
        setRecommendations(Array.isArray(recommendationData.documents) ? recommendationData.documents : [])
        setStudyOverview(studyData && typeof studyData === 'object' ? studyData : null)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    return () => {
      cancelled = true
    }
  }, [])

  const firstCorpus = corpusDocuments[0]
  const firstSample = sampleDocuments[0]
  const primaryAction = () => {
    if (firstCorpus) return onOpenDocument(firstCorpus.id)
    if (firstSample) return onOpenDocument(firstSample.id)
    return onAsk(QUICK_QUESTION_PROMPTS[0])
  }
  const featuredReadingDocuments = corpusDocuments.length > 0 ? corpusDocuments : sampleDocuments
  const heroEntryWays = [
    {
      key: 'corpus',
      eyebrow: '古籍起步',
      title: firstCorpus ? '先从古籍库读一部经典' : firstSample ? '先读一篇精选导读' : '打开阅读枢纽',
      description: '主图库已接入真实典籍，首次开启即可直接畅读长卷。',
      action: primaryAction,
      accent: 'var(--gf-gugong-red)',
      accentSoft: 'rgba(140,26,17,0.08)',
    },
    {
      key: 'search',
      eyebrow: '原句定位',
      title: '按问题寻找原文',
      description: '从人物、典故或名句切入，精准定位后再深入阅读。',
      action: () => onSearch(SEARCH_TOPICS[0]),
      accent: '#7b5b44',
      accentSoft: 'rgba(123,91,68,0.08)',
    },
    {
      key: 'scan',
      eyebrow: '辅助上传',
      title: '扫描图片并识别',
      description: '为实物影像保留的 OCR 通道，辅助完成断句与白话对照。',
      action: onOpenReaderHub,
      accent: 'var(--gf-gold)',
      accentSoft: 'rgba(201,160,99,0.12)',
    },
  ]

  const statCards = [
    {
      label: '继续阅读',
      value: history.length,
      icon: Clock3,
      accent: '#5b8aab',
      hint: '阅读记录已并入阅读中心。',
      surface: 'linear-gradient(180deg, rgba(255,255,255,0.84) 0%, rgba(237,244,247,0.96) 100%)',
      action: onOpenReaderHub,
    },
    {
      label: '古籍库',
      value: corpusDocuments.length,
      icon: LibraryBig,
      accent: 'var(--gf-gugong-red)',
      hint: '主阅读功能来自真实古籍。',
      surface: 'linear-gradient(180deg, rgba(255,255,255,0.82) 0%, rgba(250,239,236,0.94) 100%)',
      action: firstCorpus ? () => onOpenDocument(firstCorpus.id) : onOpenReaderHub,
    },
    {
      label: '字词本',
      value: wordbook.length,
      icon: Star,
      accent: '#3c8a51',
      hint: '留住释义与典故。',
      surface: 'linear-gradient(180deg, rgba(255,255,255,0.84) 0%, rgba(239,246,241,0.96) 100%)',
      action: onOpenWordbook,
    },
    {
      label: '可读篇目',
      value: documents.length + corpusDocuments.length + sampleDocuments.length,
      icon: ScrollText,
      accent: 'var(--gf-gold)',
      hint: '阅读与典籍库现已合并。',
      surface: 'linear-gradient(180deg, rgba(255,255,255,0.86) 0%, rgba(248,244,233,0.98) 100%)',
      action: onOpenReaderHub,
    },
  ]

  const hasLearningTrail =
    documents.length > 0 ||
    history.length > 0 ||
    wordbook.length > 0 ||
    (studyOverview?.sessions_count ?? 0) > 0

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
                  古籍阅读主阵地
                </span>
                <div className="text-xs tracking-[0.36em]" style={{ color: 'rgba(26,30,35,0.34)' }}>
                  读原典、看释义、探出处
                </div>
              </div>

              <div className="space-y-4">
                <h2
                  className="max-w-3xl text-4xl leading-[1.08] md:text-5xl"
                  style={{ fontFamily: '"ZCOOL XiaoWei", serif', color: 'var(--gf-text)' }}
                >
                  专为古籍打造的阅读平台，
                  <br className="hidden md:block" />
                  从原典开始探索
                </h2>
                <p className="max-w-2xl text-sm leading-7 md:text-base" style={{ color: 'rgba(26,30,35,0.62)' }}>
                  建议先畅读古籍库经典、检索原句或直接提问；若手头有实物典籍图片，再进入扫描识别与对照阅读流程。
                </p>
              </div>

              <div className="flex flex-wrap gap-2 text-xs" style={{ color: 'rgba(26,30,35,0.52)' }}>
                <span className="rounded-full px-3 py-1.5" style={{ backgroundColor: 'rgba(255,255,255,0.72)', border: '1px solid rgba(26,30,35,0.06)' }}>经典入门</span>
                <span className="rounded-full px-3 py-1.5" style={{ backgroundColor: 'rgba(255,255,255,0.72)', border: '1px solid rgba(26,30,35,0.06)' }}>原句检索</span>
                <span className="rounded-full px-3 py-1.5" style={{ backgroundColor: 'rgba(255,255,255,0.72)', border: '1px solid rgba(26,30,35,0.06)' }}>继续追问</span>
                <span className="rounded-full px-3 py-1.5" style={{ backgroundColor: 'rgba(255,255,255,0.72)', border: '1px solid rgba(26,30,35,0.06)' }}>图片识别可选</span>
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
                第一次进入先这样用
              </div>
              <div className="space-y-4">
                {heroEntryWays.map((item, index) => (
                  <button
                    key={item.key}
                    onClick={item.action}
                    className="group flex w-full items-start gap-4 rounded-[24px] px-4 py-4 text-left transition-all duration-300 hover:-translate-y-0.5"
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
                    <div className="min-w-0">
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
                    <ArrowRight className="mt-1 h-4 w-4 shrink-0 transition-transform duration-300 group-hover:translate-x-0.5" style={{ color: item.accent }} />
                  </button>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="grid gap-5 lg:grid-cols-[1.1fr_0.9fr]">
        </section>

        <section
          className="rounded-2xl p-4 md:p-5"
          style={{ backgroundColor: 'rgba(255,255,255,0.68)', border: '1px solid rgba(26,30,35,0.06)' }}
        >
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
                <h3 className="text-base font-medium" style={{ color: 'var(--gf-text)' }}>
                  下一步继续读什么
                </h3>
                <p className="text-xs" style={{ color: 'rgba(26,30,35,0.45)' }}>
                  根据你最近读过的内容和字词收藏，推荐下一篇继续读。
                </p>
              </div>
            <div className="flex gap-2">
              <button
                onClick={onOpenCompare}
                className="rounded-xl px-3 py-1.5 text-xs"
                style={{ backgroundColor: 'rgba(201,160,99,0.12)', color: 'var(--gf-gold)' }}
              >
                打开对照阅读
              </button>
              <button
                onClick={onOpenWordbook}
                className="rounded-xl px-3 py-1.5 text-xs"
                style={{ backgroundColor: 'rgba(26,30,35,0.04)', color: 'var(--gf-text)' }}
              >
                打开字词本
              </button>
            </div>
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
                暂无推荐，先读一篇样例或上传一张扫描页试试看。
              </p>
            )}
          </div>
        </section>
      </div>
    </div>
  )
}
