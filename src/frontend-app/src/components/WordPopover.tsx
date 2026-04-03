import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { BookPlus, X } from 'lucide-react';
import { API_BASE } from '../lib/api';
import { authFetchOptions } from '../store/useAuthStore';

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
    fetch(`${API_BASE}/api/v1/documents/explain?word=${encodeURIComponent(word)}`, { method: 'POST' })
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

  const popoverStyle: React.CSSProperties = {
    position: 'fixed',
    left: Math.min(position.x, window.innerWidth - 340),
    top: Math.min(position.y + 12, window.innerHeight - 360),
    zIndex: 1000,
  };

  const handleSaveWord = async () => {
    if (!explanation || saving) return;
    setSaving(true);
    try {
      const response = await fetch(`${API_BASE}/api/v1/reader/wordbook`, {
        ...authFetchOptions({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        }),
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
    <AnimatePresence>
      {/* Backdrop */}
      <motion.div
        key="word-popover-backdrop"
        className="fixed inset-0 z-[999]"
        style={{ backgroundColor: 'rgba(26,30,35,0.18)', backdropFilter: 'blur(2px)' }}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
        onClick={onClose}
      />

      {/* Popover Card */}
      <motion.div
        key="word-popover-card"
        style={popoverStyle}
        className="glass-card rounded-[24px] w-80 max-h-[420px] overflow-y-auto z-[1000] scrollbar-hide"
        initial={{ opacity: 0, scale: 0.92, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 6 }}
        transition={{ type: 'spring' as const, stiffness: 360, damping: 28 }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-5 py-4 border-b"
          style={{ borderColor: 'rgba(26,30,35,0.06)' }}
        >
          <h4
            className="text-2xl"
            style={{ fontFamily: '"ZCOOL XiaoWei", "Noto Serif SC", serif', color: 'var(--gf-text)' }}
          >
            {word}
          </h4>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg transition-colors"
            style={{ color: 'rgba(26,30,35,0.35)' }}
            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'rgba(26,30,35,0.06)')}
            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
            aria-label="关闭"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="px-5 py-4 space-y-4">
          {loading ? (
            /* Skeleton loading */
            <div className="space-y-3">
              <p className="text-sm" style={{ color: 'rgba(26,30,35,0.45)' }}>
                正在查找释义...
              </p>
              <div className="skeleton-shimmer h-4 w-16 rounded-lg" />
              <div className="skeleton-shimmer h-4 w-full rounded-lg" />
              <div className="skeleton-shimmer h-4 w-3/4 rounded-lg" />
              <div className="skeleton-shimmer h-4 w-16 rounded-lg mt-4" />
              <div className="skeleton-shimmer h-4 w-full rounded-lg" />
            </div>
          ) : explanation ? (
            <>
              {/* Save to wordbook */}
              <button
                onClick={handleSaveWord}
                disabled={saving || saved}
                className="w-full inline-flex items-center justify-center gap-2 rounded-[14px] px-3 py-2.5 text-sm transition-all duration-300 disabled:opacity-60"
                style={{
                  backgroundColor: saved ? 'rgba(60,138,81,0.10)' : 'rgba(140,26,17,0.07)',
                  color: saved ? '#3c8a51' : 'var(--gf-gugong-red)',
                  border: saved ? '1px solid rgba(60,138,81,0.15)' : '1px solid rgba(140,26,17,0.10)',
                }}
              >
                <BookPlus className="w-4 h-4" />
                {saved ? '已加入字词本' : saving ? '正在保存...' : '加入字词本'}
              </button>

              {/* Meaning */}
              {explanation.meaning && (
                <div>
                  <p
                    className="text-[11px] tracking-[0.2em] mb-1.5"
                    style={{ color: 'rgba(26,30,35,0.42)' }}
                  >
                    释义
                  </p>
                  <p className="text-sm leading-7" style={{ color: 'rgba(26,30,35,0.72)' }}>
                    {explanation.meaning}
                  </p>
                </div>
              )}

              {/* Allusion */}
              {explanation.allusion && (
                <div>
                  <p
                    className="text-[11px] tracking-[0.2em] mb-1.5"
                    style={{ color: 'rgba(26,30,35,0.42)' }}
                  >
                    典故
                  </p>
                  <p className="text-sm leading-7" style={{ color: 'rgba(26,30,35,0.72)' }}>
                    {explanation.allusion}
                  </p>
                </div>
              )}

              {/* Citations */}
              {explanation.citations && explanation.citations.length > 0 && (
                <div>
                  <p
                    className="text-[11px] tracking-[0.2em] mb-2"
                    style={{ color: 'rgba(26,30,35,0.42)' }}
                  >
                    引用出处
                  </p>
                  <div className="space-y-2">
                    {explanation.citations.map((citation, idx) => (
                      <div
                        key={idx}
                        className="rounded-[12px] px-3 py-2.5 text-sm"
                        style={{
                          backgroundColor: 'rgba(201,160,99,0.08)',
                          border: '1px solid rgba(201,160,99,0.12)',
                        }}
                      >
                        <p className="font-medium" style={{ color: 'var(--gf-text)' }}>
                          {citation.title}
                        </p>
                        <p className="text-xs mt-0.5" style={{ color: 'rgba(26,30,35,0.45)' }}>
                          {citation.source}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          ) : (
            <p className="text-sm" style={{ color: 'rgba(26,30,35,0.4)' }}>
              无法取到这个词的释义，请换一个词再试
            </p>
          )}
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
