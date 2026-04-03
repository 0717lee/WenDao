import { useState, useEffect, useRef, type ReactNode } from 'react';
import { ScrollSync, ScrollSyncPane } from 'react-scroll-sync';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, GraduationCap, Loader2, NotebookText } from 'lucide-react';
import { authHeaders } from '../store/useAuthStore';
import { useDocumentStore } from '../store/useDocumentStore';
import { useGraphStore } from '../store/useGraphStore';
import { useStore } from '../store/useStore';
import { ReaderNotesPanel } from './ReaderNotesPanel';
import { StudyCardsPanel } from './StudyCardsPanel';
import { WordPopover } from './WordPopover';
import { API_BASE } from '../lib/api';

const columnContainerVariants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.12, delayChildren: 0.1 }
  }
};

const columnItemVariants = {
  hidden: { opacity: 0, x: -20, scale: 0.95 },
  show: { opacity: 1, x: 0, scale: 1, transition: { type: 'spring' as const, stiffness: 180, damping: 20 } }
};

export function ThreeColumnReader() {
  const { currentDocument, consumePendingAnchorText, consumePendingReaderPanel, updateDocument } = useDocumentStore();
  const readerReturnTab = useGraphStore((state) => state.readerReturnTab);
  const setAppTab = useGraphStore((state) => state.setActiveTab);
  const queueSearchQuery = useGraphStore((state) => state.queueSearchQuery);
  const setDraftMessage = useStore((state) => state.setDraftMessage);
  const [selectedWord, setSelectedWord] = useState<string | null>(null);
  const [popoverPosition, setPopoverPosition] = useState<{ x: number; y: number } | null>(null);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  const [activeReaderTab, setActiveReaderTab] = useState<'original' | 'punctuated' | 'translated'>('original');
  const [sidePanel, setSidePanel] = useState<'notes' | 'study' | null>(null);
  const [anchorText, setAnchorText] = useState('');
  const [progressSyncError, setProgressSyncError] = useState(false);
  const [translationGenerating, setTranslationGenerating] = useState(false);
  const [translationError, setTranslationError] = useState('');
  const progressTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const anchorRef = useRef<HTMLSpanElement | null>(null);

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 768);
    };
    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
      if (progressTimeoutRef.current) clearTimeout(progressTimeoutRef.current);
    };
  }, []);

  useEffect(() => {
    if (!currentDocument) return;
    const nextAnchor = consumePendingAnchorText();
    if (nextAnchor) {
      setAnchorText(nextAnchor);
    }
    const nextPanel = consumePendingReaderPanel();
    if (nextPanel) {
      setSidePanel(nextPanel);
    }
  }, [currentDocument?.id, consumePendingAnchorText, consumePendingReaderPanel]);

  useEffect(() => {
    if (anchorText && anchorRef.current) {
      anchorRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [anchorText, activeReaderTab]);

  if (!currentDocument) return null;

  const isSample = (currentDocument as any).sourceType === 'sample';
  const documentMeta = [
    currentDocument.dynasty,
    currentDocument.author,
    currentDocument.category,
    currentDocument.chapterCount ? `${currentDocument.chapterCount}篇` : null,
  ].filter(Boolean).join(' · ')
  const chapterPreview = currentDocument.chapterTitles?.slice(0, 5) ?? []
  const recommendedChapters = currentDocument.recommendedChapters?.slice(0, 4) ?? []
  const segmentGuides = currentDocument.segmentGuides?.slice(0, 6) ?? []
  const translationCache = currentDocument.translationCache ?? []

  const totalParagraphs = Math.max(
    1,
    (currentDocument.punctuatedText || currentDocument.originalText)
      .split(/\n+/)
      .map((item) => item.trim())
      .filter(Boolean).length,
  );

  const handleWordClick = (word: string, event: React.MouseEvent) => {
    setSelectedWord(word);
    setPopoverPosition({ x: event.clientX, y: event.clientY });
  };

  const handleBack = () => {
    setAppTab(readerReturnTab || 'home');
  };

  const reportProgress = (scrollTop: number, scrollHeight: number, clientHeight: number) => {
    if (!currentDocument || isSample) return;
    const readableHeight = Math.max(scrollHeight - clientHeight, 1);
    const ratio = Math.min(1, Math.max(0, scrollTop / readableHeight));
    const currentParagraph = Math.min(totalParagraphs, Math.max(1, Math.round(ratio * (totalParagraphs - 1)) + 1));

    if (progressTimeoutRef.current) clearTimeout(progressTimeoutRef.current);
    progressTimeoutRef.current = setTimeout(() => {
      fetch(`${API_BASE}/api/v1/reader/progress`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...authHeaders(),
        },
        body: JSON.stringify({
          document_id: currentDocument.id,
          current_paragraph: currentParagraph,
          total_paragraphs: totalParagraphs,
        }),
      })
        .then(async (response) => {
          const data = await response.json().catch(() => null);
          if (!response.ok || data?.status === 'error') {
            throw new Error('progress sync failed');
          }
          setProgressSyncError(false);
        })
        .catch(() => {
          setProgressSyncError(true);
        });
    }, 200);
  };

  const renderTextBlocks = (text: string, label: string) => {
    if (!text) return <p style={{ color: 'rgba(26,30,35,0.3)' }}>暂无内容</p>
    return (
      <>
        {text
          .split(/\n+/)
          .filter((block) => block.length > 0)
          .map((block, blockIndex) => {
            const isAnchorBlock = Boolean(anchorText) && block.includes(anchorText);
            return (
              <p
                key={`${label}-${blockIndex}`}
                className="rounded-lg px-2 py-1"
                style={{ backgroundColor: isAnchorBlock ? 'rgba(201,160,99,0.14)' : 'transparent' }}
              >
                {block.split('').map((char, idx) => (
                  <motion.span
                    key={`${label}-${blockIndex}-${idx}`}
                    ref={isAnchorBlock && idx === 0 ? anchorRef : undefined}
                    onClick={(e) => handleWordClick(char, e)}
                    className="inline-block cursor-pointer transition-colors"
                    style={{ borderRadius: '4px' }}
                    initial={{ backgroundColor: 'transparent' }}
                    whileHover={{ scale: 1.15, backgroundColor: 'rgba(201,160,99,0.22)', color: 'var(--gf-gugong-red)' }}
                    whileTap={{ scale: 0.85 }}
                    transition={{ type: 'spring', stiffness: 500, damping: 25 }}
                  >
                    {char}
                  </motion.span>
                ))}
              </p>
            );
          })}
      </>
    )
  };

  const renderColumn = (label: string, content: ReactNode) => {
    return (
      <div className="space-y-2 relative z-10">
        <h3
          className="text-base font-medium sticky top-0 py-2 border-b z-20"
          style={{ color: 'var(--gf-text)', backgroundColor: 'rgba(247,246,243,0.85)', borderColor: 'rgba(26,30,35,0.06)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)' }}
        >
          {label}
        </h3>
        <div className="space-y-2 leading-relaxed whitespace-pre-wrap" style={{ color: 'var(--gf-text)' }}>
          {content}
        </div>
      </div>
    )
  }

  const renderTranslatedFallback = () => {
    if (translationCache.length > 0) {
      return (
        <div className="space-y-3">
          {translationCache.map((item) => (
            <div
              key={item.title}
              className="rounded-[18px] px-3 py-3"
              style={{ backgroundColor: 'rgba(255,255,255,0.72)', border: '1px solid rgba(26,30,35,0.06)' }}
            >
              <div className="mb-2 text-sm font-medium" style={{ color: 'var(--gf-text)' }}>
                {item.title}
              </div>
              <div className="text-sm leading-7" style={{ color: 'rgba(26,30,35,0.58)' }}>
                {item.translated}
              </div>
            </div>
          ))}
        </div>
      )
    }

    if (segmentGuides.length > 0) {
      return (
        <div className="space-y-3">
          {segmentGuides.map((item) => (
            <div
              key={item.title}
              className="rounded-[18px] px-3 py-3"
              style={{ backgroundColor: 'rgba(255,255,255,0.72)', border: '1px solid rgba(26,30,35,0.06)' }}
            >
              <div className="mb-2 text-sm font-medium" style={{ color: 'var(--gf-text)' }}>
                {item.title}
              </div>
              <div className="text-xs mb-2" style={{ color: 'rgba(26,30,35,0.42)' }}>
                原句提示：{item.excerpt}
              </div>
              <div className="text-sm leading-7" style={{ color: 'rgba(26,30,35,0.58)' }}>
                {item.summary}
              </div>
            </div>
          ))}
        </div>
      )
    }

    return <p style={{ color: 'rgba(26,30,35,0.3)' }}>暂无白话译</p>
  }

  const generateTranslationCache = async () => {
    if (!currentDocument || translationGenerating) return
    setTranslationGenerating(true)
    setTranslationError('')
    try {
      const strategy = (currentDocument.translationCache?.length ?? 0) > 0 ? 'next' : 'recommended'
      const response = await fetch(`${API_BASE}/api/v1/documents/${currentDocument.id}/translation-cache`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ strategy, max_segments: 6 }),
      })
      if (!response.ok) throw new Error('translation cache failed')
      const data = await response.json()
      const document = data?.document
      if (document) {
        updateDocument({
          translatedText: document.translated_text ?? currentDocument.translatedText,
          translationCache: document.translation_cache ?? currentDocument.translationCache,
          translationStatus: document.translation_status ?? currentDocument.translationStatus,
        })
      }
    } catch {
      setTranslationError('翻译生成失败，请稍后重试')
    } finally {
      setTranslationGenerating(false)
    }
  }

  const openReaderCompanion = (kind: 'explain' | 'allusion' | 'study') => {
    if (kind === 'study') {
      setSidePanel('study')
      return
    }

    if (kind === 'allusion') {
      queueSearchQuery(`${currentDocument.title} 典故 人物`)
      setAppTab('search')
      return
    }

    setDraftMessage(`请像老师带读一样解释《${currentDocument.title}》：先说主旨，再讲关键句，再给两条继续阅读建议。`)
    setAppTab('chat')
  }

  // Mobile: Tab interface
  if (isMobile) {
    return (
      <div className="flex flex-col h-full" style={{ backgroundColor: 'var(--gf-bg)' }}>
        <div className="flex items-center justify-between border-b px-4 py-2" style={{ borderColor: 'rgba(26,30,35,0.06)', backgroundColor: 'rgba(255,255,255,0.45)' }}>
          <div className="flex items-center gap-2">
            <button
              onClick={handleBack}
              className="inline-flex items-center gap-1 rounded-xl px-3 py-1.5 text-xs"
              style={{ backgroundColor: 'rgba(26,30,35,0.05)', color: 'rgba(26,30,35,0.62)' }}
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              返回
            </button>
            <span className="text-xs" style={{ color: progressSyncError ? '#b03a3a' : 'rgba(26,30,35,0.45)' }}>
              {isSample ? currentDocument.title : (progressSyncError ? '阅读进度暂未同步' : (documentMeta || currentDocument.title))}
            </span>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setSidePanel((prev) => (prev === 'notes' ? null : 'notes'))}
              className="inline-flex items-center gap-1 rounded-xl px-3 py-1.5 text-xs"
              style={{ backgroundColor: sidePanel === 'notes' ? 'rgba(140,26,17,0.12)' : 'rgba(140,26,17,0.08)', color: 'var(--gf-gugong-red)' }}
            >
              <NotebookText className="w-3.5 h-3.5" />
              笔记
            </button>
            <button
              onClick={() => setSidePanel((prev) => (prev === 'study' ? null : 'study'))}
              className="inline-flex items-center gap-1 rounded-xl px-3 py-1.5 text-xs"
              style={{ backgroundColor: sidePanel === 'study' ? 'rgba(201,160,99,0.18)' : 'rgba(201,160,99,0.12)', color: 'var(--gf-gold)' }}
            >
              <GraduationCap className="w-3.5 h-3.5" />
              学习卡片
            </button>
          </div>
        </div>

        {/* Tab buttons */}
        <div className="flex border-b" style={{ borderColor: 'rgba(26,30,35,0.06)', backgroundColor: 'rgba(255,255,255,0.5)' }}>
          {[
            { key: 'original' as const, label: '原文' },
            { key: 'punctuated' as const, label: '标点文' },
            { key: 'translated' as const, label: '白话译' },
          ].map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveReaderTab(tab.key)}
              className="flex-1 py-3 px-4 text-sm font-medium transition-colors relative"
              style={{
                color: activeReaderTab === tab.key ? 'var(--gf-gugong-red)' : 'rgba(26,30,35,0.4)',
              }}
            >
              {tab.label}
              {activeReaderTab === tab.key && (
                <span className="absolute bottom-0 left-4 right-4 h-0.5 rounded-full" style={{ backgroundColor: 'var(--gf-gugong-red)' }} />
              )}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div
          className="flex-1 overflow-y-auto p-4"
          onScroll={(e) => {
            const target = e.currentTarget;
            reportProgress(target.scrollTop, target.scrollHeight, target.clientHeight);
          }}
        >
          {(currentDocument.guideSummary || currentDocument.readingTip || currentDocument.difficulty) && (
            <div
              className="mb-4 rounded-[22px] px-4 py-4"
              style={{ backgroundColor: 'rgba(255,255,255,0.72)', border: '1px solid rgba(26,30,35,0.06)' }}
            >
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <span className="text-[11px] tracking-[0.24em]" style={{ color: 'rgba(26,30,35,0.42)' }}>
                  阅读导读
                </span>
                {currentDocument.difficulty && (
                  <span className="rounded-full px-2 py-0.5 text-[11px]" style={{ backgroundColor: 'rgba(26,30,35,0.06)', color: 'rgba(26,30,35,0.58)' }}>
                    {currentDocument.difficulty}
                  </span>
                )}
              </div>
              {currentDocument.guideSummary && (
                <div className="text-sm leading-7" style={{ color: 'rgba(26,30,35,0.62)' }}>
                  {currentDocument.guideSummary}
                </div>
              )}
              {currentDocument.readingTip && (
                <div className="mt-2 text-sm leading-7" style={{ color: 'rgba(26,30,35,0.52)' }}>
                  起读建议：{currentDocument.readingTip}
                </div>
              )}
              {recommendedChapters.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {recommendedChapters.map((title) => (
                    <span
                      key={`recommended-${title}`}
                      className="rounded-full px-3 py-1 text-[11px]"
                      style={{ backgroundColor: 'rgba(201,160,99,0.14)', color: 'var(--gf-gold)' }}
                    >
                      先读：{title}
                    </span>
                  ))}
                </div>
              )}
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  onClick={() => openReaderCompanion('explain')}
                  className="rounded-full px-3 py-1.5 text-xs transition-all duration-300 hover:-translate-y-0.5"
                  style={{ backgroundColor: 'rgba(140,26,17,0.08)', color: 'var(--gf-gugong-red)' }}
                >
                  解释这篇
                </button>
                <button
                  onClick={() => openReaderCompanion('allusion')}
                  className="rounded-full px-3 py-1.5 text-xs transition-all duration-300 hover:-translate-y-0.5"
                  style={{ backgroundColor: 'rgba(201,160,99,0.12)', color: 'var(--gf-gold)' }}
                >
                  追人物典故
                </button>
                <button
                  onClick={() => openReaderCompanion('study')}
                  className="rounded-full px-3 py-1.5 text-xs transition-all duration-300 hover:-translate-y-0.5"
                  style={{ backgroundColor: 'rgba(26,30,35,0.06)', color: 'rgba(26,30,35,0.66)' }}
                >
                  进入复习
                </button>
              </div>
              {!currentDocument.translatedText && currentDocument.sourceType === 'corpus' && (
                <button
                  onClick={generateTranslationCache}
                  className="mt-3 inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs transition-all duration-300 hover:-translate-y-0.5"
                  style={{ backgroundColor: 'rgba(140,26,17,0.08)', color: 'var(--gf-gugong-red)' }}
                >
                  {translationGenerating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                  {translationCache.length > 0 ? '继续按需补全白话译' : '生成推荐章节白话译'}
                </button>
              )}
              {translationError && (
                <p className="mt-1 text-xs" style={{ color: 'var(--gf-gugong-red)' }}>{translationError}</p>
              )}
            </div>
          )}
          {chapterPreview.length > 0 && (
            <div className="mb-3 flex flex-wrap gap-2">
              {chapterPreview.map((title) => (
                <span
                  key={title}
                  className="rounded-full px-3 py-1 text-[11px]"
                  style={{ backgroundColor: 'rgba(26,30,35,0.05)', color: 'rgba(26,30,35,0.6)' }}
                >
                  {title}
                </span>
              ))}
            </div>
          )}
          {activeReaderTab === 'original' && renderColumn('原文', renderTextBlocks(currentDocument.originalText, '原文'))}
          {activeReaderTab === 'punctuated' && renderColumn('标点文', currentDocument.punctuatedText ? renderTextBlocks(currentDocument.punctuatedText, '标点文') : <p style={{ color: 'rgba(26,30,35,0.3)' }}>暂无标点文</p>)}
          {activeReaderTab === 'translated' && renderColumn('白话译', currentDocument.translatedText ? renderTextBlocks(currentDocument.translatedText, '白话译') : renderTranslatedFallback())}
        </div>

        {sidePanel === 'notes' && (
          <div className="border-t p-4" style={{ borderColor: 'rgba(26,30,35,0.06)', backgroundColor: 'rgba(255,255,255,0.4)' }}>
            <ReaderNotesPanel documentId={currentDocument.id} documentTitle={currentDocument.title} />
          </div>
        )}
        {sidePanel === 'study' && (
          <div className="border-t p-4" style={{ borderColor: 'rgba(26,30,35,0.06)', backgroundColor: 'rgba(255,255,255,0.4)' }}>
            <StudyCardsPanel documentId={currentDocument.id} />
          </div>
        )}

        {selectedWord && popoverPosition && (
          <WordPopover
            word={selectedWord}
            position={popoverPosition}
            onClose={() => setSelectedWord(null)}
          />
        )}
      </div>
    );
  }

  // Desktop: Three columns side-by-side with scroll sync
  return (
    <div className="h-full" style={{ backgroundColor: 'var(--gf-bg)' }}>
        <div className="flex items-center justify-between px-4 pt-4">
          <div className="flex items-center gap-3">
            <button
              onClick={handleBack}
              className="inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs"
              style={{ backgroundColor: 'rgba(26,30,35,0.05)', color: 'rgba(26,30,35,0.62)' }}
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              返回
            </button>
            <div className="space-y-1">
              <div className="text-xs" style={{ color: 'rgba(26,30,35,0.6)' }}>
                {currentDocument.title}
              </div>
              <div className="text-xs" style={{ color: progressSyncError ? '#b03a3a' : 'rgba(26,30,35,0.42)' }}>
                {progressSyncError ? '阅读进度暂未同步' : (documentMeta || currentDocument.sourceName || '阅读进度会自动记录')}
              </div>
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setSidePanel((prev) => (prev === 'notes' ? null : 'notes'))}
              className="inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs"
              style={{ backgroundColor: sidePanel === 'notes' ? 'rgba(140,26,17,0.12)' : 'rgba(140,26,17,0.08)', color: 'var(--gf-gugong-red)' }}
            >
              <NotebookText className="w-3.5 h-3.5" />
              {sidePanel === 'notes' ? '收起笔记' : '阅读笔记'}
            </button>
            <button
              onClick={() => setSidePanel((prev) => (prev === 'study' ? null : 'study'))}
              className="inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs"
              style={{ backgroundColor: sidePanel === 'study' ? 'rgba(201,160,99,0.18)' : 'rgba(201,160,99,0.12)', color: 'var(--gf-gold)' }}
            >
              <GraduationCap className="w-3.5 h-3.5" />
              {sidePanel === 'study' ? '收起卡片' : '学习卡片'}
            </button>
          </div>
        </div>
      {chapterPreview.length > 0 && (
        <div className="flex flex-wrap gap-2 px-4 pt-3">
          {chapterPreview.map((title) => (
            <span
              key={title}
              className="rounded-full px-3 py-1 text-[11px]"
              style={{ backgroundColor: 'rgba(26,30,35,0.05)', color: 'rgba(26,30,35,0.6)' }}
            >
              {title}
            </span>
          ))}
        </div>
      )}
      {(currentDocument.guideSummary || currentDocument.readingTip || currentDocument.difficulty) && (
        <div className="px-4 pt-3">
          <div
            className="rounded-[22px] px-4 py-4"
            style={{ backgroundColor: 'rgba(255,255,255,0.72)', border: '1px solid rgba(26,30,35,0.06)' }}
          >
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <span className="text-[11px] tracking-[0.24em]" style={{ color: 'rgba(26,30,35,0.42)' }}>
                阅读导读
              </span>
              {currentDocument.difficulty && (
                <span className="rounded-full px-2 py-0.5 text-[11px]" style={{ backgroundColor: 'rgba(26,30,35,0.06)', color: 'rgba(26,30,35,0.58)' }}>
                  {currentDocument.difficulty}
                </span>
              )}
            </div>
            {currentDocument.guideSummary && (
              <div className="text-sm leading-7" style={{ color: 'rgba(26,30,35,0.62)' }}>
                {currentDocument.guideSummary}
              </div>
            )}
            {currentDocument.readingTip && (
              <div className="mt-2 text-sm leading-7" style={{ color: 'rgba(26,30,35,0.52)' }}>
                起读建议：{currentDocument.readingTip}
              </div>
            )}
            {!currentDocument.translatedText && translationCache.length > 0 && (
              <div className="mt-2 text-xs leading-6" style={{ color: 'rgba(26,30,35,0.42)' }}>
                已缓存部分分段白话译，可先读右侧摘要，再继续补全全文。
              </div>
            )}
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                onClick={() => openReaderCompanion('explain')}
                className="rounded-full px-3 py-1.5 text-xs transition-all duration-300 hover:-translate-y-0.5"
                style={{ backgroundColor: 'rgba(140,26,17,0.08)', color: 'var(--gf-gugong-red)' }}
              >
                解释这篇
              </button>
              <button
                onClick={() => openReaderCompanion('allusion')}
                className="rounded-full px-3 py-1.5 text-xs transition-all duration-300 hover:-translate-y-0.5"
                style={{ backgroundColor: 'rgba(201,160,99,0.12)', color: 'var(--gf-gold)' }}
              >
                追人物典故
              </button>
              <button
                onClick={() => openReaderCompanion('study')}
                className="rounded-full px-3 py-1.5 text-xs transition-all duration-300 hover:-translate-y-0.5"
                style={{ backgroundColor: 'rgba(26,30,35,0.06)', color: 'rgba(26,30,35,0.66)' }}
              >
                进入复习
              </button>
            </div>
          </div>
        </div>
      )}
      <ScrollSync>
        <motion.div
          layout
          variants={columnContainerVariants}
          initial="hidden"
          animate="show"
          transition={{ type: "spring", bounce: 0.15, duration: 0.6 }}
          className={`grid h-full gap-4 p-4 ${sidePanel ? 'grid-cols-[1fr_1fr_1fr_320px]' : 'grid-cols-3'}`}
        >
          <ScrollSyncPane>
            <motion.div
              layout
              variants={columnItemVariants}
              className="overflow-y-auto h-full rounded-[20px] p-5 glass-card relative"
              onScroll={(e) => {
                const target = e.currentTarget;
                reportProgress(target.scrollTop, target.scrollHeight, target.clientHeight);
              }}
            >
              <div className="bg-xuan-paper rounded-[20px]"></div>
              <div className="ink-wash-blob w-32 h-32 -top-10 -left-10 bg-[var(--gf-gold)] opacity-10"></div>
              {renderColumn('原文', renderTextBlocks(currentDocument.originalText, '原文'))}
            </motion.div>
          </ScrollSyncPane>

          <ScrollSyncPane>
            <motion.div layout variants={columnItemVariants} className="overflow-y-auto h-full rounded-[20px] p-5 glass-card relative">
              <div className="bg-xuan-paper rounded-[20px]"></div>
              <div className="ink-wash-blob w-40 h-40 -bottom-10 -right-10 bg-[var(--gf-gugong-red)] opacity-[0.04]"></div>
              {renderColumn(
                '标点文',
                currentDocument.punctuatedText
                  ? renderTextBlocks(currentDocument.punctuatedText, '标点文')
                  : <p className="relative z-10" style={{ color: 'rgba(26,30,35,0.3)' }}>暂无标点文</p>
              )}
            </motion.div>
          </ScrollSyncPane>

          <ScrollSyncPane>
            <motion.div layout variants={columnItemVariants} className="overflow-y-auto h-full rounded-[20px] p-5 glass-card relative">
              <div className="bg-xuan-paper rounded-[20px]"></div>
              {renderColumn(
                '白话译',
                currentDocument.translatedText
                  ? renderTextBlocks(currentDocument.translatedText, '白话译')
                  : renderTranslatedFallback()
              )}
            </motion.div>
          </ScrollSyncPane>

          <AnimatePresence mode="wait">
            {sidePanel && (
              <motion.div
                key={sidePanel}
                layout
                initial={{ opacity: 0, x: 40, scale: 0.95 }}
                animate={{ opacity: 1, x: 0, scale: 1 }}
                exit={{ opacity: 0, x: 20, scale: 0.98 }}
                transition={{ type: 'spring', stiffness: 220, damping: 25 }}
                className="overflow-y-auto h-full rounded-[20px] glass-card"
              >
                {sidePanel === 'notes' ? (
                  <ReaderNotesPanel documentId={currentDocument.id} documentTitle={currentDocument.title} />
                ) : (
                  <StudyCardsPanel documentId={currentDocument.id} />
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      </ScrollSync>

      {selectedWord && popoverPosition && (
        <WordPopover
          word={selectedWord}
          position={popoverPosition}
          onClose={() => setSelectedWord(null)}
        />
      )}
    </div>
  );
}
