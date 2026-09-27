import { useEffect, useRef, useState } from 'react'
import { BookMarked, NotebookText, Save, Star } from 'lucide-react'
import { API_BASE } from '../lib/api'
import { authFetchOptions } from '../store/useAuthStore'
import { addDocumentToFavorites, type FavoriteFolder } from '../lib/favorites'

interface ReaderNotesPanelProps {
  documentId: string
  documentTitle: string
}

export function ReaderNotesPanel({ documentId, documentTitle }: ReaderNotesPanelProps) {
  const [noteText, setNoteText] = useState('')
  const [folders, setFolders] = useState<FavoriteFolder[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [favoriteSaving, setFavoriteSaving] = useState(false)
  const favoritePending = useRef(false)
  const [message, setMessage] = useState<string | null>(null)
  const [messageKind, setMessageKind] = useState<'success' | 'error'>('success')
  const [loadAttempt, setLoadAttempt] = useState(0)
  const noteDirtyRef = useRef(false)

  useEffect(() => {
    let cancelled = false

    async function load() {
      setLoading(true)
      setLoadError(null)
      setMessage(null)
      noteDirtyRef.current = false
      setNoteText('')
      try {
        const [noteRes, foldersRes] = await Promise.all([
          fetch(`${API_BASE}/api/v1/documents/${documentId}/note`, authFetchOptions()),
          fetch(`${API_BASE}/api/v1/reader/folders`, authFetchOptions()),
        ])
        if (!noteRes.ok || !foldersRes.ok) throw new Error('reader notes load failed')
        const noteData = await noteRes.json()
        const folderData = await foldersRes.json()
        if (!cancelled) {
          if (!noteDirtyRef.current) setNoteText(noteData.note_text || '')
          setFolders(folderData || [])
        }
      } catch {
        if (!cancelled) setLoadError('阅读笔记加载失败，暂时不能编辑，请重试。')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    return () => {
      cancelled = true
    }
  }, [documentId, loadAttempt])

  const showMessage = (text: string, kind: 'success' | 'error' = 'success') => {
    setMessage(text)
    setMessageKind(kind)
  }

  const handleSaveNote = async () => {
    if (loading || loadError) return
    setSaving(true)
    try {
      const response = await fetch(`${API_BASE}/api/v1/documents/${documentId}/note`, {
        ...authFetchOptions({
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
        }),
        body: JSON.stringify({ note_text: noteText }),
      })
      if (!response.ok) throw new Error('save failed')
      showMessage('笔记已经保存。下次打开这篇，再点“阅读笔记”就能继续看。')
    } catch {
      showMessage('笔记没保存成功，请稍后再试一次', 'error')
    } finally {
      setSaving(false)
    }
  }

  const handleFavorite = async () => {
    if (loading || loadError || favoritePending.current) return
    favoritePending.current = true
    setFavoriteSaving(true)
    try {
      const folder = await addDocumentToFavorites(documentId, folders)
      setFolders((prev) => (prev.some((item) => item.id === folder.id) ? prev : [folder, ...prev]))
      showMessage(`已经收藏到 ${folder.name}`)
    } catch {
      showMessage('收藏没有成功，请稍后再试一次', 'error')
    } finally {
      favoritePending.current = false
      setFavoriteSaving(false)
    }
  }

  return (
    <div
      className="rounded-2xl p-4 md:p-5"
      style={{ backgroundColor: 'rgba(255,255,255,0.72)', border: '1px solid rgba(26,30,35,0.06)' }}
    >
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-sm" style={{ color: 'var(--gf-text)' }}>
            <NotebookText className="h-4 w-4" />
            阅读笔记
          </div>
          <p className="mt-1 text-xs" style={{ color: 'var(--gf-muted)' }}>
            为《{documentTitle}》记下自己的理解、疑问，或课堂笔记。
          </p>
        </div>
        <button
          onClick={handleFavorite}
          disabled={loading || !!loadError || favoriteSaving}
          className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-xl px-3 py-2 text-xs transition-colors hover:bg-[rgba(201,160,99,0.12)]"
          style={{ color: 'var(--gf-gold)', border: '1px solid rgba(201,160,99,0.2)' }}
        >
          <Star className="h-3.5 w-3.5" />
          {favoriteSaving ? '正在收藏...' : '收藏这篇'}
        </button>
      </div>

      {loading && (
        <div className="mb-3 rounded-xl px-3 py-2 text-sm" style={{ backgroundColor: 'rgba(26,30,35,0.04)', color: 'var(--gf-muted)' }} role="status">
          正在加载阅读笔记...
        </div>
      )}

      {loadError && (
        <div className="mb-3 rounded-xl px-3 py-2 text-sm" style={{ backgroundColor: 'rgba(140,26,17,0.08)', color: 'var(--gf-gugong-red)' }} role="alert">
          <span>{loadError}</span>
          <button type="button" onClick={() => setLoadAttempt((attempt) => attempt + 1)} className="ml-3 underline">
            重试加载
          </button>
        </div>
      )}

      <textarea
        value={noteText}
        onChange={(e) => {
          noteDirtyRef.current = true
          setMessage(null)
          setNoteText(e.target.value)
        }}
        disabled={loading || !!loadError}
        placeholder="记下你的理解、疑问，或稍后还想继续追问的地方"
        className="min-h-[180px] w-full rounded-2xl px-4 py-3 text-sm leading-7 focus:outline-none focus:ring-2"
        style={{
          backgroundColor: 'rgba(255,255,255,0.8)',
          border: '1px solid rgba(26,30,35,0.1)',
          color: 'var(--gf-text)',
          ['--tw-ring-color' as any]: 'rgba(140,26,17,0.2)',
        }}
      />

      <div className="mt-3 flex flex-col items-start gap-3">
        <div className="space-y-1 text-xs" style={{ color: 'var(--gf-muted)' }}>
          <div className="flex items-center gap-2">
            <BookMarked className="h-3.5 w-3.5" />
            {folders.length > 0 ? `默认分组：${folders[0].name}` : '点“收藏此篇”后会自动建立默认分组'}
          </div>
          <div>
            保存后会跟这篇文章一起保留；下次可以从“文章收藏”打开文章，再点“阅读笔记”继续看。
          </div>
        </div>
        <button
          onClick={handleSaveNote}
          disabled={saving || loading || !!loadError}
          className="inline-flex shrink-0 self-end items-center gap-2 whitespace-nowrap rounded-xl px-4 py-2 text-sm text-white transition-colors disabled:opacity-60"
          style={{ backgroundColor: 'var(--gf-gugong-red)' }}
        >
          <Save className="h-4 w-4" />
          {saving ? '正在保存...' : '保存笔记'}
        </button>
      </div>

      {message && (
        <div
          className="mt-3 rounded-xl px-3 py-2 text-xs"
          style={{
            backgroundColor: messageKind === 'error' ? 'rgba(140,26,17,0.08)' : 'rgba(26,30,35,0.04)',
            color: messageKind === 'error' ? 'var(--gf-gugong-red)' : 'var(--gf-text)',
          }}
          role={messageKind === 'error' ? 'alert' : 'status'}
          aria-live="polite"
        >
          {message}
        </div>
      )}
    </div>
  )
}
