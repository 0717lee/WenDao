import React, { useState, useEffect } from 'react';
import { Folder, FolderPlus, Star, ChevronRight, ChevronDown } from 'lucide-react';
import { API_BASE } from '../lib/api';

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
  onNavigate?: (documentId: string) => void;
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
      const response = await fetch(`${API_BASE}/api/v1/reader/folders`);
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
      const response = await fetch(`${API_BASE}/api/v1/reader/favorites/${folderId}`);
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
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      if (!response.ok) throw new Error('Failed to create folder');
      setNewFolderName('');
      await fetchFolders();
    } catch {
      // Could add error toast here
    } finally {
      setCreating(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full" style={{ backgroundColor: 'var(--gf-bg)' }}>
        <div className="w-8 h-8 border-2 rounded-full animate-spin" style={{ borderColor: 'rgba(26,30,35,0.1)', borderTopColor: 'var(--gf-gugong-red)' }} />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full" style={{ backgroundColor: 'var(--gf-bg)' }}>
      {/* Create Folder */}
      <div className="p-4 border-b" style={{ borderColor: 'rgba(26,30,35,0.06)', backgroundColor: 'rgba(255,255,255,0.3)' }}>
        <div className="flex gap-2">
          <input
            type="text"
            value={newFolderName}
            onChange={(e) => setNewFolderName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleCreateFolder()}
            placeholder="新建收藏夹..."
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
          <div className="text-center mt-16 opacity-35">
            <Folder className="w-14 h-14 mx-auto mb-4" style={{ color: 'var(--gf-text)' }} />
            <p style={{ color: 'var(--gf-text)' }}>暂无收藏夹</p>
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
                          加载中...
                        </div>
                      ) : docs.length === 0 ? (
                        <div className="p-3 text-sm" style={{ color: 'rgba(26,30,35,0.3)' }}>
                          此收藏夹为空
                        </div>
                      ) : (
                        docs.map((doc) => (
                          <div
                            key={doc.id}
                            className="p-3 rounded-xl transition-all cursor-pointer flex items-center gap-2 hover:shadow-sm"
                            style={{
                              backgroundColor: 'rgba(255,255,255,0.4)',
                              border: '1px solid rgba(26,30,35,0.04)',
                            }}
                            onClick={() => {
                              if (onNavigate) {
                                onNavigate(doc.id);
                              }
                            }}
                          >
                            <Star className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--gf-gold)' }} />
                            <span className="text-sm" style={{ color: 'var(--gf-text)' }}>{doc.title}</span>
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
