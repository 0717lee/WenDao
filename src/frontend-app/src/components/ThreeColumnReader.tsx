import { useState, useEffect, useMemo, useRef, type ReactNode } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, BookPlus, Loader2, Menu, Sparkles } from 'lucide-react';
import { authFetchOptions } from '../store/useAuthStore';
import { useDocumentStore } from '../store/useDocumentStore';
import { useGraphStore } from '../store/useGraphStore';
import { useStore } from '../store/useStore';
import { Drawer } from './Drawer';
import { ReaderExplainPanel } from './ReaderExplainPanel';
import { ReaderNotesPanel } from './ReaderNotesPanel';
import { ReaderTocPanel } from './ReaderTocPanel';
import { StudyCardsPanel } from './StudyCardsPanel';
import { WordPopover } from './WordPopover';
import { API_BASE } from '../lib/api';
import { buildReaderParagraphs, type ReaderSentence } from '../utils/readerSentences';
import { addDocumentToFavorites } from '../lib/favorites';

const TECHNICAL_SECTION_ID_RE = /^[A-Za-z]{1,6}\d[\w-]*$/;

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
  const {
    currentDocument,
    comparisonDocuments,
    consumePendingAnchorText,
    consumePendingReaderPanel,
    updateDocument,
    clearCurrentDocument,
    toggleComparisonDocument,
  } = useDocumentStore();
  const readerReturnTab = useGraphStore((state) => state.readerReturnTab);
  const setAppTab = useGraphStore((state) => state.setActiveTab);
  const queueSearchQuery = useGraphStore((state) => state.queueSearchQuery);
  const setDraftMessage = useStore((state) => state.setDraftMessage);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  const [activeReaderTab, setActiveReaderTab] = useState<'original' | 'punctuated' | 'translated'>('original');
  const [sidePanel, setSidePanel] = useState<'notes' | 'study' | 'explain' | null>(null);
  const [selectedSentence, setSelectedSentence] = useState<ReaderSentence | null>(null);
  const [selectedChapterTitle, setSelectedChapterTitle] = useState<string | null>(null);
  const [tocOpen, setTocOpen] = useState(false);
  const [anchorText, setAnchorText] = useState('');
  const [progressSyncError, setProgressSyncError] = useState(false);
  const [translationGenerating, setTranslationGenerating] = useState(false);
  const [translationError, setTranslationError] = useState('');
  const [readerNotice, setReaderNotice] = useState<{ tone: 'info' | 'success' | 'error'; message: string } | null>(null);
  const [favoriteSaving, setFavoriteSaving] = useState(false);
  const [wordLookup, setWordLookup] = useState<{ word: string; position: { x: number; y: number } } | null>(null);
  const progressTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const anchorRef = useRef<HTMLDivElement | null>(null);

  const formatSectionTitle = (title: string | undefined | null, index: number) => {
    const trimmed = title?.trim() ?? ''
    if (!trimmed || TECHNICAL_SECTION_ID_RE.test(trimmed)) {
      return `第${index + 1}段`
    }
    return trimmed
  }

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
    setSelectedSentence(null);
    setSelectedChapterTitle(null);
    setSidePanel(null);
    setReaderNotice(null);
    setWordLookup(null);

    const nextAnchor = consumePendingAnchorText();
    if (nextAnchor) {
      setAnchorText(nextAnchor);
    } else {
      setAnchorText('');
    }

    const nextPanel = consumePendingReaderPanel();
    if (nextPanel) {
      setSidePanel(nextPanel);
    }
  }, [currentDocument?.id, consumePendingAnchorText, consumePendingReaderPanel]);

  const readerParagraphs = useMemo(() => {
    if (!currentDocument) return [];
    return buildReaderParagraphs(currentDocument);
  }, [
    currentDocument?.id,
    currentDocument?.originalText,
    currentDocument?.punctuatedText,
    currentDocument?.translatedText,
  ]);

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
  const recommendedChapters = currentDocument.recommendedChapters?.slice(0, 4) ?? []
  const segmentGuides = (currentDocument.segmentGuides ?? [])
    .slice(0, 6)
    .map((item, index) => ({
      ...item,
      title: formatSectionTitle(item.title, index),
    }))
  const translationCache = currentDocument.translationCache ?? []
  const tocEntries = currentDocument.segments?.map((segment, index) => ({
    title: segment.title,
    displayTitle: formatSectionTitle(segment.title, index),
    excerpt: segment.excerpt,
    summary: segment.summary,
  })) ?? (currentDocument.chapterTitles ?? [])
    .slice(0, 5)
    .map((title, index) => {
      const displayTitle = formatSectionTitle(title, index)
      return { title: title ?? displayTitle, displayTitle }
    })

  const totalParagraphs = Math.max(1, readerParagraphs.length);
  const selectedSentenceText = selectedSentence?.punctuated || selectedSentence?.original || '';
  const isCompared = comparisonDocuments.some((item) => item.id === currentDocument.id);

  const handleBack = () => {
    clearCurrentDocument();
    if (readerReturnTab === 'reader') {
      setAppTab('reader');
      return;
    }
    setAppTab(readerReturnTab || 'home');
  };

  const handleSentenceSelect = (sentence: ReaderSentence) => {
    setSelectedSentence(sentence);
    setSelectedChapterTitle(
      formatSectionTitle(
        currentDocument.segments?.[sentence.paragraphIndex]?.title ??
        currentDocument.chapterTitles?.[sentence.paragraphIndex],
        sentence.paragraphIndex,
      ) ??
      null,
    );
    setReaderNotice({ tone: 'info', message: '已选中一句。需要时再点“AI解读选中句”，不会自动打断阅读。' });
  };

  const handleLookupSelection = (event: React.MouseEvent<HTMLDivElement>) => {
    const selection = window.getSelection();
    const word = selection?.toString().trim() ?? '';
    if (!word || word.length > 8) return;
    const anchorNode = selection?.anchorNode;
    const focusNode = selection?.focusNode;
    if (!anchorNode || !focusNode) return;
    if (!event.currentTarget.contains(anchorNode) || !event.currentTarget.contains(focusNode)) return;
    setWordLookup({ word, position: { x: event.clientX, y: event.clientY } });
  };

  const openSelectedSentenceExplain = () => {
    if (!selectedSentence) return;
    setSidePanel('explain');
    setReaderNotice(null);
  };

  const handleToggleCompare = () => {
    toggleComparisonDocument(currentDocument);
    setReaderNotice(
      isCompared
        ? { tone: 'info', message: '这篇已经从对照阅读里移出。' }
        : { tone: 'success', message: '这篇已经加入对照阅读，去“对照阅读”页就能看到。' }
    );
  };

  const handleFavoriteDocument = async () => {
    if (favoriteSaving) return;
    setFavoriteSaving(true);
    try {
      const folder = await addDocumentToFavorites(currentDocument.id);
      setReaderNotice({ tone: 'success', message: `这篇已经收藏到 ${folder.name}，去“文章收藏”里就能看到。` });
    } catch {
      setReaderNotice({ tone: 'error', message: '收藏没有成功，请稍后再试一次。' });
    } finally {
      setFavoriteSaving(false);
    }
  };

  const clearSentenceSelection = () => {
    setSelectedSentence(null);
    setSelectedChapterTitle(null);
    setReaderNotice({ tone: 'info', message: '继续顺着原文往下读，卡住时再点一句。' });
  };

  const handleTocSelect = (entry: { title: string; displayTitle?: string; excerpt?: string; summary?: string }) => {
    setSelectedChapterTitle(entry.displayTitle ?? entry.title);
    setAnchorText(entry.excerpt || entry.title);
    setActiveReaderTab('punctuated');
    setTocOpen(false);
  };

  const reportProgress = (scrollTop: number, scrollHeight: number, clientHeight: number) => {
    if (!currentDocument || isSample) return;
    const readableHeight = Math.max(scrollHeight - clientHeight, 1);
    const ratio = Math.min(1, Math.max(0, scrollTop / readableHeight));
    const currentParagraph = Math.min(totalParagraphs, Math.max(1, Math.round(ratio * (totalParagraphs - 1)) + 1));

    if (progressTimeoutRef.current) clearTimeout(progressTimeoutRef.current);
    progressTimeoutRef.current = setTimeout(() => {
      fetch(`${API_BASE}/api/v1/reader/progress`, {
        ...authFetchOptions({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        }),
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

  const renderInteractiveParagraphs = (column: 'original' | 'punctuated') => {
    if (readerParagraphs.length === 0) return <p style={{ color: 'rgba(26,30,35,0.3)' }}>这一栏暂时还没有内容</p>
    return (
      <>
        {readerParagraphs.map((paragraph) => (
          <div key={`${column}-${paragraph.id}`} className="space-y-2">
            {paragraph.sentences.map((sentence) => {
              const displayText = column === 'original' ? sentence.original : sentence.punctuated;
              if (!displayText) return null;

              const isAnchorSentence =
                Boolean(anchorText) &&
                (sentence.punctuated.includes(anchorText) || sentence.original.includes(anchorText));
              const isSelectedSentence = selectedSentence?.id === sentence.id;

              return (
                <div
                  key={`${column}-${sentence.id}`}
                  onClick={() => handleSentenceSelect(sentence)}
                  onMouseUp={handleLookupSelection}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      handleSentenceSelect(sentence);
                    }
                  }}
                  ref={isAnchorSentence ? anchorRef : undefined}
                  role="button"
                  tabIndex={0}
                  className="block w-full rounded-lg px-2 py-1 text-left transition-colors"
                  style={{
                    backgroundColor: isSelectedSentence
                      ? 'rgba(140,26,17,0.10)'
                      : isAnchorSentence
                        ? 'rgba(201,160,99,0.14)'
                        : 'transparent',
                  }}
                >
                  {displayText}
                </div>
              );
            })}
          </div>
        ))}
      </>
    )
  };

  const renderTranslatedParagraphs = () => {
    if (!currentDocument.translatedText) {
      return renderTranslatedFallback();
    }

    return (
      <>
        {readerParagraphs.map((paragraph) => {
          const translatedBlock = paragraph.translated;
          const isActiveParagraph = selectedSentence?.paragraphIndex === paragraph.paragraphIndex;
          if (!translatedBlock) return null;
          return (
            <p
              key={`translated-${paragraph.id}`}
              className="rounded-lg px-2 py-1"
              style={{ backgroundColor: isActiveParagraph ? 'rgba(140,26,17,0.08)' : 'transparent' }}
            >
              {translatedBlock}
            </p>
          );
        })}
      </>
    );
  };

  const renderColumn = (label: string, content: ReactNode) => {
    return (
      <div className="space-y-2 relative z-10">
        <h3
          className="pb-2 text-base font-medium border-b"
          style={{ color: 'var(--gf-text)', borderColor: 'rgba(26,30,35,0.06)' }}
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
          {translationCache.map((item, index) => (
            <div
              key={`${item.title}-${index}`}
              className="rounded-[18px] px-3 py-3"
              style={{ backgroundColor: 'rgba(255,255,255,0.72)', border: '1px solid rgba(26,30,35,0.06)' }}
            >
              <div className="mb-2 text-sm font-medium" style={{ color: 'var(--gf-text)' }}>
                {formatSectionTitle(item.title, index)}
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

    return <p style={{ color: 'rgba(26,30,35,0.3)' }}>这篇内容还没有白话解读</p>
  }

  const generateTranslationCache = async () => {
    if (!currentDocument || translationGenerating) return
    setTranslationGenerating(true)
    setTranslationError('')
    try {
      const strategy = (currentDocument.translationCache?.length ?? 0) > 0 ? 'next' : 'recommended'
      const response = await fetch(`${API_BASE}/api/v1/documents/${currentDocument.id}/translation-cache`, {
        method: 'POST',
        ...authFetchOptions({ headers: { 'Content-Type': 'application/json' } }),
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
      setTranslationError('白话解读还没生成出来，请稍后再试一次')
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

  const renderReaderGuideCard = () => (
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
        {selectedSentence && (
          <span className="rounded-full px-2 py-0.5 text-[11px]" style={{ backgroundColor: 'rgba(140,26,17,0.08)', color: 'var(--gf-gugong-red)' }}>
            已选中 1 句
          </span>
        )}
      </div>
      {currentDocument.guideSummary ? (
        <div className="text-sm leading-7" style={{ color: 'rgba(26,30,35,0.62)' }}>
          {currentDocument.guideSummary}
        </div>
      ) : (
        <div className="text-sm leading-7" style={{ color: 'rgba(26,30,35,0.58)' }}>
          可以先顺着原文往下读，卡住时再点一句细看。
        </div>
      )}
      {currentDocument.readingTip && (
        <div className="mt-2 text-sm leading-7" style={{ color: 'rgba(26,30,35,0.52)' }}>
          可以先这样读：{currentDocument.readingTip}
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
              建议先读：{title}
            </span>
          ))}
        </div>
      )}
      <div
        className="mt-3 rounded-[18px] px-3 py-3 text-xs leading-7"
        style={{ backgroundColor: 'rgba(244,241,225,0.72)', border: '1px solid rgba(26,30,35,0.05)', color: 'rgba(26,30,35,0.55)' }}
      >
        这一页默认先让你顺着原文往下读：卡住时再点一句、查词，或收藏这篇，不会一下子出现太多操作。
      </div>
      {selectedSentenceText && (
        <div
          className="mt-3 rounded-[18px] px-3 py-3"
          style={{ backgroundColor: 'rgba(255,255,255,0.78)', border: '1px solid rgba(26,30,35,0.05)' }}
        >
          <div className="mb-1 text-[11px] tracking-[0.22em]" style={{ color: 'rgba(26,30,35,0.42)' }}>
            当前选中
          </div>
          <div className="line-clamp-2 text-sm leading-7" style={{ color: 'var(--gf-text)' }}>
            {selectedSentenceText}
          </div>
        </div>
      )}
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          onClick={openSelectedSentenceExplain}
          disabled={!selectedSentence}
          className="inline-flex min-w-[8.25rem] justify-center rounded-full px-3 py-1.5 text-xs transition-all duration-300 disabled:cursor-not-allowed disabled:opacity-45 hover:-translate-y-0.5"
          style={{ backgroundColor: 'rgba(140,26,17,0.08)', color: 'var(--gf-gugong-red)' }}
        >
          <Sparkles className="mr-1 inline h-3.5 w-3.5" />
          讲解此句
        </button>
        <button
          onClick={handleFavoriteDocument}
          disabled={favoriteSaving}
          className="inline-flex min-w-[8.25rem] justify-center rounded-full px-3 py-1.5 text-xs transition-all duration-300 hover:-translate-y-0.5"
          style={{ backgroundColor: 'rgba(26,30,35,0.06)', color: 'rgba(26,30,35,0.66)' }}
        >
          <BookPlus className="mr-1 inline h-3.5 w-3.5" />
          {favoriteSaving ? '正在收藏...' : '收藏这篇'}
        </button>
        <button
          onClick={clearSentenceSelection}
          className="inline-flex min-w-[8.25rem] justify-center rounded-full px-3 py-1.5 text-xs transition-all duration-300 disabled:cursor-not-allowed disabled:opacity-45 hover:-translate-y-0.5"
          style={{ backgroundColor: 'rgba(255,255,255,0.74)', color: 'rgba(26,30,35,0.66)', border: '1px solid rgba(26,30,35,0.08)' }}
        >
          继续阅读
        </button>
      </div>
      <div
        className="mt-2 rounded-[16px] px-3 py-2 text-xs leading-6"
          style={{ backgroundColor: 'rgba(255,255,255,0.66)', color: 'rgba(26,30,35,0.46)', border: '1px solid rgba(26,30,35,0.05)' }}
      >
        查词提示：在原文里拖选一个词，系统会弹出查词卡，也能顺手加入字词记录。
      </div>
      {readerNotice && (
        <div
          className="mt-3 rounded-[16px] px-3 py-2 text-xs"
          style={{
            backgroundColor:
              readerNotice.tone === 'success'
                ? 'rgba(60,138,81,0.10)'
                : readerNotice.tone === 'error'
                  ? 'rgba(176,58,58,0.08)'
                  : 'rgba(26,30,35,0.05)',
            color:
              readerNotice.tone === 'success'
                ? '#3c8a51'
                : readerNotice.tone === 'error'
                  ? '#b03a3a'
                  : 'rgba(26,30,35,0.62)',
          }}
        >
          {readerNotice.message}
        </div>
      )}
      <details
        className="mt-4 rounded-[18px] px-3 py-3"
        style={{ backgroundColor: 'rgba(255,255,255,0.74)', border: '1px solid rgba(26,30,35,0.06)' }}
      >
        <summary className="cursor-pointer text-sm" style={{ color: 'var(--gf-text)' }}>
          更多功能
        </summary>
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            onClick={() => setSidePanel((prev) => (prev === 'notes' ? null : 'notes'))}
            className="inline-flex min-w-[8.25rem] justify-center rounded-full px-3 py-1.5 text-xs transition-all duration-300 hover:-translate-y-0.5"
            style={{ backgroundColor: 'rgba(140,26,17,0.08)', color: 'var(--gf-gugong-red)' }}
          >
            阅读笔记
          </button>
          <button
            onClick={handleToggleCompare}
            className="inline-flex min-w-[8.25rem] justify-center rounded-full px-3 py-1.5 text-xs transition-all duration-300 hover:-translate-y-0.5"
            style={{ backgroundColor: 'rgba(201,160,99,0.12)', color: 'var(--gf-gold)' }}
          >
            {isCompared ? '移出对照' : '加入对照'}
          </button>
          <button
            onClick={() => openReaderCompanion('explain')}
            className="inline-flex min-w-[8.25rem] justify-center rounded-full px-3 py-1.5 text-xs transition-all duration-300 hover:-translate-y-0.5"
            style={{ backgroundColor: 'rgba(140,26,17,0.08)', color: 'var(--gf-gugong-red)' }}
          >
            整篇讲解
          </button>
          <button
            onClick={() => openReaderCompanion('allusion')}
            className="inline-flex min-w-[8.25rem] justify-center rounded-full px-3 py-1.5 text-xs transition-all duration-300 hover:-translate-y-0.5"
            style={{ backgroundColor: 'rgba(201,160,99,0.12)', color: 'var(--gf-gold)' }}
          >
            查人物典故
          </button>
          <button
            onClick={() => openReaderCompanion('study')}
            className="inline-flex min-w-[8.25rem] justify-center rounded-full px-3 py-1.5 text-xs transition-all duration-300 hover:-translate-y-0.5"
            style={{ backgroundColor: 'rgba(26,30,35,0.06)', color: 'rgba(26,30,35,0.66)' }}
          >
            生成复习卡
          </button>
          <button
            onClick={() => setAppTab('wordbook')}
            className="inline-flex min-w-[8.25rem] justify-center rounded-full px-3 py-1.5 text-xs transition-all duration-300 hover:-translate-y-0.5"
            style={{ backgroundColor: 'rgba(255,255,255,0.74)', color: 'rgba(26,30,35,0.66)', border: '1px solid rgba(26,30,35,0.08)' }}
          >
            字词记录
          </button>
          {!currentDocument.translatedText && currentDocument.sourceType === 'corpus' && (
            <button
              onClick={generateTranslationCache}
              className="inline-flex min-w-[8.25rem] justify-center rounded-full px-3 py-1.5 text-xs transition-all duration-300 hover:-translate-y-0.5"
              style={{ backgroundColor: 'rgba(140,26,17,0.08)', color: 'var(--gf-gugong-red)' }}
            >
              {translationGenerating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
              {translationCache.length > 0 ? '继续生成白话解读' : '生成白话解读'}
            </button>
          )}
        </div>
        {translationError && (
          <p className="mt-2 text-xs" style={{ color: 'var(--gf-gugong-red)' }}>{translationError}</p>
        )}
      </details>
    </div>
  )

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
              onClick={() => setTocOpen(true)}
              className="inline-flex items-center gap-1 rounded-xl px-3 py-1.5 text-xs"
              style={{ backgroundColor: 'rgba(26,30,35,0.05)', color: 'rgba(26,30,35,0.62)' }}
            >
              <Menu className="w-3.5 h-3.5" />
              目录
            </button>
          </div>
        </div>

        {/* Tab buttons */}
        <div className="flex border-b" style={{ borderColor: 'rgba(26,30,35,0.06)', backgroundColor: 'rgba(255,255,255,0.5)' }}>
          {[
            { key: 'original' as const, label: '原文' },
            { key: 'punctuated' as const, label: '标点文' },
            { key: 'translated' as const, label: '白话解读' },
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
          <div className="mb-4">{renderReaderGuideCard()}</div>
          {activeReaderTab === 'original' && renderColumn('原文', renderInteractiveParagraphs('original'))}
          {activeReaderTab === 'punctuated' && renderColumn('标点文', currentDocument.punctuatedText ? renderInteractiveParagraphs('punctuated') : <p style={{ color: 'rgba(26,30,35,0.3)' }}>这篇内容还没整理出标点文</p>)}
          {activeReaderTab === 'translated' && renderColumn('白话解读', renderTranslatedParagraphs())}
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
        {sidePanel === 'explain' && selectedSentence && (
          <div className="border-t p-4" style={{ borderColor: 'rgba(26,30,35,0.06)', backgroundColor: 'rgba(255,255,255,0.4)' }}>
            <ReaderExplainPanel
              documentId={currentDocument.id}
              documentTitle={currentDocument.title}
              sentence={selectedSentence.punctuated || selectedSentence.original}
              context={readerParagraphs[selectedSentence.paragraphIndex]?.punctuated ?? ''}
              chapterTitle={selectedChapterTitle ?? undefined}
            />
          </div>
        )}

        {wordLookup && (
          <WordPopover
            word={wordLookup.word}
            position={wordLookup.position}
            onClose={() => setWordLookup(null)}
          />
        )}

      </div>
    );
  }

  // Desktop: Three columns side-by-side with scroll sync
  return (
    <div className="flex h-full min-h-0 flex-col" style={{ backgroundColor: 'var(--gf-bg)' }}>
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
                {progressSyncError ? '阅读进度暂未同步' : (documentMeta || currentDocument.sourceName || '阅读进度会自动保存')}
              </div>
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setTocOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs"
              style={{ backgroundColor: 'rgba(26,30,35,0.05)', color: 'rgba(26,30,35,0.62)' }}
            >
              <Menu className="w-3.5 h-3.5" />
              目录
            </button>
          </div>
        </div>
      <div className="px-4 pt-3">{renderReaderGuideCard()}</div>
      <motion.div
        layout
        variants={columnContainerVariants}
        initial="hidden"
        animate="show"
        transition={{ type: "spring", bounce: 0.15, duration: 0.6 }}
        className={`grid min-h-0 flex-1 gap-4 p-4 ${sidePanel ? 'grid-cols-[1fr_1fr_1fr_320px]' : 'grid-cols-3'}`}
      >
        <motion.div
          layout
          variants={columnItemVariants}
          className="relative h-full min-h-0 overflow-y-auto overflow-x-hidden rounded-[20px] p-5 glass-card"
          onScroll={(e) => {
            const target = e.currentTarget;
            reportProgress(target.scrollTop, target.scrollHeight, target.clientHeight);
          }}
        >
          <div className="bg-xuan-paper rounded-[20px]"></div>
          <div className="ink-wash-blob w-32 h-32 -top-10 -left-10 bg-[var(--gf-gold)] opacity-10"></div>
          {renderColumn('原文', renderInteractiveParagraphs('original'))}
        </motion.div>

        <motion.div layout variants={columnItemVariants} className="relative h-full min-h-0 overflow-y-auto overflow-x-hidden scrollbar-hide rounded-[20px] p-5 glass-card">
          <div className="bg-xuan-paper rounded-[20px]"></div>
          <div className="ink-wash-blob w-40 h-40 -bottom-10 -right-10 bg-[var(--gf-gugong-red)] opacity-[0.04]"></div>
          {renderColumn(
            '标点文',
            currentDocument.punctuatedText
              ? renderInteractiveParagraphs('punctuated')
              : <p className="relative z-10" style={{ color: 'rgba(26,30,35,0.3)' }}>这篇内容还没整理出标点文</p>
          )}
        </motion.div>

        <motion.div layout variants={columnItemVariants} className="relative h-full min-h-0 overflow-y-auto overflow-x-hidden rounded-[20px] p-5 glass-card">
          <div className="bg-xuan-paper rounded-[20px]"></div>
          {renderColumn(
            '白话解读',
            renderTranslatedParagraphs()
          )}
        </motion.div>

        <AnimatePresence mode="wait">
          {sidePanel && (
            <motion.div
              key={sidePanel}
              layout
              initial={{ opacity: 0, x: 40, scale: 0.95 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, x: 20, scale: 0.98 }}
              transition={{ type: 'spring', stiffness: 220, damping: 25 }}
              className="h-full min-h-0 overflow-y-auto rounded-[20px] glass-card"
            >
              {sidePanel === 'notes' ? (
                <ReaderNotesPanel documentId={currentDocument.id} documentTitle={currentDocument.title} />
              ) : sidePanel === 'explain' && selectedSentence ? (
                <ReaderExplainPanel
                  documentId={currentDocument.id}
                  documentTitle={currentDocument.title}
                  sentence={selectedSentence.punctuated || selectedSentence.original}
                  context={readerParagraphs[selectedSentence.paragraphIndex]?.punctuated ?? ''}
                  chapterTitle={selectedChapterTitle ?? undefined}
                />
              ) : (
                <StudyCardsPanel documentId={currentDocument.id} />
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>

      <Drawer
        side="left"
        open={tocOpen}
        onClose={() => setTocOpen(false)}
        title="章节目录"
        icon={<Menu className="w-5 h-5" />}
      >
        <ReaderTocPanel entries={tocEntries} selectedTitle={selectedChapterTitle} onSelect={handleTocSelect} />
      </Drawer>

      {wordLookup && (
        <WordPopover
          word={wordLookup.word}
          position={wordLookup.position}
          onClose={() => setWordLookup(null)}
        />
      )}
    </div>
  );
}
