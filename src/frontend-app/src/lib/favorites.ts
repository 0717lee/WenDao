import { API_BASE } from './api'
import { authFetchOptions } from '../store/useAuthStore'

export interface FavoriteFolder {
  id: string
  name: string
}

async function loadFavoriteFolders(): Promise<FavoriteFolder[]> {
  const response = await fetch(`${API_BASE}/api/v1/reader/folders`, authFetchOptions())
  if (!response.ok) return []
  const data = await response.json().catch(() => [])
  return Array.isArray(data) ? data : []
}

async function createDefaultFavoriteFolder(): Promise<FavoriteFolder> {
  const response = await fetch(`${API_BASE}/api/v1/reader/folders`, {
    ...authFetchOptions({
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    }),
    body: JSON.stringify({ name: '默认收藏夹' }),
  })

  if (!response.ok) {
    throw new Error('create folder failed')
  }

  const data = await response.json()
  return { id: data.folder_id, name: data.name }
}

export async function ensureDefaultFavoriteFolder(existingFolders?: FavoriteFolder[]): Promise<FavoriteFolder> {
  if (existingFolders && existingFolders.length > 0) {
    return existingFolders[0]
  }

  const loadedFolders = await loadFavoriteFolders()
  if (loadedFolders.length > 0) {
    return loadedFolders[0]
  }

  return createDefaultFavoriteFolder()
}

export async function addDocumentToFavorites(documentId: string, existingFolders?: FavoriteFolder[]): Promise<FavoriteFolder> {
  const folder = await ensureDefaultFavoriteFolder(existingFolders)
  const response = await fetch(`${API_BASE}/api/v1/reader/favorites`, {
    ...authFetchOptions({
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    }),
    body: JSON.stringify({ document_id: documentId, folder_id: folder.id }),
  })

  if (!response.ok) {
    throw new Error('favorite failed')
  }

  return folder
}
