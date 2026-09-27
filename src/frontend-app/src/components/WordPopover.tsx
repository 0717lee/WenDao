import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { createPortal } from 'react-dom';
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
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [retryAttempt, setRetryAttempt] = useState(0);
  const [viewport, setViewport] = useState(() => ({ width: window.innerWidth, height: window.innerHeight }));
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const saveControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    saveControllerRef.current?.abort();
    setSaving(false);
    setExplanation(null);
    setLoading(true);
    setLoadError(null);
    setSaved(false);
    setSaveError(null);
    fetch(`${API_BASE}/api/v1/documents/explain?word=${encodeURIComponent(word)}`, {
      method: 'POST',
      ...authFetchOptions({ signal: controller.signal }),
    })
      .then(res => {
        if (!res.ok) throw new Error('explanation request failed');
        return res.json();
      })
      .then(data => {
        if (controller.signal.aborted) return;
        setExplanation(data);
      })
      .catch(err => {
        if (controller.signal.aborted) return;
        console.error('Failed to fetch word explanation:', err);
        setLoadError('现在还没取到这个词的释义，请换一个词再试。');
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => {
      controller.abort();
      saveControllerRef.current?.abort();
    };
  }, [word, retryAttempt]);

  useEffect(() => {
    const updateViewport = () => setViewport({ width: window.innerWidth, height: window.innerHeight });
    window.addEventListener('resize', updateViewport);
    return () => window.removeEventListener('resize', updateViewport);
  }, []);

  useEffect(() => {
    const previousFocus = document.activeElement as HTMLElement | null;
    const appRoot = document.getElementById('root');
    const wasInert = appRoot?.inert ?? false;
    closeButtonRef.current?.focus();
    if (appRoot) appRoot.inert = true;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onCloseRef.current();
      }
      if (event.key === 'Tab') {
        const buttons = Array.from(panelRef.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? []);
        const first = buttons[0];
        const last = buttons[buttons.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      if (appRoot) appRoot.inert = wasInert;
      previousFocus?.focus();
    };
  }, []);

  const viewportPadding = 12;
  const cardWidth = Math.min(320, Math.max(0, viewport.width - viewportPadding * 2));
  const cardMaxHeight = Math.max(0, viewport.height - viewportPadding * 2);
  const estimatedHeight = Math.min(420, cardMaxHeight);
  const popoverStyle: CSSProperties = {
    position: 'fixed',
    left: Math.max(viewportPadding, Math.min(position.x, viewport.width - cardWidth - viewportPadding)),
    top: Math.max(viewportPadding, Math.min(position.y + 12, viewport.height - estimatedHeight - viewportPadding)),
    width: cardWidth,
    maxHeight: estimatedHeight,
    zIndex: 1000,
  };

  const handleSaveWord = async () => {
    if (!explanation || saving) return;
    saveControllerRef.current?.abort();
    const controller = new AbortController();
    saveControllerRef.current = controller;
    setSaving(true);
    setSaveError(null);
    try {
      const response = await fetch(`${API_BASE}/api/v1/reader/wordbook`, {
        ...authFetchOptions({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: controller.signal,
        }),
        body: JSON.stringify({
          word,
          meaning: explanation.meaning,
          allusion: explanation.allusion,
          citations: explanation.citations,
        }),
      });
      if (!response.ok) throw new Error('save failed');
      if (controller.signal.aborted) return;
      setSaved(true);
    } catch (err) {
      if (controller.signal.aborted) return;
      console.error('Failed to save wordbook entry:', err);
      setSaveError('加入字词记录没有成功，请重试。');
    } finally {
      if (!controller.signal.aborted) setSaving(false);
    }
  };

  return createPortal(
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
        ref={panelRef}
        style={popoverStyle}
        className="glass-card rounded-[24px] overflow-y-auto z-[1000] scrollbar-hide"
        initial={{ opacity: 0, scale: 0.92, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 6 }}
        transition={{ type: 'spring' as const, stiffness: 360, damping: 28 }}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="word-popover-title"
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-5 py-4 border-b"
          style={{ borderColor: 'rgba(26,30,35,0.06)' }}
        >
          <h4
            id="word-popover-title"
            className="text-2xl"
            style={{ fontFamily: '"ZCOOL XiaoWei", "Noto Serif SC", serif', color: 'var(--gf-text)' }}
          >
            {word}
          </h4>
          <button
            ref={closeButtonRef}
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
              <p className="text-sm" style={{ color: 'var(--gf-muted)' }}>
                正在查找这个词的释义...
              </p>
              <div className="skeleton-shimmer h-4 w-16 rounded-lg" />
              <div className="skeleton-shimmer h-4 w-full rounded-lg" />
              <div className="skeleton-shimmer h-4 w-3/4 rounded-lg" />
              <div className="skeleton-shimmer h-4 w-16 rounded-lg mt-4" />
              <div className="skeleton-shimmer h-4 w-full rounded-lg" />
            </div>
          ) : loadError ? (
            <div className="space-y-3" role="alert">
              <p className="text-sm" style={{ color: 'var(--gf-gugong-red)' }}>{loadError}</p>
              <button
                type="button"
                onClick={() => setRetryAttempt((attempt) => attempt + 1)}
                className="rounded-xl px-3 py-2 text-sm text-white"
                style={{ backgroundColor: 'var(--gf-gugong-red)' }}
              >
                重试查词
              </button>
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
                    {saved ? '已经加入字词记录' : saving ? '正在保存...' : '加入字词记录'}
                </button>
                {saveError && (
                  <p className="mt-2 text-xs" style={{ color: 'var(--gf-gugong-red)' }} role="alert">
                    {saveError}
                  </p>
                )}

              {/* Meaning */}
              {explanation.meaning && (
                <div>
                  <p
                    className="text-[11px] tracking-[0.2em] mb-1.5"
                    style={{ color: 'var(--gf-muted)' }}
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
                    style={{ color: 'var(--gf-muted)' }}
                  >
                    典故
                  </p>
                  <p className="text-sm leading-7" style={{ color: 'rgba(26,30,35,0.72)' }}>
                    {explanation.allusion}
                  </p>
                </div>
              )}

            </>
          ) : (
            <p className="text-sm" style={{ color: 'var(--gf-muted)' }}>
              现在还没取到这个词的释义，请换一个词再试。
            </p>
          )}
        </div>
      </motion.div>
    </AnimatePresence>,
    document.body
  );
}
