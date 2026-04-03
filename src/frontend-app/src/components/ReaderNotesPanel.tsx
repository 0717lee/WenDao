import { useEffect, useState } from 'react'
import { BookMarked, NotebookText, Save, Star } from 'lucide-react'
import { API_BASE } from '../lib/api'
import { authFetchOptions } from '../store/useAuthStore'

interface ReaderNotesPanelProps {
  documentId: string
  documentTitle: string
}

interface FolderItem {
  id: string
  name: string
}

export function ReaderNotesPanel({ documentId, documentTitle }: ReaderNotesPanelProps) {
  const [noteText, setNoteText] = useState('')
  const [folders, setFolders] = useState<FolderItem[]>([])
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
      showMessage('笔记已保存')
    } catch {
      showMessage('笔记没有保存成功，请稍后再试')
    } finally {
      setSaving(false)
    }
  }

  const ensureDefaultFolder = async () => {
    if (folders.length > 0) return folders[0]
    const response = await fetch(`${API_BASE}/api/v1/reader/folders`, {
      ...authFetchOptions({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      }),
      body: JSON.stringify({ name: '默认收藏夹' }),
    })
    if (!response.ok) throw new Error('create folder failed')
    const data = await response.json()
    const created = { id: data.folder_id, name: data.name }
    setFolders((prev) => [created, ...prev])
    return created
  }

  const handleFavorite = async () => {
    try {
      const folder = await ensureDefaultFolder()
      const response = await fetch(`${API_BASE}/api/v1/reader/favorites`, {
        ...authFetchOptions({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        }),
        body: JSON.stringify({ document_id: documentId, folder_id: folder.id }),
      })
      if (!response.ok) throw new Error('favorite failed')
      showMessage(`已加入${folder.name}`)
    } catch {
      showMessage('收藏没有成功，请稍后再试')
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
            为《{documentTitle}》记录自己的理解、疑问或课堂笔记。
          </p>
        </div>
        <button
          onClick={handleFavorite}
          className="inline-flex items-center gap-1 rounded-xl px-3 py-2 text-xs transition-colors hover:bg-[rgba(201,160,99,0.12)]"
          style={{ color: 'var(--gf-gold)', border: '1px solid rgba(201,160,99,0.2)' }}
        >
          <Star className="h-3.5 w-3.5" />
          加入收藏
        </button>
      </div>

      <textarea
        value={noteText}
        onChange={(e) => setNoteText(e.target.value)}
        placeholder="记录你的理解、课堂批注或想继续追问的问题..."
        className="min-h-[180px] w-full rounded-2xl px-4 py-3 text-sm leading-7 focus:outline-none focus:ring-2"
        style={{
          backgroundColor: 'rgba(255,255,255,0.8)',
          border: '1px solid rgba(26,30,35,0.1)',
          color: 'var(--gf-text)',
          ['--tw-ring-color' as any]: 'rgba(140,26,17,0.2)',
        }}
      />

      <div className="mt-3 flex items-center justify-between">
        <div className="flex items-center gap-2 text-xs" style={{ color: 'rgba(26,30,35,0.45)' }}>
          <BookMarked className="h-3.5 w-3.5" />
          {folders.length > 0 ? `默认收藏夹：${folders[0].name}` : '需要时会自动创建默认收藏夹'}
        </div>
        <button
          onClick={handleSaveNote}
          disabled={saving}
          className="inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm text-white transition-colors disabled:opacity-60"
          style={{ backgroundColor: 'var(--gf-gugong-red)' }}
        >
          <Save className="h-4 w-4" />
          {saving ? '保存中...' : '保存笔记'}
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
