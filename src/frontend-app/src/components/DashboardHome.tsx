import { useEffect, useState } from 'react'
import {
  ArrowRight,
  BookOpen,
  Clock3,
  Flame,
  LibraryBig,
  Sparkles,
  Star,
  ScrollText,
  Users,
} from 'lucide-react'
import { API_BASE } from '../lib/api'
import { getDemoBookshelfDocuments } from '../data/demoDocuments'
import { authFetchOptions } from '../store/useAuthStore'

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

interface FocusAction {
  action_type: 'reader' | 'study' | 'search' | 'chat' | 'wordbook'
  document_id?: string | null
  query?: string
  prompt?: string
}

interface FocusItem extends FocusAction {
  id: string
  title: string
  description: string
}

interface LearningFocus {
  streak_days: number
  review_queue_count: number
  today_review: FocusAction & {
    title: string
    description: string
    action_label: string
  }
  reading_paths: Array<FocusItem & { badge?: string }>
  co_reading_prompts: FocusItem[]
}

const QUICK_QUESTION_PROMPTS = [
  '“学而时习之”到底在讲什么？',
  '《道德经》第一章到底想说什么？',
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
  const [learningFocus, setLearningFocus] = useState<LearningFocus | null>(null)
  const [usingDemoSamples, setUsingDemoSamples] = useState(false)

  useEffect(() => {
    let cancelled = false

    async function load() {
      setLoading(true)
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
        const [docsData, corpusData, sampleData, historyData, wordbookData, recommendationData, studyData, focusData] = await Promise.all([
          loadJson<{ documents: BookshelfItem[] }>(`${API_BASE}/api/v1/documents?limit=12`, { documents: [] }),
          loadJson<{ documents: BookshelfItem[] }>(`${API_BASE}/api/v1/documents?limit=8&source_type=corpus`, { documents: [] }),
          loadJson<{ documents: BookshelfItem[] }>(`${API_BASE}/api/v1/documents?limit=8&source_type=sample`, { documents: [] }),
          loadJson<HistoryItem[]>(`${API_BASE}/api/v1/reader/history`, []),
          loadJson<{ entries: WordbookItem[] }>(`${API_BASE}/api/v1/reader/wordbook?limit=6`, { entries: [] }),
          loadJson<{ documents: RecommendationItem[] }>(`${API_BASE}/api/v1/documents/recommendations?limit=4`, { documents: [] }),
          loadJson<StudyOverview | null>(`${API_BASE}/api/v1/reader/study-overview`, null),
          loadJson<LearningFocus | null>(`${API_BASE}/api/v1/reader/focus`, null),
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
        setLearningFocus(focusData && typeof focusData === 'object' ? focusData : null)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    return () => {
      cancelled = true
    }
  }, [])

  const runFocusAction = (action: FocusAction) => {
    if (action.action_type === 'reader' && action.document_id) {
      onOpenDocument(action.document_id)
      return
    }
    if (action.action_type === 'study' && action.document_id) {
      onContinueStudy(action.document_id)
      return
    }
    if (action.action_type === 'search' && action.query) {
      onSearch(action.query)
      return
    }
    if (action.action_type === 'chat' && action.prompt) {
      onAsk(action.prompt)
      return
    }
    if (action.action_type === 'wordbook') {
      onOpenWordbook()
      return
    }
    onOpenReaderHub()
  }

  const firstCorpus = corpusDocuments[0]
  const firstSample = sampleDocuments[0]
  const latestHistoryDocumentId = history[0]?.id ?? null
  const continueReadingAction = () => {
    if (latestHistoryDocumentId) return onOpenDocument(latestHistoryDocumentId)
    return onOpenReaderHub()
  }
  const primaryAction = () => {
    if (firstCorpus) return onOpenDocument(firstCorpus.id)
    if (firstSample) return onOpenDocument(firstSample.id)
    return onAsk(QUICK_QUESTION_PROMPTS[0])
  }
  const heroEntryWays = [
    {
      key: 'corpus',
      eyebrow: '开卷即览',
      title: firstCorpus ? '先翻开一部经典' : firstSample ? '先读一篇导读' : '转至阅读页',
      description: '古籍库里已有可以直接翻开的文本，第一次来也能立刻上手。',
      action: primaryAction,
      accent: 'var(--gf-gugong-red)',
      accentSoft: 'rgba(140,26,17,0.08)',
    },
    {
      key: 'search',
      eyebrow: '寻章摘句',
      title: '先从一句话找起',
      description: '记得一句原文、一个人物或一个典故，从这里最快找到。',
      action: () => onSearch(SEARCH_TOPICS[0]),
      accent: '#7b5b44',
      accentSoft: 'rgba(123,91,68,0.08)',
    },
    {
      key: 'scan',
      eyebrow: '拍页即读',
      title: '有图片时再走这里',
      description: '手头有影印页或扫描图，用 OCR 转成可读文字，再做断句和对照。',
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
      hint: '回到上次停下的地方，接着往后读。',
      surface: 'linear-gradient(180deg, rgba(255,255,255,0.84) 0%, rgba(237,244,247,0.96) 100%)',
      action: continueReadingAction,
    },
    {
      label: '古籍库',
      value: corpusDocuments.length,
      icon: LibraryBig,
      accent: 'var(--gf-gugong-red)',
      hint: '从这些可以直接翻开的古籍开始。',
      surface: 'linear-gradient(180deg, rgba(255,255,255,0.82) 0%, rgba(250,239,236,0.94) 100%)',
      action: firstCorpus ? () => onOpenDocument(firstCorpus.id) : onOpenReaderHub,
    },
    {
      label: '字词本',
      value: wordbook.length,
      icon: Star,
      accent: '#3c8a51',
      hint: '遇到难词随手收，积少成多。',
      surface: 'linear-gradient(180deg, rgba(255,255,255,0.84) 0%, rgba(239,246,241,0.96) 100%)',
      action: onOpenWordbook,
    },
    {
      label: '可读篇目',
      value: documents.length + corpusDocuments.length + sampleDocuments.length,
      icon: ScrollText,
      accent: 'var(--gf-gold)',
      hint: '样例、古籍和你上传的文档，汇总在这里。',
      surface: 'linear-gradient(180deg, rgba(255,255,255,0.86) 0%, rgba(248,244,233,0.98) 100%)',
      action: onOpenReaderHub,
    },
  ]

  const hasLearningTrail =
    documents.length > 0 ||
    history.length > 0 ||
    wordbook.length > 0 ||
    (studyOverview?.sessions_count ?? 0) > 0
  const continueStudyTarget =
    studyOverview?.last_reviewed_document?.document_id ||
    history[0]?.id ||
    firstCorpus?.id ||
    firstSample?.id ||
    null
  const recentTrailTitle =
    studyOverview?.last_reviewed_document?.title ||
    history[0]?.title ||
    wordbook[0]?.word ||
    null
  const recentTrailTime =
    studyOverview?.last_reviewed_document?.created_at ||
    history[0]?.last_read_at ||
    null

  const streakDays = learningFocus?.streak_days ?? 0
  const reviewQueueCount = learningFocus?.review_queue_count ?? 0
  const todayReview = learningFocus?.today_review
  const readingPaths = learningFocus?.reading_paths ?? []
  const coReadingPrompts = learningFocus?.co_reading_prompts ?? []

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
                  开卷导读
                </span>
                <div className="text-xs tracking-[0.36em]" style={{ color: 'rgba(26,30,35,0.34)' }}>
                  先读原文，再徐徐通晓
                </div>
              </div>

              <div className="space-y-4">
                <h2
                  className="max-w-3xl text-4xl leading-[1.08] md:text-5xl"
                  style={{ fontFamily: '"ZCOOL XiaoWei", serif', color: 'var(--gf-text)' }}
                >
                  先把古籍翻开，
                  <br className="hidden md:block" />
                  一句一句通晓其义
                </h2>
                <p className="max-w-2xl text-sm leading-7 md:text-base" style={{ color: 'rgba(26,30,35,0.62)' }}>
                  既可翻开一篇古籍，亦可由一句未明之语发问。
                </p>
              </div>

              <div className="flex flex-wrap gap-2 text-xs" style={{ color: 'rgba(26,30,35,0.52)' }}>
                <span className="rounded-full px-3 py-1.5" style={{ backgroundColor: 'rgba(255,255,255,0.72)', border: '1px solid rgba(26,30,35,0.06)' }}>直接开读</span>
                <span className="rounded-full px-3 py-1.5" style={{ backgroundColor: 'rgba(255,255,255,0.72)', border: '1px solid rgba(26,30,35,0.06)' }}>原句检索</span>
                <span className="rounded-full px-3 py-1.5" style={{ backgroundColor: 'rgba(255,255,255,0.72)', border: '1px solid rgba(26,30,35,0.06)' }}>继续追问</span>
                <span className="rounded-full px-3 py-1.5" style={{ backgroundColor: 'rgba(255,255,255,0.72)', border: '1px solid rgba(26,30,35,0.06)' }}>有图再上传</span>
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
                第一次打开，可先由此入手
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
          <div
            className="rounded-[28px] p-4 md:p-5"
            style={{ backgroundColor: 'rgba(255,255,255,0.68)', border: '1px solid rgba(26,30,35,0.06)' }}
          >
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-base font-medium" style={{ color: 'var(--gf-text)' }}>
                  开卷总览
                </h3>
                <p className="text-xs" style={{ color: 'rgba(26,30,35,0.45)' }}>
                  此后可续前读。
                </p>
              </div>
              {usingDemoSamples && (
                <span
                  className="rounded-full px-3 py-1 text-[11px]"
                  style={{ backgroundColor: 'rgba(140,26,17,0.08)', color: 'var(--gf-gugong-red)' }}
                >
                  当前为离线体验样例
                </span>
              )}
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              {statCards.map((item) => (
                <button
                  key={item.label}
                  onClick={item.action}
                  className="rounded-[24px] px-4 py-4 text-left transition-all duration-300 hover:-translate-y-0.5"
                  style={{
                    background: item.surface,
                    border: '1px solid rgba(26,30,35,0.06)',
                    boxShadow: '0 10px 24px rgba(26,30,35,0.04)',
                  }}
                >
                  <div className="mb-3 flex items-center justify-between">
                    <span className="text-[11px] tracking-[0.24em]" style={{ color: 'rgba(26,30,35,0.42)' }}>
                      {item.label}
                    </span>
                    <item.icon className="h-4 w-4" style={{ color: item.accent }} />
                  </div>
                  <div className="text-3xl" style={{ color: 'var(--gf-text)', fontFamily: '"ZCOOL XiaoWei", serif' }}>
                    {loading ? '—' : item.value}
                  </div>
                  <div className="mt-2 text-xs leading-6" style={{ color: 'rgba(26,30,35,0.48)' }}>
                    {item.hint}
                  </div>
                </button>
              ))}
            </div>
          </div>

          <div
            className="rounded-[28px] p-4 md:p-5"
            style={{ backgroundColor: 'rgba(255,255,255,0.68)', border: '1px solid rgba(26,30,35,0.06)' }}
          >
            <div className="mb-4">
              <h3 className="text-base font-medium" style={{ color: 'var(--gf-text)' }}>
                学习脉络
              </h3>
                <p className="text-xs" style={{ color: 'rgba(26,30,35,0.45)' }}>
                  读、记、问、复习，尽量不断线。
                </p>
              </div>

            {hasLearningTrail ? (
              <div className="space-y-4">
                <div
                  className="rounded-[24px] px-4 py-4"
                  style={{ backgroundColor: 'rgba(248,244,233,0.92)', border: '1px solid rgba(201,160,99,0.16)' }}
                >
                  <div className="text-[11px] tracking-[0.24em]" style={{ color: 'rgba(26,30,35,0.42)' }}>
                    最近读到这里
                  </div>
                  <div className="mt-2 text-base font-medium" style={{ color: 'var(--gf-text)' }}>
                    {recentTrailTitle ? `继续读：${recentTrailTitle}` : '回到上次停下的地方'}
                  </div>
                  <div className="mt-1 text-xs" style={{ color: 'rgba(26,30,35,0.48)' }}>
                    {recentTrailTime ? `上次读到：${formatTimeLabel(recentTrailTime)}` : '你的阅读记录会从这里一点点长出来。'}
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2 text-[11px]">
                    <span className="rounded-full px-3 py-1" style={{ backgroundColor: 'rgba(255,255,255,0.72)', color: 'rgba(26,30,35,0.62)' }}>
                      复习 {studyOverview?.sessions_count ?? 0} 次
                    </span>
                    <span className="rounded-full px-3 py-1" style={{ backgroundColor: 'rgba(255,255,255,0.72)', color: 'rgba(26,30,35,0.62)' }}>
                      生词 {wordbook.length}
                    </span>
                    <span className="rounded-full px-3 py-1" style={{ backgroundColor: 'rgba(255,255,255,0.72)', color: 'rgba(26,30,35,0.62)' }}>
                      最近阅读 {history.length}
                    </span>
                  </div>
                </div>

                <button
                  onClick={() => {
                    if (continueStudyTarget) {
                      onContinueStudy(continueStudyTarget)
                    } else {
                      onOpenReaderHub()
                    }
                  }}
                  className="inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm transition-all duration-300 hover:-translate-y-0.5"
                  style={{ backgroundColor: 'rgba(140,26,17,0.08)', color: 'var(--gf-gugong-red)' }}
                >
                  转至续读
                  <ArrowRight className="h-4 w-4" />
                </button>
              </div>
            ) : (
              <div
                className="rounded-[24px] px-4 py-4"
                style={{ backgroundColor: 'rgba(255,255,255,0.76)', border: '1px solid rgba(26,30,35,0.06)' }}
              >
                <div className="text-sm leading-7" style={{ color: 'rgba(26,30,35,0.58)' }}>
                  先读一篇、记一词，或做一轮卡片，此处便会替你记住进度。
                </div>
                <button
                  onClick={primaryAction}
                  className="mt-3 inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm transition-all duration-300 hover:-translate-y-0.5"
                  style={{ backgroundColor: 'rgba(201,160,99,0.12)', color: 'var(--gf-gold)' }}
                >
                  转至起读
                  <ArrowRight className="h-4 w-4" />
                </button>
              </div>
            )}
          </div>
        </section>

        <section className="grid gap-5 lg:grid-cols-[1.05fr_0.95fr]">
          <div
            className="rounded-[28px] p-4 md:p-5"
            style={{ backgroundColor: 'rgba(255,255,255,0.68)', border: '1px solid rgba(26,30,35,0.06)' }}
          >
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-base font-medium" style={{ color: 'var(--gf-text)' }}>
                  今日一课
                </h3>
                <p className="text-xs" style={{ color: 'rgba(26,30,35,0.45)' }}>
                  起手一事。
                </p>
              </div>
              <div className="flex items-center gap-2 text-xs" style={{ color: 'rgba(26,30,35,0.55)' }}>
                <Flame className="h-3.5 w-3.5" />
                连续 {streakDays} 天
              </div>
            </div>

            <div
              className="rounded-[24px] px-4 py-4"
              style={{ backgroundColor: 'rgba(248,244,233,0.92)', border: '1px solid rgba(201,160,99,0.18)' }}
            >
              <div className="text-[11px] tracking-[0.22em]" style={{ color: 'rgba(26,30,35,0.42)' }}>
                今天先做这个
              </div>
              <div className="mt-2 text-base font-medium" style={{ color: 'var(--gf-text)' }}>
                {todayReview?.title || '先翻开一篇古籍'}
              </div>
              <div className="mt-1 text-sm leading-7" style={{ color: 'rgba(26,30,35,0.56)' }}>
                {todayReview?.description || '先翻开一篇古籍，你的复习节奏就会慢慢长出来。'}
              </div>
              <div className="mt-3 flex flex-wrap gap-2 text-[11px]">
                <span className="rounded-full px-3 py-1" style={{ backgroundColor: 'rgba(255,255,255,0.78)', color: 'rgba(26,30,35,0.62)' }}>
                  待复习 {reviewQueueCount}
                </span>
                <span className="rounded-full px-3 py-1" style={{ backgroundColor: 'rgba(255,255,255,0.78)', color: 'rgba(26,30,35,0.62)' }}>
                  掌握率 {Math.round((studyOverview?.mastery_rate ?? 0) * 100)}%
                </span>
              </div>
              <button
                onClick={() => runFocusAction(todayReview || { action_type: 'reader' })}
                className="mt-3 inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm transition-all duration-300 hover:-translate-y-0.5"
                style={{ backgroundColor: 'rgba(140,26,17,0.08)', color: 'var(--gf-gugong-red)' }}
              >
                {todayReview?.action_label || '转至起读'}
                <ArrowRight className="h-4 w-4" />
              </button>
            </div>

            {readingPaths.length > 0 && (
              <div className="mt-4 space-y-3">
                {readingPaths.map((path) => (
                  <button
                    key={path.id}
                    onClick={() => runFocusAction(path)}
                    className="w-full rounded-[20px] px-4 py-3 text-left transition-all duration-300 hover:-translate-y-0.5"
                    style={{ backgroundColor: 'rgba(255,255,255,0.8)', border: '1px solid rgba(26,30,35,0.06)' }}
                  >
                    <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
                      <span className="text-sm font-medium" style={{ color: 'var(--gf-text)' }}>{path.title}</span>
                      {path.badge && (
                        <span className="rounded-full px-2 py-0.5 text-[11px]" style={{ backgroundColor: 'rgba(201,160,99,0.12)', color: 'var(--gf-gold)' }}>
                          {path.badge}
                        </span>
                      )}
                    </div>
                    <div className="text-xs leading-6" style={{ color: 'rgba(26,30,35,0.5)' }}>{path.description}</div>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div
            className="rounded-[28px] p-4 md:p-5"
            style={{ backgroundColor: 'rgba(255,255,255,0.68)', border: '1px solid rgba(26,30,35,0.06)' }}
          >
            <div className="mb-4">
              <div className="mb-2 inline-flex items-center gap-2 text-xs" style={{ color: 'rgba(26,30,35,0.58)' }}>
                <Users className="h-3.5 w-3.5" />
                今天可以这样读
              </div>
              <h3 className="text-base font-medium" style={{ color: 'var(--gf-text)' }}>
                起手一卷
              </h3>
              <p className="text-xs" style={{ color: 'rgba(26,30,35,0.45)' }}>
                由此起手，便可续读。
              </p>
            </div>

            <div className="space-y-3">
              {coReadingPrompts.map((item) => (
                <button
                  key={item.id}
                  onClick={() => runFocusAction(item)}
                  className="w-full rounded-[20px] px-4 py-3 text-left transition-all duration-300 hover:-translate-y-0.5"
                  style={{ backgroundColor: 'rgba(255,255,255,0.8)', border: '1px solid rgba(26,30,35,0.06)' }}
                >
                  <div className="text-sm font-medium" style={{ color: 'var(--gf-text)' }}>{item.title}</div>
                  <div className="mt-1 text-xs leading-6" style={{ color: 'rgba(26,30,35,0.5)' }}>{item.description}</div>
                </button>
              ))}
              {coReadingPrompts.length === 0 && (
                <div className="rounded-[20px] px-4 py-4 text-sm" style={{ backgroundColor: 'rgba(255,255,255,0.78)', color: 'rgba(26,30,35,0.5)' }}>
                  先完成一次阅读或问答，这里会出现更贴合你的共读建议。
                </div>
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
                  起手一卷
                </h3>
                <p className="text-xs" style={{ color: 'rgba(26,30,35,0.45)' }}>
                  依近来所读与字词收藏，续推数篇可读之作。
                </p>
              </div>
            <div className="flex gap-2">
              <button
                onClick={onOpenCompare}
                className="rounded-xl px-3 py-1.5 text-xs"
                style={{ backgroundColor: 'rgba(201,160,99,0.12)', color: 'var(--gf-gold)' }}
              >
                转至对照
              </button>
              <button
                onClick={onOpenWordbook}
                className="rounded-xl px-3 py-1.5 text-xs"
                style={{ backgroundColor: 'rgba(26,30,35,0.04)', color: 'var(--gf-text)' }}
              >
                转至字词本
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
                  {item.preview || '翻开后可继续对照原文、标点和白话。'}
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
                先读一篇，推荐会慢慢准起来。
              </p>
            )}
          </div>
        </section>
      </div>
    </div>
  )
}
