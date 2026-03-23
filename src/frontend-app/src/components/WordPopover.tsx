import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
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
        </div>
      </div>
    </>
  );
}
