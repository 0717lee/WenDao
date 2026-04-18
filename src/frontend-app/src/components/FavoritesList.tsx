import React, { useState, useEffect } from 'react';
import { Folder, FolderPlus, Star, ChevronRight, ChevronDown, NotebookText } from 'lucide-react';
import { API_BASE } from '../lib/api';
import { authFetchOptions } from '../store/useAuthStore';
import { toast } from '../store/useToastStore';
import { SkeletonPage } from './Skeleton';

interface FolderItem {
  id: string;
  name: string;
  created_at: string;
}

interface FavoriteDoc {
  id: string;
  title: string;
  created_at: string;
}

interface FavoritesListProps {
  onNavigate?: (documentId: string, options?: { readerPanel?: 'notes' | 'study' | null }) => void;
}

const FavoritesList: React.FC<FavoritesListProps> = ({ onNavigate }) => {
  const [folders, setFolders] = useState<FolderItem[]>([]);
  const [expandedFolder, setExpandedFolder] = useState<string | null>(null);
  const [folderDocs, setFolderDocs] = useState<Record<string, FavoriteDoc[]>>({});
  const [loading, setLoading] = useState(true);
  const [newFolderName, setNewFolderName] = useState('');
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    fetchFolders();
  }, []);

  const fetchFolders = async () => {
    setLoading(true);
    try {
      const response = await fetch(`${API_BASE}/api/v1/reader/folders`, authFetchOptions());
      if (!response.ok) throw new Error('Failed to fetch folders');
      const data = await response.json();
      setFolders(data);
    } catch {
      // Silently handle -- empty state is shown
    } finally {
      setLoading(false);
    }
  };

  const fetchFolderDocs = async (folderId: string) => {
    try {
      const response = await fetch(`${API_BASE}/api/v1/reader/favorites/${folderId}`, authFetchOptions());
      if (!response.ok) throw new Error('Failed to fetch favorites');
      const data = await response.json();
      setFolderDocs((prev) => ({ ...prev, [folderId]: data }));
    } catch {
      setFolderDocs((prev) => ({ ...prev, [folderId]: [] }));
    }
  };

  const handleToggleFolder = (folderId: string) => {
    if (expandedFolder === folderId) {
      setExpandedFolder(null);
    } else {
      setExpandedFolder(folderId);
      if (!folderDocs[folderId]) {
        fetchFolderDocs(folderId);
      }
    }
  };

  const handleCreateFolder = async () => {
    const name = newFolderName.trim();
    if (!name) return;

    setCreating(true);
    try {
      const response = await fetch(`${API_BASE}/api/v1/reader/folders`, {
        method: 'POST',
        ...authFetchOptions({ headers: { 'Content-Type': 'application/json' } }),
        body: JSON.stringify({ name }),
      });
      if (!response.ok) throw new Error('Failed to create folder');
      setNewFolderName('');
      await fetchFolders();
      toast.success(`已创建分组「${name}」`);
    } catch {
      toast.error('创建分组没有成功，请稍后再试');
    } finally {
      setCreating(false);
    }
  };

  if (loading) {
    return <SkeletonPage label="正在加载收藏" variant="list" />;
  }

  return (
    <div className="flex flex-col h-full" style={{ backgroundColor: 'var(--gf-bg)' }}>
      {/* Create Folder */}
      <div className="p-4 border-b" style={{ borderColor: 'rgba(26,30,35,0.06)', backgroundColor: 'rgba(255,255,255,0.3)' }}>
        <div className="mb-3">
          <h2 className="text-xl font-medium" style={{ color: 'var(--gf-text)' }}>
            文章收藏
          </h2>
          <p className="text-sm" style={{ color: 'rgba(26,30,35,0.45)' }}>
            这里收整篇文章；需要继续看笔记时，也可以从这里直接进去。
          </p>
        </div>
        <div
          className="mb-3 rounded-2xl px-3 py-3 text-sm leading-7"
          style={{ backgroundColor: 'rgba(255,255,255,0.6)', border: '1px solid rgba(26,30,35,0.06)', color: 'rgba(26,30,35,0.58)' }}
        >
          在阅读页点“收藏此篇”后，文章会先进入默认分组；需要时再回来整理。
        </div>
        <div className="flex gap-2">
          <input
            type="text"
            value={newFolderName}
            onChange={(e) => setNewFolderName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleCreateFolder()}
            placeholder="新建一个分组"
            className="flex-1 px-3 py-2 rounded-xl text-sm focus:outline-none focus:ring-2 transition-shadow"
            style={{
              backgroundColor: 'rgba(255,255,255,0.7)',
              border: '1px solid rgba(26,30,35,0.1)',
              color: 'var(--gf-text)',
              '--tw-ring-color': 'rgba(140,26,17,0.2)',
            } as React.CSSProperties}
          />
          <button
            onClick={handleCreateFolder}
            disabled={creating || !newFolderName.trim()}
            className="px-3 py-2 text-white rounded-xl text-sm font-medium transition-colors flex items-center gap-1 disabled:opacity-40 disabled:cursor-not-allowed"
            style={{ backgroundColor: 'var(--gf-gugong-red)' }}
          >
            <FolderPlus className="w-4 h-4" />
            创建
          </button>
        </div>
      </div>

      {/* Folder List */}
      <div className="flex-1 overflow-y-auto p-4">
        {folders.length === 0 ? (
          <div
            className="mt-16 rounded-[24px] px-5 py-8 text-center"
            style={{ backgroundColor: 'rgba(255,255,255,0.6)', border: '1px solid rgba(26,30,35,0.06)' }}
          >
            <Folder className="w-14 h-14 mx-auto mb-4" style={{ color: 'rgba(26,30,35,0.25)' }} />
            <p className="mb-2" style={{ color: 'var(--gf-text)' }}>还没有收藏的文章</p>
            <p className="text-sm leading-7" style={{ color: 'rgba(26,30,35,0.45)' }}>
              先去阅读页点“收藏此篇”，这里就会出现内容。
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {folders.map((folder) => {
              const isExpanded = expandedFolder === folder.id;
              const docs = folderDocs[folder.id];

              return (
                <div key={folder.id} className="rounded-xl overflow-hidden">
                  {/* Folder Header */}
                  <button
                    onClick={() => handleToggleFolder(folder.id)}
                    className="w-full flex items-center gap-3 p-3 rounded-xl transition-all text-left hover:shadow-sm"
                    style={{
                      backgroundColor: 'rgba(255,255,255,0.6)',
                      border: '1px solid rgba(26,30,35,0.06)',
                    }}
                  >
                    {isExpanded ? (
                      <ChevronDown className="w-4 h-4" style={{ color: 'rgba(26,30,35,0.35)' }} />
                    ) : (
                      <ChevronRight className="w-4 h-4" style={{ color: 'rgba(26,30,35,0.35)' }} />
                    )}
                    <Folder className="w-5 h-5" style={{ color: 'var(--gf-gold)' }} />
                    <span className="font-medium flex-1" style={{ color: 'var(--gf-text)' }}>{folder.name}</span>
                  </button>

                  {/* Expanded Document List */}
                  {isExpanded && (
                    <div className="ml-6 mt-1 space-y-1">
                      {!docs ? (
                        <div className="p-3 text-sm flex items-center gap-2" style={{ color: 'rgba(26,30,35,0.4)' }}>
                          <div className="w-4 h-4 border-2 rounded-full animate-spin" style={{ borderColor: 'rgba(26,30,35,0.1)', borderTopColor: 'var(--gf-gugong-red)' }} />
                          正在打开这个分组...
                        </div>
                      ) : docs.length === 0 ? (
                        <div className="p-3 text-sm" style={{ color: 'rgba(26,30,35,0.3)' }}>
                          这个分组里还没有收藏的文章
                        </div>
                      ) : (
                        docs.map((doc) => (
                          <div
                            key={doc.id}
                            className="p-3 rounded-xl transition-all flex items-center gap-3 hover:shadow-sm"
                            style={{
                              backgroundColor: 'rgba(255,255,255,0.4)',
                              border: '1px solid rgba(26,30,35,0.04)',
                            }}
                          >
                            <button
                              type="button"
                              className="flex min-w-0 flex-1 items-center gap-2 text-left"
                              onClick={() => {
                                if (onNavigate) {
                                  onNavigate(doc.id);
                                }
                              }}
                            >
                              <Star className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--gf-gold)' }} />
                              <span className="text-sm" style={{ color: 'var(--gf-text)' }}>{doc.title}</span>
                            </button>
                            <button
                              type="button"
                              className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs transition-colors hover:bg-[rgba(140,26,17,0.08)]"
                              style={{ color: 'var(--gf-gugong-red)' }}
                              onClick={() => {
                                if (onNavigate) {
                                  onNavigate(doc.id, { readerPanel: 'notes' });
                                }
                              }}
                            >
                              <NotebookText className="h-3.5 w-3.5" />
                              阅读笔记
                            </button>
                          </div>
                        ))
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default FavoritesList;
