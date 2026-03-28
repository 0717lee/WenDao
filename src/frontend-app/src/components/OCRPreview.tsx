import { useState, useEffect } from 'react';
import { CheckCircle, AlertCircle } from 'lucide-react';
import { useDocumentStore } from '../store/useDocumentStore';
import { API_BASE } from '../lib/api';

export function OCRPreview() {
  const { currentDocument, setDocument, uploadStatus, setUploadStatus, processProgress, setProcessProgress } = useDocumentStore();
  const [editedText, setEditedText] = useState('');

  useEffect(() => {
    if (currentDocument?.originalText) {
      setEditedText(currentDocument.originalText);
    }
  }, [currentDocument?.originalText]);

  const handleProcess = async () => {
    if (!currentDocument) return;

    setUploadStatus('processing');
    setProcessProgress('正在断句标点...');

    try {
      const saveResponse = await fetch(`${API_BASE}/api/v1/documents/${currentDocument.id}/text`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: editedText.trim() }),
      });

      if (!saveResponse.ok) {
        throw new Error('保存校对文本失败');
      }

      const eventSource = new EventSource(`${API_BASE}/api/v1/documents/process/${currentDocument.id}`);

      eventSource.addEventListener('progress', (e) => {
        const data = JSON.parse(e.data);
        setProcessProgress(data.status || data.message || '处理中...');
      });

      eventSource.addEventListener('done', (e) => {
        const data = JSON.parse(e.data);
        setDocument({
          ...currentDocument,
          originalText: editedText, // Use edited text
          punctuatedText: data.punctuated,
          translatedText: data.translated,
        });
        setUploadStatus('done');
        setProcessProgress('');
        eventSource.close();
      });

      eventSource.addEventListener('error', (e) => {
        console.error('SSE error:', e);
        setUploadStatus('error');
        setProcessProgress('处理失败，请重试');
        eventSource.close();
      });
    } catch (error) {
      console.error('Process error:', error);
      setUploadStatus('error');
      setProcessProgress('处理失败，请重试');
    }
  };

  if (!currentDocument) return null;

  const confidenceColor = (confidence?: number) => {
    if (!confidence) return 'text-gray-500';
    if (confidence >= 0.9) return 'text-green-600';
    if (confidence >= 0.7) return 'text-yellow-600';
    return 'text-red-600';
  };

  return (
    <div className="relative h-full p-4 md:p-6" style={{ backgroundColor: 'var(--gf-bg)' }}>
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute left-[8%] top-8 h-60 w-60 rounded-full blur-3xl" style={{ backgroundColor: 'rgba(201,160,99,0.12)' }} />
        <div className="absolute right-[10%] top-16 h-72 w-72 rounded-full blur-3xl" style={{ backgroundColor: 'rgba(140,26,17,0.06)' }} />
      </div>

      <div className="relative max-w-7xl mx-auto h-full flex flex-col">
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
            OCR 校对
          </div>
          <h2 className="text-xl font-medium mb-1" style={{ color: 'var(--gf-text)' }}>先校对识别结果，再继续整理</h2>
          <p className="text-sm" style={{ color: 'rgba(26,30,35,0.45)' }}>
            请检查识别结果，如有错误可手动修改，然后点击"继续处理"进行断句和翻译
          </p>
        </div>

        {/* Two-column layout */}
        <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-4 overflow-hidden">
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
                  className="max-w-full max-h-full object-contain"
                />
              ) : (
                <p style={{ color: 'rgba(26,30,35,0.3)' }}>无图片预览</p>
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
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-base font-medium" style={{ color: 'var(--gf-text)' }}>OCR 文本</h3>
              {currentDocument.confidence !== undefined && (
                <div className="flex items-center gap-2 rounded-full px-3 py-1" style={{ backgroundColor: 'rgba(255,255,255,0.72)' }}>
                  <span className="text-sm" style={{ color: 'rgba(26,30,35,0.45)' }}>置信度:</span>
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
              className="flex-1 w-full p-4 rounded-[22px] resize-none focus:outline-none focus:ring-2 text-sm"
              style={{
                backgroundColor: 'rgba(255,255,255,0.78)',
                border: '1px solid rgba(26,30,35,0.08)',
                color: 'var(--gf-text)',
                '--tw-ring-color': 'rgba(140,26,17,0.2)',
              } as React.CSSProperties}
              placeholder="OCR 识别的文本将显示在这里..."
              disabled={uploadStatus === 'processing'}
            />

            {/* Process button */}
            <div className="mt-4 flex flex-col gap-3">
              {processProgress && (
                <div className="flex items-center gap-2 text-sm rounded-full px-3 py-1.5 w-fit" style={{ color: 'rgba(26,30,35,0.55)', backgroundColor: 'rgba(255,255,255,0.72)' }}>
                  <div className="w-4 h-4 border-2 rounded-full animate-spin" style={{ borderColor: 'rgba(26,30,35,0.1)', borderTopColor: 'var(--gf-gugong-red)' }} />
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
                    处理中...
                  </>
                ) : (
                  '继续处理'
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
