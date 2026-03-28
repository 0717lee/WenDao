import { useDocumentStore } from '../store/useDocumentStore'

const COLUMN_LABELS: Array<keyof Pick<NonNullable<ReturnType<typeof useDocumentStore.getState>['comparisonDocuments'][number]>, 'originalText' | 'punctuatedText' | 'translatedText'>> = [
  'originalText',
  'punctuatedText',
  'translatedText',
]

const COLUMN_TITLES: Record<string, string> = {
  originalText: '原文',
  punctuatedText: '标点文',
  translatedText: '白话译',
}

export default function ComparePanel() {
  const { comparisonDocuments, removeComparisonDocument, clearComparisonDocuments } = useDocumentStore()

  if (comparisonDocuments.length === 0) {
    return (
      <div className="flex h-full items-center justify-center px-6" style={{ backgroundColor: 'var(--gf-bg)' }}>
        <div
          className="max-w-xl rounded-3xl p-8 text-center"
          style={{ backgroundColor: 'rgba(255,255,255,0.7)', border: '1px solid rgba(26,30,35,0.06)' }}
        >
          <h2 className="mb-3 text-xl font-medium" style={{ color: 'var(--gf-text)' }}>
            对照阅读
          </h2>
          <p style={{ color: 'rgba(26,30,35,0.45)' }}>
            先去典籍库挑选 1-2 份体验样例或你的文档加入对照，就可以并排比较原文、标点和白话译。
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="h-full overflow-y-auto px-4 py-5 md:px-6" style={{ backgroundColor: 'var(--gf-bg)' }}>
      <div className="mx-auto max-w-7xl space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-medium" style={{ color: 'var(--gf-text)' }}>
              多文档对照
            </h2>
            <p className="text-sm" style={{ color: 'rgba(26,30,35,0.45)' }}>
              适合答辩演示“同题异文”或不同资料来源的并排比较。
            </p>
          </div>
          <button
            onClick={clearComparisonDocuments}
            className="rounded-xl px-3 py-2 text-sm"
            style={{ backgroundColor: 'rgba(26,30,35,0.05)', color: 'var(--gf-text)' }}
          >
            清空对照
          </button>
        </div>

        <div className={`grid gap-4 ${comparisonDocuments.length === 1 ? 'grid-cols-1' : 'grid-cols-1 xl:grid-cols-2'}`}>
          {comparisonDocuments.map((doc) => (
            <div
              key={doc.id}
              className="rounded-3xl p-4"
              style={{ backgroundColor: 'rgba(255,255,255,0.72)', border: '1px solid rgba(26,30,35,0.06)' }}
            >
              <div className="mb-4 flex items-center justify-between gap-3">
                <div>
                  <h3 className="text-lg font-medium" style={{ color: 'var(--gf-text)' }}>
                    {doc.title}
                  </h3>
                  <p className="text-xs" style={{ color: 'rgba(26,30,35,0.4)' }}>
                    {doc.punctuatedText ? '已完成全文处理' : '仅有 OCR 原文'}
                  </p>
                </div>
                <button
                  onClick={() => removeComparisonDocument(doc.id)}
                  className="rounded-xl px-3 py-2 text-xs"
                  style={{ backgroundColor: 'rgba(26,30,35,0.05)', color: 'rgba(26,30,35,0.55)' }}
                >
                  移出对照
                </button>
              </div>

              <div className="grid gap-3 lg:grid-cols-3">
                {COLUMN_LABELS.map((field) => (
                  <div
                    key={`${doc.id}-${field}`}
                    className="rounded-2xl p-3"
                    style={{ backgroundColor: 'rgba(244,241,225,0.6)', border: '1px solid rgba(26,30,35,0.05)' }}
                  >
                    <div className="mb-2 text-sm font-medium" style={{ color: 'var(--gf-text)' }}>
                      {COLUMN_TITLES[field]}
                    </div>
                    <div className="max-h-[360px] overflow-y-auto whitespace-pre-wrap text-sm leading-7" style={{ color: 'rgba(26,30,35,0.72)' }}>
                      {doc[field] || '暂无内容'}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
