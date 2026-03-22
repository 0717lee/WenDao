import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { useGraphStore } from '../store/useGraphStore';
import { API_BASE } from '../lib/api';

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
  const [matchedEntity, setMatchedEntity] = useState<{id: string; label: string} | null>(null);

  useEffect(() => {
    setLoading(true);
    fetch(`${API_BASE}/api/v1/documents/explain?word=${encodeURIComponent(word)}`)
      .then(res => res.json())
      .then(data => {
        setExplanation(data);
        setLoading(false);
      })
      .catch(err => {
        console.error('Failed to fetch word explanation:', err);
        setLoading(false);
      });
  }, [word]);

  // Check if word matches a KG entity
  useEffect(() => {
    fetch(`${API_BASE}/api/v1/knowledge-graph/search?q=${encodeURIComponent(word)}`)
      .then(res => res.json())
      .then(data => {
        if (data.nodes?.length > 0) {
          const exact = data.nodes.find((n: any) => n.label === word) || data.nodes[0];
          setMatchedEntity({ id: exact.id, label: exact.label });
        } else {
          setMatchedEntity(null);
        }
      })
      .catch(() => setMatchedEntity(null));
  }, [word]);

  // Position popover near click position, but keep it on screen
  const popoverStyle: React.CSSProperties = {
    position: 'fixed',
    left: Math.min(position.x, window.innerWidth - 320),
    top: Math.min(position.y + 10, window.innerHeight - 300),
    zIndex: 1000,
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
            <p className="text-gray-500">加载中...</p>
          ) : explanation ? (
            <>
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

          {matchedEntity && (
            <div className="pt-2 border-t" style={{ borderColor: 'rgba(26,30,35,0.08)' }}>
              <button
                onClick={() => {
                  useGraphStore.getState().focusEntityInGraph(matchedEntity.id);
                  useGraphStore.getState().setActiveTab('graph');
                  onClose();
                }}
                className="w-full flex items-center justify-center gap-1.5 px-3 py-2 text-sm rounded-lg transition-all"
                style={{
                  color: 'var(--gf-gugong-red, #8c1a11)',
                  backgroundColor: 'rgba(140,26,17,0.06)',
                }}
                onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'rgba(140,26,17,0.12)')}
                onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'rgba(140,26,17,0.06)')}
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                </svg>
                在知识图谱中查看「{matchedEntity.label}」
              </button>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
