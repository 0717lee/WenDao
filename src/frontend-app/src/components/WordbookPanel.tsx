import { useEffect, useState } from 'react'
import { BookHeart, Trash2 } from 'lucide-react'
import { API_BASE } from '../lib/api'
import { authFetchOptions } from '../store/useAuthStore'

interface WordbookEntry {
  id: string
  word: string
  meaning: string
  allusion: string
  citations: Array<{ title: string; source: string }>
  created_at?: string
}

interface WordbookPanelProps {
  onAskAboutWord: (word: string) => void
}

export default function WordbookPanel({ onAskAboutWord }: WordbookPanelProps) {
  const [entries, setEntries] = useState<WordbookEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [loadAttempt, setLoadAttempt] = useState(0)

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      setLoadError(null)
      setDeleteError(null)
      try {
        const response = await fetch(`${API_BASE}/api/v1/reader/wordbook?limit=200`, authFetchOptions())
        if (!response.ok) throw new Error('wordbook load failed')
        const data = await response.json()
        if (!cancelled) setEntries(data.entries || [])
      } catch {
        if (!cancelled) setLoadError('字词记录加载失败，请重试。')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [loadAttempt])

  const handleDelete = async (entryId: string) => {
    if (deletingId) return
    setDeletingId(entryId)
    setDeleteError(null)
    try {
      const response = await fetch(`${API_BASE}/api/v1/reader/wordbook/${entryId}`, authFetchOptions({ method: 'DELETE' }))
      if (!response.ok) throw new Error('delete failed')
      setEntries((prev) => prev.filter((item) => item.id !== entryId))
    } catch {
      setDeleteError('删除没有成功，请重试。')
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <div className="h-full overflow-y-auto px-4 py-5 md:px-6" style={{ backgroundColor: 'var(--gf-bg)' }}>
      <div className="mx-auto max-w-4xl space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-medium" style={{ color: 'var(--gf-text)' }}>
              字词记录
            </h2>
            <p className="text-sm" style={{ color: 'var(--gf-muted)' }}>
              这里收阅读时查过的字词；整篇文章请去“文章收藏”。
            </p>
          </div>
          <span className="text-sm" style={{ color: 'var(--gf-muted)' }}>
            {loading ? '加载中...' : `${entries.length} 条`}
          </span>
        </div>

        {deleteError && (
          <div className="rounded-xl px-3 py-2 text-sm" style={{ backgroundColor: 'rgba(140,26,17,0.08)', color: 'var(--gf-gugong-red)' }} role="alert">
            {deleteError}
          </div>
        )}

        {loading ? (
          <div className="rounded-2xl p-8 text-center text-sm" style={{ backgroundColor: 'rgba(255,255,255,0.65)' }}>
            正在整理字词...
          </div>
        ) : loadError ? (
          <div className="rounded-2xl p-8 text-center text-sm" style={{ backgroundColor: 'rgba(140,26,17,0.06)', color: 'var(--gf-gugong-red)' }} role="alert">
            <p>{loadError}</p>
            <button
              type="button"
              onClick={() => setLoadAttempt((attempt) => attempt + 1)}
              className="mt-3 rounded-xl px-4 py-2 text-sm text-white"
              style={{ backgroundColor: 'var(--gf-gugong-red)' }}
            >
              重试加载
            </button>
          </div>
        ) : entries.length === 0 ? (
          <div className="rounded-2xl p-10 text-center" style={{ backgroundColor: 'rgba(255,255,255,0.65)' }}>
            <BookHeart className="mx-auto mb-3 h-12 w-12" style={{ color: 'rgba(26,30,35,0.25)' }} />
            <p className="leading-7" style={{ color: 'var(--gf-muted)' }}>
              先在阅读页拖选一个字词，打开查词卡后点“加入字词记录”，这里就会出现内容。
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {entries.map((entry) => (
              <div
                key={entry.id}
                className="rounded-2xl px-4 py-4"
                style={{ backgroundColor: 'rgba(255,255,255,0.65)', border: '1px solid rgba(26,30,35,0.06)' }}
              >
                <div className="mb-3 flex items-start justify-between gap-4">
                  <div>
                    <button
                      onClick={() => onAskAboutWord(entry.word)}
                      className="text-left text-lg"
                      style={{ color: 'var(--gf-gugong-red)', fontFamily: '"ZCOOL XiaoWei", serif' }}
                    >
                      {entry.word}
                    </button>
                    {entry.created_at && (
                    <p className="text-xs" style={{ color: 'var(--gf-muted)' }}>
                        收藏于 {new Date(entry.created_at).toLocaleDateString('zh-CN')}
                      </p>
                    )}
                  </div>
                  <button
                    onClick={() => handleDelete(entry.id)}
                    disabled={deletingId !== null}
                    aria-label={`删除${entry.word}`}
                    className="rounded-xl p-2 transition-colors hover:bg-[rgba(26,30,35,0.05)] disabled:opacity-50"
                    title="删除生词"
                  >
                    <Trash2 className="h-4 w-4" style={{ color: 'rgba(26,30,35,0.35)' }} />
                  </button>
                </div>

                {entry.meaning && (
                  <p className="mb-2 text-sm leading-7" style={{ color: 'var(--gf-text)' }}>
                    <strong>释义：</strong>{entry.meaning}
                  </p>
                )}
                {entry.allusion && (
                  <p className="mb-2 text-sm leading-7" style={{ color: 'rgba(26,30,35,0.6)' }}>
                    <strong>典故：</strong>{entry.allusion}
                  </p>
                )}
                {entry.citations.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {entry.citations.map((citation, idx) => (
                      <span
                        key={`${entry.id}-${idx}`}
                        className="rounded-full px-2 py-1 text-[11px]"
                        style={{ backgroundColor: 'rgba(201,160,99,0.12)', color: 'var(--gf-gold)' }}
                      >
                        {citation.title} / {citation.source}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
