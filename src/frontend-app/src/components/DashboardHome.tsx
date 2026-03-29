import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import {
  ArrowRight,
  BookOpen,
  Clock3,
  LibraryBig,
  ScanText,
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
  onOpenBookshelf: () => void
  onOpenHistory: () => void
  onOpenWordbook: () => void
  onOpenCompare: () => void
  onContinueStudy: (documentId: string) => void
}

interface BookshelfItem {
  id: string
  title: string
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
  onOpenBookshelf,
  onOpenHistory,
  onOpenWordbook,
  onOpenCompare,
  onContinueStudy,
}: DashboardHomeProps) {
  const [loading, setLoading] = useState(true)
  const [documents, setDocuments] = useState<BookshelfItem[]>([])
  const [sampleDocuments, setSampleDocuments] = useState<BookshelfItem[]>([])
  const [history, setHistory] = useState<HistoryItem[]>([])
  const [wordbook, setWordbook] = useState<WordbookItem[]>([])
  const [analytics, setAnalytics] = useState<AnalyticsOverview | null>(null)
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
        const [docsData, sampleData, historyData, wordbookData, analyticsData, recommendationData, studyData] = await Promise.all([
          loadJson<{ documents: BookshelfItem[] }>(`${API_BASE}/api/v1/documents?limit=12`, { documents: [] }),
          loadJson<{ documents: BookshelfItem[] }>(`${API_BASE}/api/v1/documents?limit=8&source_type=sample`, { documents: [] }),
          loadJson<HistoryItem[]>(`${API_BASE}/api/v1/reader/history`, []),
          loadJson<{ entries: WordbookItem[] }>(`${API_BASE}/api/v1/reader/wordbook?limit=6`, { entries: [] }),
          loadJson<AnalyticsOverview | null>(`${API_BASE}/api/v1/analytics/overview`, null),
          loadJson<{ documents: RecommendationItem[] }>(`${API_BASE}/api/v1/documents/recommendations?limit=4`, { documents: [] }),
          loadJson<StudyOverview | null>(`${API_BASE}/api/v1/reader/study-overview`, null),
        ])

        if (cancelled) return

        const allDocuments = Array.isArray(docsData.documents) ? docsData.documents : []
        const builtInSamples = Array.isArray(sampleData.documents) ? sampleData.documents : []
        const demoSamples = getDemoBookshelfDocuments()
        const resolvedSamples = builtInSamples.length > 0 ? builtInSamples : demoSamples

        setDocuments(allDocuments.filter((item: BookshelfItem) => item.source_type !== 'sample'))
        setSampleDocuments(resolvedSamples)
        setUsingDemoSamples(builtInSamples.length === 0)
        setHistory(Array.isArray(historyData) ? historyData : [])
        setWordbook(Array.isArray(wordbookData.entries) ? wordbookData.entries : [])
        setAnalytics(analyticsData && typeof analyticsData === 'object' ? analyticsData : null)
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

  const firstSample = sampleDocuments[0]
  const primaryAction = () => (firstSample ? onOpenDocument(firstSample.id) : onAsk(QUICK_QUESTION_PROMPTS[0]))
  const audienceCards = [
    {
      title: '经典入门',
      description: '如果你想读《论语》《孟子》《道德经》这些经典，可以先从精选样例开始，不用先准备扫描件。',
      actionLabel: sampleDocuments[0] ? '看经典样例' : '看看典籍库',
      action: () => (sampleDocuments[0] ? onOpenDocument(sampleDocuments[0].id) : onOpenBookshelf()),
      icon: ScrollText,
      accent: 'var(--gf-gold)',
      surface: 'linear-gradient(180deg, rgba(252,248,238,0.96) 0%, rgba(255,255,255,0.88) 100%)',
      borderTone: 'rgba(201,160,99,0.16)',
      tag: '经典阅读',
    },
    {
      title: '扫描页整理',
      description: '如果你手头有影印页、扫描图或馆藏图片，可以直接上传，走 OCR、断句、翻译和对照阅读链路。',
      actionLabel: '上传扫描页',
      action: onOpenReaderHub,
      icon: ScanText,
      accent: 'var(--gf-gugong-red)',
      surface: 'linear-gradient(180deg, rgba(255,255,255,0.88) 0%, rgba(250,239,236,0.98) 100%)',
      borderTone: 'rgba(140,26,17,0.14)',
      tag: '图片整理',
    },
  ]

  const heroEntryWays = [
    {
      key: 'sample',
      eyebrow: '样例起步',
      title: firstSample ? '先读一篇体验样例' : '先去看看典籍库',
      description: '不用准备图片，直接进入阅读、释义和继续提问。',
      action: primaryAction,
      accent: 'var(--gf-gugong-red)',
      accentSoft: 'rgba(140,26,17,0.08)',
    },
    {
      key: 'ask',
      eyebrow: '问题切入',
      title: '先问一句古文',
      description: '从一句原文、一个人物或一个典故开始，马上得到解释。',
      action: () => onAsk(QUICK_QUESTION_PROMPTS[0]),
      accent: '#7b5b44',
      accentSoft: 'rgba(123,91,68,0.08)',
    },
    {
      key: 'scan',
      eyebrow: '扫描整理',
      title: '上传影印页或扫描图',
      description: '手头有图片时，再进入 OCR、断句和对照阅读。',
      action: onOpenReaderHub,
      accent: 'var(--gf-gold)',
      accentSoft: 'rgba(201,160,99,0.12)',
    },
  ]

  const statCards = [
    {
      label: '体验样例',
      value: sampleDocuments.length,
      icon: LibraryBig,
      accent: 'var(--gf-gugong-red)',
      hint: '不用准备图片',
      surface: 'linear-gradient(180deg, rgba(255,255,255,0.82) 0%, rgba(250,239,236,0.94) 100%)',
      action: firstSample ? () => onOpenDocument(firstSample.id) : onOpenBookshelf,
    },
    {
      label: '最近阅读',
      value: history.length,
      icon: Clock3,
      accent: '#5b8aab',
      hint: '随时接着往下读',
      surface: 'linear-gradient(180deg, rgba(255,255,255,0.84) 0%, rgba(237,244,247,0.96) 100%)',
      action: onOpenHistory,
    },
    {
      label: '字词沉淀',
      value: wordbook.length,
      icon: Star,
      accent: '#3c8a51',
      hint: '留住释义与典故',
      surface: 'linear-gradient(180deg, rgba(255,255,255,0.84) 0%, rgba(239,246,241,0.96) 100%)',
      action: onOpenWordbook,
    },
    {
      label: '可读篇目',
      value: documents.length + sampleDocuments.length,
      icon: ScrollText,
      accent: 'var(--gf-gold)',
      hint: '查看全部典籍',
      surface: 'linear-gradient(180deg, rgba(255,255,255,0.86) 0%, rgba(248,244,233,0.98) 100%)',
      action: onOpenBookshelf,
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
                  AI 古籍入门助手
                </span>
                <div className="text-xs tracking-[0.36em]" style={{ color: 'rgba(26,30,35,0.34)' }}>
                  像有一位会讲古文的老师
                </div>
              </div>

              <div className="space-y-4">
                <h2
                  className="max-w-3xl text-4xl leading-[1.08] md:text-5xl"
                  style={{ fontFamily: '"ZCOOL XiaoWei", serif', color: 'var(--gf-text)' }}
                >
                  帮你读懂古籍的第一步，
                  <br className="hidden md:block" />
                  不必先有一张扫描页
                </h2>
                <p className="max-w-2xl text-sm leading-7 md:text-base" style={{ color: 'rgba(26,30,35,0.62)' }}>
                  想先读懂一段古文，可以从体验样例、提问或检索开始；手头有扫描页时，再上传识别。
                </p>
              </div>

              <div className="flex flex-wrap gap-2 text-xs" style={{ color: 'rgba(26,30,35,0.52)' }}>
                <span className="rounded-full px-3 py-1.5" style={{ backgroundColor: 'rgba(255,255,255,0.72)', border: '1px solid rgba(26,30,35,0.06)' }}>经典入门</span>
                <span className="rounded-full px-3 py-1.5" style={{ backgroundColor: 'rgba(255,255,255,0.72)', border: '1px solid rgba(26,30,35,0.06)' }}>扫描识别</span>
                <span className="rounded-full px-3 py-1.5" style={{ backgroundColor: 'rgba(255,255,255,0.72)', border: '1px solid rgba(26,30,35,0.06)' }}>查询追问</span>
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
                30 秒开始
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

        <section className="grid gap-4 md:grid-cols-2">
          {audienceCards.map((item, index) => (
            <motion.div
              key={item.title}
              className={`card-hover-lift rounded-[28px] p-5 ${index === 1 ? 'md:-translate-y-3' : ''}`}
              initial={{ opacity: 0, y: 32, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{
                type: 'spring',
                stiffness: 260,
                damping: 24,
                delay: 0.15 + index * 0.12,
              }}
              style={{
                background: item.surface,
                border: `1px solid ${item.borderTone}`,
                boxShadow: '0 18px 32px rgba(26,30,35,0.05)',
              }}
            >
              <div className="mb-4 flex items-center justify-between">
                <div
                  className="flex h-11 w-11 items-center justify-center rounded-2xl"
                  style={{ backgroundColor: item.borderTone }}
                >
                  <item.icon className="h-5 w-5" style={{ color: item.accent }} />
                </div>
                <span className="rounded-full px-3 py-1 text-[11px] tracking-[0.22em]" style={{ backgroundColor: 'rgba(255,255,255,0.72)', color: 'rgba(26,30,35,0.38)' }}>
                  {item.tag}
                </span>
              </div>
              <div className="space-y-2">
                <h3 className="text-lg font-medium" style={{ color: 'var(--gf-text)' }}>
                  {item.title}
                </h3>
                <p className="text-sm leading-7" style={{ color: 'rgba(26,30,35,0.56)' }}>
                  {item.description}
                </p>
              </div>
              <button
                onClick={item.action}
                className="mt-5 inline-flex items-center gap-2 rounded-2xl px-4 py-2.5 text-sm transition-all duration-300 hover:-translate-y-0.5"
                style={{ backgroundColor: 'rgba(255,255,255,0.72)', color: 'var(--gf-text)', border: '1px solid rgba(26,30,35,0.06)' }}
              >
                {item.actionLabel}
                <ArrowRight className="h-4 w-4" />
              </button>
            </motion.div>
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
                  体验样例
                </h3>
                <p className="text-xs" style={{ color: 'rgba(26,30,35,0.45)' }}>
                  无需扫描页，先读一段起步片段，再决定深入哪部典籍
                </p>
              </div>
              <button
                onClick={onOpenBookshelf}
                className="rounded-xl px-3 py-1.5 text-xs"
                style={{ backgroundColor: 'rgba(26,30,35,0.04)', color: 'var(--gf-text)' }}
              >
                查看全部
              </button>
            </div>
            {usingDemoSamples && (
              <div className="mb-3 rounded-2xl px-4 py-3 text-xs leading-6" style={{ backgroundColor: 'rgba(140,26,17,0.06)', color: 'rgba(26,30,35,0.56)', border: '1px solid rgba(140,26,17,0.10)' }}>
                当前展示的是本地演示样例。即使后端临时波动，评审时也能完整体验“阅读、释义、追问”的主链路。
              </div>
            )}
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {sampleDocuments.slice(0, 6).map((doc, idx) => (
                <button
                  key={doc.id}
                  onClick={() => onOpenDocument(doc.id)}
                  className="stagger-fade-up card-hover-lift rounded-2xl px-4 py-4 text-left"
                  style={{ '--stagger-delay': `${0.05 + idx * 0.06}s`, border: '1px solid rgba(26,30,35,0.08)' } as React.CSSProperties}
                >
                  <div className="mb-2 flex items-center justify-between gap-3">
                    <span className="text-sm font-medium" style={{ color: 'var(--gf-text)' }}>
                      {doc.title}
                    </span>
                    <span className="rounded-full px-2 py-0.5 text-[11px]" style={{ backgroundColor: 'rgba(140,26,17,0.08)', color: 'var(--gf-gugong-red)' }}>
                      体验
                    </span>
                  </div>
                  <div className="line-clamp-4 text-sm leading-7" style={{ color: 'rgba(26,30,35,0.48)' }}>
                    {doc.preview || '打开后即可查看原文、标点和白话对照。'}
                  </div>
                </button>
              ))}
              {!loading && sampleDocuments.length === 0 && (
                <div
                  className="rounded-[24px] px-4 py-4"
                  style={{ backgroundColor: 'rgba(255,255,255,0.76)', border: '1px solid rgba(26,30,35,0.06)' }}
                >
                  <p className="text-sm mb-3" style={{ color: 'rgba(26,30,35,0.42)' }}>
                    暂时没加载到体验样例，你也可以先从问题入口开始。
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {QUICK_QUESTION_PROMPTS.slice(0, 2).map((prompt) => (
                      <button
                        key={`fallback-${prompt}`}
                        onClick={() => onAsk(prompt)}
                        className="rounded-full px-3 py-1.5 text-xs transition-all duration-300 hover:-translate-y-0.5"
                        style={{ backgroundColor: 'rgba(140,26,17,0.08)', color: 'var(--gf-gugong-red)' }}
                      >
                        {prompt}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="grid gap-5">
            <div
              className="rounded-2xl p-4 md:p-5"
              style={{ backgroundColor: 'rgba(255,255,255,0.68)', border: '1px solid rgba(26,30,35,0.06)' }}
            >
              <div className="mb-4">
                <h3 className="text-base font-medium" style={{ color: 'var(--gf-text)' }}>
                  片段问答
                </h3>
                <p className="text-xs" style={{ color: 'rgba(26,30,35,0.45)' }}>
                  适合第一次体验，也适合课堂、考试和阅读时的即时追问
                </p>
              </div>
              <div className="space-y-2">
                {QUICK_QUESTION_PROMPTS.map((prompt) => (
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
                    问题检索
                  </h3>
                  <p className="text-xs" style={{ color: 'rgba(26,30,35,0.45)' }}>
                    从人物、概念和典故切入，适合快速找入口
                  </p>
                </div>
                <Search className="h-4 w-4" style={{ color: 'rgba(26,30,35,0.35)' }} />
              </div>
              <div className="flex flex-wrap gap-2">
                {SEARCH_TOPICS.map((topic) => (
                  <button
                    key={topic}
                    onClick={() => onSearch(topic)}
                    className="rounded-full px-3 py-1.5 text-xs transition-colors hover:bg-[rgba(201,160,99,0.16)]"
                    style={{ border: '1px solid rgba(26,30,35,0.08)', color: 'var(--gf-text)' }}
                  >
                    {topic}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-4">
          {statCards.map((item, index) => (
            <button
              key={item.label}
              onClick={item.action}
              className="stagger-fade-up card-hover-lift rounded-[24px] p-4 text-left"
              style={{
                '--stagger-delay': `${0.12 + index * 0.08}s`,
                background: item.surface,
                border: '1px solid rgba(26,30,35,0.06)',
                boxShadow: '0 14px 28px rgba(26,30,35,0.04)',
              } as React.CSSProperties}
            >
              <div className="mb-4 flex items-center justify-between">
                <span className="text-[11px] tracking-[0.26em]" style={{ color: 'rgba(26,30,35,0.42)' }}>
                  {item.label}
                </span>
                <div className="flex h-8 w-8 items-center justify-center rounded-xl" style={{ backgroundColor: 'rgba(255,255,255,0.7)' }}>
                  <item.icon className="h-4 w-4" style={{ color: item.accent }} />
                </div>
              </div>
              <div className={`text-3xl ${!loading && item.value > 0 ? 'pulse-glow' : ''}`} style={{ color: 'var(--gf-text)', fontFamily: '"ZCOOL XiaoWei", serif', borderRadius: '12px' }}>
                {loading ? <div className="skeleton-shimmer h-9 w-16" /> : item.value}
              </div>
              <div className="mt-2 text-xs leading-6" style={{ color: 'rgba(26,30,35,0.48)' }}>
                {item.hint}
              </div>
            </button>
          ))}
        </section>

        {hasLearningTrail ? (
          <section className="grid gap-5 lg:grid-cols-2">
            <div
              className="rounded-2xl p-4 md:p-5"
              style={{ backgroundColor: 'rgba(255,255,255,0.68)', border: '1px solid rgba(26,30,35,0.06)' }}
            >
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <h3 className="text-base font-medium" style={{ color: 'var(--gf-text)' }}>
                    继续阅读
                  </h3>
                  <p className="text-xs" style={{ color: 'rgba(26,30,35,0.45)' }}>
                    读过的样例和你上传的文档，都可以从这里接着往下读。
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
              </div>
            </div>

            <div
              className="rounded-2xl p-4 md:p-5"
              style={{ backgroundColor: 'rgba(255,255,255,0.68)', border: '1px solid rgba(26,30,35,0.06)' }}
            >
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <h3 className="text-base font-medium" style={{ color: 'var(--gf-text)' }}>
                    最近积累
                  </h3>
                  <p className="text-xs" style={{ color: 'rgba(26,30,35,0.45)' }}>
                    阅读记录和字词收藏，会慢慢串成你的古籍学习足迹。
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
                  </div>
                </div>

                <div>
                  <div className="mb-2 flex items-center gap-2 text-sm" style={{ color: 'var(--gf-text)' }}>
                    <Star className="h-4 w-4" />
                    最近字词
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
                  </div>
                </div>
              </div>
            </div>
          </section>
        ) : null}

        <section className="grid gap-5 lg:grid-cols-[1fr_0.92fr]">
          <div
            className="rounded-2xl p-4 md:p-5"
            style={{ backgroundColor: 'rgba(255,255,255,0.68)', border: '1px solid rgba(26,30,35,0.06)' }}
          >
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-base font-medium" style={{ color: 'var(--gf-text)' }}>
                  学习总览
                </h3>
                <p className="text-xs" style={{ color: 'rgba(26,30,35,0.45)' }}>
                  看看最近复习了哪些内容，还有哪些值得再回顾。
                </p>
              </div>
              {studyOverview?.last_reviewed_document?.document_id && (
                <button
                  onClick={() => onContinueStudy(studyOverview.last_reviewed_document!.document_id)}
                  className="rounded-2xl px-4 py-2 text-sm text-white"
                  style={{ backgroundColor: 'var(--gf-gugong-red)' }}
                >
                  继续复习
                </button>
              )}
            </div>

            <div className="grid gap-3 md:grid-cols-4">
              <div className="rounded-2xl p-4" style={{ backgroundColor: 'rgba(26,30,35,0.03)' }}>
                <div className="text-xs" style={{ color: 'rgba(26,30,35,0.45)' }}>复习次数</div>
                <div className="mt-2 text-2xl" style={{ color: 'var(--gf-text)', fontFamily: '"ZCOOL XiaoWei", serif' }}>
                  {studyOverview?.sessions_count ?? 0}
                </div>
              </div>
              <div className="rounded-2xl p-4" style={{ backgroundColor: 'rgba(26,30,35,0.03)' }}>
                <div className="text-xs" style={{ color: 'rgba(26,30,35,0.45)' }}>复习文档</div>
                <div className="mt-2 text-2xl" style={{ color: 'var(--gf-text)', fontFamily: '"ZCOOL XiaoWei", serif' }}>
                  {studyOverview?.reviewed_documents_count ?? 0}
                </div>
              </div>
              <div className="rounded-2xl p-4" style={{ backgroundColor: 'rgba(26,30,35,0.03)' }}>
                <div className="text-xs" style={{ color: 'rgba(26,30,35,0.45)' }}>掌握率</div>
                <div className="mt-2 text-2xl" style={{ color: 'var(--gf-text)', fontFamily: '"ZCOOL XiaoWei", serif' }}>
                  {Math.round((studyOverview?.mastery_rate ?? 0) * 100)}%
                </div>
              </div>
              <div className="rounded-2xl p-4" style={{ backgroundColor: 'rgba(26,30,35,0.03)' }}>
                <div className="text-xs" style={{ color: 'rgba(26,30,35,0.45)' }}>需复习卡片</div>
                <div className="mt-2 text-2xl" style={{ color: 'var(--gf-text)', fontFamily: '"ZCOOL XiaoWei", serif' }}>
                  {studyOverview?.review_again_cards ?? 0}
                </div>
              </div>
            </div>

            {studyOverview?.last_reviewed_document?.title && (
              <div className="mt-4 text-sm" style={{ color: 'rgba(26,30,35,0.52)' }}>
                最近一次复习：{studyOverview.last_reviewed_document.title}
              </div>
            )}
          </div>

          <div
            className="rounded-2xl p-4 md:p-5"
            style={{ backgroundColor: 'rgba(255,255,255,0.68)', border: '1px solid rgba(26,30,35,0.06)' }}
          >
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h3 className="text-base font-medium" style={{ color: 'var(--gf-text)' }}>
                  热门人物与概念
                </h3>
                <p className="text-xs" style={{ color: 'rgba(26,30,35,0.45)' }}>
                  点击任意条目，可在问答中追问该人物或典故的更多信息。
                </p>
              </div>
            </div>
            <div className="space-y-2">
              {(analytics?.top_entities || []).slice(0, 5).map((entity) => (
                <button
                  key={entity.id}
                  onClick={() => onAsk(`请介绍"${entity.label}"在古籍中的角色和典故`)}
                  className="flex w-full items-center justify-between rounded-xl px-3 py-2 text-sm transition-colors hover:bg-[rgba(26,30,35,0.05)]"
                  style={{ backgroundColor: 'rgba(26,30,35,0.03)', color: 'var(--gf-text)' }}
                >
                  <span>{entity.label}</span>
                  <span style={{ color: 'rgba(26,30,35,0.45)' }}>{entity.count} 关联</span>
                </button>
              ))}
              {!loading && (analytics?.top_entities || []).length === 0 && (
                <p className="text-sm" style={{ color: 'rgba(26,30,35,0.35)' }}>
                  暂无可展示数据
                </p>
              )}
            </div>
          </div>
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
                查看字词本
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
