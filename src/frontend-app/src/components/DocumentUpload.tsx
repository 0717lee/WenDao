import { useCallback, useEffect, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { BookOpen, ScanText, Search, Sparkles, Upload } from 'lucide-react';
import { useDocumentStore } from '../store/useDocumentStore';
import { useGraphStore } from '../store/useGraphStore';
import { useStore } from '../store/useStore';
import { API_BASE } from '../lib/api';

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

  useEffect(() => {
    let cancelled = false;

    async function loadSamples() {
      setLoadingSamples(true);
      try {
        const response = await fetch(`${API_BASE}/api/v1/documents?limit=6&source_type=sample`);
        const data = response.ok ? await response.json() : { documents: [] };
        if (!cancelled) {
          setSampleDocuments(Array.isArray(data.documents) ? data.documents : []);
        }
      } catch {
        if (!cancelled) {
          setSampleDocuments([]);
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
        });
        setUploadStatus('done');
      } catch (error) {
        console.error('Open sample error:', error);
      }
    },
    [setDocument, setUploadStatus]
  );

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

    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch(`${API_BASE}/api/v1/documents/upload`, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        throw new Error('Upload failed');
      }

      const data = await response.json();
      setDocument({
        id: data.document_id,
        title: file.name,
        originalText: data.text,
        confidence: data.confidence,
        imageUrl: data.image_url,
      });
      setUploadStatus('done');
    } catch (error) {
      console.error('Upload error:', error);
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
    <div className="w-full h-full overflow-y-auto p-4 md:p-6" style={{ backgroundColor: 'var(--gf-bg)' }}>
      <div className="mx-auto max-w-6xl space-y-5">
        <section
          className="rounded-[28px] p-6 md:p-7"
          style={{
            background: 'linear-gradient(135deg, rgba(255,255,255,0.8) 0%, rgba(244,241,225,0.9) 100%)',
            border: '1px solid rgba(26,30,35,0.06)',
            boxShadow: '0 24px 48px rgba(26,30,35,0.05)',
          }}
        >
          <div className="space-y-3">
            <span
              className="inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs tracking-[0.22em]"
              style={{ backgroundColor: 'rgba(140,26,17,0.08)', color: 'var(--gf-gugong-red)' }}
            >
              <Sparkles className="h-3.5 w-3.5" />
              读古籍入口
            </span>
            <h2
              className="text-2xl leading-tight md:text-3xl"
              style={{ fontFamily: '"ZCOOL XiaoWei", serif', color: 'var(--gf-text)' }}
            >
              没有古籍图片，也可以马上开始
            </h2>
            <p className="max-w-3xl text-sm leading-7 md:text-base" style={{ color: 'rgba(26,30,35,0.58)' }}>
              左边给普通用户准备了体验样例、片段问答和人物典故检索；右边保留上传 OCR 的专业入口，给手头有扫描页的人使用。
            </p>
          </div>
        </section>

        <section className="grid gap-5 xl:grid-cols-[1.12fr_0.88fr]">
          <div className="space-y-5">
            <div
              className="rounded-2xl p-4 md:p-5"
              style={{ backgroundColor: 'rgba(255,255,255,0.68)', border: '1px solid rgba(26,30,35,0.06)' }}
            >
              <div className="mb-4 flex items-center justify-between gap-3">
                <div>
                  <h3 className="text-base font-medium" style={{ color: 'var(--gf-text)' }}>
                    大众入口 · 体验样例
                  </h3>
                  <p className="text-xs" style={{ color: 'rgba(26,30,35,0.45)' }}>
                    直接打开内置经典片段，进入三栏阅读、字词释义和继续提问
                  </p>
                </div>
                <BookOpen className="h-4 w-4" style={{ color: 'rgba(26,30,35,0.3)' }} />
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                {sampleDocuments.slice(0, 4).map((doc) => (
                  <button
                    key={doc.id}
                    onClick={() => openSampleDocument(doc.id)}
                    className="rounded-2xl px-4 py-4 text-left transition-colors hover:bg-[rgba(26,30,35,0.03)]"
                    style={{ border: '1px solid rgba(26,30,35,0.08)' }}
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
                    暂时还没有样例，请稍后再试。
                  </p>
                )}
              </div>
            </div>

            <div className="grid gap-5 md:grid-cols-2">
              <div
                className="rounded-2xl p-4 md:p-5"
                style={{ backgroundColor: 'rgba(255,255,255,0.68)', border: '1px solid rgba(26,30,35,0.06)' }}
              >
                <div className="mb-4">
                  <h3 className="text-base font-medium" style={{ color: 'var(--gf-text)' }}>
                    片段问答
                  </h3>
                  <p className="text-xs" style={{ color: 'rgba(26,30,35,0.45)' }}>
                    适合课本、考试和经典入门阅读时的即时追问
                  </p>
                </div>
                <div className="space-y-2">
                  {QUICK_QUESTION_PROMPTS.map((prompt) => (
                    <button
                      key={prompt}
                      onClick={() => askQuestion(prompt)}
                      className="w-full rounded-2xl px-4 py-3 text-left text-sm transition-colors hover:bg-[rgba(140,26,17,0.05)]"
                      style={{ border: '1px solid rgba(26,30,35,0.08)', color: 'var(--gf-text)' }}
                    >
                      {prompt}
                    </button>
                  ))}
                </div>
              </div>

              <div
                className="rounded-2xl p-4 md:p-5"
                style={{ backgroundColor: 'rgba(255,255,255,0.68)', border: '1px solid rgba(26,30,35,0.06)' }}
              >
                <div className="mb-4 flex items-center justify-between">
                  <div>
                    <h3 className="text-base font-medium" style={{ color: 'var(--gf-text)' }}>
                      人物与典故检索
                    </h3>
                    <p className="text-xs" style={{ color: 'rgba(26,30,35,0.45)' }}>
                      没想好从哪篇开始，就先从名字和概念搜起
                    </p>
                  </div>
                  <Search className="h-4 w-4" style={{ color: 'rgba(26,30,35,0.3)' }} />
                </div>
                <div className="flex flex-wrap gap-2">
                  {SEARCH_TOPICS.map((topic) => (
                    <button
                      key={topic}
                      onClick={() => searchTopic(topic)}
                      className="rounded-full px-3 py-1.5 text-xs transition-colors hover:bg-[rgba(201,160,99,0.16)]"
                      style={{ border: '1px solid rgba(26,30,35,0.08)', color: 'var(--gf-text)' }}
                    >
                      {topic}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div
            className="rounded-2xl p-4 md:p-5"
            style={{ backgroundColor: 'rgba(255,255,255,0.68)', border: '1px solid rgba(26,30,35,0.06)' }}
          >
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h3 className="text-base font-medium" style={{ color: 'var(--gf-text)' }}>
                  专业入口 · 上传古籍图片
                </h3>
                <p className="text-xs" style={{ color: 'rgba(26,30,35,0.45)' }}>
                  适合手头已有扫描页、影印件或馆藏图片的用户
                </p>
              </div>
              <ScanText className="h-4 w-4" style={{ color: 'var(--gf-gugong-red)' }} />
            </div>

            <div
              {...getRootProps()}
              className={`
                p-10 border-2 border-dashed rounded-[28px]
                transition-all cursor-pointer
                ${uploadStatus === 'uploading' ? 'opacity-50 cursor-not-allowed' : ''}
              `}
              style={{
                borderColor: isDragActive ? 'var(--gf-gugong-red)' : 'rgba(26,30,35,0.12)',
                backgroundColor: isDragActive ? 'rgba(140,26,17,0.04)' : 'rgba(247,246,243,0.8)',
              }}
            >
              <input {...getInputProps()} />

              <div className="flex flex-col items-center gap-4 text-center">
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
                        支持 JPG、PNG、TIFF 格式，上传后将进入 OCR、断句和白话翻译流程
                      </p>
                    </div>
                  </>
                )}
              </div>
            </div>

            {uploadStatus === 'error' && (
              <div
                className="mt-4 rounded-2xl px-4 py-3 text-sm"
                style={{ backgroundColor: 'rgba(176,58,58,0.08)', border: '1px solid rgba(176,58,58,0.15)', color: '#b03a3a' }}
              >
                上传失败，请检查图片格式后再试。
              </div>
            )}

            <div className="mt-4 rounded-2xl px-4 py-4 text-sm leading-7" style={{ backgroundColor: 'rgba(26,30,35,0.03)', color: 'rgba(26,30,35,0.55)' }}>
              这条链路更适合专业用户：
              <br />
              1. 手头真的有古籍扫描图或影印页。
              <br />
              2. 需要把图片内容转成可读文本。
              <br />
              3. 之后再进入三栏阅读和字词释义。
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
