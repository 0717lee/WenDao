import { useEffect, useState } from 'react';
import { BookPlus, X } from 'lucide-react';
import { API_BASE } from '../lib/api';
import { authHeaders } from '../store/useAuthStore';

interface WordExplanation {
  meaning: string;
  allusion: string;
  citations: Array<{ title: string; source: string }>;
}

interface WordPopoverProps {
  word: string;
  position: { x: number; y: number };
  onClose: () => void;
}

export function WordPopover({ word, position, onClose }: WordPopoverProps) {
  const [explanation, setExplanation] = useState<WordExplanation | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setLoading(true);
    fetch(`${API_BASE}/api/v1/documents/explain?word=${encodeURIComponent(word)}`)
      .then(res => res.json())
      .then(data => {
        setExplanation(data);
        setSaved(false);
        setLoading(false);
      })
      .catch(err => {
        console.error('Failed to fetch word explanation:', err);
        setLoading(false);
      });
  }, [word]);

  // Position popover near click position, but keep it on screen
  const popoverStyle: React.CSSProperties = {
    position: 'fixed',
    left: Math.min(position.x, window.innerWidth - 320),
    top: Math.min(position.y + 10, window.innerHeight - 300),
    zIndex: 1000,
  };

  const handleSaveWord = async () => {
    if (!explanation || saving) return;
    setSaving(true);
    try {
      const response = await fetch(`${API_BASE}/api/v1/reader/wordbook`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...authHeaders(),
        },
        body: JSON.stringify({
          word,
          meaning: explanation.meaning,
          allusion: explanation.allusion,
          citations: explanation.citations,
        }),
      });
      if (!response.ok) throw new Error('save failed');
      setSaved(true);
    } catch (err) {
      console.error('Failed to save wordbook entry:', err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/20 z-[999]"
        onClick={onClose}
      />

      {/* Popover */}
      <div
        style={popoverStyle}
        className="bg-white rounded-lg shadow-xl border border-gray-200 w-80 max-h-96 overflow-y-auto z-[1000]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b">
          <h4 className="text-lg font-semibold text-gray-800">{word}</h4>
          <button
            onClick={onClose}
            className="p-1 hover:bg-gray-100 rounded transition-colors"
            aria-label="关闭"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 space-y-3">
          {loading ? (
            <p style={{ color: 'rgba(26,30,35,0.45)' }}>加载中...</p>
          ) : explanation ? (
            <>
              <button
                onClick={handleSaveWord}
                disabled={saving || saved}
                className="w-full inline-flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors disabled:opacity-60"
                style={{
                  backgroundColor: saved ? 'rgba(60,138,81,0.12)' : 'rgba(140,26,17,0.08)',
                  color: saved ? '#3c8a51' : '#8c1a11',
                }}
              >
                <BookPlus className="w-4 h-4" />
                {saved ? '已加入生词本' : saving ? '保存中...' : '加入生词本'}
              </button>

              {explanation.meaning && (
                <div>
                  <p className="text-sm font-semibold text-gray-700 mb-1">释义</p>
                  <p className="text-sm text-gray-600">{explanation.meaning}</p>
                </div>
              )}

              {explanation.allusion && (
                <div>
                  <p className="text-sm font-semibold text-gray-700 mb-1">典故</p>
                  <p className="text-sm text-gray-600">{explanation.allusion}</p>
                </div>
              )}

              {explanation.citations && explanation.citations.length > 0 && (
                <div>
                  <p className="text-sm font-semibold text-gray-700 mb-1">引用</p>
                  <div className="space-y-2">
                    {explanation.citations.map((citation, idx) => (
                      <div key={idx} className="text-sm text-gray-600 pl-3 border-l-2 border-blue-200">
                        <p className="font-medium">{citation.title}</p>
                        <p className="text-xs text-gray-500">{citation.source}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          ) : (
            <p className="text-gray-500">无法加载释义</p>
          )}
        </div>
      </div>
    </>
  );
}
