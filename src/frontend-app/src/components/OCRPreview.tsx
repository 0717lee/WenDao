import { useState, useEffect, useRef } from 'react';
import { ArrowLeft, CheckCircle, AlertCircle } from 'lucide-react';
import { useDocumentStore } from '../store/useDocumentStore';
import { API_BASE } from '../lib/api';
import { authFetchOptions } from '../store/useAuthStore';
import { EmptyState } from './EmptyState';

export function OCRPreview() {
  const { currentDocument, setDocument, clearCurrentDocument, uploadStatus, setUploadStatus, processProgress, setProcessProgress } = useDocumentStore();
  const [editedText, setEditedText] = useState('');
  const eventSourceRef = useRef<EventSource | null>(null);
  const requestControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (currentDocument?.originalText) {
      setEditedText(currentDocument.originalText);
    }
  }, [currentDocument?.originalText]);

  useEffect(() => {
    return () => {
      requestControllerRef.current?.abort();
      eventSourceRef.current?.close();
      if (useDocumentStore.getState().uploadStatus === 'processing') {
        setUploadStatus('error');
        setProcessProgress('整理连接已关闭，可以重新整理这篇内容。');
      }
    };
  }, []);

  const handleProcess = async () => {
    if (!currentDocument || uploadStatus === 'processing') return;
    const controller = new AbortController();
    requestControllerRef.current = controller;
    useDocumentStore.getState().updateDocument({ originalText: editedText });

    setUploadStatus('processing');
    setProcessProgress('正在补标点并整理内容...');

    try {
      const saveResponse = await fetch(`${API_BASE}/api/v1/documents/${currentDocument.id}/text`, authFetchOptions({
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: editedText.trim() }),
        signal: controller.signal,
      }));

      if (controller.signal.aborted) return;

      if (!saveResponse.ok) {
        throw new Error('保存校对文本失败');
      }

      const eventSource = new EventSource(`${API_BASE}/api/v1/documents/process/${currentDocument.id}`, { withCredentials: true });
      eventSourceRef.current = eventSource;

      eventSource.addEventListener('progress', (e) => {
        if (controller.signal.aborted) return;
        const data = JSON.parse(e.data);
        setProcessProgress(data.status || data.message || '正在继续整理内容...');
      });

      eventSource.addEventListener('done', (e) => {
        if (controller.signal.aborted) return;
        const data = JSON.parse(e.data);
        setDocument({
          ...currentDocument,
          originalText: editedText,
          punctuatedText: data.punctuated,
          translatedText: data.translated,
        });
        setUploadStatus('done');
        setProcessProgress('');
        eventSource.close();
        eventSourceRef.current = null;
      });

      eventSource.addEventListener('error', (e) => {
        if (controller.signal.aborted) return;
        console.error('SSE error:', e);
        setUploadStatus('error');
        setProcessProgress('整理没有完成，请稍后再试一次');
        eventSource.close();
        eventSourceRef.current = null;
      });
    } catch (error) {
      if (controller.signal.aborted) return;
      console.error('Process error:', error);
      setUploadStatus('error');
      setProcessProgress('整理没有完成，请稍后再试一次');
    }
  };

  if (!currentDocument) return null;

  const confidenceColor = (confidence?: number) => {
    if (confidence === undefined) return 'text-gray-500';
    if (confidence >= 0.9) return 'text-green-600';
    if (confidence >= 0.7) return 'text-yellow-600';
    return 'text-red-600';
  };

  return (
    <div className="relative h-full overflow-y-auto p-4 md:p-6" style={{ backgroundColor: 'var(--gf-bg)' }}>
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute left-[8%] top-8 h-60 w-60 rounded-full blur-3xl" style={{ backgroundColor: 'rgba(201,160,99,0.12)' }} />
        <div className="absolute right-[10%] top-16 h-72 w-72 rounded-full blur-3xl" style={{ backgroundColor: 'rgba(140,26,17,0.06)' }} />
      </div>

      <div className="relative max-w-7xl mx-auto min-h-full flex flex-col">
        <button type="button" onClick={clearCurrentDocument} disabled={uploadStatus === 'processing'} className="mb-3 inline-flex items-center gap-2 self-start rounded-xl px-3 py-2 text-sm disabled:opacity-50">
          <ArrowLeft className="h-4 w-4" />返回书架
        </button>
        {/* Header */}
        <div
          className="mb-4 rounded-[28px] px-5 py-4 md:px-6"
          style={{
            background: 'linear-gradient(135deg, rgba(255,255,255,0.84) 0%, rgba(248,244,233,0.96) 100%)',
            border: '1px solid rgba(201,160,99,0.14)',
            boxShadow: '0 18px 34px rgba(26,30,35,0.04)',
          }}
        >
          <div className="text-[11px] tracking-[0.28em] mb-2" style={{ color: 'var(--gf-gold)' }}>
            图片转文字
          </div>
          <h2 className="text-xl font-medium mb-1" style={{ color: 'var(--gf-text)' }}>先看一眼识别结果，再继续处理</h2>
          <p className="text-sm" style={{ color: 'rgba(26,30,35,0.45)' }}>
            如果识别得不太对，可以先直接改。确认后再继续整理，系统会补标点并整理成可继续阅读的文本。
          </p>
        </div>

        {/* Two-column layout */}
        <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Left: Image preview */}
          <div
            className="rounded-[28px] shadow-sm p-4 flex flex-col"
            style={{
              background: 'linear-gradient(180deg, rgba(255,255,255,0.82) 0%, rgba(248,244,233,0.96) 100%)',
              border: '1px solid rgba(201,160,99,0.12)',
              boxShadow: '0 18px 34px rgba(26,30,35,0.04)',
            }}
          >
            <h3 className="text-base font-medium mb-3" style={{ color: 'var(--gf-text)' }}>原图预览</h3>
            <div className="flex-1 flex items-center justify-center rounded-[22px] overflow-hidden" style={{ backgroundColor: 'rgba(255,255,255,0.72)', border: '1px solid rgba(26,30,35,0.05)' }}>
              {currentDocument.imageUrl ? (
                <img
                  src={currentDocument.imageUrl}
                  alt="上传的古籍图片"
                  className="max-w-full max-h-64 md:max-h-[60vh] object-contain"
                />
              ) : (
                <EmptyState
                  illustration="scroll"
                  title="这里暂时没有可预览的图片"
                  description="回到书架上传一张影印页，识读完成后会在此显示。"
                  compact
                />
              )}
            </div>
          </div>

          {/* Right: OCR text with editing */}
          <div
            className="rounded-[28px] shadow-sm p-4 flex flex-col"
            style={{
              background: 'linear-gradient(180deg, rgba(255,255,255,0.84) 0%, rgba(250,239,236,0.96) 100%)',
              border: '1px solid rgba(140,26,17,0.10)',
              boxShadow: '0 18px 34px rgba(26,30,35,0.04)',
            }}
          >
            <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
              <h3 className="text-base font-medium" style={{ color: 'var(--gf-text)' }}>识别出的文字</h3>
              {currentDocument.confidence !== undefined && (
                <div className="flex items-center gap-2 rounded-full px-3 py-1" style={{ backgroundColor: 'rgba(255,255,255,0.72)' }}>
                  <span className="text-sm" style={{ color: 'rgba(26,30,35,0.45)' }}>识别准确度：</span>
                  <span className={`text-sm font-semibold ${confidenceColor(currentDocument.confidence)}`}>
                    {(currentDocument.confidence * 100).toFixed(1)}%
                  </span>
                  {currentDocument.confidence >= 0.9 ? (
                    <CheckCircle className="w-4 h-4 text-green-600" />
                  ) : currentDocument.confidence < 0.7 ? (
                    <AlertCircle className="w-4 h-4 text-red-600" />
                  ) : null}
                </div>
              )}
            </div>

            <textarea
              value={editedText}
              onChange={(e) => setEditedText(e.target.value)}
              aria-label="校对识别文字"
              className="min-h-48 flex-1 w-full p-4 rounded-[22px] resize-y focus:outline-none focus:ring-2 text-sm"
              style={{
                backgroundColor: 'rgba(255,255,255,0.78)',
                border: '1px solid rgba(26,30,35,0.08)',
                color: 'var(--gf-text)',
                '--tw-ring-color': 'rgba(140,26,17,0.2)',
              } as React.CSSProperties}
              placeholder="识别出的文字会先显示在这里，确认后再继续整理"
              disabled={uploadStatus === 'processing'}
            />

            {/* Process button */}
            <div className="mt-4 flex flex-col gap-3">
              {processProgress && (
                <div role={uploadStatus === 'error' ? 'alert' : 'status'} className="flex items-center gap-2 text-sm rounded-xl px-3 py-2 w-fit" style={{ color: uploadStatus === 'error' ? '#b03a3a' : 'var(--gf-muted)', backgroundColor: 'rgba(255,255,255,0.72)' }}>
                  {uploadStatus === 'processing' && <div className="shrink-0 w-4 h-4 border-2 rounded-full animate-spin" style={{ borderColor: 'rgba(26,30,35,0.1)', borderTopColor: 'var(--gf-gugong-red)' }} />}
                  <span>{processProgress}</span>
                </div>
              )}
              <button
                onClick={handleProcess}
                disabled={uploadStatus === 'processing' || !editedText.trim()}
                className="w-full py-3.5 text-white rounded-[22px] font-medium transition-all duration-300 flex items-center justify-center gap-2 disabled:opacity-40"
                style={{ backgroundColor: 'var(--gf-gugong-red)', boxShadow: '0 14px 26px rgba(140,26,17,0.22)' }}
              >
                {uploadStatus === 'processing' ? (
                  <>
                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    正在继续整理
                  </>
                ) : (
                  uploadStatus === 'error' ? '重新整理这篇内容' : '继续整理这篇内容'
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
