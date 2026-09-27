import { useEffect, useState } from 'react'
import { HelpCircle, RotateCcw } from 'lucide-react'
import { API_BASE } from '../lib/api'
import { authFetchOptions } from '../store/useAuthStore'

interface StudyCard {
  id: string
  front: string
  back: string
  hint: string
}

interface QuizItem {
  id: string
  question: string
  answer: string
}

interface StudyCardsPanelProps {
  documentId: string
}

type CardResult = 'mastered' | 'review'
type CardResults = Record<string, CardResult>

function createStudySessionId() {
  return globalThis.crypto.randomUUID()
}

export function StudyCardsPanel({ documentId }: StudyCardsPanelProps) {
  const [cards, setCards] = useState<StudyCard[]>([])
  const [quiz, setQuiz] = useState<QuizItem[]>([])
  const [loading, setLoading] = useState(true)
  const [index, setIndex] = useState(0)
  const [showAnswer, setShowAnswer] = useState(false)
  const [cardResults, setCardResults] = useState<CardResults>({})
  const [summary, setSummary] = useState<{
    sessions_count: number
    mastery_rate: number
    last_reviewed_at: string | null
  } | null>(null)
  const [saving, setSaving] = useState(false)
  const [completed, setCompleted] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [completionError, setCompletionError] = useState<string | null>(null)
  const [completionWarning, setCompletionWarning] = useState<string | null>(null)
  const [progressSaved, setProgressSaved] = useState(false)
  const [loadAttempt, setLoadAttempt] = useState(0)
  const [sessionId, setSessionId] = useState(() => createStudySessionId())

  useEffect(() => {
    setSessionId(createStudySessionId())
  }, [documentId])

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      setLoadError(null)
      setCards([])
      setQuiz([])
      setSummary(null)
      setIndex(0)
      setShowAnswer(false)
      setCardResults({})
      setCompleted(false)
      setCompletionError(null)
      setCompletionWarning(null)
      setProgressSaved(false)
      try {
        const [cardsResponse, summaryResponse] = await Promise.all([
          fetch(`${API_BASE}/api/v1/documents/${documentId}/study-cards`, authFetchOptions()),
          fetch(`${API_BASE}/api/v1/documents/${documentId}/study-progress`, authFetchOptions()),
        ])
        if (!cardsResponse.ok || !summaryResponse.ok) throw new Error('study data unavailable')
        const data = await cardsResponse.json()
        const summaryData = await summaryResponse.json()
        if (!cancelled) {
          setCards(data.cards || [])
          setQuiz(data.quiz || [])
          setSummary(summaryData)
        }
      } catch {
        if (!cancelled) {
          setLoadError('复习卡加载失败，请重试。')
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [documentId, loadAttempt])

  const current = cards[index]
  const resultValues = Object.values(cardResults)
  const masteredCount = resultValues.filter((result) => result === 'mastered').length
  const reviewAgainCount = resultValues.filter((result) => result === 'review').length
  const completedCount = resultValues.length
  const currentResult = current ? cardResults[current.id] : undefined

  const persistProgress = async (results: CardResults) => {
    const values = Object.values(results)
    const nextMastered = values.filter((result) => result === 'mastered').length
    const nextReview = values.filter((result) => result === 'review').length
    const response = await fetch(`${API_BASE}/api/v1/documents/${documentId}/study-progress`, {
      ...authFetchOptions({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      }),
      body: JSON.stringify({
        session_id: sessionId,
        completed_cards: values.length,
        total_cards: cards.length,
        mastered_cards: nextMastered,
        review_again_cards: nextReview,
      }),
    })
    if (!response.ok) throw new Error('study progress save failed')

    // The POST creates one session. Once it succeeds, never POST this round
    // again; a failed aggregate refresh must not create a duplicate session.
    setProgressSaved(true)
    try {
      const summaryResponse = await fetch(`${API_BASE}/api/v1/documents/${documentId}/study-progress`, authFetchOptions())
      if (!summaryResponse.ok) throw new Error('study summary refresh failed')
      setSummary(await summaryResponse.json())
      setCompletionWarning(null)
    } catch {
      setCompletionWarning('本轮已经保存，但历史统计暂时没有刷新。')
    }
  }

  const resetRound = () => {
    setIndex(0)
    setShowAnswer(false)
    setCardResults({})
    setCompleted(false)
    setCompletionError(null)
    setCompletionWarning(null)
    setProgressSaved(false)
    setSessionId(createStudySessionId())
  }

  const nextUnansweredIndex = (results: CardResults, fromIndex: number) => {
    if (cards.length === 0) return 0
    for (let offset = 1; offset <= cards.length; offset += 1) {
      const candidateIndex = (fromIndex + offset) % cards.length
      if (!results[cards[candidateIndex].id]) return candidateIndex
    }
    return fromIndex
  }

  const handleCardResult = async (result: CardResult) => {
    if (!current || saving || completed || currentResult) return

    const nextResults = { ...cardResults, [current.id]: result }
    setCardResults(nextResults)
    setCompletionError(null)

    if (Object.keys(nextResults).length < cards.length) {
      setIndex(nextUnansweredIndex(nextResults, index))
      setShowAnswer(false)
      return
    }

    setSaving(true)
    try {
      if (!progressSaved) await persistProgress(nextResults)
      setCompleted(true)
    } catch {
      setCompletionError('本轮结果没有保存成功，请重试。')
    } finally {
      setSaving(false)
    }
  }

  const retryCompletion = async () => {
    if (!Object.keys(cardResults).length || saving) return
    setSaving(true)
    setCompletionError(null)
    try {
      if (!progressSaved) await persistProgress(cardResults)
      setCompleted(true)
    } catch {
      setCompletionError('本轮结果没有保存成功，请重试。')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      className="rounded-2xl p-4 md:p-5"
      style={{ backgroundColor: 'rgba(255,255,255,0.72)', border: '1px solid rgba(26,30,35,0.06)' }}
    >
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-sm" style={{ color: 'var(--gf-text)' }}>
            <HelpCircle className="h-4 w-4" />
            复习卡片
          </div>
          <p className="mt-1 text-xs" style={{ color: 'var(--gf-muted)' }}>
            适合读完之后快速回看重点，也方便之后再复习。
          </p>
        </div>
        <button
          onClick={resetRound}
          className="rounded-xl px-3 py-2 text-xs"
          style={{ backgroundColor: 'rgba(26,30,35,0.05)', color: 'rgba(26,30,35,0.6)' }}
          disabled={loading || saving}
        >
          <RotateCcw className="mr-1 inline h-3.5 w-3.5" />
          重置
        </button>
      </div>

      {summary && (
        <div
          className="mb-4 rounded-2xl px-4 py-3 text-xs"
          style={{ backgroundColor: 'rgba(26,30,35,0.03)', color: 'var(--gf-muted)' }}
        >
          已复习 {summary.sessions_count} 次，最近掌握率 {Math.round((summary.mastery_rate || 0) * 100)}%
          {summary.last_reviewed_at ? `，最近一次：${new Date(summary.last_reviewed_at).toLocaleString('zh-CN')}` : ''}
        </div>
      )}

      {!loading && cards.length > 0 && (
        <div className="mb-4 text-xs" style={{ color: 'var(--gf-muted)' }} aria-live="polite">
          本轮已完成 {completedCount} / {cards.length} 张 · 已掌握 {masteredCount} 张 · 需要复习 {reviewAgainCount} 张
        </div>
      )}

      {loading ? (
        <div className="rounded-2xl p-6 text-center text-sm" style={{ backgroundColor: 'rgba(26,30,35,0.03)' }}>
          正在准备复习卡...
        </div>
      ) : loadError ? (
        <div className="rounded-2xl p-6 text-center text-sm" style={{ backgroundColor: 'rgba(140,26,17,0.06)', color: 'var(--gf-gugong-red)' }} role="alert">
          <p>{loadError}</p>
          <button
            type="button"
            onClick={() => setLoadAttempt((attempt) => attempt + 1)}
            className="mt-3 rounded-xl px-4 py-2 text-sm text-white"
            style={{ backgroundColor: 'var(--gf-gugong-red)' }}
          >
            重试
          </button>
        </div>
      ) : current ? (
        <div className="space-y-4">
          {completed ? (
            <div className="rounded-2xl p-6 text-center" style={{ backgroundColor: 'rgba(60,138,81,0.10)', color: '#286d3b' }} role="status">
              <p className="text-base font-medium">这一轮复习完成了</p>
              <p className="mt-2 text-sm">已掌握 {masteredCount} 张，需要复习 {reviewAgainCount} 张。</p>
              {completionWarning && <p className="mt-2 text-xs" role="status">{completionWarning}</p>}
              <button
                type="button"
                onClick={resetRound}
                className="mt-4 rounded-xl px-4 py-2 text-sm text-white"
                style={{ backgroundColor: 'var(--gf-gugong-red)' }}
              >
                再复习一遍
              </button>
            </div>
          ) : (
            <>
          <div
            className="rounded-2xl p-4"
            style={{ backgroundColor: 'rgba(244,241,225,0.68)', border: '1px solid rgba(26,30,35,0.06)' }}
          >
            <div className="mb-2 text-xs" style={{ color: 'var(--gf-muted)' }}>
              卡片 {index + 1} / {cards.length}
            </div>
            <div className="text-sm leading-7" style={{ color: 'var(--gf-text)' }}>
              <strong>{showAnswer ? '答案：' : '原句：'}</strong>
              {showAnswer ? current.back : current.front}
            </div>
            <div className="mt-2 text-xs" style={{ color: 'var(--gf-muted)' }}>
              {current.hint}
            </div>
          </div>

          {currentResult && (
            <p className="text-xs" style={{ color: 'var(--gf-muted)' }} role="status">
              这张卡片本轮已标记为“{currentResult === 'mastered' ? '我已掌握' : '需要复习'}”，不会重复计入。
            </p>
          )}

          {completionError && (
            <div className="rounded-xl px-3 py-2 text-sm" style={{ backgroundColor: 'rgba(140,26,17,0.08)', color: 'var(--gf-gugong-red)' }} role="alert">
              <span>{completionError}</span>
              <button type="button" onClick={retryCompletion} className="ml-3 underline" disabled={saving}>
                {saving ? '正在保存...' : '重试保存'}
              </button>
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setShowAnswer((prev) => !prev)}
              disabled={saving}
              className="rounded-xl px-4 py-2 text-sm text-white"
              style={{ backgroundColor: 'var(--gf-gugong-red)' }}
            >
              {showAnswer ? '查看原句' : '翻看答案'}
            </button>
            <button
              onClick={() => {
                setIndex((prev) => (prev + 1) % cards.length)
                setShowAnswer(false)
              }}
              disabled={saving}
              className="rounded-xl px-4 py-2 text-sm"
              style={{ backgroundColor: 'rgba(26,30,35,0.05)', color: 'var(--gf-text)' }}
            >
              下一张
            </button>
            <button
              onClick={() => handleCardResult('mastered')}
              disabled={saving || !!currentResult}
              className="rounded-xl px-4 py-2 text-sm disabled:opacity-60"
              style={{ backgroundColor: 'rgba(60,138,81,0.12)', color: '#3c8a51' }}
            >
              {saving ? '正在保存...' : '我已掌握'}
            </button>
            <button
              onClick={() => handleCardResult('review')}
              disabled={saving || !!currentResult}
              className="rounded-xl px-4 py-2 text-sm disabled:opacity-60"
              style={{ backgroundColor: 'rgba(201,160,99,0.12)', color: 'var(--gf-gold)' }}
            >
              需要复习
            </button>
          </div>

            </>
          )}

          {quiz.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-sm font-medium" style={{ color: 'var(--gf-text)' }}>
                自测提示
              </h4>
              {quiz.map((item) => (
                <details
                  key={item.id}
                  className="rounded-xl px-3 py-2"
                  style={{ backgroundColor: 'rgba(26,30,35,0.03)', color: 'var(--gf-text)' }}
                >
                  <summary className="cursor-pointer text-sm">{item.question}</summary>
                  <p className="mt-2 text-sm leading-7" style={{ color: 'rgba(26,30,35,0.62)' }}>
                    {item.answer}
                  </p>
                </details>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="rounded-2xl p-6 text-center text-sm" style={{ backgroundColor: 'rgba(26,30,35,0.03)', color: 'var(--gf-muted)' }}>
          这篇内容暂时还不能生成复习卡。
        </div>
      )}
    </div>
  )
}
