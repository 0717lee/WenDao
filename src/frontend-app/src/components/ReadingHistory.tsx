import React, { useState, useEffect } from 'react';
import { BookOpen } from 'lucide-react';
import { API_BASE } from '../lib/api';
import { authHeaders } from '../store/useAuthStore';

interface HistoryItem {
  id: string;
  title: string;
  current_paragraph: number;
  total_paragraphs: number;
  last_read_at: string;
}

interface ReadingHistoryProps {
  onNavigate?: (documentId: string) => void;
}

const ReadingHistory: React.FC<ReadingHistoryProps> = ({ onNavigate }) => {
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchHistory();
  }, []);

  const fetchHistory = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`${API_BASE}/api/v1/reader/history`, { headers: authHeaders() });
      if (!response.ok) throw new Error('Failed to fetch history');
      const data = await response.json();
      setHistory(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load history');
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 60) return `${diffMins}分钟前`;
    if (diffHours < 24) return `${diffHours}小时前`;
    if (diffDays < 7) return `${diffDays}天前`;
    return date.toLocaleDateString('zh-CN');
  };

  const getProgressPercent = (current: number, total: number) => {
    if (total === 0) return 0;
    return Math.round((current / total) * 100);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full" style={{ backgroundColor: 'var(--gf-bg)' }}>
        <div className="w-8 h-8 border-2 rounded-full animate-spin" style={{ borderColor: 'rgba(26,30,35,0.1)', borderTopColor: 'var(--gf-gugong-red)' }} />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col h-full" style={{ backgroundColor: 'var(--gf-bg)' }}>
        <div className="flex-1 overflow-y-auto p-4 md:p-6">
          <div className="mb-4 md:mb-5">
            <h2 className="text-xl font-medium" style={{ color: 'var(--gf-text)' }}>学习进度</h2>
          </div>
          <div className="text-center mt-16 opacity-35">
            <BookOpen className="w-14 h-14 mx-auto mb-4" style={{ color: 'var(--gf-text)' }} />
            <p style={{ color: 'var(--gf-text)' }}>暂无阅读记录</p>
            <p className="mt-2 text-sm" style={{ color: 'rgba(26,30,35,0.5)' }}>
              阅读文档后，进度会自动记录在这里。
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full" style={{ backgroundColor: 'var(--gf-bg)' }}>
      <div className="flex-1 overflow-y-auto p-4 md:p-6">
        <div className="mb-4 md:mb-5">
          <h2 className="text-xl font-medium" style={{ color: 'var(--gf-text)' }}>
            学习进度
          </h2>
          <p className="text-sm" style={{ color: 'rgba(26,30,35,0.45)' }}>
            这里会记下你读过的样例和文档，方便下次接着读。
          </p>
        </div>
        {history.length === 0 ? (
          <div className="text-center mt-16 opacity-35">
            <BookOpen className="w-14 h-14 mx-auto mb-4" style={{ color: 'var(--gf-text)' }} />
            <p style={{ color: 'var(--gf-text)' }}>暂无阅读记录</p>
            <p className="mt-2 text-sm" style={{ color: 'rgba(26,30,35,0.5)' }}>
              可以先打开一篇体验样例，或上传一张古籍图片开始阅读。
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {history.map((item) => {
              const progress = getProgressPercent(item.current_paragraph, item.total_paragraphs);
              return (
                <div
                  key={item.id}
                  className="rounded-xl p-4 transition-all cursor-pointer hover:shadow-md"
                  style={{
                    backgroundColor: 'rgba(255,255,255,0.6)',
                    border: '1px solid rgba(26,30,35,0.06)',
                  }}
                  onClick={() => {
                    if (onNavigate) {
                      onNavigate(item.id);
                    }
                  }}
                >
                  <div className="flex items-start justify-between mb-2">
                    <h3 className="font-medium flex-1" style={{ color: 'var(--gf-text)' }}>{item.title}</h3>
                    <span className="text-sm ml-4" style={{ color: 'rgba(26,30,35,0.35)' }}>
                      {formatDate(item.last_read_at)}
                    </span>
                  </div>

                  <div className="flex items-center gap-3">
                    <div className="flex-1 rounded-full h-1.5 overflow-hidden" style={{ backgroundColor: 'rgba(26,30,35,0.06)' }}>
                      <div
                        className="h-full rounded-full transition-all"
                        style={{ width: `${progress}%`, backgroundColor: 'var(--gf-gold)' }}
                      />
                    </div>
                    <span className="text-xs whitespace-nowrap" style={{ color: 'rgba(26,30,35,0.4)' }}>
                      {item.current_paragraph}/{item.total_paragraphs} ({progress}%)
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default ReadingHistory;
