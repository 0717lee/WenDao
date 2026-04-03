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

export function StudyCardsPanel({ documentId }: StudyCardsPanelProps) {
  const [cards, setCards] = useState<StudyCard[]>([])
  const [quiz, setQuiz] = useState<QuizItem[]>([])
  const [loading, setLoading] = useState(true)
  const [index, setIndex] = useState(0)
  const [showAnswer, setShowAnswer] = useState(false)
  const [masteredCount, setMasteredCount] = useState(0)
  const [reviewAgainCount, setReviewAgainCount] = useState(0)
  const [summary, setSummary] = useState<{
    sessions_count: number
    mastery_rate: number
    last_reviewed_at: string | null
  } | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      try {
        const [cardsResponse, summaryResponse] = await Promise.all([
          fetch(`${API_BASE}/api/v1/documents/${documentId}/study-cards`, authFetchOptions()),
          fetch(`${API_BASE}/api/v1/documents/${documentId}/study-progress`, authFetchOptions()),
        ])
        const data = cardsResponse.ok ? await cardsResponse.json() : { cards: [], quiz: [] }
        const summaryData = summaryResponse.ok ? await summaryResponse.json() : null
        if (!cancelled) {
          setCards(data.cards || [])
          setQuiz(data.quiz || [])
          setIndex(0)
          setShowAnswer(false)
          setMasteredCount(0)
          setReviewAgainCount(0)
          setSummary(summaryData)
        }
      } catch {
        if (!cancelled) {
          setCards([])
          setQuiz([])
          setSummary(null)
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [documentId])

  const current = cards[index]

  const handleCardResult = async (result: 'mastered' | 'review') => {
    const nextMastered = result === 'mastered' ? masteredCount + 1 : masteredCount
    const nextReview = result === 'review' ? reviewAgainCount + 1 : reviewAgainCount
    setMasteredCount(nextMastered)
    setReviewAgainCount(nextReview)

    if (index < cards.length - 1) {
      setIndex((prev) => prev + 1)
      setShowAnswer(false)
      return
    }

    setSaving(true)
    try {
      await fetch(`${API_BASE}/api/v1/documents/${documentId}/study-progress`, {
        ...authFetchOptions({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        }),
        body: JSON.stringify({
          completed_cards: cards.length,
          total_cards: cards.length,
          mastered_cards: nextMastered,
          review_again_cards: nextReview,
        }),
      })

      const summaryResponse = await fetch(`${API_BASE}/api/v1/documents/${documentId}/study-progress`, authFetchOptions())
      const summaryData = summaryResponse.ok ? await summaryResponse.json() : null
      setSummary(summaryData)
    } catch {
      // Keep local summary silent if persistence fails
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
            学习卡片
          </div>
          <p className="mt-1 text-xs" style={{ color: 'rgba(26,30,35,0.45)' }}>
            适合课后复习，亦可在答辩时展示持续学习能力。
          </p>
        </div>
        <button
          onClick={() => {
            setIndex(0)
            setShowAnswer(false)
          }}
          className="rounded-xl px-3 py-2 text-xs"
          style={{ backgroundColor: 'rgba(26,30,35,0.05)', color: 'rgba(26,30,35,0.6)' }}
        >
          <RotateCcw className="mr-1 inline h-3.5 w-3.5" />
          重置
        </button>
      </div>

      {summary && (
        <div
          className="mb-4 rounded-2xl px-4 py-3 text-xs"
          style={{ backgroundColor: 'rgba(26,30,35,0.03)', color: 'rgba(26,30,35,0.58)' }}
        >
          已复习 {summary.sessions_count} 次，最近掌握率 {Math.round((summary.mastery_rate || 0) * 100)}%
          {summary.last_reviewed_at ? `，最近一次：${new Date(summary.last_reviewed_at).toLocaleString('zh-CN')}` : ''}
        </div>
      )}

      {loading ? (
        <div className="rounded-2xl p-6 text-center text-sm" style={{ backgroundColor: 'rgba(26,30,35,0.03)' }}>
          正在生成学习卡片...
        </div>
      ) : current ? (
        <div className="space-y-4">
          <div
            className="rounded-2xl p-4"
            style={{ backgroundColor: 'rgba(244,241,225,0.68)', border: '1px solid rgba(26,30,35,0.06)' }}
          >
            <div className="mb-2 text-xs" style={{ color: 'rgba(26,30,35,0.45)' }}>
              卡片 {index + 1} / {cards.length}
            </div>
            <div className="text-sm leading-7" style={{ color: 'var(--gf-text)' }}>
              <strong>{showAnswer ? '答案：' : '原句：'}</strong>
              {showAnswer ? current.back : current.front}
            </div>
            <div className="mt-2 text-xs" style={{ color: 'rgba(26,30,35,0.45)' }}>
              {current.hint}
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setShowAnswer((prev) => !prev)}
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
              className="rounded-xl px-4 py-2 text-sm"
              style={{ backgroundColor: 'rgba(26,30,35,0.05)', color: 'var(--gf-text)' }}
            >
              下一张
            </button>
            <button
              onClick={() => handleCardResult('mastered')}
              disabled={saving}
              className="rounded-xl px-4 py-2 text-sm disabled:opacity-60"
              style={{ backgroundColor: 'rgba(60,138,81,0.12)', color: '#3c8a51' }}
            >
              {saving ? '保存中...' : '我已掌握'}
            </button>
            <button
              onClick={() => handleCardResult('review')}
              disabled={saving}
              className="rounded-xl px-4 py-2 text-sm disabled:opacity-60"
              style={{ backgroundColor: 'rgba(201,160,99,0.12)', color: 'var(--gf-gold)' }}
            >
              需要复习
            </button>
          </div>

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
        <div className="rounded-2xl p-6 text-center text-sm" style={{ backgroundColor: 'rgba(26,30,35,0.03)', color: 'rgba(26,30,35,0.45)' }}>
          当前文档还无法生成学习卡片。
        </div>
      )}
    </div>
  )
}
