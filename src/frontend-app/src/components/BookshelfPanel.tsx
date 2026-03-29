import { useEffect, useState } from 'react'
import { BookMarked, ChevronRight } from 'lucide-react'
import { API_BASE } from '../lib/api'
import { getDemoBookshelfDocuments } from '../data/demoDocuments'

interface BookshelfItem {
  id: string
  title: string
  status: string
  preview: string
  current_paragraph: number
  total_paragraphs: number
  has_processed: boolean
  has_note: boolean
  source_type?: string
  updated_at?: string
}

interface BookshelfPanelProps {
  onOpenDocument: (documentId: string) => void
  onToggleCompare: (documentId: string) => void
  comparedDocumentIds: string[]
  onOpenCompare: () => void
}

function progressLabel(item: BookshelfItem) {
  if (item.source_type === 'sample') return '样例全文'
  if (!item.total_paragraphs) return '未开始'
  return `${item.current_paragraph}/${item.total_paragraphs}`
}

export default function BookshelfPanel({ onOpenDocument, onToggleCompare, comparedDocumentIds, onOpenCompare }: BookshelfPanelProps) {
  const [documents, setDocuments] = useState<BookshelfItem[]>([])
  const [loading, setLoading] = useState(true)
  const [usingDemoDocuments, setUsingDemoDocuments] = useState(false)

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      try {
        const response = await fetch(`${API_BASE}/api/v1/documents?limit=100`)
        const data = response.ok ? await response.json() : { documents: [] }
        const nextDocuments = Array.isArray(data.documents) && data.documents.length > 0
          ? data.documents
          : getDemoBookshelfDocuments()

        if (!cancelled) {
          setDocuments(nextDocuments)
          setUsingDemoDocuments(!Array.isArray(data.documents) || data.documents.length === 0)
        }
      } catch {
        if (!cancelled) {
          setDocuments(getDemoBookshelfDocuments())
          setUsingDemoDocuments(true)
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

  return (
    <div className="h-full overflow-y-auto px-4 py-5 md:px-6" style={{ backgroundColor: 'var(--gf-bg)' }}>
      <div className="mx-auto max-w-5xl space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-medium" style={{ color: 'var(--gf-text)' }}>
              典籍库
            </h2>
            <p className="text-sm" style={{ color: 'rgba(26,30,35,0.45)' }}>
              浏览体验样例和你整理过的古籍，并从上次位置继续打开
            </p>
          </div>
          <span className="text-sm" style={{ color: 'rgba(26,30,35,0.45)' }}>
            {loading ? '整理中...' : `${documents.length} 份文档`}
          </span>
        </div>

        {usingDemoDocuments && !loading && (
          <div
            className="rounded-2xl px-4 py-3 text-sm"
            style={{ backgroundColor: 'rgba(140,26,17,0.06)', border: '1px solid rgba(140,26,17,0.10)', color: 'rgba(26,30,35,0.56)' }}
          >
            当前为离线演示书架，已自动切换到本地体验样例，方便现场继续完成样例阅读和对照演示。
          </div>
        )}

        {comparedDocumentIds.length > 0 && (
          <div
            className="flex flex-wrap items-center justify-between gap-3 rounded-2xl px-4 py-3"
            style={{ backgroundColor: 'rgba(140,26,17,0.08)', border: '1px solid rgba(140,26,17,0.12)' }}
          >
            <span className="text-sm" style={{ color: 'var(--gf-gugong-red)' }}>
              已选择 {comparedDocumentIds.length} 份文档加入对照
            </span>
            <button
              onClick={onOpenCompare}
              className="rounded-xl px-4 py-2 text-sm text-white"
              style={{ backgroundColor: 'var(--gf-gugong-red)' }}
            >
              打开对照阅读
            </button>
          </div>
        )}

        {loading ? (
          <div className="rounded-2xl p-8 text-center text-sm" style={{ backgroundColor: 'rgba(255,255,255,0.65)' }}>
            正在整理书架...
          </div>
        ) : documents.length === 0 ? (
          <div className="rounded-2xl p-10 text-center" style={{ backgroundColor: 'rgba(255,255,255,0.65)' }}>
            <BookMarked className="mx-auto mb-3 h-12 w-12" style={{ color: 'rgba(26,30,35,0.25)' }} />
            <p style={{ color: 'rgba(26,30,35,0.45)' }}>还没有典籍记录，可以先去首页体验样例或上传扫描页。</p>
          </div>
        ) : (
          <div className="grid gap-3">
            {documents.map((doc) => {
              const compared = comparedDocumentIds.includes(doc.id)
              return (
              <div
                key={doc.id}
                className="rounded-2xl px-4 py-4 transition-colors hover:bg-[rgba(26,30,35,0.03)]"
                style={{ backgroundColor: 'rgba(255,255,255,0.65)', border: '1px solid rgba(26,30,35,0.06)' }}
              >
                <div className="flex items-start justify-between gap-4">
                  <button className="min-w-0 flex-1 space-y-2 text-left" onClick={() => onOpenDocument(doc.id)}>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-base font-medium" style={{ color: 'var(--gf-text)' }}>
                        {doc.title}
                      </span>
                      <span
                        className="rounded-full px-2 py-0.5 text-[11px]"
                        style={{
                          backgroundColor: doc.has_processed ? 'rgba(201,160,99,0.14)' : 'rgba(26,30,35,0.06)',
                          color: doc.has_processed ? 'var(--gf-gold)' : 'rgba(26,30,35,0.45)',
                        }}
                      >
                        {doc.has_processed ? '已处理' : '待处理'}
                      </span>
                      <span
                        className="rounded-full px-2 py-0.5 text-[11px]"
                        style={{
                          backgroundColor: doc.source_type === 'sample' ? 'rgba(140,26,17,0.08)' : 'rgba(26,30,35,0.06)',
                          color: doc.source_type === 'sample' ? 'var(--gf-gugong-red)' : 'rgba(26,30,35,0.45)',
                        }}
                      >
                        {doc.source_type === 'sample' ? '体验样例' : '我的文档'}
                      </span>
                      {doc.has_note && (
                        <span className="rounded-full px-2 py-0.5 text-[11px]" style={{ backgroundColor: 'rgba(60,138,81,0.12)', color: '#3c8a51' }}>
                          有笔记
                        </span>
                      )}
                    </div>
                    <p className="line-clamp-2 text-sm leading-7" style={{ color: 'rgba(26,30,35,0.55)' }}>
                      {doc.preview || '暂无摘要'}
                    </p>
                    <div className="flex flex-wrap items-center gap-3 text-xs" style={{ color: 'rgba(26,30,35,0.42)' }}>
                      <span>阅读进度：{progressLabel(doc)}</span>
                      {doc.updated_at && <span>最近整理：{new Date(doc.updated_at).toLocaleString('zh-CN')}</span>}
                    </div>
                  </button>
                  <div className="flex flex-col items-end gap-2">
                    <ChevronRight className="mt-1 h-4 w-4 shrink-0" style={{ color: 'rgba(26,30,35,0.3)' }} />
                    <button
                      onClick={() => onToggleCompare(doc.id)}
                      className="rounded-xl px-3 py-1.5 text-xs"
                      style={{
                        backgroundColor: compared ? 'rgba(201,160,99,0.15)' : 'rgba(26,30,35,0.05)',
                        color: compared ? 'var(--gf-gold)' : 'rgba(26,30,35,0.55)',
                      }}
                    >
                      {compared ? '已加入对照' : '加入对照'}
                    </button>
                  </div>
                </div>
              </div>
            )})}
          </div>
        )}
      </div>
    </div>
  )
}
