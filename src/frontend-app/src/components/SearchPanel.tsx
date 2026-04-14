import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, Loader2, RefreshCcw, X } from 'lucide-react';
import { API_BASE } from '../lib/api';
import { useDocumentStore } from '../store/useDocumentStore';
import { useGraphStore } from '../store/useGraphStore';
import { useStore } from '../store/useStore';
import { authFetchOptions } from '../store/useAuthStore';

interface SearchResult {
  id: string;
  document_id?: string | null;
  title: string;
  content: string;
  source: string;
  score: number;
  anchor_text?: string | null;
}

interface SearchResponse {
  results: SearchResult[];
  mode: string;
  total: number;
}

type SearchMode = 'FULLTEXT' | 'VECTOR' | 'HYBRID';

interface SearchPanelProps {
  onOpenDocument?: (documentId: string) => void;
  onAsk?: (prompt: string) => void;
}

const SEARCH_QUERY_POOL = [
  '孔子怎样理解“仁”与“礼”',
  '“学而时习之”到底在讲什么',
  '《逍遥游》里的“大鹏”想表达什么',
  '孟子为什么强调“舍生取义”',
  '《道德经》第一章适合怎么入门',
  '“关关雎鸠”背后的典故和情感',
  '《礼记》里有哪些适合初学者的句子',
  '“君子不器”放在今天怎么理解',
  '庄子为什么会讲“齐物”',
  '《论语·学而》有哪些值得先读的片段',
  '“道法自然”在古籍里原本是什么意思',
  '孔子和孟子对于“义”有什么共同点',
];

const SUGGESTION_COUNT = 5;

function pickSuggestedQueries(previous: string[] = []) {
  const pool = [...SEARCH_QUERY_POOL];

  for (let index = pool.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [pool[index], pool[swapIndex]] = [pool[swapIndex], pool[index]];
  }

  const next = pool.slice(0, SUGGESTION_COUNT);
  const sameAsPrevious =
    previous.length === next.length && previous.every((item, index) => item === next[index]);

  if (sameAsPrevious) {
    next.push(next.shift()!);
  }

  return next;
}

const SearchPanel: React.FC<SearchPanelProps> = ({ onOpenDocument, onAsk }) => {
  const [query, setQuery] = useState('');
  const [mode, setMode] = useState<SearchMode>('FULLTEXT');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedResult, setSelectedResult] = useState<SearchResult | null>(null);
  const consumeSearchQuery = useGraphStore((state) => state.consumeSearchQuery);
  const setActiveTab = useGraphStore((state) => state.setActiveTab);
  const setPendingAnchorText = useDocumentStore((state) => state.setPendingAnchorText);
  const setDraftMessage = useStore((state) => state.setDraftMessage);
  const [suggestedQueries, setSuggestedQueries] = useState(() => pickSuggestedQueries());

  const reshuffleSuggestions = () => {
    setSuggestedQueries((previous) => pickSuggestedQueries(previous));
  };

  const handleSearch = async (forcedQuery?: string) => {
    const nextQuery = (forcedQuery ?? query).trim();
    if (!nextQuery) {
      setError('先输入一句原文，或一个人物、典故。');
      return;
    }

    if (forcedQuery !== undefined) {
      setQuery(nextQuery);
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch(
        `${API_BASE}/api/v1/search?q=${encodeURIComponent(nextQuery)}&mode=${mode}&limit=10`,
        authFetchOptions()
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || '搜索失败');
      }

      const data: SearchResponse = await response.json();
      setResults(data.results);
    } catch (err) {
      const message = err instanceof Error ? err.message : '搜索服务暂时不可用';
      setError(
        message.includes('Failed to fetch')
          ? '检索服务暂时不可用，请稍后再试，或先回到阅读页继续读。'
          : message
      );
      setResults([]);
    } finally {
      setLoading(false);
    }
  };

  React.useEffect(() => {
    const queued = consumeSearchQuery();
    if (queued) {
      handleSearch(queued);
    }
  }, [consumeSearchQuery]);

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSearch();
    }
  };

  const openQuestionAnswer = (prompt: string) => {
    if (onAsk) {
      onAsk(prompt);
      return;
    }
    setDraftMessage(prompt);
    setActiveTab('chat');
  };

  const jumpToChatExplanation = () => {
    const nextPrompt = query.trim()
      ? `请用最简单的话解释“${query.trim()}”相关的古籍内容，并说明它为什么重要`
      : '请用最简单的话解释一段古文，并顺手补充它的背景和关键词';
    openQuestionAnswer(nextPrompt);
  };

  const openResultDocument = (result: SearchResult) => {
    if (!result.document_id) return;
    if (result.anchor_text) {
      setPendingAnchorText(result.anchor_text);
    }
    setSelectedResult(null);
    onOpenDocument?.(String(result.document_id));
  };

  return (
    <div className="relative flex flex-col h-full" style={{ backgroundColor: 'var(--gf-bg)' }}>
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute left-[10%] top-10 h-64 w-64 rounded-full blur-3xl" style={{ backgroundColor: 'rgba(201,160,99,0.12)' }} />
        <div className="absolute right-[8%] top-28 h-72 w-72 rounded-full blur-3xl" style={{ backgroundColor: 'rgba(140,26,17,0.07)' }} />
      </div>
      {/* Search Header */}
      <div
        className="relative m-4 mb-0 md:m-6 md:mb-0 rounded-[30px] p-4 md:p-6"
        style={{
          border: '1px solid rgba(26,30,35,0.06)',
          background: 'linear-gradient(135deg, rgba(255,255,255,0.86) 0%, rgba(248,244,233,0.96) 100%)',
          boxShadow: '0 20px 42px rgba(26,30,35,0.05)',
        }}
      >
        <div className="mb-4">
          <div className="text-[11px] tracking-[0.28em] mb-2" style={{ color: 'var(--gf-gold)' }}>
            原文检索
          </div>
          <h2 className="text-lg font-medium" style={{ color: 'var(--gf-text)' }}>
            查一句原文，直接定位到篇章
          </h2>
          <p className="text-sm" style={{ color: 'rgba(26,30,35,0.45)' }}>
            这里专门负责定位原文；如果你想延伸解释、追问背景，再转去 AI 问答。
          </p>
        </div>

        {/* Search Input */}
        <div className="flex gap-2 mb-3">
          <div className="flex-1 relative">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleKeyPress}
              placeholder="贴一句原文，或搜人物、典故、概念"
              className="gf-input w-full px-4 py-3 pl-10 rounded-[22px] text-sm"
              style={{
                color: 'var(--gf-text)',
              } as React.CSSProperties}
            />
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: 'rgba(26,30,35,0.3)' }} />
          </div>
          <button
            onClick={() => handleSearch()}
            disabled={loading}
            className="px-5 py-3 text-white rounded-[22px] text-sm font-medium transition-all duration-300 flex items-center gap-2 disabled:opacity-50"
            style={{ backgroundColor: 'var(--gf-gugong-red)', boxShadow: '0 12px 24px rgba(140,26,17,0.18)' }}
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                正在检索
              </>
            ) : (
              <>
                <Search className="w-4 h-4" />
                搜索
              </>
            )}
          </button>
        </div>

        <div className="grid gap-2 md:grid-cols-3">
          {[
            { value: 'FULLTEXT' as SearchMode, label: '原句检索', desc: '最快，适合记得原句时' },
            { value: 'VECTOR' as SearchMode, label: '大意检索', desc: '适合只记得意思时' },
            { value: 'HYBRID' as SearchMode, label: '综合检索', desc: '效果最稳，但会更慢一些' },
          ].map((item) => (
            <label
              key={item.value}
              className="flex min-h-[4.5rem] items-center gap-1.5 cursor-pointer rounded-2xl px-3 py-2"
              style={{ color: 'rgba(26,30,35,0.55)', backgroundColor: 'rgba(255,255,255,0.58)' }}
            >
              <input
                type="radio"
                value={item.value}
                checked={mode === item.value}
                onChange={(event) => setMode(event.target.value as SearchMode)}
                className="w-3.5 h-3.5"
                style={{ accentColor: 'var(--gf-gugong-red)' }}
              />
              <div className="flex flex-col">
                <span className="text-sm" style={{ fontFamily: '"Noto Serif SC", serif' }}>{item.label}</span>
                <span className="text-xs opacity-60">{item.desc}</span>
              </div>
            </label>
          ))}
        </div>

        <div className="mt-4 flex items-center justify-between gap-3">
          <div className="text-xs" style={{ color: 'rgba(26,30,35,0.42)' }}>
            一时找不到，也可以转去 AI 问答继续问。
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={jumpToChatExplanation}
              className="inline-flex min-w-[7.5rem] justify-center items-center gap-1.5 rounded-full px-3 py-1.5 text-xs transition-all duration-300 hover:-translate-y-0.5"
              style={{ border: '1px solid rgba(140,26,17,0.12)', color: 'var(--gf-gugong-red)', backgroundColor: 'rgba(140,26,17,0.06)' }}
            >
              转到 AI 问答
            </button>
            <button
              type="button"
              onClick={reshuffleSuggestions}
              className="inline-flex min-w-[7.5rem] justify-center items-center gap-1.5 rounded-full px-3 py-1.5 text-xs transition-all duration-300 hover:-translate-y-0.5"
              style={{ border: '1px solid rgba(26,30,35,0.08)', color: 'rgba(26,30,35,0.62)', backgroundColor: 'rgba(255,255,255,0.72)' }}
            >
              <RefreshCcw className="h-3.5 w-3.5" />
              换一组
            </button>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          {suggestedQueries.map((item) => (
            <button
              key={item}
              onClick={() => handleSearch(item)}
              className="rounded-full px-3 py-1.5 text-xs transition-all duration-300 hover:-translate-y-0.5"
              style={{ border: '1px solid rgba(26,30,35,0.08)', color: 'var(--gf-text)', backgroundColor: 'rgba(255,255,255,0.72)' }}
            >
              {item}
            </button>
          ))}
        </div>
      </div>

      {/* Error Message */}
      {error && (
        <div className="mx-4 md:mx-6 mt-4 p-3 rounded-[22px] text-sm" style={{ backgroundColor: 'rgba(176,58,58,0.08)', border: '1px solid rgba(176,58,58,0.15)', color: '#b03a3a' }}>
          <div>{error}</div>
          {error.includes('检索服务') && (
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                onClick={() => setActiveTab('reader')}
                className="rounded-full px-3 py-1.5 text-xs transition-colors"
                style={{ backgroundColor: 'rgba(255,255,255,0.76)', color: '#8c1a11', border: '1px solid rgba(140,26,17,0.12)' }}
              >
                打开阅读页
              </button>
              <button
                onClick={reshuffleSuggestions}
                className="rounded-full px-3 py-1.5 text-xs transition-colors"
                style={{ backgroundColor: 'rgba(255,255,255,0.76)', color: '#8c1a11', border: '1px solid rgba(140,26,17,0.12)' }}
              >
                换一组关键词
              </button>
            </div>
          )}
        </div>
      )}

      {/* Search Results */}
      <div className="relative flex-1 overflow-y-auto p-4 md:p-6">
        {results.length === 0 && !loading && !error && !query && (
          <div className="text-center mt-20 opacity-35">
            <Search className="w-14 h-14 mx-auto mb-4" style={{ color: 'var(--gf-text)' }} />
            <p style={{ color: 'var(--gf-text)' }}>贴一句原文，或输入你记得的人物、典故，开始检索。</p>
          </div>
        )}

        {results.length === 0 && !loading && !error && !!query && (
          <div className="text-center mt-20 opacity-45">
            <Search className="w-14 h-14 mx-auto mb-4" style={{ color: 'var(--gf-text)' }} />
            <p className="mb-3" style={{ color: 'var(--gf-text)' }}>
              没找到和“{query}”直接相关的内容
            </p>
            <p className="text-sm mb-4" style={{ color: 'rgba(26,30,35,0.45)' }}>
              可以试试人物名、典故名，或把原句写得更完整一点。
            </p>
            <div className="flex justify-center flex-wrap gap-2">
              {suggestedQueries.map((item) => (
                <button
                  key={`empty-${item}`}
                  onClick={() => handleSearch(item)}
                  className="rounded-full px-3 py-1.5 text-xs transition-colors hover:bg-[rgba(201,160,99,0.18)]"
                  style={{ border: '1px solid rgba(26,30,35,0.08)', color: 'var(--gf-text)' }}
                >
                  {item}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="space-y-3">
          {results.map((result) => (
            <div
              key={result.id}
              onClick={() => setSelectedResult(result)}
              className="p-4 rounded-[24px] transition-all duration-300 cursor-pointer hover:-translate-y-0.5"
              style={{
                background: 'linear-gradient(180deg, rgba(255,255,255,0.82) 0%, rgba(248,244,233,0.96) 100%)',
                border: '1px solid rgba(26,30,35,0.06)',
                boxShadow: '0 14px 30px rgba(26,30,35,0.04)',
              }}
            >
              <div className="flex justify-between items-start mb-2">
                <h3 className="text-base font-medium" style={{ color: 'var(--gf-text)' }}>{result.title}</h3>
              </div>
              <p className="text-sm mb-2 line-clamp-2" style={{ color: 'rgba(26,30,35,0.6)' }}>
                {result.content.substring(0, 100)}...
              </p>
              <div className="text-xs" style={{ color: 'rgba(26,30,35,0.35)' }}>
                {result.source || '未知'}
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    openResultDocument(result);
                  }}
                  disabled={!onOpenDocument || !result.document_id}
                  className="inline-flex min-w-[7.5rem] justify-center rounded-full px-3 py-1.5 text-xs transition-all duration-300 disabled:cursor-not-allowed disabled:opacity-45"
                  style={{ backgroundColor: 'rgba(201,160,99,0.12)', color: 'var(--gf-gold)' }}
                >
                  {result.document_id ? '打开原文' : '暂时不能直接打开'}
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Detail Modal */}
      <AnimatePresence>
        {selectedResult && (
          <motion.div
            key="search-detail-backdrop"
            className="fixed inset-0 flex items-center justify-center z-50 p-4"
            style={{ backgroundColor: 'rgba(26,30,35,0.5)', backdropFilter: 'blur(8px)' }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.22 }}
            onClick={() => setSelectedResult(null)}
          >
            <motion.div
              className="glass-card rounded-[30px] max-w-3xl w-full max-h-[80vh] overflow-hidden"
              style={{ boxShadow: '0 32px 64px rgba(26,30,35,0.14)' }}
              initial={{ opacity: 0, scale: 0.92, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 10 }}
              transition={{ type: 'spring' as const, stiffness: 300, damping: 26 }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="p-6 border-b flex justify-between items-start" style={{ borderColor: 'rgba(26,30,35,0.06)' }}>
                <div>
                  <h2 className="text-xl font-medium mb-1" style={{ color: 'var(--gf-text)' }}>
                    {selectedResult.title}
                  </h2>
                  <p className="text-sm" style={{ color: 'rgba(26,30,35,0.4)' }}>
                    {selectedResult.source || '未知'}
                  </p>
                </div>
                <button
                  onClick={() => setSelectedResult(null)}
                  className="p-2 rounded-lg transition-colors"
                  style={{ color: 'rgba(26,30,35,0.3)' }}
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="p-6 overflow-y-auto max-h-[60vh]">
                <p className="leading-relaxed whitespace-pre-wrap" style={{ color: 'var(--gf-text)' }}>
                  {selectedResult.content}
                </p>
                <div className="mt-5 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => openResultDocument(selectedResult)}
                    disabled={!onOpenDocument || !selectedResult.document_id}
                    className="inline-flex min-w-[7.5rem] justify-center rounded-full px-4 py-2 text-sm transition-all duration-300 disabled:cursor-not-allowed disabled:opacity-45"
                    style={{ backgroundColor: 'rgba(201,160,99,0.12)', color: 'var(--gf-gold)' }}
                  >
                    {selectedResult.document_id ? '打开原文' : '暂时不能直接打开'}
                  </button>
                </div>
                {!selectedResult.document_id && (
                  <p className="mt-3 text-xs" style={{ color: 'rgba(26,30,35,0.42)' }}>
                    这条结果目前只是一段索引片段，还不能直接打开全文；建议换更完整的原句，或转到 AI 问答继续追背景。
                  </p>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default SearchPanel;
