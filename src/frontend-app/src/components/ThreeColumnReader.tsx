import { startTransition, useState, useEffect, useMemo, useRef, useCallback, type ReactNode } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, BookPlus, Menu, NotebookPen, Sparkles } from 'lucide-react';
import { authFetchOptions } from '../store/useAuthStore';
import { useDocumentStore } from '../store/useDocumentStore';
import { useGraphStore } from '../store/useGraphStore';
import { Drawer } from './Drawer';
import { ReaderExplainPanel } from './ReaderExplainPanel';
import { ReaderNotesPanel } from './ReaderNotesPanel';
import { ReaderTocPanel } from './ReaderTocPanel';
import { StudyCardsPanel } from './StudyCardsPanel';
import { WordPopover } from './WordPopover';
import { API_BASE } from '../lib/api';
import { countLoadedReaderParagraphs, countTotalReaderParagraphs, mergeReaderSegmentChunk } from '../lib/readerDocument';
import { computeSyncedScrollTop, shouldLoadMoreReaderContent } from '../lib/readerScroll';
import {
  buildReaderBlocks,
  buildReaderParagraphs,
  buildReaderVirtualMetrics,
  findReaderBlockIndexForAnchor,
  findReaderBlockIndexForParagraph,
  getReaderVisibleRange,
  splitReaderBlockSentences,
  type ReaderColumn,
  type ReaderSentence,
} from '../utils/readerSentences';
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

const DEFAULT_VISIBLE_BLOCKS = 18;
const RANGE_OVERSCAN = 6;
const READER_SEGMENT_WINDOW_DEFAULT = 6;

type RenderRange = {
  start: number;
  end: number;
};

type ReaderRangeMap = Record<ReaderColumn, RenderRange>;

const EMPTY_RANGE: RenderRange = { start: 0, end: 0 };

function createRangeMap(range: RenderRange): ReaderRangeMap {
  return {
    original: range,
    punctuated: range,
    translated: range,
  };
}

export function ThreeColumnReader() {
  const {
    currentDocument,
    updateDocument,
    consumePendingAnchorText,
    consumePendingResumeParagraph,
    consumePendingReaderPanel,
    clearCurrentDocument,
  } = useDocumentStore();
  const readerReturnTab = useGraphStore((state) => state.readerReturnTab);
  const setAppTab = useGraphStore((state) => state.setActiveTab);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  const [activeReaderTab, setActiveReaderTab] = useState<'original' | 'punctuated' | 'translated'>('original');
  const [sidePanel, setSidePanel] = useState<'notes' | 'study' | 'explain' | null>(null);
  const [selectedSentence, setSelectedSentence] = useState<ReaderSentence | null>(null);
  const [selectedChapterTitle, setSelectedChapterTitle] = useState<string | null>(null);
  const [tocOpen, setTocOpen] = useState(false);
  const [anchorText, setAnchorText] = useState('');
  const [resumeParagraph, setResumeParagraph] = useState<number | null>(null);
  const [progressSyncError, setProgressSyncError] = useState(false);
  const [readerNotice, setReaderNotice] = useState<{ tone: 'info' | 'success' | 'error'; message: string } | null>(null);
  const [favoriteSaving, setFavoriteSaving] = useState(false);
  const [syncScrollEnabled, setSyncScrollEnabled] = useState(true);
  const [segmentLoading, setSegmentLoading] = useState(false);
  const [segmentLoadError, setSegmentLoadError] = useState(false);
  const [pendingSegmentIndex, setPendingSegmentIndex] = useState<number | null>(null);
  const [wordLookup, setWordLookup] = useState<{ word: string; position: { x: number; y: number } } | null>(null);
  const progressTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const currentParagraphRef = useRef(1);
  const currentDocumentRef = useRef(currentDocument);
  const anchorRef = useRef<HTMLDivElement | null>(null);
  const resumeOriginalParagraphRef = useRef<HTMLDivElement | null>(null);
  const resumePunctuatedParagraphRef = useRef<HTMLDivElement | null>(null);
  const resumeTranslatedParagraphRef = useRef<HTMLParagraphElement | null>(null);
  const hasMountedProgressRef = useRef<string | null>(null);
  const segmentLoadingRef = useRef(false);
  const syncLockRef = useRef<ReaderColumn | null>(null);
  const originalScrollerRef = useRef<HTMLDivElement | null>(null);
  const punctuatedScrollerRef = useRef<HTMLDivElement | null>(null);
  const scrollFrameRef = useRef<Record<'mobile' | ReaderColumn, number | null>>({
    mobile: null,
    original: null,
    punctuated: null,
    translated: null,
  });

  const formatSectionTitle = (title: string | undefined | null, index: number) => {
    const trimmed = title?.trim() ?? ''
    if (!trimmed || TECHNICAL_SECTION_ID_RE.test(trimmed)) {
      return `第${index + 1}段`
    }
    return trimmed
  }

  useEffect(() => {
    currentDocumentRef.current = currentDocument;
  }, [currentDocument]);

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 768);
    };
    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
      if (progressTimeoutRef.current) {
        clearTimeout(progressTimeoutRef.current);
        progressTimeoutRef.current = null;
      }
      for (const key of Object.keys(scrollFrameRef.current) as Array<'mobile' | ReaderColumn>) {
        const frame = scrollFrameRef.current[key];
        if (frame !== null) {
          cancelAnimationFrame(frame);
          scrollFrameRef.current[key] = null;
        }
      }
    };
  }, []);

  useEffect(() => {
    if (!currentDocument) return;
    setSelectedSentence(null);
    setSelectedChapterTitle(null);
    setSidePanel(null);
    setReaderNotice(null);
    setWordLookup(null);
    setSyncScrollEnabled(true);
    setSegmentLoading(false);
    setSegmentLoadError(false);
    setPendingSegmentIndex(null);
    segmentLoadingRef.current = false;
    syncLockRef.current = null;

    const nextAnchor = consumePendingAnchorText();
    if (nextAnchor) {
      setAnchorText(nextAnchor);
    } else {
      setAnchorText('');
    }

    const nextResumeParagraph = consumePendingResumeParagraph();
    setResumeParagraph(nextResumeParagraph && nextResumeParagraph > 0 ? nextResumeParagraph : null);
    currentParagraphRef.current = nextResumeParagraph && nextResumeParagraph > 0 ? nextResumeParagraph : 1;

    const nextPanel = consumePendingReaderPanel();
    if (nextPanel) {
      setSidePanel(nextPanel);
    }
  }, [currentDocument?.id, consumePendingAnchorText, consumePendingReaderPanel, consumePendingResumeParagraph]);

  const readerParagraphs = useMemo(() => {
    if (!currentDocument) return [];
    return buildReaderParagraphs(currentDocument);
  }, [
    currentDocument?.id,
    currentDocument?.originalText,
    currentDocument?.punctuatedText,
    currentDocument?.translatedText,
  ]);

  const readerBlocks = useMemo(() => buildReaderBlocks(readerParagraphs), [readerParagraphs]);
  const originalMetrics = useMemo(() => buildReaderVirtualMetrics(readerBlocks, 'original'), [readerBlocks]);
  const punctuatedMetrics = useMemo(() => buildReaderVirtualMetrics(readerBlocks, 'punctuated'), [readerBlocks]);
  const translatedMetrics = useMemo(() => buildReaderVirtualMetrics(readerBlocks, 'translated'), [readerBlocks]);
  const [desktopRanges, setDesktopRanges] = useState<ReaderRangeMap>(createRangeMap(EMPTY_RANGE));
  const [mobileRanges, setMobileRanges] = useState<ReaderRangeMap>(createRangeMap(EMPTY_RANGE));
  const loadedParagraphCount = useMemo(
    () => countLoadedReaderParagraphs(currentDocument?.segments),
    [currentDocument?.segments],
  );
  const totalParagraphEstimate = useMemo(() => {
    const segmentParagraphs = countTotalReaderParagraphs(currentDocument?.segments);
    return Math.max(segmentParagraphs, readerParagraphs.length);
  }, [currentDocument?.segments, readerParagraphs.length]);

  const buildInitialRange = (index: number): RenderRange => {
    const safeIndex = Math.max(0, index);
    const start = Math.max(0, safeIndex - Math.floor(DEFAULT_VISIBLE_BLOCKS / 2));
    const end = Math.min(readerBlocks.length, Math.max(start + DEFAULT_VISIBLE_BLOCKS, safeIndex + Math.ceil(DEFAULT_VISIBLE_BLOCKS / 2)));
    return { start, end };
  };

  const getMetricsForColumn = (column: ReaderColumn) => (
    column === 'original'
      ? originalMetrics
      : column === 'punctuated'
        ? punctuatedMetrics
        : translatedMetrics
  );

  const getEndOffset = (column: ReaderColumn, end: number) => {
    const metrics = getMetricsForColumn(column);
    if (end <= 0) return 0;
    if (end >= readerBlocks.length) return metrics.totalHeight;
    return metrics.offsets[end];
  };

  const setRangeForTarget = (
    target: 'desktop' | 'mobile',
    column: ReaderColumn,
    scrollTop: number,
    clientHeight: number,
  ) => {
    const nextRange = getReaderVisibleRange(getMetricsForColumn(column), scrollTop, clientHeight, RANGE_OVERSCAN);
    const applyRanges = target === 'desktop' ? setDesktopRanges : setMobileRanges;
    startTransition(() => {
      applyRanges((previous) => {
        const current = previous[column];
        if (current.start === nextRange.start && current.end === nextRange.end) {
          return previous;
        }
        return { ...previous, [column]: nextRange };
      });
    });
  };

  const scheduleRangeUpdate = (
    target: 'desktop' | 'mobile',
    column: ReaderColumn,
    scrollTop: number,
    clientHeight: number,
  ) => {
    const frameKey = target === 'desktop' ? column : 'mobile';
    if (scrollFrameRef.current[frameKey] !== null) {
      return;
    }
    scrollFrameRef.current[frameKey] = requestAnimationFrame(() => {
      setRangeForTarget(target, column, scrollTop, clientHeight);
      reportProgress(column, scrollTop, clientHeight);
      scrollFrameRef.current[frameKey] = null;
    });
  };

  const loadMoreReaderContent = useCallback(
    async (options?: { untilParagraph?: number; untilSegmentIndex?: number | null; untilAnchorText?: string }) => {
      const initialDocument = currentDocumentRef.current;
      const initialReaderContent = initialDocument?.readerContent;
      if (!initialDocument || !initialReaderContent?.hasMore || initialReaderContent.nextOffset == null || segmentLoadingRef.current) {
        return;
      }

      const meetsTarget = (document: typeof initialDocument) => {
        if (!document) return true;
        if (options?.untilParagraph && countLoadedReaderParagraphs(document.segments) < options.untilParagraph) {
          return false;
        }
        if (
          options?.untilSegmentIndex != null &&
          (document.readerContent?.loadedSegmentCount ?? 0) <= options.untilSegmentIndex
        ) {
          return false;
        }
        if (options?.untilAnchorText) {
          const needle = options.untilAnchorText.trim();
          if (needle && !(document.originalText?.includes(needle) || document.punctuatedText?.includes(needle))) {
            return false;
          }
        }
        return true;
      };

      segmentLoadingRef.current = true;
      setSegmentLoading(true);
      setSegmentLoadError(false);
      try {
        let workingDocument = initialDocument;
        while (workingDocument?.readerContent?.hasMore && workingDocument.readerContent.nextOffset != null) {
          const response = await fetch(
            `${API_BASE}/api/v1/documents/${workingDocument.id}/reader/segments?offset=${workingDocument.readerContent.nextOffset}&limit=${workingDocument.readerContent.limit || READER_SEGMENT_WINDOW_DEFAULT}`,
            authFetchOptions(),
          );
          if (!response.ok) {
            throw new Error('reader segment load failed');
          }
          const payload = await response.json();
          const updates = mergeReaderSegmentChunk(workingDocument, payload);
          workingDocument = { ...workingDocument, ...updates };
          currentDocumentRef.current = workingDocument;
          updateDocument(updates);
          if (!options || meetsTarget(workingDocument)) {
            break;
          }
        }
      } catch {
        setSegmentLoadError(true);
      } finally {
        segmentLoadingRef.current = false;
        setSegmentLoading(false);
      }
    },
    [updateDocument],
  );

  const maybeLoadMoreReaderContent = useCallback(
    (scrollTop: number, clientHeight: number, scrollHeight: number) => {
      const readerContent = currentDocumentRef.current?.readerContent;
      if (
        shouldLoadMoreReaderContent({
          scrollTop,
          clientHeight,
          scrollHeight,
          hasMore: Boolean(readerContent?.hasMore),
          isLoading: segmentLoadingRef.current,
        })
      ) {
        void loadMoreReaderContent();
      }
    },
    [loadMoreReaderContent],
  );

  const syncDesktopScroll = useCallback(
    (column: ReaderColumn, scrollTop: number) => {
      if (!syncScrollEnabled || column === 'translated') return;
      const targetColumn = column === 'original' ? 'punctuated' : 'original';
      const targetNode = targetColumn === 'original' ? originalScrollerRef.current : punctuatedScrollerRef.current;
      if (!targetNode) return;
      const sourceMetrics = column === 'original' ? originalMetrics : punctuatedMetrics;
      const targetMetrics = targetColumn === 'original' ? originalMetrics : punctuatedMetrics;
      syncLockRef.current = targetColumn;
      targetNode.scrollTop = computeSyncedScrollTop({
        sourceMetrics,
        targetMetrics,
        scrollTop,
      });
      requestAnimationFrame(() => {
        if (syncLockRef.current === targetColumn) {
          syncLockRef.current = null;
        }
      });
    },
    [originalMetrics, punctuatedMetrics, syncScrollEnabled],
  );

  const anchorBlockIndex = useMemo(
    () => findReaderBlockIndexForAnchor(readerBlocks, anchorText),
    [anchorText, readerBlocks],
  );

  const resumeBlockIndex = useMemo(
    () => findReaderBlockIndexForParagraph(readerBlocks, resumeParagraph != null ? resumeParagraph - 1 : null),
    [readerBlocks, resumeParagraph],
  );

  useEffect(() => {
    const focusIndex = anchorBlockIndex >= 0 ? anchorBlockIndex : resumeBlockIndex >= 0 ? resumeBlockIndex : 0;
    const nextRange = buildInitialRange(focusIndex);
    setDesktopRanges(createRangeMap(nextRange));
    setMobileRanges(createRangeMap(nextRange));
  }, [currentDocument?.id, readerBlocks.length, anchorBlockIndex, resumeBlockIndex]);

  useEffect(() => {
    if (anchorText && anchorRef.current) {
      anchorRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [anchorText, activeReaderTab]);

  useEffect(() => {
    if (anchorText || !resumeParagraph) return;
    const targets = [
      resumeOriginalParagraphRef.current,
      resumePunctuatedParagraphRef.current,
      resumeTranslatedParagraphRef.current,
    ].filter(Boolean);
    if (targets.length === 0) return;
    targets.forEach((target) => target?.scrollIntoView({ behavior: 'smooth', block: 'center' }));
    setResumeParagraph(null);
  }, [anchorText, resumeParagraph, activeReaderTab, readerBlocks.length]);

  useEffect(() => {
    if (!currentDocument?.readerContent?.hasMore || !resumeParagraph) return;
    if (loadedParagraphCount >= resumeParagraph) return;
    void loadMoreReaderContent({ untilParagraph: resumeParagraph });
  }, [currentDocument?.id, currentDocument?.readerContent?.hasMore, loadedParagraphCount, loadMoreReaderContent, resumeParagraph]);

  useEffect(() => {
    if (pendingSegmentIndex == null) return;
    if ((currentDocument?.readerContent?.loadedSegmentCount ?? 0) > pendingSegmentIndex) {
      setPendingSegmentIndex(null);
      return;
    }
    if (!currentDocument?.readerContent?.hasMore) return;
    void loadMoreReaderContent({ untilSegmentIndex: pendingSegmentIndex });
  }, [
    currentDocument?.id,
    currentDocument?.readerContent?.hasMore,
    currentDocument?.readerContent?.loadedSegmentCount,
    loadMoreReaderContent,
    pendingSegmentIndex,
  ]);

  useEffect(() => {
    if (!anchorText || anchorBlockIndex >= 0 || !currentDocument?.readerContent?.hasMore) return;
    void loadMoreReaderContent({ untilAnchorText: anchorText });
  }, [anchorBlockIndex, anchorText, currentDocument?.id, currentDocument?.readerContent?.hasMore, loadMoreReaderContent]);

  useEffect(() => {
    if (!currentDocument) return
    const hasFullTranslation = Boolean(currentDocument.translatedText?.trim())
    if (!hasFullTranslation && activeReaderTab === 'translated') {
      setActiveReaderTab('punctuated')
    }
  }, [activeReaderTab, currentDocument])

  useEffect(() => {
    if (!currentDocument) return
    const isSampleDocument = (currentDocument as any).sourceType === 'sample'
    if (isSampleDocument) return
    if (hasMountedProgressRef.current === currentDocument.id) return
    hasMountedProgressRef.current = currentDocument.id
    const paragraphCount = Math.max(1, totalParagraphEstimate)
    persistProgress(1, { immediate: true, totalParagraphsOverride: paragraphCount })
  }, [currentDocument, totalParagraphEstimate])

  if (!currentDocument) return null;

  const isSample = (currentDocument as any).sourceType === 'sample';
  const documentMeta = [
    currentDocument.dynasty,
    currentDocument.author,
    currentDocument.category,
    currentDocument.chapterCount ? `${currentDocument.chapterCount}篇` : null,
  ].filter(Boolean).join(' · ')
  const tocEntries = currentDocument.segments?.map((segment, index) => ({
    index: segment.index ?? index,
    title: segment.title,
    displayTitle: formatSectionTitle(segment.title, index),
    excerpt: segment.excerpt,
    summary: segment.summary,
  })) ?? (currentDocument.chapterTitles ?? [])
    .slice(0, 5)
    .map((title, index) => {
      const displayTitle = formatSectionTitle(title, index)
      return { index, title: title ?? displayTitle, displayTitle }
    })

  const totalParagraphs = Math.max(1, totalParagraphEstimate);
  const selectedSentenceText = selectedSentence?.punctuated || selectedSentence?.original || '';
  const hasFullTranslation = Boolean(currentDocument.translatedText?.trim());
  const readerContentState = currentDocument.readerContent;

  const persistProgress = (
    currentParagraph: number,
    options?: { immediate?: boolean; totalParagraphsOverride?: number },
  ) => {
    currentParagraphRef.current = currentParagraph;
    if (progressTimeoutRef.current) clearTimeout(progressTimeoutRef.current);

    const syncProgress = () => {
      progressTimeoutRef.current = null;
      void (async () => {
        try {
          const response = await fetch(`${API_BASE}/api/v1/reader/progress`, {
            ...authFetchOptions({
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
            }),
            body: JSON.stringify({
              document_id: currentDocument.id,
              current_paragraph: currentParagraph,
              total_paragraphs: options?.totalParagraphsOverride ?? totalParagraphs,
            }),
          });
          const data = await response?.json?.().catch(() => null);
          if (!response?.ok || data?.status === 'error') {
            throw new Error('progress sync failed');
          }
          setProgressSyncError(false);
        } catch {
          setProgressSyncError(true);
        }
      })();
    };

    if (options?.immediate) {
      syncProgress();
      return;
    }

    progressTimeoutRef.current = setTimeout(syncProgress, 200);
  };

  const handleBack = () => {
    if (!isSample) {
      persistProgress(currentParagraphRef.current, { immediate: true });
    }
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
  };

  const hasActiveTextSelection = () => {
    const selection = window.getSelection();
    return Boolean(selection?.toString().trim());
  };

  const handleSentenceActivate = (sentence: ReaderSentence) => {
    if (hasActiveTextSelection()) return;
    handleSentenceSelect(sentence);
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
  };

  const handleTocSelect = (entry: { index?: number; title: string; displayTitle?: string; excerpt?: string; summary?: string }) => {
    setSelectedChapterTitle(entry.displayTitle ?? entry.title);
    setAnchorText(entry.excerpt || entry.title);
    setPendingSegmentIndex(entry.index ?? null);
    setActiveReaderTab('punctuated');
    setTocOpen(false);
  };

  const reportProgress = (column: ReaderColumn, scrollTop: number, clientHeight: number) => {
    if (!currentDocument || isSample) return;
    if (readerBlocks.length === 0) return;
    const focusOffset = scrollTop + clientHeight * 0.35;
    const focusRange = getReaderVisibleRange(getMetricsForColumn(column), focusOffset, 1, 0);
    const blockIndex = Math.min(readerBlocks.length - 1, Math.max(0, focusRange.start));
    const currentParagraph = Math.min(
      totalParagraphs,
      Math.max(1, (readerBlocks[blockIndex]?.startParagraphIndex ?? 0) + 1),
    );
    persistProgress(currentParagraph);
  };

  const renderInteractiveParagraphs = (column: 'original' | 'punctuated', range: RenderRange) => {
    if (readerBlocks.length === 0) return <p style={{ color: 'rgba(26,30,35,0.3)' }}>这一栏暂时还没有内容</p>
    const resumeIndex = Math.max((resumeParagraph ?? 1) - 1, 0);
    const metrics = getMetricsForColumn(column);
    const topSpacerHeight = range.start < readerBlocks.length ? metrics.offsets[range.start] ?? 0 : 0;
    const bottomSpacerHeight = Math.max(0, metrics.totalHeight - getEndOffset(column, range.end));

    return (
      <>
        {topSpacerHeight > 0 && <div aria-hidden style={{ height: topSpacerHeight }} />}
        {readerBlocks.slice(range.start, range.end).map((block) => {
          const sentences = splitReaderBlockSentences(block);
          const isResumeBlock = resumeIndex >= block.startParagraphIndex && resumeIndex <= block.endParagraphIndex;
          const hasAnchorSentence = Boolean(anchorText) && sentences.some(
            (sentence) => sentence.punctuated.includes(anchorText) || sentence.original.includes(anchorText),
          );

          return (
          <div
            key={`${column}-${block.id}`}
            className="space-y-2"
            ref={
              isResumeBlock
                ? (column === 'original' ? resumeOriginalParagraphRef : resumePunctuatedParagraphRef)
                : undefined
            }
            style={{
              contentVisibility: 'auto',
              containIntrinsicSize: '480px',
            }}
          >
            {!hasAnchorSentence && anchorText && (block.punctuated.includes(anchorText) || block.original.includes(anchorText)) && (
              <div ref={anchorRef} />
            )}
            {sentences.map((sentence) => {
              const displayText = column === 'original' ? sentence.original : sentence.punctuated;
              if (!displayText) return null;

              const isAnchorSentence =
                Boolean(anchorText) &&
                (sentence.punctuated.includes(anchorText) || sentence.original.includes(anchorText));
              const isSelectedSentence = selectedSentence?.id === sentence.id;

              return (
                <div
                  key={`${column}-${sentence.id}`}
                  onClick={() => handleSentenceActivate(sentence)}
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
                    userSelect: 'text',
                    WebkitUserSelect: 'text',
                    cursor: 'text',
                  }}
                >
                  {displayText}
                </div>
              );
            })}
          </div>
        )})}
        {bottomSpacerHeight > 0 && <div aria-hidden style={{ height: bottomSpacerHeight }} />}
      </>
    )
  };

  const renderTranslatedParagraphs = (range: RenderRange) => {
    const topSpacerHeight = range.start < readerBlocks.length ? translatedMetrics.offsets[range.start] ?? 0 : 0;
    const bottomSpacerHeight = Math.max(0, translatedMetrics.totalHeight - getEndOffset('translated', range.end));
    return (
      <>
        {topSpacerHeight > 0 && <div aria-hidden style={{ height: topSpacerHeight }} />}
        {readerBlocks.slice(range.start, range.end).map((block) => {
          const translatedBlock = block.translated;
          const isActiveParagraph =
            selectedSentence != null &&
            selectedSentence.paragraphIndex >= block.startParagraphIndex &&
            selectedSentence.paragraphIndex <= block.endParagraphIndex;
          if (!translatedBlock) return null;
          return (
            <p
              key={`translated-${block.id}`}
              ref={
                Math.max((resumeParagraph ?? 1) - 1, 0) >= block.startParagraphIndex &&
                Math.max((resumeParagraph ?? 1) - 1, 0) <= block.endParagraphIndex
                  ? resumeTranslatedParagraphRef
                  : undefined
              }
              className="rounded-lg px-2 py-1"
              style={{
                backgroundColor: isActiveParagraph ? 'rgba(140,26,17,0.08)' : 'transparent',
                contentVisibility: 'auto',
                containIntrinsicSize: '320px',
              }}
            >
              {translatedBlock}
            </p>
          );
        })}
        {bottomSpacerHeight > 0 && <div aria-hidden style={{ height: bottomSpacerHeight }} />}
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
          onClick={() => setSidePanel((prev) => (prev === 'study' ? null : 'study'))}
          className="inline-flex min-w-[8.25rem] justify-center rounded-full px-3 py-1.5 text-xs transition-all duration-300 hover:-translate-y-0.5"
          style={{ backgroundColor: 'rgba(201,160,99,0.12)', color: 'var(--gf-gold)' }}
        >
          学习卡片
        </button>
        <button
          onClick={() => setSidePanel((prev) => (prev === 'notes' ? null : 'notes'))}
          className="inline-flex min-w-[8.25rem] justify-center rounded-full px-3 py-1.5 text-xs transition-all duration-300 hover:-translate-y-0.5"
          style={{ backgroundColor: 'rgba(26,30,35,0.06)', color: 'rgba(26,30,35,0.66)' }}
        >
          <NotebookPen className="mr-1 inline h-3.5 w-3.5" />
          阅读笔记
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
        {!isMobile && (
          <button
            onClick={() => setSyncScrollEnabled((previous) => !previous)}
            className="inline-flex min-w-[8.25rem] justify-center rounded-full px-3 py-1.5 text-xs transition-all duration-300 hover:-translate-y-0.5"
            style={{
              backgroundColor: syncScrollEnabled ? 'rgba(201,160,99,0.12)' : 'rgba(26,30,35,0.06)',
              color: syncScrollEnabled ? 'var(--gf-gold)' : 'rgba(26,30,35,0.66)',
            }}
          >
            {syncScrollEnabled ? '同步滚动：开' : '同步滚动：关'}
          </button>
        )}
        {selectedSentence && (
          <button
            onClick={clearSentenceSelection}
            className="inline-flex min-w-[8.25rem] justify-center rounded-full px-3 py-1.5 text-xs transition-all duration-300 disabled:cursor-not-allowed disabled:opacity-45 hover:-translate-y-0.5"
            style={{ backgroundColor: 'rgba(255,255,255,0.74)', color: 'rgba(26,30,35,0.66)', border: '1px solid rgba(26,30,35,0.08)' }}
          >
          取消选句
        </button>
      )}
      </div>
      <div
        className="mt-2 rounded-[16px] px-3 py-2 text-xs leading-6"
          style={{ backgroundColor: 'rgba(255,255,255,0.66)', color: 'rgba(26,30,35,0.46)', border: '1px solid rgba(26,30,35,0.05)' }}
      >
        查词提示：在原文里拖选一个词，系统会弹出查词卡，也能顺手加入字词记录。
      </div>
      {readerContentState && readerContentState.totalSegments > 0 && (
        <div
          className="mt-2 rounded-[16px] px-3 py-2 text-xs leading-6"
          style={{ backgroundColor: 'rgba(255,255,255,0.66)', color: 'rgba(26,30,35,0.5)', border: '1px solid rgba(26,30,35,0.05)' }}
        >
          {segmentLoading
            ? `正在继续加载正文，已到第 ${readerContentState.loadedSegmentCount} / ${readerContentState.totalSegments} 节。`
            : readerContentState.hasMore
              ? `当前已加载第 ${readerContentState.loadedSegmentCount} / ${readerContentState.totalSegments} 节，往下滚动会自动续读。`
              : `这篇内容已经全部载入，共 ${readerContentState.totalSegments} 节。`}
        </div>
      )}
      {segmentLoadError && (
        <div
          className="mt-2 rounded-[16px] px-3 py-2 text-xs"
          style={{ backgroundColor: 'rgba(176,58,58,0.08)', color: '#b03a3a' }}
        >
          后续章节这次没有拉下来，继续下滑时会再试一次。
        </div>
      )}
      {readerNotice && readerNotice.tone !== 'info' && (
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
              {isSample ? currentDocument.title : (progressSyncError ? '阅读进度稍后同步' : (documentMeta || currentDocument.title))}
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
            ...(hasFullTranslation ? [{ key: 'translated' as const, label: '白话解读' }] : []),
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
            scheduleRangeUpdate('mobile', activeReaderTab, target.scrollTop, target.clientHeight);
            maybeLoadMoreReaderContent(target.scrollTop, target.clientHeight, target.scrollHeight);
          }}
        >
          <div className="mb-4">{renderReaderGuideCard()}</div>
          {activeReaderTab === 'original' && renderColumn('原文', renderInteractiveParagraphs('original', mobileRanges.original))}
          {activeReaderTab === 'punctuated' && renderColumn('标点文', currentDocument.punctuatedText ? renderInteractiveParagraphs('punctuated', mobileRanges.punctuated) : <p style={{ color: 'rgba(26,30,35,0.3)' }}>这篇内容还没整理出标点文</p>)}
          {hasFullTranslation && activeReaderTab === 'translated' && renderColumn('白话解读', renderTranslatedParagraphs(mobileRanges.translated))}
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
              context={selectedSentence.context}
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
                {progressSyncError ? '阅读进度稍后同步' : (documentMeta || currentDocument.sourceName || '阅读进度会自动保存')}
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
        className={`grid min-h-0 flex-1 gap-4 p-4 ${
          sidePanel
            ? (hasFullTranslation ? 'grid-cols-[1fr_1fr_1fr_320px]' : 'grid-cols-[1fr_1fr_320px]')
            : (hasFullTranslation ? 'grid-cols-3' : 'grid-cols-2')
        }`}
      >
        <motion.div
          layout
          variants={columnItemVariants}
          ref={originalScrollerRef}
          className="reader-paper-panel relative h-full min-h-0 overflow-y-auto overflow-x-hidden rounded-[20px] p-5 glass-card"
          onScroll={(e) => {
            const target = e.currentTarget;
            scheduleRangeUpdate('desktop', 'original', target.scrollTop, target.clientHeight);
            maybeLoadMoreReaderContent(target.scrollTop, target.clientHeight, target.scrollHeight);
            if (syncLockRef.current === 'original') {
              syncLockRef.current = null;
              return;
            }
            syncDesktopScroll('original', target.scrollTop);
          }}
          data-testid="reader-column-original"
        >
          {renderColumn('原文', renderInteractiveParagraphs('original', desktopRanges.original))}
        </motion.div>

        <motion.div
          layout
          variants={columnItemVariants}
          ref={punctuatedScrollerRef}
          className="reader-paper-panel relative h-full min-h-0 overflow-y-auto overflow-x-hidden rounded-[20px] p-5 glass-card"
          onScroll={(e) => {
            const target = e.currentTarget;
            scheduleRangeUpdate('desktop', 'punctuated', target.scrollTop, target.clientHeight);
            maybeLoadMoreReaderContent(target.scrollTop, target.clientHeight, target.scrollHeight);
            if (syncLockRef.current === 'punctuated') {
              syncLockRef.current = null;
              return;
            }
            syncDesktopScroll('punctuated', target.scrollTop);
          }}
          data-testid="reader-column-punctuated"
        >
          {renderColumn(
            '标点文',
            currentDocument.punctuatedText
              ? renderInteractiveParagraphs('punctuated', desktopRanges.punctuated)
              : <p className="relative z-10" style={{ color: 'rgba(26,30,35,0.3)' }}>这篇内容还没整理出标点文</p>
          )}
        </motion.div>

        {hasFullTranslation && (
          <motion.div
            layout
            variants={columnItemVariants}
            className="reader-paper-panel relative h-full min-h-0 overflow-y-auto overflow-x-hidden rounded-[20px] p-5 glass-card"
            onScroll={(e) => {
              const target = e.currentTarget;
              scheduleRangeUpdate('desktop', 'translated', target.scrollTop, target.clientHeight);
              maybeLoadMoreReaderContent(target.scrollTop, target.clientHeight, target.scrollHeight);
            }}
            data-testid="reader-column-translated"
          >
            {renderColumn(
              '白话解读',
              renderTranslatedParagraphs(desktopRanges.translated)
            )}
          </motion.div>
        )}

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
                  context={selectedSentence.context}
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
