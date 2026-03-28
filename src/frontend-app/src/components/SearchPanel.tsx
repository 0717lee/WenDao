import React, { useState } from 'react';
import { Search, Loader2, X } from 'lucide-react';
import { API_BASE } from '../lib/api';
import { useGraphStore } from '../store/useGraphStore';

interface SearchResult {
  id: string;
  title: string;
  content: string;
  source: string;
  score: number;
}

interface SearchResponse {
  results: SearchResult[];
  mode: string;
  total: number;
}

type SearchMode = 'FULLTEXT' | 'VECTOR' | 'HYBRID';

const SUGGESTED_QUERIES = ['孔子', '仁义', '逍遥游', '学而时习之'];

const SearchPanel: React.FC = () => {
  const [query, setQuery] = useState('');
  const [mode, setMode] = useState<SearchMode>('HYBRID');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedResult, setSelectedResult] = useState<SearchResult | null>(null);
  const consumeSearchQuery = useGraphStore((state) => state.consumeSearchQuery);

  const handleSearch = async (forcedQuery?: string) => {
    const nextQuery = (forcedQuery ?? query).trim();
    if (!nextQuery) {
      setError('请输入搜索关键词');
      return;
    }

    if (forcedQuery !== undefined) {
      setQuery(nextQuery);
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch(
        `${API_BASE}/api/v1/search?q=${encodeURIComponent(nextQuery)}&mode=${mode}&limit=10`
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || '搜索失败');
      }

      const data: SearchResponse = await response.json();
      setResults(data.results);
    } catch (err) {
      setError(err instanceof Error ? err.message : '搜索服务不可用');
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

  return (
    <div className="flex flex-col h-full" style={{ backgroundColor: 'var(--gf-bg)' }}>
      {/* Search Header */}
      <div className="p-4 md:p-6 border-b" style={{ borderColor: 'rgba(26,30,35,0.06)', backgroundColor: 'rgba(255,255,255,0.4)' }}>
        <div className="mb-4">
          <h2 className="text-lg font-medium" style={{ color: 'var(--gf-text)' }}>
            人物、典故与原句检索
          </h2>
          <p className="text-sm" style={{ color: 'rgba(26,30,35,0.45)' }}>
            适合从人物、概念、典故或一句原文切入，快速找到可继续阅读的入口。
          </p>
        </div>

        {/* Search Input */}
        <div className="flex gap-2 mb-3">
          <div className="flex-1 relative">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder="输入人物、典故、概念或一句原文..."
              className="w-full px-4 py-2.5 pl-10 rounded-xl text-sm focus:outline-none focus:ring-2 transition-shadow"
              style={{
                backgroundColor: 'rgba(255,255,255,0.7)',
                border: '1px solid rgba(26,30,35,0.1)',
                color: 'var(--gf-text)',
                '--tw-ring-color': 'rgba(140,26,17,0.2)',
              } as React.CSSProperties}
            />
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: 'rgba(26,30,35,0.3)' }} />
          </div>
          <button
            onClick={() => handleSearch()}
            disabled={loading}
            className="px-5 py-2.5 text-white rounded-xl text-sm font-medium transition-colors flex items-center gap-2 disabled:opacity-50"
            style={{ backgroundColor: 'var(--gf-gugong-red)' }}
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                搜索中
              </>
            ) : (
              <>
                <Search className="w-4 h-4" />
                搜索
              </>
            )}
          </button>
        </div>

        {/* Search Mode Selection */}
        <div className="flex gap-4">
          {[
            { value: 'FULLTEXT' as SearchMode, label: '精确匹配', desc: '按关键词精确查找' },
            { value: 'VECTOR' as SearchMode, label: '智能理解', desc: '理解语义相关内容' },
            { value: 'HYBRID' as SearchMode, label: '智能搜索', desc: '推荐使用' },
          ].map(opt => (
            <label key={opt.value} className="flex items-center gap-1.5 cursor-pointer group" style={{ color: 'rgba(26,30,35,0.55)' }}>
              <input
                type="radio"
                value={opt.value}
                checked={mode === opt.value}
                onChange={(e) => setMode(e.target.value as SearchMode)}
                className="w-3.5 h-3.5"
                style={{ accentColor: 'var(--gf-gugong-red)' }}
              />
              <div className="flex flex-col">
                <span className="text-sm" style={{ fontFamily: '"Noto Serif SC", serif' }}>{opt.label}</span>
                <span className="text-xs opacity-60">{opt.desc}</span>
              </div>
            </label>
          ))}
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          {SUGGESTED_QUERIES.map((item) => (
            <button
              key={item}
              onClick={() => handleSearch(item)}
              className="rounded-full px-3 py-1.5 text-xs transition-colors hover:bg-[rgba(201,160,99,0.18)]"
              style={{ border: '1px solid rgba(26,30,35,0.08)', color: 'var(--gf-text)' }}
            >
              试试 {item}
            </button>
          ))}
        </div>
      </div>

      {/* Error Message */}
      {error && (
        <div className="mx-4 md:mx-6 mt-4 p-3 rounded-xl text-sm" style={{ backgroundColor: 'rgba(176,58,58,0.08)', border: '1px solid rgba(176,58,58,0.15)', color: '#b03a3a' }}>
          {error}
        </div>
      )}

      {/* Search Results */}
      <div className="flex-1 overflow-y-auto p-4 md:p-6">
        {results.length === 0 && !loading && !error && !query && (
          <div className="text-center mt-20 opacity-35">
            <Search className="w-14 h-14 mx-auto mb-4" style={{ color: 'var(--gf-text)' }} />
            <p style={{ color: 'var(--gf-text)' }}>输入人物、典故或原句开始检索</p>
          </div>
        )}

        {results.length === 0 && !loading && !error && !!query && (
          <div className="text-center mt-20 opacity-45">
            <Search className="w-14 h-14 mx-auto mb-4" style={{ color: 'var(--gf-text)' }} />
            <p className="mb-3" style={{ color: 'var(--gf-text)' }}>
              没有找到“{query}”的结果
            </p>
            <p className="text-sm mb-4" style={{ color: 'rgba(26,30,35,0.45)' }}>
              可以试试人物名、典故名、关键概念，或换成一句更完整的原文。
            </p>
            <div className="flex justify-center flex-wrap gap-2">
              {SUGGESTED_QUERIES.map((item) => (
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
              className="p-4 rounded-xl transition-all cursor-pointer hover:shadow-md"
              style={{
                backgroundColor: 'rgba(255,255,255,0.6)',
                border: '1px solid rgba(26,30,35,0.06)',
              }}
            >
              <div className="flex justify-between items-start mb-2">
                <h3 className="text-base font-medium" style={{ color: 'var(--gf-text)' }}>{result.title}</h3>
                <span className="text-xs font-mono px-2 py-0.5 rounded-full" style={{ backgroundColor: 'rgba(201,160,99,0.12)', color: 'var(--gf-gold)' }}>
                  {(result.score * 100).toFixed(1)}%
                </span>
              </div>
              <p className="text-sm mb-2 line-clamp-2" style={{ color: 'rgba(26,30,35,0.6)' }}>
                {result.content.substring(0, 100)}...
              </p>
              <div className="text-xs" style={{ color: 'rgba(26,30,35,0.35)' }}>
                {result.source || '未知'}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Detail Modal */}
      {selectedResult && (
        <div
          className="fixed inset-0 flex items-center justify-center z-50 p-4"
          style={{ backgroundColor: 'rgba(26,30,35,0.5)', backdropFilter: 'blur(8px)' }}
          onClick={() => setSelectedResult(null)}
        >
          <div
            className="rounded-2xl max-w-3xl w-full max-h-[80vh] overflow-hidden shadow-2xl"
            style={{ backgroundColor: 'var(--gf-bg)', border: '1px solid rgba(26,30,35,0.1)' }}
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
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SearchPanel;
