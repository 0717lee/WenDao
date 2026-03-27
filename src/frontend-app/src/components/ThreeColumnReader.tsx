import { useState, useEffect, useRef } from 'react';
import { ScrollSync, ScrollSyncPane } from 'react-scroll-sync';
import { GraduationCap, NotebookText } from 'lucide-react';
import { authHeaders } from '../store/useAuthStore';
import { useDocumentStore } from '../store/useDocumentStore';
import { ReaderNotesPanel } from './ReaderNotesPanel';
import { StudyCardsPanel } from './StudyCardsPanel';
import { WordPopover } from './WordPopover';
import { API_BASE } from '../lib/api';

export function ThreeColumnReader() {
  const { currentDocument, consumePendingAnchorText, consumePendingReaderPanel } = useDocumentStore();
  const [selectedWord, setSelectedWord] = useState<string | null>(null);
  const [popoverPosition, setPopoverPosition] = useState<{ x: number; y: number } | null>(null);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  const [activeTab, setActiveTab] = useState<'original' | 'punctuated' | 'translated'>('original');
  const [sidePanel, setSidePanel] = useState<'notes' | 'study' | null>(null);
  const [anchorText, setAnchorText] = useState('');
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
  }, [anchorText, activeTab]);

  if (!currentDocument) return null;

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

  const reportProgress = (scrollTop: number, scrollHeight: number, clientHeight: number) => {
    if (!currentDocument) return;
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
      }).catch(() => {});
    }, 200);
  };

  const renderText = (text: string, label: string) => (
    <div className="space-y-2">
      <h3
        className="text-base font-medium sticky top-0 py-2 border-b"
        style={{ color: 'var(--gf-text)', backgroundColor: 'rgba(255,255,255,0.9)', borderColor: 'rgba(26,30,35,0.06)', backdropFilter: 'blur(8px)' }}
      >
        {label}
      </h3>
      <div className="space-y-2 leading-relaxed whitespace-pre-wrap" style={{ color: 'var(--gf-text)' }}>
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
                  <span
                    key={`${label}-${blockIndex}-${idx}`}
                    ref={isAnchorBlock && idx === 0 ? anchorRef : undefined}
                    onClick={(e) => handleWordClick(char, e)}
                    className="cursor-pointer transition-colors"
                    style={{ borderRadius: '2px' }}
                    onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'rgba(201,160,99,0.15)')}
                    onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                  >
                    {char}
                  </span>
                ))}
              </p>
            );
          })}
      </div>
    </div>
  );

  // Mobile: Tab interface
  if (isMobile) {
    return (
      <div className="flex flex-col h-full" style={{ backgroundColor: 'var(--gf-bg)' }}>
        <div className="flex items-center justify-between border-b px-4 py-2" style={{ borderColor: 'rgba(26,30,35,0.06)', backgroundColor: 'rgba(255,255,255,0.45)' }}>
          <span className="text-xs" style={{ color: 'rgba(26,30,35,0.45)' }}>
            阅读进度会自动记录
          </span>
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
              onClick={() => setActiveTab(tab.key)}
              className="flex-1 py-3 px-4 text-sm font-medium transition-colors relative"
              style={{
                color: activeTab === tab.key ? 'var(--gf-gugong-red)' : 'rgba(26,30,35,0.4)',
              }}
            >
              {tab.label}
              {activeTab === tab.key && (
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
          {activeTab === 'original' && renderText(currentDocument.originalText, '原文')}
          {activeTab === 'punctuated' && currentDocument.punctuatedText && renderText(currentDocument.punctuatedText, '标点文')}
          {activeTab === 'translated' && currentDocument.translatedText && renderText(currentDocument.translatedText, '白话译')}
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
          <div className="text-xs" style={{ color: 'rgba(26,30,35,0.45)' }}>
            当前文档：{currentDocument.title}
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
      <ScrollSync>
        <div className={`grid h-full gap-4 p-4 ${sidePanel ? 'grid-cols-[1fr_1fr_1fr_320px]' : 'grid-cols-3'}`}>
          <ScrollSyncPane>
            <div
              className="overflow-y-auto h-full rounded-xl shadow-sm p-4"
              style={{ backgroundColor: 'rgba(255,255,255,0.6)', border: '1px solid rgba(26,30,35,0.06)' }}
              onScroll={(e) => {
                const target = e.currentTarget;
                reportProgress(target.scrollTop, target.scrollHeight, target.clientHeight);
              }}
            >
              {renderText(currentDocument.originalText, '原文')}
            </div>
          </ScrollSyncPane>

          <ScrollSyncPane>
            <div
              className="overflow-y-auto h-full rounded-xl shadow-sm p-4"
              style={{ backgroundColor: 'rgba(255,255,255,0.6)', border: '1px solid rgba(26,30,35,0.06)' }}
            >
              {currentDocument.punctuatedText
                ? renderText(currentDocument.punctuatedText, '标点文')
                : <p style={{ color: 'rgba(26,30,35,0.3)' }}>暂无标点文</p>
              }
            </div>
          </ScrollSyncPane>

          <ScrollSyncPane>
            <div
              className="overflow-y-auto h-full rounded-xl shadow-sm p-4"
              style={{ backgroundColor: 'rgba(255,255,255,0.6)', border: '1px solid rgba(26,30,35,0.06)' }}
            >
              {currentDocument.translatedText
                ? renderText(currentDocument.translatedText, '白话译')
                : <p style={{ color: 'rgba(26,30,35,0.3)' }}>暂无白话译</p>
              }
            </div>
          </ScrollSyncPane>

          {sidePanel && (
            <div className="overflow-y-auto h-full">
              {sidePanel === 'notes' ? (
                <ReaderNotesPanel documentId={currentDocument.id} documentTitle={currentDocument.title} />
              ) : (
                <StudyCardsPanel documentId={currentDocument.id} />
              )}
            </div>
          )}
        </div>
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
