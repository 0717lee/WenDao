import { useCallback, useEffect, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { BookOpen, ScanText, Search, Sparkles, Upload } from 'lucide-react';
import { useDocumentStore } from '../store/useDocumentStore';
import { useGraphStore } from '../store/useGraphStore';
import { useStore } from '../store/useStore';
import { API_BASE } from '../lib/api';
import { getDemoBookshelfDocuments, getDemoDocumentById, toReaderDocument } from '../data/demoDocuments';

interface SampleDocument {
  id: string;
  title: string;
  preview: string;
}

const QUICK_QUESTION_PROMPTS = [
  '请用白话解释“学而时习之，不亦说乎？”',
  '《孟子》里为什么总在讲仁义？',
  '《逍遥游》的“鲲鹏”到底想表达什么？',
];

const SEARCH_TOPICS = ['孔子', '孟子', '道', '逍遥游'];

export function DocumentUpload() {
  const { setDocument, setUploadStatus, uploadStatus } = useDocumentStore();
  const setActiveTab = useGraphStore((state) => state.setActiveTab);
  const queueSearchQuery = useGraphStore((state) => state.queueSearchQuery);
  const setDraftMessage = useStore((state) => state.setDraftMessage);
  const [sampleDocuments, setSampleDocuments] = useState<SampleDocument[]>([]);
  const [loadingSamples, setLoadingSamples] = useState(true);
  const [usingDemoSamples, setUsingDemoSamples] = useState(false);
  const [uploadErrorMessage, setUploadErrorMessage] = useState('');

  useEffect(() => {
    let cancelled = false;

    async function loadSamples() {
      setLoadingSamples(true);
      try {
        const response = await fetch(`${API_BASE}/api/v1/documents?limit=6&source_type=sample`);
        const data = response.ok ? await response.json() : { documents: [] };
        if (!cancelled) {
          const nextSamples = Array.isArray(data.documents) && data.documents.length > 0
            ? data.documents
            : getDemoBookshelfDocuments();
          setSampleDocuments(nextSamples);
          setUsingDemoSamples(!Array.isArray(data.documents) || data.documents.length === 0);
        }
      } catch {
        if (!cancelled) {
          setSampleDocuments(getDemoBookshelfDocuments());
          setUsingDemoSamples(true);
        }
      } finally {
        if (!cancelled) {
          setLoadingSamples(false);
        }
      }
    }

    loadSamples();
    return () => {
      cancelled = true;
    };
  }, []);

  const openSampleDocument = useCallback(
    async (documentId: string) => {
      try {
        const response = await fetch(`${API_BASE}/api/v1/documents/${documentId}`);
        if (!response.ok) {
          throw new Error('Load sample failed');
        }

        const data = await response.json();
        setDocument({
          id: data.id,
          title: data.title,
          originalText: data.original_text,
          punctuatedText: data.punctuated_text || '',
          translatedText: data.translated_text || '',
          confidence: data.ocr_confidence,
          imageUrl: data.image_data || undefined,
          sourceType: data.source_type || 'sample',
        });
        setUploadStatus('done');
      } catch (error) {
        const demoDocument = getDemoDocumentById(documentId);
        if (demoDocument) {
          setDocument(toReaderDocument(demoDocument));
          setUploadStatus('done');
        } else {
          console.error('Open sample error:', error);
        }
      }
    },
    [setDocument, setUploadStatus]
  );

  const openFallbackSample = useCallback(() => {
    const candidateId = sampleDocuments[0]?.id ?? getDemoBookshelfDocuments()[0]?.id;
    if (candidateId) {
      openSampleDocument(candidateId);
    }
  }, [openSampleDocument, sampleDocuments]);

  const askQuestion = useCallback(
    (prompt: string) => {
      setDraftMessage(prompt);
      setActiveTab('chat');
    },
    [setActiveTab, setDraftMessage]
  );

  const searchTopic = useCallback(
    (topic: string) => {
      queueSearchQuery(topic);
      setActiveTab('search');
    },
    [queueSearchQuery, setActiveTab]
  );

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    if (acceptedFiles.length === 0) return;

    const file = acceptedFiles[0];
    setUploadStatus('uploading');
    setUploadErrorMessage('');

    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch(`${API_BASE}/api/v1/documents/upload`, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        throw new Error(errorData?.detail || 'Upload failed');
      }

      const data = await response.json();
      setDocument({
        id: data.document_id,
        title: file.name,
        originalText: data.text,
        confidence: data.confidence,
        imageUrl: data.image_url,
        sourceType: 'user',
      });
      setUploadStatus('done');
    } catch (error) {
      console.error('Upload error:', error);
      const message = error instanceof Error ? error.message : 'Upload failed';
      setUploadErrorMessage(
        message.toLowerCase().includes('fetch')
          ? '识别服务暂时不可用，建议先打开体验样例继续体验。'
          : '上传失败，请检查图片格式，或先切换到体验样例继续体验。'
      );
      setUploadStatus('error');
    }
  }, [setDocument, setUploadStatus]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'image/jpeg': ['.jpg', '.jpeg'],
      'image/png': ['.png'],
      'image/tiff': ['.tiff', '.tif'],
    },
    multiple: false,
    disabled: uploadStatus === 'uploading',
  });

  return (
    <div className="relative w-full h-full overflow-y-auto p-4 md:p-6" style={{ backgroundColor: 'var(--gf-bg)' }}>
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute left-[8%] top-8 h-64 w-64 rounded-full blur-3xl" style={{ backgroundColor: 'rgba(201,160,99,0.14)' }} />
        <div className="absolute right-[12%] top-24 h-72 w-72 rounded-full blur-3xl" style={{ backgroundColor: 'rgba(140,26,17,0.07)' }} />
      </div>

      <div className="relative mx-auto max-w-6xl space-y-5">
        <section
          className="relative overflow-hidden rounded-[32px] p-6 md:p-8"
          style={{
            background: 'linear-gradient(135deg, rgba(255,255,255,0.86) 0%, rgba(244,241,225,0.95) 100%)',
            border: '1px solid rgba(26,30,35,0.06)',
            boxShadow: '0 24px 52px rgba(26,30,35,0.06)',
          }}
        >
          <div className="pointer-events-none absolute inset-0 opacity-35" style={{
            backgroundImage: 'repeating-linear-gradient(90deg, rgba(26,30,35,0.018) 0, rgba(26,30,35,0.018) 1px, transparent 1px, transparent 82px)',
          }} />
          <div className="space-y-3">
            <span
              className="inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs tracking-[0.22em]"
              style={{ backgroundColor: 'rgba(140,26,17,0.08)', color: 'var(--gf-gugong-red)' }}
            >
              <Sparkles className="h-3.5 w-3.5" />
              开始读古籍
            </span>
            <h2
              className="text-2xl leading-tight md:text-3xl"
              style={{ fontFamily: '"ZCOOL XiaoWei", serif', color: 'var(--gf-text)' }}
            >
              没有古籍图片，也可以马上开始
            </h2>
            <p className="max-w-3xl text-sm leading-7 md:text-base" style={{ color: 'rgba(26,30,35,0.58)' }}>
              想先读懂一段古文，可以从左边的样例、问答和检索开始；手头有扫描页时，再用右边的上传入口。
            </p>
          </div>
        </section>

        <section className="grid gap-5 xl:grid-cols-[1.12fr_0.88fr]">
          <div className="space-y-5">
            <div
              className="rounded-[28px] p-4 md:p-5"
              style={{
                background: 'linear-gradient(180deg, rgba(255,255,255,0.82) 0%, rgba(250,239,236,0.96) 100%)',
                border: '1px solid rgba(140,26,17,0.10)',
                boxShadow: '0 18px 36px rgba(26,30,35,0.04)',
              }}
            >
              <div className="mb-4 flex items-center justify-between gap-3">
                <div>
                  <h3 className="text-base font-medium" style={{ color: 'var(--gf-text)' }}>
                    先从体验样例开始
                  </h3>
                  <p className="text-xs" style={{ color: 'rgba(26,30,35,0.45)' }}>
                    直接打开内置经典片段，进入阅读、释义和继续提问
                  </p>
                </div>
                <BookOpen className="h-4 w-4" style={{ color: 'rgba(26,30,35,0.3)' }} />
              </div>

              {usingDemoSamples && (
                <div className="mb-3 rounded-[22px] px-4 py-3 text-xs leading-6" style={{ backgroundColor: 'rgba(140,26,17,0.06)', border: '1px solid rgba(140,26,17,0.10)', color: 'rgba(26,30,35,0.56)' }}>
                  当前展示的是本地样例。即使识别服务暂时不可用，也能先完整体验阅读流程。
                </div>
              )}

              <div className="grid gap-3 md:grid-cols-2">
                {sampleDocuments.slice(0, 4).map((doc) => (
                  <button
                    key={doc.id}
                    onClick={() => openSampleDocument(doc.id)}
                    className="rounded-[24px] px-4 py-4 text-left transition-all duration-300 hover:-translate-y-0.5"
                    style={{
                      border: '1px solid rgba(26,30,35,0.07)',
                      backgroundColor: 'rgba(255,255,255,0.74)',
                      boxShadow: '0 10px 24px rgba(26,30,35,0.04)',
                    }}
                  >
                    <div className="mb-2 flex items-center justify-between gap-3">
                      <span className="text-sm font-medium" style={{ color: 'var(--gf-text)' }}>
                        {doc.title}
                      </span>
                      <span className="rounded-full px-2 py-0.5 text-[11px]" style={{ backgroundColor: 'rgba(140,26,17,0.08)', color: 'var(--gf-gugong-red)' }}>
                        样例
                      </span>
                    </div>
                    <div className="line-clamp-3 text-xs leading-6" style={{ color: 'rgba(26,30,35,0.48)' }}>
                      {doc.preview || '打开后即可查看原文、标点和白话对照。'}
                    </div>
                  </button>
                ))}

                {!loadingSamples && sampleDocuments.length === 0 && (
                  <p className="text-sm" style={{ color: 'rgba(26,30,35,0.35)' }}>
                    暂时没加载到体验样例，可以先问一句古文，或试试右侧上传。
                  </p>
                )}
              </div>
            </div>

            <div className="grid gap-5 md:grid-cols-2">
              <div
                className="rounded-[26px] p-4 md:p-5"
                style={{
                  background: 'linear-gradient(180deg, rgba(255,255,255,0.84) 0%, rgba(247,242,233,0.98) 100%)',
                  border: '1px solid rgba(123,91,68,0.10)',
                  boxShadow: '0 16px 30px rgba(26,30,35,0.04)',
                }}
              >
                <div className="mb-4">
                  <h3 className="text-base font-medium" style={{ color: 'var(--gf-text)' }}>
                    片段问答（AI 解读）
                  </h3>
                  <p className="text-xs" style={{ color: 'rgba(26,30,35,0.45)' }}>
                    输入一句原文或疑问，AI 会给出白话解释
                  </p>
                </div>
                <div className="space-y-2">
                  {QUICK_QUESTION_PROMPTS.map((prompt) => (
                    <button
                      key={prompt}
                      onClick={() => askQuestion(prompt)}
                      className="w-full rounded-[22px] px-4 py-3 text-left text-sm transition-all duration-300 hover:-translate-y-0.5"
                      style={{
                        border: '1px solid rgba(26,30,35,0.07)',
                        color: 'var(--gf-text)',
                        backgroundColor: 'rgba(255,255,255,0.72)',
                      }}
                    >
                      {prompt}
                    </button>
                  ))}
                </div>
              </div>

              <div
                className="rounded-[26px] p-4 md:p-5"
                style={{
                  background: 'linear-gradient(180deg, rgba(255,255,255,0.84) 0%, rgba(248,244,233,0.98) 100%)',
                  border: '1px solid rgba(201,160,99,0.12)',
                  boxShadow: '0 16px 30px rgba(26,30,35,0.04)',
                }}
              >
                <div className="mb-4 flex items-center justify-between">
                  <div>
                    <h3 className="text-base font-medium" style={{ color: 'var(--gf-text)' }}>
                      典籍定位
                    </h3>
                    <p className="text-xs" style={{ color: 'rgba(26,30,35,0.45)' }}>
                      在已入库的典籍中定位原文片段
                    </p>
                  </div>
                  <Search className="h-4 w-4" style={{ color: 'rgba(26,30,35,0.3)' }} />
                </div>
                <div className="flex flex-wrap gap-2">
                  {SEARCH_TOPICS.map((topic) => (
                    <button
                      key={topic}
                      onClick={() => searchTopic(topic)}
                      className="rounded-full px-3 py-1.5 text-xs transition-all duration-300 hover:-translate-y-0.5"
                      style={{ border: '1px solid rgba(26,30,35,0.08)', color: 'var(--gf-text)', backgroundColor: 'rgba(255,255,255,0.74)' }}
                    >
                      {topic}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div
            className="rounded-[30px] p-4 md:p-5"
            style={{
              background: 'linear-gradient(180deg, rgba(255,255,255,0.82) 0%, rgba(248,244,233,0.98) 100%)',
              border: '1px solid rgba(201,160,99,0.16)',
              boxShadow: '0 22px 42px rgba(26,30,35,0.05)',
            }}
          >
            <div className="mb-4 flex items-center justify-between">
              <div>
                  <h3 className="text-base font-medium" style={{ color: 'var(--gf-text)' }}>
                    上传古籍图片
                  </h3>
                  <p className="text-xs" style={{ color: 'rgba(26,30,35,0.45)' }}>
                    如果你手头有影印页、扫描图或馆藏图片，可以从这里开始识别。
                  </p>
                </div>
              <ScanText className="h-4 w-4" style={{ color: 'var(--gf-gugong-red)' }} />
            </div>

            <div
              {...getRootProps()}
              className={`
                relative overflow-hidden p-10 border-2 border-dashed rounded-[28px]
                transition-all duration-300 cursor-pointer
                ${uploadStatus === 'uploading' ? 'opacity-50 cursor-not-allowed' : ''}
              `}
              style={{
                borderColor: isDragActive ? 'var(--gf-gugong-red)' : 'rgba(26,30,35,0.12)',
                background: isDragActive
                  ? 'linear-gradient(135deg, rgba(140,26,17,0.08) 0%, rgba(255,255,255,0.76) 100%)'
                  : 'linear-gradient(135deg, rgba(255,255,255,0.84) 0%, rgba(247,246,243,0.92) 100%)',
                boxShadow: isDragActive ? '0 18px 36px rgba(140,26,17,0.10)' : 'inset 0 1px 0 rgba(255,255,255,0.55)',
              }}
            >
              <div className="pointer-events-none absolute inset-0 opacity-40" style={{
                backgroundImage: 'radial-gradient(circle at top right, rgba(201,160,99,0.18), transparent 32%)',
              }} />
              <input {...getInputProps()} />

              <div className="relative flex flex-col items-center gap-4 text-center">
                {uploadStatus === 'uploading' ? (
                  <>
                    <div
                      className="w-14 h-14 border-2 rounded-full animate-spin"
                      style={{ borderColor: 'rgba(26,30,35,0.1)', borderTopColor: 'var(--gf-gugong-red)' }}
                    />
                    <p className="text-lg font-medium" style={{ color: 'var(--gf-text)' }}>上传中...</p>
                  </>
                ) : (
                  <>
                    <Upload className="w-14 h-14" style={{ color: 'rgba(26,30,35,0.2)' }} />
                    <div>
                      <p className="text-lg font-medium mb-2" style={{ color: 'var(--gf-text)' }}>
                        {isDragActive ? '松开上传' : '拖拽图片或点击上传'}
                      </p>
                      <p className="text-sm leading-7" style={{ color: 'rgba(26,30,35,0.45)' }}>
                        支持 JPG、PNG、TIFF 格式，上传后会自动进入 OCR、断句和白话翻译流程
                      </p>
                    </div>
                  </>
                )}
              </div>
            </div>

            {uploadStatus === 'error' && (
              <div
                className="mt-4 rounded-[22px] px-4 py-3 text-sm"
                style={{ backgroundColor: 'rgba(176,58,58,0.08)', border: '1px solid rgba(176,58,58,0.15)', color: '#b03a3a' }}
              >
                <div>{uploadErrorMessage || '上传失败，请检查图片格式后再试。'}</div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    onClick={openFallbackSample}
                    className="rounded-full px-3 py-1.5 text-xs transition-colors"
                    style={{ backgroundColor: 'rgba(255,255,255,0.78)', color: '#8c1a11', border: '1px solid rgba(140,26,17,0.12)' }}
                  >
                    打开体验样例
                  </button>
                  <button
                    onClick={() => askQuestion(QUICK_QUESTION_PROMPTS[0])}
                    className="rounded-full px-3 py-1.5 text-xs transition-colors"
                    style={{ backgroundColor: 'rgba(255,255,255,0.78)', color: '#8c1a11', border: '1px solid rgba(140,26,17,0.12)' }}
                  >
                    先问一句古文
                  </button>
                </div>
              </div>
            )}

            <div className="mt-4 rounded-[22px] px-4 py-4 text-sm leading-7" style={{ backgroundColor: 'rgba(255,255,255,0.62)', border: '1px solid rgba(26,30,35,0.05)', color: 'rgba(26,30,35,0.55)' }}>
              适合这几种情况：
              <br />
              1. 手头有古籍扫描图或影印页。
              <br />
              2. 需要先把图片内容转成可读文本。
              <br />
              3. 想继续进入对照阅读和字词释义。
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
