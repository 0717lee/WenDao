import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useDropzone } from 'react-dropzone'
import { ArrowRight, BookMarked, BookOpen, Clock3, LibraryBig, Loader2, ScanText, Search, Upload } from 'lucide-react'
import { API_BASE } from '../lib/api'
import { authFetchOptions } from '../store/useAuthStore'
import { useDocumentStore } from '../store/useDocumentStore'
import { useGraphStore } from '../store/useGraphStore'

const BOOKSHELF_WARM_RETRY_MAX = 4
const BOOKSHELF_WARM_RETRY_DELAY_MS = 900
const CATALOG_PAGE_SIZE = 36
const CORPUS_FETCH_LIMIT = 120
const DIFFICULTY_RANK: Record<string, number> = {
  入门: 0,
  进阶: 1,
  挑战: 2,
}
const FEATURED_STARTER_REPO_IDS = [
  'KR1h0004', // 《论语》
  'KR3l0002', // 《世说新语》
  'KR5c0045', // 《道德经》
  'KR2a0001', // 《史记》
  'KR1c0001', // 《诗经》
  'KR3b0003', // 《孙子》
  'KR4a0001', // 《楚辞》
  'KR6c0023', // 《金刚经》
  'KR1h0001', // 《孟子》
  'KR2e0006', // 《贞观政要》
  'KR3j0092', // 《梦溪笔谈》
  'KR5c0126', // 《庄子》
] as const
const FEATURED_STARTER_REPO_RANK = new Map<string, number>(
  FEATURED_STARTER_REPO_IDS.map((repoId, index) => [repoId, index]),
)

interface BookshelfItem {
  id: string
  repo_id?: string
  title: string
  author?: string
  dynasty?: string
  category?: string
  source_name?: string
  source_url?: string
  chapter_count?: number
  difficulty?: string
  guide_summary?: string
  status: string
  preview: string
  current_paragraph: number
  total_paragraphs: number
  has_processed: boolean
  has_note: boolean
  source_type?: string
  updated_at?: string
}

interface HistoryItem {
  id: string
  document_id?: string
  title: string
  current_paragraph?: number
  total_paragraphs?: number
  last_read_at: string
}

interface CatalogEntry {
  repo_id: string
  title: string
  author?: string | null
  dynasty?: string | null
  family?: string | null
  section?: string | null
  imported: boolean
  imported_document_id?: string | null
}

interface BookshelfPanelProps {
  onOpenDocument: (documentId: string, options?: { readerPanel?: 'notes' | 'study' | null; resumeParagraph?: number | null }) => void
  onToggleCompare: (documentId: string) => void
  comparedDocumentIds: string[]
  onOpenCompare: () => void
}

const FAMILY_LABELS: Record<string, string> = {
  全部: '全部门类',
  经部: '经学',
  史部: '历史',
  子部: '思想',
  集部: '文学',
  道部: '道教',
  佛部: '佛学',
}

function progressLabel(item: BookshelfItem): string {
  if (!item.total_paragraphs) return item.has_processed ? '已经整理好，可以直接开始读' : '还在继续处理'
  return `读到 ${item.current_paragraph}/${item.total_paragraphs}`
}

function formatTimeLabel(value?: string): string {
  if (!value) return '刚刚整理'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '刚刚整理'
  return date.toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' })
}

function rankDocumentForStart(doc: BookshelfItem, index: number) {
  return {
    doc,
    index,
    starterRank: FEATURED_STARTER_REPO_RANK.get(doc.repo_id || '') ?? Number.MAX_SAFE_INTEGER,
    difficultyRank: DIFFICULTY_RANK[doc.difficulty || ''] ?? 99,
    chapterRank: doc.chapter_count ?? Number.MAX_SAFE_INTEGER,
  }
}

function inferFeaturedBucket(doc: BookshelfItem): string {
  switch (doc.category) {
    case '四书':
    case '经学典籍':
      return '经部'
    case '史书':
      return '史部'
    case '儒家':
    case '兵家':
    case '法家':
    case '墨家':
    case '杂家':
    case '政论':
    case '理学':
    case '笔记':
    case '笔记小说':
    case '志怪':
    case '艺术':
      return '子部'
    case '文学总集':
    case '辞赋':
    case '文学理论':
    case '词曲':
    case '古文选本':
    case '文论':
      return '集部'
    case '道家':
      return '道部'
    case '佛学':
      return '佛部'
    default:
      return doc.category || `__${doc.id}`
  }
}

function buildFeaturedGuideSummary(doc: BookshelfItem): string {
  switch (inferFeaturedBucket(doc)) {
    case '经部':
      return '句子和概念都更常见，适合先从几段熟悉的话开始读。'
    case '史部':
      return '可以先从熟悉的人物或事件切进去，不用一开始就通读全书。'
    case '子部':
      return '适合先抓一个观点或故事，看懂一层再往下走。'
    case '集部':
      return '先读短篇或熟悉题材，更容易读出画面和情绪。'
    case '道部':
      return '先抓几个反复出现的关键词，不必急着把每句都讲透。'
    case '佛部':
      return '先把大意读顺，再回头看术语，会轻松很多。'
    default:
      return doc.difficulty === '入门'
        ? '门槛更低，适合先翻几段试试看。'
        : '可以先从自己熟悉的主题切进去。'
  }
}

function pickFeaturedCorpusDocuments(
  documents: BookshelfItem[],
  selectedCategory: string,
  maxItems = 4,
): BookshelfItem[] {
  const scoped = selectedCategory === '全部'
    ? documents
    : documents.filter((item) => item.category === selectedCategory)

  if (scoped.length === 0) return []

  const ordered = scoped
    .map((doc, index) => rankDocumentForStart(doc, index))
    .sort((left, right) => {
      if (left.starterRank !== right.starterRank) {
        return left.starterRank - right.starterRank
      }
      if (left.difficultyRank !== right.difficultyRank) {
        return left.difficultyRank - right.difficultyRank
      }
      if (left.chapterRank !== right.chapterRank) {
        return left.chapterRank - right.chapterRank
      }
      return left.index - right.index
    })
    .map((item) => item.doc)

  if (selectedCategory !== '全部') {
    return ordered.slice(0, maxItems)
  }

  const featured: BookshelfItem[] = []
  const seenCategories = new Set<string>()

  for (const doc of ordered) {
    const categoryKey = inferFeaturedBucket(doc)
    if (seenCategories.has(categoryKey)) continue
    seenCategories.add(categoryKey)
    featured.push(doc)
    if (featured.length >= maxItems) return featured
  }

  for (const doc of ordered) {
    if (featured.some((item) => item.id === doc.id)) continue
    featured.push(doc)
    if (featured.length >= maxItems) break
  }

  return featured
}

export default function BookshelfPanel({
  onOpenDocument,
  onToggleCompare,
  comparedDocumentIds,
  onOpenCompare,
}: BookshelfPanelProps) {
  const [corpusDocuments, setCorpusDocuments] = useState<BookshelfItem[]>([])
  const [userDocuments, setUserDocuments] = useState<BookshelfItem[]>([])
  const [history, setHistory] = useState<HistoryItem[]>([])
  const [loading, setLoading] = useState(true)
  const [userDocumentsLoading, setUserDocumentsLoading] = useState(false)
  const [selectedCorpusCategory, setSelectedCorpusCategory] = useState('全部')
  const [catalogEntries, setCatalogEntries] = useState<CatalogEntry[]>([])
  const [catalogTotal, setCatalogTotal] = useState(0)
  const [userTotal, setUserTotal] = useState(0)
  const [catalogQuery, setCatalogQuery] = useState('')
  const [catalogLoading, setCatalogLoading] = useState(false)
  const [catalogImportingId, setCatalogImportingId] = useState<string | null>(null)
  const [selectedCatalogFamily, setSelectedCatalogFamily] = useState('全部')
  const [uploadErrorMessage, setUploadErrorMessage] = useState('')
  const [panelNotice, setPanelNotice] = useState<{ tone: 'info' | 'success' | 'error'; message: string } | null>(null)
  const [showMoreOptions, setShowMoreOptions] = useState(false)
  const [moreOptionsLoaded, setMoreOptionsLoaded] = useState(false)
  const { setDocument, setUploadStatus, uploadStatus } = useDocumentStore()
  const consumeReaderHubSection = useGraphStore((state) => state.consumeReaderHubSection)
  const continueReadingRef = useRef<HTMLDivElement | null>(null)
  const corpusSectionRef = useRef<HTMLDivElement | null>(null)
  const userDocumentsRef = useRef<HTMLDivElement | null>(null)
  const uploadSectionRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    let cancelled = false

    async function load(): Promise<void> {
      setLoading(true)
      try {
        for (let attempt = 0; attempt <= BOOKSHELF_WARM_RETRY_MAX; attempt += 1) {
          const [corpusResponse, historyResponse] = await Promise.all([
            fetch(`${API_BASE}/api/v1/documents?limit=${CORPUS_FETCH_LIMIT}&source_type=corpus`, authFetchOptions()).catch(() => null),
            fetch(`${API_BASE}/api/v1/reader/history`, authFetchOptions()).catch(() => null),
          ])

          const corpusData = corpusResponse?.ok ? await corpusResponse.json() : { documents: [] }
          const historyData = historyResponse?.ok ? await historyResponse.json() : []

          if (cancelled) return

          const corpusList = Array.isArray(corpusData.documents) ? corpusData.documents : []
          const totalCorpus = Math.max(Number(corpusData.total) || 0, corpusList.length)
          const shouldRetry =
            Boolean(corpusResponse?.ok) &&
            totalCorpus === 0 &&
            corpusList.length === 0 &&
            (!Array.isArray(historyData) || historyData.length === 0) &&
            attempt < BOOKSHELF_WARM_RETRY_MAX

          if (shouldRetry) {
            await new Promise((resolve) => setTimeout(resolve, BOOKSHELF_WARM_RETRY_DELAY_MS))
            continue
          }

          setCorpusDocuments(corpusList)
          setHistory(Array.isArray(historyData) ? historyData : [])
          break
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()

    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!showMoreOptions || moreOptionsLoaded) return

    let cancelled = false

    async function loadMoreOptions() {
      setUserDocumentsLoading(true)
      try {
        const response = await fetch(`${API_BASE}/api/v1/documents?limit=24&source_type=user`, authFetchOptions()).catch(() => null)
        const data = response?.ok ? await response.json() : { documents: [], total: 0 }

        if (cancelled) return

        const userDocs = Array.isArray(data.documents) ? data.documents : []
        setUserDocuments(userDocs)
        setUserTotal(Math.max(Number(data.total) || 0, userDocs.length))
        setMoreOptionsLoaded(true)
      } finally {
        if (!cancelled) setUserDocumentsLoading(false)
      }
    }

    void loadMoreOptions()

    return () => {
      cancelled = true
    }
  }, [moreOptionsLoaded, showMoreOptions])

  useEffect(() => {
    const nextSection = consumeReaderHubSection()
    if (nextSection !== 'upload') return

    setShowMoreOptions(true)
    window.setTimeout(() => {
      uploadSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    }, 30)
  }, [consumeReaderHubSection])

  const continueReadingItems = useMemo(() => {
    return history.slice(0, 4)
  }, [history])

  const primaryContinueItem = continueReadingItems[0] ?? null
  const secondaryContinueItems = primaryContinueItem ? continueReadingItems.slice(1) : continueReadingItems

  const recommendedStart = useMemo(() => {
    return pickFeaturedCorpusDocuments(corpusDocuments, selectedCorpusCategory, 4)[0] ?? null
  }, [corpusDocuments, selectedCorpusCategory])

  const scrollToSection = (target: { current: HTMLDivElement | null }) => {
    target.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }

  const openMoreAndScroll = (target: { current: HTMLDivElement | null }) => {
    if (!showMoreOptions) {
      setShowMoreOptions(true)
      window.setTimeout(() => {
        target.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
      }, 30)
      return
    }
    target.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }

  const corpusCategories = useMemo(() => {
    const items = new Set(
      corpusDocuments
        .map((item) => item.category)
        .filter((value): value is string => Boolean(value))
    )
    return ['全部', ...Array.from(items)]
  }, [corpusDocuments])

  const featuredCorpusDocuments = useMemo(() => {
    return pickFeaturedCorpusDocuments(corpusDocuments, selectedCorpusCategory, 4)
  }, [corpusDocuments, selectedCorpusCategory])

  const secondaryFeaturedDocuments = useMemo(() => {
    if (!recommendedStart) return featuredCorpusDocuments
    return featuredCorpusDocuments.filter((doc) => doc.id !== recommendedStart.id)
  }, [featuredCorpusDocuments, recommendedStart])

  const renderMetaLine = (doc: BookshelfItem) => {
    const parts = [doc.dynasty, doc.author, doc.category, doc.chapter_count ? `${doc.chapter_count}篇` : null].filter(Boolean)
    if (parts.length === 0) return null
    return (
      <div className="mt-2 text-xs" style={{ color: 'rgba(26,30,35,0.42)' }}>
        {parts.join(' · ')}
      </div>
    )
  }

  const catalogFamilies = ['全部', '经部', '史部', '子部', '集部', '道部', '佛部']

  useEffect(() => {
    if (!showMoreOptions) return

    let cancelled = false
    const timer = setTimeout(async () => {
      setCatalogLoading(true)
      try {
        const params = new URLSearchParams({
          limit: String(CATALOG_PAGE_SIZE),
          primary_only: 'true',
        })
        if (catalogQuery.trim()) params.set('q', catalogQuery.trim())
        if (selectedCatalogFamily !== '全部') params.set('family', selectedCatalogFamily)

        const response = await fetch(`${API_BASE}/api/v1/documents/catalog?${params.toString()}`, authFetchOptions())
        const data = response.ok ? await response.json() : { entries: [], total: 0 }
        if (!cancelled) {
          setCatalogEntries(Array.isArray(data.entries) ? data.entries : [])
          setCatalogTotal(Number(data.total) || 0)
        }
      } catch {
        if (!cancelled) {
          setCatalogEntries([])
          setCatalogTotal(0)
        }
      } finally {
        if (!cancelled) setCatalogLoading(false)
      }
    }, 250)

    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [catalogQuery, selectedCatalogFamily, showMoreOptions])

  useEffect(() => {
    if (!panelNotice) return
    const timer = window.setTimeout(() => setPanelNotice(null), 3200)
    return () => window.clearTimeout(timer)
  }, [panelNotice])

  const openCatalogEntry = useCallback(async (entry: CatalogEntry) => {
    if (entry.imported_document_id) {
      onOpenDocument(entry.imported_document_id)
      return
    }

    setCatalogImportingId(entry.repo_id)
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 90_000)
    try {
      const response = await fetch(`${API_BASE}/api/v1/documents/catalog/import/${entry.repo_id}`, {
        ...authFetchOptions({ method: 'POST' }),
        signal: controller.signal,
      })
      clearTimeout(timer)
      if (!response.ok) {
        const err = await response.json().catch(() => null)
        setPanelNotice({ tone: 'error', message: err?.detail || '加入阅读没有成功，请稍后再试一次。' })
        return
      }
      const data = await response.json()
      const documentId = data?.document?.id
      if (documentId) {
        setCatalogEntries((current) =>
          current.map((item) =>
            item.repo_id === entry.repo_id
              ? { ...item, imported: true, imported_document_id: documentId }
              : item
          )
        )
        setPanelNotice({ tone: 'success', message: `《${entry.title}》已加入阅读，马上为你打开。` })
        onOpenDocument(documentId)
      }
    } catch (e: any) {
      clearTimeout(timer)
      if (e.name === 'AbortError') {
        setPanelNotice({ tone: 'error', message: '加入阅读超时了，请检查网络后再试一次。' })
      } else {
        setPanelNotice({ tone: 'error', message: `加入阅读没有成功：${e.message || '请稍后再试一次'}` })
      }
    } finally {
      setCatalogImportingId(null)
    }
  }, [onOpenDocument])

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    if (acceptedFiles.length === 0) return

    const file = acceptedFiles[0]
    setUploadStatus('uploading')
    setUploadErrorMessage('')

    try {
      const formData = new FormData()
      formData.append('file', file)

      const response = await fetch(`${API_BASE}/api/v1/documents/upload`, {
        method: 'POST',
        body: formData,
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => null)
        throw new Error(errorData?.detail || 'Upload failed')
      }

      const data = await response.json()
      setDocument({
        id: data.document_id,
        title: file.name,
        originalText: data.text,
        confidence: data.confidence,
        imageUrl: data.image_url,
        sourceType: 'user',
      })
      setUploadStatus('done')
      setPanelNotice({ tone: 'success', message: '图片已经识读完成，先核对文字，再继续整理。' })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Upload failed'
      setUploadErrorMessage(
        message.toLowerCase().includes('fetch')
          ? '识读服务暂时不可用，可以先读现成内容，稍后再试。'
          : '上传没有成功，请检查图片格式后再试一次。'
      )
      setUploadStatus('error')
    }
  }, [setDocument, setUploadStatus])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'image/jpeg': ['.jpg', '.jpeg'],
      'image/png': ['.png'],
      'image/tiff': ['.tiff', '.tif'],
    },
    multiple: false,
    disabled: uploadStatus === 'uploading',
  })

  return (
    <div className="h-full overflow-y-auto px-4 py-5 md:px-6" style={{ backgroundColor: 'var(--gf-bg)' }}>
      <div className="mx-auto max-w-6xl space-y-5">
        <section
          className="rounded-[34px] p-6 md:p-8"
          style={{
            background: 'linear-gradient(135deg, rgba(255,255,255,0.88) 0%, rgba(249,244,230,0.96) 52%, rgba(247,246,243,0.98) 100%)',
            border: '1px solid rgba(26,30,35,0.06)',
            boxShadow: '0 24px 52px rgba(26,30,35,0.06)',
          }}
        >
          <div className="space-y-3">
            <div className="inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-[11px] tracking-[0.24em]" style={{ backgroundColor: 'rgba(140,26,17,0.08)', color: 'var(--gf-gugong-red)' }}>
              <BookOpen className="h-3.5 w-3.5" />
              开始阅读
            </div>
            <h2 className="text-3xl leading-tight md:text-4xl" style={{ fontFamily: '"ZCOOL XiaoWei", serif', color: 'var(--gf-text)' }}>
              先选一种开始方式，
              <br className="hidden md:block" />
              然后顺着读下去
            </h2>
            <p className="max-w-3xl text-sm leading-7 md:text-base" style={{ color: 'rgba(26,30,35,0.6)' }}>
              如果你已经读过，就回到上次停下的地方；如果是第一次来，可以先从推荐内容开始；如果手头只有图片，就先识读成文。
            </p>
          </div>

          <div className="mt-6 grid gap-4 lg:grid-cols-3">
            <button
              onClick={primaryContinueItem
                ? () => onOpenDocument(primaryContinueItem.document_id ?? primaryContinueItem.id, { resumeParagraph: primaryContinueItem.current_paragraph ?? null })
                : () => scrollToSection(corpusSectionRef)}
              className="flex h-full flex-col rounded-[26px] px-5 py-5 text-left transition-all duration-300 hover:-translate-y-0.5"
              style={{ backgroundColor: 'rgba(255,255,255,0.78)', border: '1px solid rgba(26,30,35,0.06)', boxShadow: '0 12px 24px rgba(26,30,35,0.04)' }}
            >
              <div className="mb-3 flex items-center justify-between">
                <span className="text-[11px] tracking-[0.24em]" style={{ color: 'rgba(26,30,35,0.42)' }}>
                  继续阅读
                </span>
                <Clock3 className="h-4 w-4" style={{ color: '#5b8aab' }} />
              </div>
              <div className="text-lg font-medium" style={{ color: 'var(--gf-text)' }}>
                回到上次进度
              </div>
              <div className="mt-2 min-h-[4.25rem] text-sm leading-7" style={{ color: 'rgba(26,30,35,0.56)' }}>
                {primaryContinueItem ? (
                  <div className="space-y-0.5">
                    <div className="line-clamp-1">当前文章：{primaryContinueItem.title}</div>
                    <div>最近读到：{formatTimeLabel(primaryContinueItem.last_read_at)}</div>
                  </div>
                ) : (
                  '还没有阅读记录时，可以先打开推荐内容。'
                )}
              </div>
              <div className="mt-auto inline-flex items-center gap-2 text-sm" style={{ color: 'var(--gf-gugong-red)' }}>
                {primaryContinueItem ? '继续阅读' : '开始阅读'}
                <ArrowRight className="h-4 w-4" />
              </div>
            </button>

            <button
              onClick={recommendedStart ? () => onOpenDocument(recommendedStart.id) : () => scrollToSection(corpusSectionRef)}
              className="flex h-full flex-col rounded-[26px] px-5 py-5 text-left transition-all duration-300 hover:-translate-y-0.5"
              style={{ backgroundColor: 'rgba(255,255,255,0.78)', border: '1px solid rgba(26,30,35,0.06)', boxShadow: '0 12px 24px rgba(26,30,35,0.04)' }}
            >
              <div className="mb-3 flex items-center justify-between">
                <span className="text-[11px] tracking-[0.24em]" style={{ color: 'rgba(26,30,35,0.42)' }}>
                  推荐阅读
                </span>
                <LibraryBig className="h-4 w-4" style={{ color: 'var(--gf-gugong-red)' }} />
              </div>
              <div className="text-lg font-medium" style={{ color: 'var(--gf-text)' }}>
                打开推荐内容
              </div>
              <div className="mt-2 min-h-[4.25rem] text-sm leading-7" style={{ color: 'rgba(26,30,35,0.56)' }}>
                {recommendedStart ? (
                  <div className="space-y-0.5">
                    <div className="line-clamp-1">推荐篇目：{recommendedStart.title}</div>
                    <div className="line-clamp-2">{buildFeaturedGuideSummary(recommendedStart)}</div>
                  </div>
                ) : (
                  '这里会先放几部更容易开始的书。'
                )}
              </div>
              <div className="mt-auto inline-flex items-center gap-2 text-sm" style={{ color: 'var(--gf-gugong-red)' }}>
                {recommendedStart ? '打开此篇' : '查看内容'}
                <ArrowRight className="h-4 w-4" />
              </div>
            </button>

            <button
              onClick={() => openMoreAndScroll(uploadSectionRef)}
              className="flex h-full flex-col rounded-[26px] px-5 py-5 text-left transition-all duration-300 hover:-translate-y-0.5"
              style={{ backgroundColor: 'rgba(255,255,255,0.78)', border: '1px solid rgba(26,30,35,0.06)', boxShadow: '0 12px 24px rgba(26,30,35,0.04)' }}
            >
              <div className="mb-3 flex items-center justify-between">
                <span className="text-[11px] tracking-[0.24em]" style={{ color: 'rgba(26,30,35,0.42)' }}>
                  图片识读
                </span>
                <ScanText className="h-4 w-4" style={{ color: 'var(--gf-gold)' }} />
              </div>
              <div className="text-lg font-medium" style={{ color: 'var(--gf-text)' }}>
                先做图片识读
              </div>
              <div className="mt-2 min-h-[4.25rem] text-sm leading-7" style={{ color: 'rgba(26,30,35,0.56)' }}>
                适合影印页、扫描图与馆藏图片。先识读成文，再继续整理与阅读。
              </div>
              <div className="mt-auto inline-flex items-center gap-2 text-sm" style={{ color: 'var(--gf-gold)' }}>
                开始识读
                <ArrowRight className="h-4 w-4" />
              </div>
            </button>
          </div>

          {comparedDocumentIds.length > 0 && (
            <div className="mt-5 flex flex-wrap gap-2">
              <button
                onClick={onOpenCompare}
                className="inline-flex min-w-[7.5rem] justify-center rounded-full px-3 py-1.5 text-xs transition-all duration-300 hover:-translate-y-0.5"
                style={{ backgroundColor: 'rgba(201,160,99,0.12)', border: '1px solid rgba(201,160,99,0.20)', color: 'var(--gf-gold)' }}
              >
                对照阅读
              </button>
            </div>
          )}
        </section>

        <section className={`grid items-stretch gap-5 ${secondaryContinueItems.length > 0 ? 'xl:grid-cols-[0.82fr_1.18fr]' : ''}`}>
          {secondaryContinueItems.length > 0 && (
            <div
              ref={continueReadingRef}
              className="h-full rounded-[28px] p-5"
              style={{ backgroundColor: 'rgba(255,255,255,0.7)', border: '1px solid rgba(26,30,35,0.06)' }}
            >
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-medium" style={{ color: 'var(--gf-text)' }}>
                    最近读过
                  </h3>
                  <p className="text-sm" style={{ color: 'rgba(26,30,35,0.45)' }}>
                    以下是你最近读过的内容。
                  </p>
                </div>
              </div>

              <div className="space-y-3">
                {secondaryContinueItems.map((item) => (
                  <button
                    key={item.document_id ?? item.id}
                    onClick={() => onOpenDocument(item.document_id ?? item.id, { resumeParagraph: item.current_paragraph ?? null })}
                    className="w-full rounded-[22px] px-4 py-4 text-left transition-all duration-300 hover:-translate-y-0.5"
                    style={{ backgroundColor: 'rgba(255,255,255,0.76)', border: '1px solid rgba(26,30,35,0.07)' }}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium" style={{ color: 'var(--gf-text)' }}>
                          {item.title}
                        </div>
                        <div className="mt-1 text-xs" style={{ color: 'rgba(26,30,35,0.42)' }}>
                          最近阅读：{formatTimeLabel(item.last_read_at)}
                        </div>
                      </div>
                      <ArrowRight className="h-4 w-4 shrink-0" style={{ color: 'rgba(26,30,35,0.3)' }} />
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          <div
            ref={corpusSectionRef}
            className="h-full rounded-[28px] p-5 flex flex-col"
            style={{ backgroundColor: 'rgba(255,255,255,0.7)', border: '1px solid rgba(26,30,35,0.06)' }}
          >
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <h3 className="text-lg font-medium" style={{ color: 'var(--gf-text)' }}>
                  精选篇目
                </h3>
                <p className="text-sm" style={{ color: 'rgba(26,30,35,0.45)' }}>
                  {selectedCorpusCategory === '全部'
                    ? '这里先放几部更容易开始的书；想看完整目录，可以展开下面的“更多篇目”。'
                    : '切到具体门类后，这里只保留更适合起步的几部。'}
                </p>
              </div>
              <label className="text-xs" style={{ color: 'rgba(26,30,35,0.5)' }}>
                按门类看
                <select
                  value={selectedCorpusCategory}
                  onChange={(event) => setSelectedCorpusCategory(event.target.value)}
                  className="ml-2 rounded-full px-3 py-1 outline-none"
                  style={{ backgroundColor: 'rgba(255,255,255,0.78)', border: '1px solid rgba(26,30,35,0.08)', color: 'var(--gf-text)' }}
                >
                  {corpusCategories.map((category) => (
                    <option key={category} value={category}>
                      {FAMILY_LABELS[category] || category}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="grid flex-1 content-start gap-3">
              {loading ? (
                <div
                  className="rounded-[22px] px-4 py-8 text-center text-sm"
                  style={{ backgroundColor: 'rgba(255,255,255,0.76)', border: '1px solid rgba(26,30,35,0.07)', color: 'rgba(26,30,35,0.45)' }}
                >
                  古籍库正在准备中，马上就能开始读。
                </div>
              ) : (secondaryFeaturedDocuments.length > 0 ? secondaryFeaturedDocuments : featuredCorpusDocuments).length === 0 ? (
                <div
                  className="rounded-[22px] px-4 py-8 text-center text-sm"
                  style={{ backgroundColor: 'rgba(255,255,255,0.76)', border: '1px solid rgba(26,30,35,0.07)', color: 'rgba(26,30,35,0.45)' }}
                >
                  这里还没有可展示的精选篇目，请稍后再试，或刷新页面。
                </div>
              ) : (
                (secondaryFeaturedDocuments.length > 0 ? secondaryFeaturedDocuments : featuredCorpusDocuments).map((doc) => (
                  <button
                    key={doc.id}
                    onClick={() => onOpenDocument(doc.id)}
                    className="rounded-[22px] px-4 py-4 text-left transition-all duration-300 hover:-translate-y-0.5"
                    style={{ backgroundColor: 'rgba(255,255,255,0.76)', border: '1px solid rgba(26,30,35,0.07)' }}
                  >
                    <div className="mb-2 flex items-center justify-between gap-3">
                      <span className="text-sm font-medium" style={{ color: 'var(--gf-text)' }}>
                        {doc.title}
                      </span>
                      <div className="flex flex-wrap items-center gap-2">
                        {doc.difficulty && (
                          <span className="rounded-full px-2 py-0.5 text-[11px]" style={{ backgroundColor: 'rgba(26,30,35,0.06)', color: 'rgba(26,30,35,0.58)' }}>
                            {doc.difficulty}
                          </span>
                        )}
                        <span
                          className="rounded-full px-2 py-0.5 text-[11px]"
                          style={{
                            backgroundColor: doc.source_type === 'corpus' ? 'rgba(201,160,99,0.14)' : 'rgba(140,26,17,0.08)',
                            color: doc.source_type === 'corpus' ? 'var(--gf-gold)' : 'var(--gf-gugong-red)',
                          }}
                        >
                          {doc.source_type === 'corpus' ? '精选篇目' : '示例'}
                        </span>
                      </div>
                    </div>
                    {renderMetaLine(doc)}
                  </button>
                ))
              )}
            </div>
          </div>
        </section>

        <section
          className="rounded-[28px] p-5"
          style={{ backgroundColor: 'rgba(255,255,255,0.7)', border: '1px solid rgba(26,30,35,0.06)' }}
        >
          <button
            type="button"
            onClick={() => setShowMoreOptions((prev) => !prev)}
            className="flex w-full items-center justify-between gap-3 text-left"
          >
            <div>
              <h3 className="text-lg font-medium" style={{ color: 'var(--gf-text)' }}>
                更多来源与工具
              </h3>
              <p className="text-sm" style={{ color: 'rgba(26,30,35,0.45)' }}>
                想继续往下读时，再来看更多目录、我的上传和图片识读。
              </p>
            </div>
            <span className="text-xs" style={{ color: 'rgba(26,30,35,0.42)' }}>
              {showMoreOptions ? '收起' : '展开'}
            </span>
          </button>

          {showMoreOptions && (
            <div className="mt-5 space-y-5">
            <section
              className="rounded-[28px] p-5"
              style={{ backgroundColor: 'rgba(255,255,255,0.7)', border: '1px solid rgba(26,30,35,0.06)' }}
            >
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <div>
                <h3 className="text-lg font-medium" style={{ color: 'var(--gf-text)' }}>
                  更多篇目
                </h3>
                <p className="text-sm" style={{ color: 'rgba(26,30,35,0.45)' }}>
                  如果这里没有你想读的，可以继续搜索，再加入阅读。
                </p>
                </div>
                <div className="text-xs" style={{ color: 'rgba(26,30,35,0.42)' }}>
                  现在可浏览 {catalogTotal} 条目录
                </div>
              </div>

          <div className="mb-4 grid gap-3 lg:grid-cols-[1fr_auto]">
            <div className="relative">
              <input
                value={catalogQuery}
                onChange={(event) => setCatalogQuery(event.target.value)}
                placeholder="搜书名、作者或主题，比如《史记》、庄子、礼记"
                className="w-full rounded-[22px] px-4 py-3 pl-10 text-sm outline-none"
                style={{ backgroundColor: 'rgba(255,255,255,0.78)', border: '1px solid rgba(26,30,35,0.08)', color: 'var(--gf-text)' }}
              />
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" style={{ color: 'rgba(26,30,35,0.35)' }} />
            </div>
            <div className="flex flex-wrap gap-2">
              {catalogFamilies.map((family) => (
                <button
                  key={family}
                  onClick={() => setSelectedCatalogFamily(family)}
                  className="rounded-full px-3 py-1.5 text-xs transition-all duration-300 hover:-translate-y-0.5"
                    style={{
                      backgroundColor: selectedCatalogFamily === family ? 'rgba(140,26,17,0.10)' : 'rgba(255,255,255,0.74)',
                      color: selectedCatalogFamily === family ? 'var(--gf-gugong-red)' : 'rgba(26,30,35,0.62)',
                      border: '1px solid rgba(26,30,35,0.08)',
                    }}
                  >
                    {FAMILY_LABELS[family] || family}
                  </button>
                ))}
              </div>
          </div>

          {catalogLoading ? (
            <div className="rounded-[24px] p-8 text-center text-sm" style={{ backgroundColor: 'rgba(255,255,255,0.72)', color: 'rgba(26,30,35,0.42)' }}>
              正在找可读篇目...
            </div>
          ) : (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {catalogEntries.map((entry) => (
                <button
                  key={entry.repo_id}
                  onClick={() => openCatalogEntry(entry)}
                  className="rounded-[22px] px-4 py-4 text-left transition-all duration-300 hover:-translate-y-0.5"
                  style={{ backgroundColor: 'rgba(255,255,255,0.76)', border: '1px solid rgba(26,30,35,0.07)' }}
                >
                  <div className="mb-2 flex items-center justify-between gap-3">
                    <span className="text-sm font-medium" style={{ color: 'var(--gf-text)' }}>
                      {entry.title}
                    </span>
                    <span
                      className="rounded-full px-2 py-0.5 text-[11px]"
                      style={{
                        backgroundColor: entry.imported ? 'rgba(201,160,99,0.14)' : 'rgba(26,30,35,0.06)',
                        color: entry.imported ? 'var(--gf-gold)' : 'rgba(26,30,35,0.55)',
                      }}
                    >
                      {catalogImportingId === entry.repo_id ? '正在加入' : entry.imported ? '已加入' : '可加入阅读'}
                    </span>
                  </div>
                  <div className="text-xs leading-6" style={{ color: 'rgba(26,30,35,0.45)' }}>
                    {([FAMILY_LABELS[entry.family || ''] || entry.family, entry.section, entry.dynasty, entry.author].filter(Boolean).join(' · ') || '目录条目')}
                  </div>
                  <div className="mt-3 flex items-center gap-2 text-xs" style={{ color: 'rgba(26,30,35,0.5)' }}>
                    {catalogImportingId === entry.repo_id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ArrowRight className="h-3.5 w-3.5" />}
                    <span>{entry.imported ? '打开此篇' : '加入阅读并打开'}</span>
                  </div>
                </button>
              ))}
            </div>
          )}
            </section>

            <section className="grid gap-5 xl:grid-cols-[1.08fr_0.92fr]">
              <div
            ref={userDocumentsRef}
            className="rounded-[28px] p-5"
            style={{ backgroundColor: 'rgba(255,255,255,0.7)', border: '1px solid rgba(26,30,35,0.06)' }}
          >
            <div className="mb-4 flex items-center justify-between">
              <div>
              <h3 className="text-lg font-medium" style={{ color: 'var(--gf-text)' }}>
                我的上传
              </h3>
              <p className="text-sm" style={{ color: 'rgba(26,30,35,0.45)' }}>
                你上传并整理过的内容，会显示在这里。
              </p>
            </div>
              <span className="text-sm" style={{ color: 'rgba(26,30,35,0.42)' }}>
                {!showMoreOptions
                  ? '展开后加载'
                  : userDocumentsLoading
                    ? '正在整理中...'
                    : `${userTotal} 份文档`}
              </span>
            </div>

            {userDocumentsLoading ? (
              <div className="rounded-[24px] p-8 text-center text-sm" style={{ backgroundColor: 'rgba(255,255,255,0.72)', color: 'rgba(26,30,35,0.42)' }}>
                正在整理你的内容...
              </div>
            ) : userDocuments.length === 0 ? (
              <div className="rounded-[24px] p-10 text-center" style={{ backgroundColor: 'rgba(255,255,255,0.72)' }}>
                <BookMarked className="mx-auto mb-3 h-12 w-12" style={{ color: 'rgba(26,30,35,0.22)' }} />
                <p className="text-sm" style={{ color: 'rgba(26,30,35,0.45)' }}>
                  你还没有上传内容。可以先读现成内容，需要时再上传图片。
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {userDocuments.map((doc) => {
                  const compared = comparedDocumentIds.includes(doc.id)

                  return (
                    <div
                      key={doc.id}
                      className="rounded-[22px] px-4 py-4"
                      style={{ backgroundColor: 'rgba(255,255,255,0.76)', border: '1px solid rgba(26,30,35,0.07)' }}
                    >
                      <div className="flex items-start justify-between gap-4">
                        <button className="min-w-0 flex-1 text-left" onClick={() => onOpenDocument(doc.id)}>
                          <div className="mb-2 flex flex-wrap items-center gap-2">
                            <span className="text-sm font-medium" style={{ color: 'var(--gf-text)' }}>
                              {doc.title}
                            </span>
                            <span
                              className="rounded-full px-2 py-0.5 text-[11px]"
                              style={{
                                backgroundColor: doc.has_processed ? 'rgba(201,160,99,0.14)' : 'rgba(26,30,35,0.06)',
                                color: doc.has_processed ? 'var(--gf-gold)' : 'rgba(26,30,35,0.45)',
                              }}
                            >
                              {doc.has_processed ? '已整理好' : '正在整理'}
                            </span>
                            {doc.has_note && (
                              <span className="rounded-full px-2 py-0.5 text-[11px]" style={{ backgroundColor: 'rgba(60,138,81,0.12)', color: '#3c8a51' }}>
                                有笔记
                              </span>
                            )}
                          </div>
                          {renderMetaLine(doc)}
                          <div className="line-clamp-2 text-sm leading-7" style={{ color: 'rgba(26,30,35,0.52)' }}>
                            {doc.preview || '翻开后可继续对照原文、标点和白话。'}
                          </div>
                          <div className="mt-2 text-xs" style={{ color: 'rgba(26,30,35,0.42)' }}>
                            {progressLabel(doc)}
                            {doc.updated_at ? ` · 最近整理：${formatTimeLabel(doc.updated_at)}` : ''}
                          </div>
                        </button>
                        <button
                          onClick={() => onToggleCompare(doc.id)}
                          className="shrink-0 rounded-[18px] px-3 py-2 text-xs"
                          style={{
                            backgroundColor: compared ? 'rgba(201,160,99,0.15)' : 'rgba(26,30,35,0.05)',
                            color: compared ? 'var(--gf-gold)' : 'rgba(26,30,35,0.55)',
                          }}
                        >
                          {compared ? '已在对照中' : '加入对照'}
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
              </div>

              <div
            ref={uploadSectionRef}
            className="rounded-[28px] p-5"
            style={{ background: 'linear-gradient(180deg, rgba(255,255,255,0.82) 0%, rgba(248,244,233,0.98) 100%)', border: '1px solid rgba(201,160,99,0.14)' }}
          >
            <div className="mb-4">
              <div className="inline-flex items-center gap-2 rounded-full px-3 py-1 text-[11px] tracking-[0.22em]" style={{ backgroundColor: 'rgba(201,160,99,0.12)', color: 'var(--gf-gold)' }}>
                <ScanText className="h-3.5 w-3.5" />
                图片识读
              </div>
              <h3 className="mt-3 text-lg font-medium" style={{ color: 'var(--gf-text)' }}>
                图片识读与整理
              </h3>
              <p className="mt-2 text-sm leading-7" style={{ color: 'rgba(26,30,35,0.5)' }}>
                手头有影印页、扫描图或馆藏图片时，可以先在这里识读成文。
              </p>
            </div>

            <div
              {...getRootProps()}
              className={`rounded-[24px] border-2 border-dashed px-5 py-8 text-center transition-all duration-300 ${uploadStatus === 'uploading' ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
              style={{
                borderColor: isDragActive ? 'var(--gf-gugong-red)' : 'rgba(26,30,35,0.12)',
                background: isDragActive
                  ? 'linear-gradient(135deg, rgba(140,26,17,0.08) 0%, rgba(255,255,255,0.78) 100%)'
                  : 'linear-gradient(135deg, rgba(255,255,255,0.84) 0%, rgba(247,246,243,0.92) 100%)',
              }}
            >
              <input {...getInputProps()} />
              <Upload className="mx-auto mb-4 h-12 w-12" style={{ color: 'rgba(26,30,35,0.22)' }} />
                <div className="text-base font-medium" style={{ color: 'var(--gf-text)' }}>
                  {uploadStatus === 'uploading' ? '正在上传图片' : isDragActive ? '松开后开始识读' : '拖拽图片到这里，或点击上传'}
                </div>
              <div className="mt-2 text-sm leading-7" style={{ color: 'rgba(26,30,35,0.48)' }}>
                支持 JPG、PNG、TIFF。上传后会先识读文字，再继续整理和阅读。
              </div>
            </div>

            {uploadErrorMessage && (
              <div className="mt-4 rounded-[22px] px-4 py-3 text-sm" style={{ backgroundColor: 'rgba(176,58,58,0.08)', border: '1px solid rgba(176,58,58,0.15)', color: '#b03a3a' }}>
                {uploadErrorMessage}
              </div>
            )}

            <div className="mt-4 rounded-[22px] px-4 py-4 text-sm leading-7" style={{ backgroundColor: 'rgba(255,255,255,0.66)', border: '1px solid rgba(26,30,35,0.05)', color: 'rgba(26,30,35,0.54)' }}>
              适合这些情况：
              <br />
              1. 手头只有扫描图、影印页或馆藏图片。
              <br />
              2. 想先把图片变成可以直接读的文字。
              <br />
              3. 后面还想继续补标点、看白话和查词。
            </div>
              </div>
            </section>
            </div>
          )}
        </section>
      </div>

      {panelNotice && (
        <div
          className="rounded-[22px] px-4 py-3 text-sm"
          style={{
            backgroundColor:
              panelNotice.tone === 'success'
                ? 'rgba(60,138,81,0.10)'
                : panelNotice.tone === 'error'
                  ? 'rgba(176,58,58,0.08)'
                  : 'rgba(26,30,35,0.05)',
            border:
              panelNotice.tone === 'success'
                ? '1px solid rgba(60,138,81,0.16)'
                : panelNotice.tone === 'error'
                  ? '1px solid rgba(176,58,58,0.15)'
                  : '1px solid rgba(26,30,35,0.06)',
            color:
              panelNotice.tone === 'success'
                ? '#2d8a56'
                : panelNotice.tone === 'error'
                  ? '#b03a3a'
                  : 'rgba(26,30,35,0.62)',
          }}
        >
          {panelNotice.message}
        </div>
      )}
    </div>
  )
}
