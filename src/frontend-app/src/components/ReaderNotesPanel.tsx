import { useEffect, useState } from 'react'
import { BookMarked, NotebookText, Save, Star } from 'lucide-react'
import { API_BASE } from '../lib/api'
import { authFetchOptions } from '../store/useAuthStore'
import { addDocumentToFavorites, ensureDefaultFavoriteFolder, type FavoriteFolder } from '../lib/favorites'

interface ReaderNotesPanelProps {
  documentId: string
  documentTitle: string
}

export function ReaderNotesPanel({ documentId, documentTitle }: ReaderNotesPanelProps) {
  const [noteText, setNoteText] = useState('')
  const [folders, setFolders] = useState<FavoriteFolder[]>([])
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    async function load() {
      try {
        const [noteRes, foldersRes] = await Promise.all([
          fetch(`${API_BASE}/api/v1/documents/${documentId}/note`, authFetchOptions()),
          fetch(`${API_BASE}/api/v1/reader/folders`, authFetchOptions()),
        ])
        const noteData = noteRes.ok ? await noteRes.json() : { note_text: '' }
        const folderData = foldersRes.ok ? await foldersRes.json() : []
        if (!cancelled) {
          setNoteText(noteData.note_text || '')
          setFolders(folderData || [])
        }
      } catch {
        if (!cancelled) {
          setNoteText('')
          setFolders([])
        }
      }
    }

    load()
    return () => {
      cancelled = true
    }
  }, [documentId])

  const showMessage = (text: string) => {
    setMessage(text)
    window.setTimeout(() => setMessage(null), 2200)
  }

  const handleSaveNote = async () => {
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
      showMessage('笔记没保存成功，请稍后再试一次')
    } finally {
      setSaving(false)
    }
  }

  const handleFavorite = async () => {
    try {
      const folder = await addDocumentToFavorites(documentId, folders)
      const nextPrimaryFolder = await ensureDefaultFavoriteFolder([folder, ...folders])
      setFolders((prev) => (prev.some((item) => item.id === nextPrimaryFolder.id) ? prev : [nextPrimaryFolder, ...prev]))
      showMessage(`已经收藏到 ${folder.name}`)
    } catch {
      showMessage('收藏没有成功，请稍后再试一次')
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
          <p className="mt-1 text-xs" style={{ color: 'rgba(26,30,35,0.45)' }}>
            为《{documentTitle}》记下自己的理解、疑问，或课堂笔记。
          </p>
        </div>
        <button
          onClick={handleFavorite}
          className="inline-flex items-center gap-1 rounded-xl px-3 py-2 text-xs transition-colors hover:bg-[rgba(201,160,99,0.12)]"
          style={{ color: 'var(--gf-gold)', border: '1px solid rgba(201,160,99,0.2)' }}
        >
          <Star className="h-3.5 w-3.5" />
          收藏这篇
        </button>
      </div>

      <textarea
        value={noteText}
        onChange={(e) => setNoteText(e.target.value)}
        placeholder="记下你的理解、疑问，或稍后还想继续追问的地方"
        className="min-h-[180px] w-full rounded-2xl px-4 py-3 text-sm leading-7 focus:outline-none focus:ring-2"
        style={{
          backgroundColor: 'rgba(255,255,255,0.8)',
          border: '1px solid rgba(26,30,35,0.1)',
          color: 'var(--gf-text)',
          ['--tw-ring-color' as any]: 'rgba(140,26,17,0.2)',
        }}
      />

      <div className="mt-3 flex items-center justify-between">
        <div className="space-y-1 text-xs" style={{ color: 'rgba(26,30,35,0.45)' }}>
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
          disabled={saving}
          className="inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm text-white transition-colors disabled:opacity-60"
          style={{ backgroundColor: 'var(--gf-gugong-red)' }}
        >
          <Save className="h-4 w-4" />
          {saving ? '正在保存...' : '保存笔记'}
        </button>
      </div>

      {message && (
        <div className="mt-3 rounded-xl px-3 py-2 text-xs" style={{ backgroundColor: 'rgba(26,30,35,0.04)', color: 'var(--gf-text)' }}>
          {message}
        </div>
      )}
    </div>
  )
}
