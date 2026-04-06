import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useDropzone } from 'react-dropzone'
import { ArrowRight, BookMarked, BookOpen, Clock3, LibraryBig, Loader2, ScanText, Search, Upload } from 'lucide-react'
import { API_BASE } from '../lib/api'
import { getDemoBookshelfDocuments } from '../data/demoDocuments'
import { authFetchOptions } from '../store/useAuthStore'
import { useDocumentStore } from '../store/useDocumentStore'
import { useGraphStore } from '../store/useGraphStore'

interface BookshelfItem {
  id: string
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
  title: string
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
  onOpenDocument: (documentId: string) => void
  onToggleCompare: (documentId: string) => void
  comparedDocumentIds: string[]
  onOpenCompare: () => void
}

function progressLabel(item: BookshelfItem): string {
  if (item.source_type === 'sample') return '样例全文'
  if (!item.total_paragraphs) return item.has_processed ? '已经整理好，等你开始阅读' : '正在整理'
  return `读到 ${item.current_paragraph}/${item.total_paragraphs}`
}

function formatTimeLabel(value?: string): string {
  if (!value) return '刚刚整理'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '刚刚整理'
  return date.toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' })
}

export default function BookshelfPanel({
  onOpenDocument,
  onToggleCompare,
  comparedDocumentIds,
  onOpenCompare,
}: BookshelfPanelProps) {
  const [corpusDocuments, setCorpusDocuments] = useState<BookshelfItem[]>([])
  const [sampleDocuments, setSampleDocuments] = useState<BookshelfItem[]>([])
  const [userDocuments, setUserDocuments] = useState<BookshelfItem[]>([])
  const [history, setHistory] = useState<HistoryItem[]>([])
  const [loading, setLoading] = useState(true)
  const [usingDemoSamples, setUsingDemoSamples] = useState(false)
  const [selectedCorpusCategory, setSelectedCorpusCategory] = useState('全部')
  const [catalogEntries, setCatalogEntries] = useState<CatalogEntry[]>([])
  const [catalogTotal, setCatalogTotal] = useState(0)
  const [corpusTotal, setCorpusTotal] = useState(0)
  const [userTotal, setUserTotal] = useState(0)
  const [catalogQuery, setCatalogQuery] = useState('')
  const [catalogLoading, setCatalogLoading] = useState(false)
  const [catalogImportingId, setCatalogImportingId] = useState<string | null>(null)
  const [selectedCatalogFamily, setSelectedCatalogFamily] = useState('全部')
  const [uploadErrorMessage, setUploadErrorMessage] = useState('')
  const { setDocument, setUploadStatus, uploadStatus } = useDocumentStore()
  const consumeReaderHubSection = useGraphStore((state) => state.consumeReaderHubSection)
  const uploadSectionRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    let cancelled = false

    async function load(): Promise<void> {
      setLoading(true)
      try {
        const [documentsResponse, corpusResponse, sampleResponse, historyResponse] = await Promise.all([
          fetch(`${API_BASE}/api/v1/documents?limit=100`, authFetchOptions()).catch(() => null),
          fetch(`${API_BASE}/api/v1/documents?limit=24&source_type=corpus`, authFetchOptions()).catch(() => null),
          fetch(`${API_BASE}/api/v1/documents?limit=8&source_type=sample`, authFetchOptions()).catch(() => null),
          fetch(`${API_BASE}/api/v1/reader/history`, authFetchOptions()).catch(() => null),
        ])

        const documentsData = documentsResponse?.ok ? await documentsResponse.json() : { documents: [] }
        const corpusData = corpusResponse?.ok ? await corpusResponse.json() : { documents: [] }
        const sampleData = sampleResponse?.ok ? await sampleResponse.json() : { documents: [] }
        const historyData = historyResponse?.ok ? await historyResponse.json() : []

        if (cancelled) return

        const allDocuments = Array.isArray(documentsData.documents) ? documentsData.documents : []
        const corpusList = Array.isArray(corpusData.documents) ? corpusData.documents : []
        const sampleList = Array.isArray(sampleData.documents) && sampleData.documents.length > 0
          ? sampleData.documents
          : getDemoBookshelfDocuments()

        setCorpusDocuments(corpusList)
        setCorpusTotal(corpusData.total || corpusList.length)
        
        const userDocs = allDocuments.filter((item: BookshelfItem) => item.source_type === 'user')
        setUserDocuments(userDocs)
        
        const allTotal = documentsData.total || allDocuments.length
        const totalCorpus = corpusData.total || corpusList.length
        const totalSample = sampleData.total || sampleList.length
        // The total number of ALL documents minus samples and corpus equals user documents.
        setUserTotal(Math.max(0, allTotal - totalCorpus - totalSample))

        setSampleDocuments(sampleList)
        setUsingDemoSamples(!Array.isArray(sampleData.documents) || sampleData.documents.length === 0)
        setHistory(Array.isArray(historyData) ? historyData : [])
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
    const nextSection = consumeReaderHubSection()
    if (nextSection !== 'upload') return

    requestAnimationFrame(() => {
      uploadSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    })
  }, [consumeReaderHubSection])

  const continueReadingItems = useMemo(() => {
    return history.slice(0, 4)
  }, [history])

  const corpusCategories = useMemo(() => {
    const items = new Set(
      corpusDocuments
        .map((item) => item.category)
        .filter((value): value is string => Boolean(value))
    )
    return ['全部', ...Array.from(items)]
  }, [corpusDocuments])

  const filteredCorpusDocuments = useMemo(() => {
    if (selectedCorpusCategory === '全部') return corpusDocuments
    return corpusDocuments.filter((item) => item.category === selectedCorpusCategory)
  }, [corpusDocuments, selectedCorpusCategory])

  const featuredCorpusDocuments = filteredCorpusDocuments.length > 0
    ? filteredCorpusDocuments.slice(0, 6)
    : sampleDocuments.slice(0, 4)

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
    let cancelled = false
        const timer = setTimeout(async () => {
          setCatalogLoading(true)
          try {
        const params = new URLSearchParams({
          limit: '60',
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
  }, [catalogQuery, selectedCatalogFamily])

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
        alert(err?.detail || '导入失败，请稍后重试')
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
        onOpenDocument(documentId)
      }
    } catch (e: any) {
      clearTimeout(timer)
      if (e.name === 'AbortError') {
        alert('导入未完成，请检查网络后重试')
      } else {
        alert('导入失败：' + (e.message || '请稍后重试'))
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
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Upload failed'
      setUploadErrorMessage(
        message.toLowerCase().includes('fetch')
          ? '识别服务暂时不可用，建议先阅读样例或定位原文。'
          : '上传失败，请检查图片格式后重试。'
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
              开卷总览
            </div>
            <h2 className="text-3xl leading-tight md:text-4xl" style={{ fontFamily: '"ZCOOL XiaoWei", serif', color: 'var(--gf-text)' }}>
              先把古籍翻开，
              <br className="hidden md:block" />
              再循序通晓其义
            </h2>
            <p className="max-w-3xl text-sm leading-7 md:text-base" style={{ color: 'rgba(26,30,35,0.6)' }}>
              从这里开始，一篇篇往下读。
            </p>
          </div>

          <div className="mt-5 grid gap-3 md:grid-cols-4">
            {[
              { label: '继续阅读', value: continueReadingItems.length, hint: '直接回到上次停下的地方', icon: Clock3, accent: '#5b8aab' },
              { label: '古籍库', value: corpusTotal, hint: '优先陈列能直接翻开的古籍', icon: LibraryBig, accent: 'var(--gf-gugong-red)' },
              { label: '我的典籍', value: userTotal, hint: '自上传文档，皆汇于此', icon: BookMarked, accent: 'var(--gf-gold)' },
              { label: '加入对照', value: comparedDocumentIds.length, hint: '想并排看时再放进对照', icon: ScanText, accent: '#7b5b44' },
            ].map((item) => (
              <div
                key={item.label}
                className="rounded-[24px] px-4 py-4"
                style={{ backgroundColor: 'rgba(255,255,255,0.76)', border: '1px solid rgba(26,30,35,0.06)' }}
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
              </div>
            ))}
          </div>
        </section>

        {comparedDocumentIds.length > 0 && (
          <div
            className="flex flex-wrap items-center justify-between gap-3 rounded-[24px] px-4 py-3"
            style={{ backgroundColor: 'rgba(201,160,99,0.12)', border: '1px solid rgba(201,160,99,0.20)' }}
          >
            <span className="text-sm" style={{ color: 'var(--gf-text)' }}>
              已加入对照，可并排阅读。
            </span>
            <button
              onClick={onOpenCompare}
              className="rounded-[18px] px-4 py-2 text-sm text-white"
              style={{ backgroundColor: 'var(--gf-gugong-red)' }}
            >
              打开对照
            </button>
          </div>
        )}

        <section className="grid gap-5 xl:grid-cols-[1.08fr_0.92fr]">
          <div
            className="rounded-[28px] p-5"
            style={{ backgroundColor: 'rgba(255,255,255,0.7)', border: '1px solid rgba(26,30,35,0.06)' }}
          >
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h3 className="text-lg font-medium" style={{ color: 'var(--gf-text)' }}>
                  继续阅读
                </h3>
                <p className="text-sm" style={{ color: 'rgba(26,30,35,0.45)' }}>
                  最近读过的内容，会接在这里。
                </p>
              </div>
            </div>

            {loading ? (
              <div className="rounded-[24px] p-8 text-center text-sm" style={{ backgroundColor: 'rgba(255,255,255,0.72)', color: 'rgba(26,30,35,0.42)' }}>
                正在整理阅读进度...
              </div>
            ) : continueReadingItems.length === 0 ? (
              <div className="rounded-[24px] p-8 text-center text-sm" style={{ backgroundColor: 'rgba(255,255,255,0.72)', color: 'rgba(26,30,35,0.42)' }}>
                还没有阅读记录，先从下面选一篇开始。
              </div>
            ) : (
              <div className="space-y-3">
                {continueReadingItems.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => onOpenDocument(item.id)}
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
            )}
          </div>

          <div
            className="rounded-[28px] p-5"
            style={{ backgroundColor: 'rgba(255,255,255,0.7)', border: '1px solid rgba(26,30,35,0.06)' }}
          >
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h3 className="text-lg font-medium" style={{ color: 'var(--gf-text)' }}>
                  古籍库精选
                </h3>
                <p className="text-sm" style={{ color: 'rgba(26,30,35,0.45)' }}>
                  这里放着能直接翻开的古籍，点开就能开始阅读。
                </p>
              </div>
            </div>

            {corpusDocuments.length > 0 && (
              <div className="mb-4 flex flex-wrap gap-2">
                {corpusCategories.map((category) => (
                  <button
                    key={category}
                    onClick={() => setSelectedCorpusCategory(category)}
                    className="rounded-full px-3 py-1.5 text-xs transition-all duration-300 hover:-translate-y-0.5"
                    style={{
                      backgroundColor: selectedCorpusCategory === category ? 'rgba(140,26,17,0.10)' : 'rgba(255,255,255,0.74)',
                      color: selectedCorpusCategory === category ? 'var(--gf-gugong-red)' : 'rgba(26,30,35,0.62)',
                      border: '1px solid rgba(26,30,35,0.08)',
                    }}
                  >
                    {category}
                  </button>
                ))}
              </div>
            )}

            {corpusDocuments.length === 0 && usingDemoSamples && !loading && (
              <div className="mb-3 rounded-[22px] px-4 py-3 text-sm leading-6" style={{ backgroundColor: 'rgba(140,26,17,0.06)', border: '1px solid rgba(140,26,17,0.10)', color: 'rgba(26,30,35,0.56)' }}>
                当前展示本地体验样例，主流程依然可以完整体验。
              </div>
            )}

            <div className="grid gap-3">
              {featuredCorpusDocuments.map((doc) => (
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
                        {doc.source_type === 'corpus' ? '古籍库' : '精选导读'}
                      </span>
                    </div>
                  </div>
                  {renderMetaLine(doc)}
                  {doc.guide_summary && (
                    <div className="mb-2 text-sm leading-6" style={{ color: 'rgba(26,30,35,0.58)' }}>
                      {doc.guide_summary}
                    </div>
                  )}
                  <div className="line-clamp-3 text-sm leading-7" style={{ color: 'rgba(26,30,35,0.5)' }}>
                    {doc.preview || '翻开后就能对照原文、标点和白话。'}
                  </div>
                </button>
              ))}
            </div>
          </div>
        </section>

        <section
          className="rounded-[28px] p-5"
          style={{ backgroundColor: 'rgba(255,255,255,0.7)', border: '1px solid rgba(26,30,35,0.06)' }}
        >
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
                <h3 className="text-lg font-medium" style={{ color: 'var(--gf-text)' }}>
                  更多古籍
                </h3>
                <p className="text-sm" style={{ color: 'rgba(26,30,35,0.45)' }}>
                  想继续往下找，可以从这里翻书目，再按需导入。
                </p>
              </div>
            <div className="text-xs" style={{ color: 'rgba(26,30,35,0.42)' }}>
              当前可看 {catalogTotal} 条书目
            </div>
          </div>

          <div className="mb-4 grid gap-3 lg:grid-cols-[1fr_auto]">
            <div className="relative">
              <input
                value={catalogQuery}
                onChange={(event) => setCatalogQuery(event.target.value)}
                placeholder="搜索古籍书目，如《史记》、庄子、礼记"
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
                  {family}
                </button>
              ))}
            </div>
          </div>

          {catalogLoading ? (
            <div className="rounded-[24px] p-8 text-center text-sm" style={{ backgroundColor: 'rgba(255,255,255,0.72)', color: 'rgba(26,30,35,0.42)' }}>
              正在整理书目...
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
                      {catalogImportingId === entry.repo_id ? '正在导入' : entry.imported ? '已导入' : '可导入'}
                    </span>
                  </div>
                  <div className="text-xs leading-6" style={{ color: 'rgba(26,30,35,0.45)' }}>
                    {[entry.family, entry.section, entry.dynasty, entry.author].filter(Boolean).join(' · ') || '整源书目'}
                  </div>
                  <div className="mt-3 flex items-center gap-2 text-xs" style={{ color: 'rgba(26,30,35,0.5)' }}>
                    {catalogImportingId === entry.repo_id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ArrowRight className="h-3.5 w-3.5" />}
                    <span>{entry.imported ? '打开阅读' : '导入并打开'}</span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </section>

        <section className="grid gap-5 xl:grid-cols-[1.08fr_0.92fr]">
          <div
            className="rounded-[28px] p-5"
            style={{ backgroundColor: 'rgba(255,255,255,0.7)', border: '1px solid rgba(26,30,35,0.06)' }}
          >
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h3 className="text-lg font-medium" style={{ color: 'var(--gf-text)' }}>
                  我的典籍
                </h3>
                <p className="text-sm" style={{ color: 'rgba(26,30,35,0.45)' }}>
                  你自己上传和整理过的文档，都放在这里。
                </p>
              </div>
              <span className="text-sm" style={{ color: 'rgba(26,30,35,0.42)' }}>
                {loading ? '加载中...' : `${userTotal} 份文档`}
              </span>
            </div>

            {loading ? (
              <div className="rounded-[24px] p-8 text-center text-sm" style={{ backgroundColor: 'rgba(255,255,255,0.72)', color: 'rgba(26,30,35,0.42)' }}>
                正在整理典籍...
              </div>
            ) : userDocuments.length === 0 ? (
              <div className="rounded-[24px] p-10 text-center" style={{ backgroundColor: 'rgba(255,255,255,0.72)' }}>
                <BookMarked className="mx-auto mb-3 h-12 w-12" style={{ color: 'rgba(26,30,35,0.22)' }} />
                <p className="text-sm" style={{ color: 'rgba(26,30,35,0.45)' }}>
                  你还没有上传文档。可以先从古籍库开始；有影印页时再回来上传。
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
                          {compared ? '已加入对照' : '加入对照'}
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
                图片识别入口
              </div>
              <h3 className="mt-3 text-lg font-medium" style={{ color: 'var(--gf-text)' }}>
                图像扫描与文字解析
              </h3>
              <p className="mt-2 text-sm leading-7" style={{ color: 'rgba(26,30,35,0.5)' }}>
                手头有影印页、扫描图或馆藏图片时，再从这里开始识别。
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
                {uploadStatus === 'uploading' ? '正在上传图片' : isDragActive ? '松开后开始识别' : '拖拽图片到这里，或点击上传'}
              </div>
              <div className="mt-2 text-sm leading-7" style={{ color: 'rgba(26,30,35,0.48)' }}>
                支持 JPG、PNG、TIFF。上传后会依次做 OCR、断句和白话翻译。
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
              1. 手头有古籍扫描图、影印页或馆藏残页。
              <br />
              2. 想先把图片转成可读文字。
              <br />
              3. 还想继续做断句、对照阅读和字词释义。
            </div>
          </div>
        </section>
      </div>
    </div>
  )
}
