import { useEffect, useMemo, useState } from 'react'
import { MessageSquareQuote, Sparkles } from 'lucide-react'
import { API_BASE } from '../lib/api'
import { authFetchOptions } from '../store/useAuthStore'
import { useGraphStore } from '../store/useGraphStore'
import { useStore } from '../store/useStore'
import { ReasoningTimeline, type ReasoningStep } from './ReasoningTimeline'

interface ExplainCitation {
  title: string
  source: string
  excerpt?: string
}

interface ExplainGloss {
  token: string
  explanation: string
}

interface ReaderExplainPanelProps {
  documentId: string
  documentTitle: string
  sentence: string
  context: string
  chapterTitle?: string
}

const INITIAL_STEPS: ReasoningStep[] = [
  { step: 'gloss', label: '逐字解析', status: 'pending' },
  { step: 'translation', label: '白话翻译', status: 'pending' },
  { step: 'reference', label: '出处参考', status: 'pending' },
  { step: 'follow_up', label: '修辞与追问', status: 'pending' },
]

export function ReaderExplainPanel({
  documentId,
  documentTitle,
  sentence,
  context,
  chapterTitle,
}: ReaderExplainPanelProps) {
  const setActiveTab = useGraphStore((state) => state.setActiveTab)
  const setDraftMessage = useStore((state) => state.setDraftMessage)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [gloss, setGloss] = useState<ExplainGloss[]>([])
  const [translation, setTranslation] = useState('')
  const [references, setReferences] = useState<ExplainCitation[]>([])
  const [rhetoric, setRhetoric] = useState('')
  const [followUp, setFollowUp] = useState('')
  const [steps, setSteps] = useState<ReasoningStep[]>(INITIAL_STEPS)

  const hasContent = useMemo(
    () => gloss.length > 0 || Boolean(translation || rhetoric || followUp || references.length > 0),
    [followUp, gloss.length, references.length, rhetoric, translation]
  )

  useEffect(() => {
    if (!sentence.trim()) return

    const controller = new AbortController()
    let active = true

    async function loadExplanation() {
      setLoading(true)
      setError('')
      setGloss([])
      setTranslation('')
      setReferences([])
      setRhetoric('')
      setFollowUp('')
      setSteps(INITIAL_STEPS.map((step) => ({ ...step })))

      try {
        const response = await fetch(`${API_BASE}/api/v1/documents/${documentId}/sentence-explain`, {
          ...authFetchOptions({
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              sentence,
              context,
              chapter_title: chapterTitle ?? '',
            }),
            signal: controller.signal,
          }),
        })

        if (!response.ok) {
          throw new Error('逐句精讲请求失败')
        }

        const reader = response.body?.getReader()
        if (!reader) {
          throw new Error('逐句精讲响应为空')
        }

        const decoder = new TextDecoder()
        let buffer = ''
        let currentEventType = ''

        while (active) {
          const { done, value } = await reader.read()
          if (done) break

          buffer += decoder.decode(value, { stream: true })
          const lines = buffer.split('\n')
          buffer = lines.pop() || ''

          for (const line of lines) {
            const trimmed = line.trim()
            if (!trimmed) {
              currentEventType = ''
              continue
            }

            if (trimmed.startsWith('event:')) {
              currentEventType = trimmed.slice(6).trim()
              continue
            }

            if (!trimmed.startsWith('data:')) continue
            const data = trimmed.slice(5).trim()

            try {
              const event = JSON.parse(data)

              if (currentEventType === 'reasoning') {
                setSteps((previous) =>
                  previous.map((step) =>
                    step.step === event.step
                      ? {
                          ...step,
                          status: event.status,
                          duration: event.duration ?? step.duration,
                          model: event.model ?? step.model,
                          fallback: event.fallback ?? step.fallback,
                        }
                      : step
                  )
                )
              } else if (currentEventType === 'section') {
                if (event.section === 'gloss') {
                  setGloss(Array.isArray(event.data) ? event.data : [])
                } else if (event.section === 'translation') {
                  setTranslation(typeof event.data === 'string' ? event.data : '')
                } else if (event.section === 'references') {
                  setReferences(Array.isArray(event.data) ? event.data : [])
                } else if (event.section === 'rhetoric') {
                  setRhetoric(typeof event.data === 'string' ? event.data : '')
                } else if (event.section === 'follow_up') {
                  setFollowUp(typeof event.data === 'string' ? event.data : '')
                }
              } else if (currentEventType === 'error') {
                setError(event.message || '逐句精讲暂时不可用，请稍后再试')
              }
            } catch {
              setError('逐句精讲结果解析失败，请稍后再试')
            }

            currentEventType = ''
          }
        }
      } catch (fetchError: any) {
        if (fetchError?.name !== 'AbortError') {
          setError('逐句精讲暂时不可用，请稍后再试')
        }
      } finally {
        if (active) {
          setLoading(false)
        }
      }
    }

    void loadExplanation()

    return () => {
      active = false
      controller.abort()
    }
  }, [chapterTitle, context, documentId, sentence])

  const handleAskFollowUp = () => {
    if (!followUp) return
    setDraftMessage(`请继续围绕《${documentTitle}》中的这句话讲解：${sentence}\n\n${followUp}`)
    setActiveTab('chat')
  }

  return (
    <div
      className="rounded-2xl p-4 md:p-5"
      style={{ backgroundColor: 'rgba(255,255,255,0.72)', border: '1px solid rgba(26,30,35,0.06)' }}
    >
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-sm" style={{ color: 'var(--gf-text)' }}>
            <Sparkles className="h-4 w-4" />
            AI 逐句精讲
          </div>
          <p className="mt-1 text-xs leading-6" style={{ color: 'rgba(26,30,35,0.45)' }}>
            {chapterTitle ? `${chapterTitle} · ` : ''}
            先在原文里点一句，再点“讲解此句”，这里会按顺序拆开讲。
          </p>
        </div>
      </div>

      <div
        className="mb-4 rounded-2xl px-4 py-4"
        style={{ backgroundColor: 'rgba(244,241,225,0.68)', border: '1px solid rgba(26,30,35,0.06)' }}
      >
        <div className="mb-2 text-xs tracking-[0.22em]" style={{ color: 'rgba(26,30,35,0.42)' }}>
          当前句子
        </div>
        <div className="text-sm leading-7" style={{ color: 'var(--gf-text)' }}>
          {sentence}
        </div>
      </div>

      <ReasoningTimeline steps={steps} defaultCollapsed={false} />

      {loading && !hasContent && !error && (
        <div className="mt-4 rounded-2xl px-4 py-4 text-sm" style={{ backgroundColor: 'rgba(26,30,35,0.03)', color: 'rgba(26,30,35,0.52)' }}>
          正在一句一句拆开讲...
        </div>
      )}

      {error && (
        <div className="mt-4 rounded-2xl px-4 py-4 text-sm" style={{ backgroundColor: 'rgba(176,58,58,0.08)', color: '#b03a3a' }}>
          {error}
        </div>
      )}

      {gloss.length > 0 && (
        <div className="mt-4">
          <div className="mb-2 text-[11px] tracking-[0.24em]" style={{ color: 'rgba(26,30,35,0.42)' }}>
            逐字解析
          </div>
          <div className="space-y-2">
            {gloss.map((item, idx) => (
              <div
                key={`${item.token}-${item.explanation}-${idx}`}
                className="rounded-xl px-3 py-3 text-sm"
                style={{ backgroundColor: 'rgba(255,255,255,0.78)', border: '1px solid rgba(26,30,35,0.05)' }}
              >
                <span className="font-medium" style={{ color: 'var(--gf-text)' }}>
                  {item.token}
                </span>
                <span style={{ color: 'rgba(26,30,35,0.55)' }}> — {item.explanation}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {translation && (
        <div className="mt-4">
          <div className="mb-2 text-[11px] tracking-[0.24em]" style={{ color: 'rgba(26,30,35,0.42)' }}>
            白话翻译
          </div>
          <div className="rounded-xl px-3 py-3 text-sm leading-7" style={{ backgroundColor: 'rgba(255,255,255,0.78)', color: 'rgba(26,30,35,0.62)', border: '1px solid rgba(26,30,35,0.05)' }}>
            {translation}
          </div>
        </div>
      )}

      {references.length > 0 && (
        <div className="mt-4">
          <div className="mb-2 text-[11px] tracking-[0.24em]" style={{ color: 'rgba(26,30,35,0.42)' }}>
            古注 / 出处参考
          </div>
          <div className="space-y-2">
            {references.map((reference, idx) => (
              <div
                key={`${reference.title}-${reference.source}-${reference.excerpt ?? ''}-${idx}`}
                className="rounded-xl px-3 py-3 text-sm"
                style={{ backgroundColor: 'rgba(201,160,99,0.08)', border: '1px solid rgba(201,160,99,0.16)' }}
              >
                <div className="font-medium" style={{ color: 'var(--gf-text)' }}>
                  {reference.title}
                </div>
                <div className="mt-1 text-xs" style={{ color: 'rgba(26,30,35,0.45)' }}>
                  {reference.source}
                </div>
                {reference.excerpt && (
                  <div className="mt-2 text-sm leading-7" style={{ color: 'rgba(26,30,35,0.58)' }}>
                    {reference.excerpt}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {rhetoric && (
        <div className="mt-4">
          <div className="mb-2 text-[11px] tracking-[0.24em]" style={{ color: 'rgba(26,30,35,0.42)' }}>
            修辞 / 句式
          </div>
          <div className="rounded-xl px-3 py-3 text-sm leading-7" style={{ backgroundColor: 'rgba(255,255,255,0.78)', color: 'rgba(26,30,35,0.62)', border: '1px solid rgba(26,30,35,0.05)' }}>
            {rhetoric}
          </div>
        </div>
      )}

      {followUp && (
        <div className="mt-4">
          <div className="mb-2 text-[11px] tracking-[0.24em]" style={{ color: 'rgba(26,30,35,0.42)' }}>
            继续追问
          </div>
          <div className="rounded-xl px-3 py-3 text-sm leading-7" style={{ backgroundColor: 'rgba(255,255,255,0.78)', color: 'rgba(26,30,35,0.62)', border: '1px solid rgba(26,30,35,0.05)' }}>
            {followUp}
          </div>
          <button
            onClick={handleAskFollowUp}
            className="mt-3 inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm"
            style={{ backgroundColor: 'rgba(140,26,17,0.08)', color: 'var(--gf-gugong-red)' }}
          >
            <MessageSquareQuote className="h-4 w-4" />
            带着这句接着问
          </button>
        </div>
      )}
    </div>
  )
}
