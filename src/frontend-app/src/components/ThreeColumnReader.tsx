import { useState, useEffect } from 'react';
import { ScrollSync, ScrollSyncPane } from 'react-scroll-sync';
import { useDocumentStore } from '../store/useDocumentStore';
import { WordPopover } from './WordPopover';

export function ThreeColumnReader() {
  const { currentDocument } = useDocumentStore();
  const [selectedWord, setSelectedWord] = useState<string | null>(null);
  const [popoverPosition, setPopoverPosition] = useState<{ x: number; y: number } | null>(null);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  const [activeTab, setActiveTab] = useState<'original' | 'punctuated' | 'translated'>('original');

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 768);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  if (!currentDocument) return null;

  const handleWordClick = (word: string, event: React.MouseEvent) => {
    setSelectedWord(word);
    setPopoverPosition({ x: event.clientX, y: event.clientY });
  };

  const renderText = (text: string, label: string) => (
    <div className="space-y-2">
      <h3
        className="text-base font-medium sticky top-0 py-2 border-b"
        style={{ color: 'var(--gf-text)', backgroundColor: 'rgba(255,255,255,0.9)', borderColor: 'rgba(26,30,35,0.06)', backdropFilter: 'blur(8px)' }}
      >
        {label}
      </h3>
      <div className="leading-relaxed whitespace-pre-wrap" style={{ color: 'var(--gf-text)' }}>
        {text.split('').map((char, idx) => (
          <span
            key={idx}
            onClick={(e) => handleWordClick(char, e)}
            className="cursor-pointer transition-colors"
            style={{ borderRadius: '2px' }}
            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'rgba(201,160,99,0.15)')}
            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
          >
            {char}
          </span>
        ))}
      </div>
    </div>
  );

  // Mobile: Tab interface
  if (isMobile) {
    return (
      <div className="flex flex-col h-full" style={{ backgroundColor: 'var(--gf-bg)' }}>
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
        <div className="flex-1 overflow-y-auto p-4">
          {activeTab === 'original' && renderText(currentDocument.originalText, '原文')}
          {activeTab === 'punctuated' && currentDocument.punctuatedText && renderText(currentDocument.punctuatedText, '标点文')}
          {activeTab === 'translated' && currentDocument.translatedText && renderText(currentDocument.translatedText, '白话译')}
        </div>

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
      <ScrollSync>
        <div className="grid grid-cols-3 gap-4 h-full p-4">
          <ScrollSyncPane>
            <div
              className="overflow-y-auto h-full rounded-xl shadow-sm p-4"
              style={{ backgroundColor: 'rgba(255,255,255,0.6)', border: '1px solid rgba(26,30,35,0.06)' }}
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
