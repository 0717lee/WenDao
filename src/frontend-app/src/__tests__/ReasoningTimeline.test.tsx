/**
 * ReasoningTimeline Tests (AI-03)
 * Coverage: Rendering, step labels, status indicators, collapse/expand, duration display
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ReasoningTimeline, type ReasoningStep } from '../components/ReasoningTimeline'

// Mock lucide-react icons
vi.mock('lucide-react', () => ({
  ChevronDown: (props: any) => <span data-testid="chevron-down" {...props} />,
  ChevronUp: (props: any) => <span data-testid="chevron-up" {...props} />,
}))

const SAMPLE_STEPS: ReasoningStep[] = [
  { step: 'retrieval', label: '检索古籍知识库', status: 'complete', duration: 0.35 },
  { step: 'entity_extraction', label: '抽取关联实体', status: 'complete', duration: 0.12 },
  { step: 'knowledge_linking', label: '知识关联推理', status: 'running' },
  { step: 'generation', label: '生成通俗解读', status: 'pending' },
]

describe('ReasoningTimeline', () => {
  it('renders nothing when no reasoning steps', () => {
    const { container } = render(<ReasoningTimeline steps={[]} />)
    expect(container.innerHTML).toBe('')
  })

  it('renders nothing when all steps are pending', () => {
    const pendingSteps: ReasoningStep[] = [
      { step: 'retrieval', label: '检索', status: 'pending' },
    ]
    const { container } = render(<ReasoningTimeline steps={pendingSteps} />)
    expect(container.innerHTML).toBe('')
  })

  it('renders timeline with multiple steps', () => {
    render(<ReasoningTimeline steps={SAMPLE_STEPS} defaultCollapsed={false} />)
    expect(screen.getByText('检索古籍知识库')).toBeDefined()
    expect(screen.getByText('抽取关联实体')).toBeDefined()
    expect(screen.getByText('知识关联推理')).toBeDefined()
  })

  it('shows step label text', () => {
    render(<ReasoningTimeline steps={SAMPLE_STEPS} defaultCollapsed={false} />)
    expect(screen.getByText('生成通俗解读')).toBeDefined()
  })

  it('shows running status with animate-pulse', () => {
    render(<ReasoningTimeline steps={SAMPLE_STEPS} defaultCollapsed={false} />)
    // The running step has animate-pulse on its dot
    const dots = document.querySelectorAll('.animate-pulse')
    expect(dots.length).toBeGreaterThanOrEqual(1)
  })

  it('shows complete status with checkmark SVG', () => {
    render(<ReasoningTimeline steps={SAMPLE_STEPS} defaultCollapsed={false} />)
    // Complete steps render an SVG checkmark path
    const checkPaths = document.querySelectorAll('path[d="M5 13l4 4L19 7"]')
    expect(checkPaths.length).toBe(2) // 2 complete steps
  })

  it('collapses and expands on click', () => {
    render(<ReasoningTimeline steps={SAMPLE_STEPS} defaultCollapsed={true} />)
    // Initially collapsed - button text says expand
    const toggleBtn = screen.getByText(/查看解析过程/)
    expect(toggleBtn).toBeDefined()

    fireEvent.click(toggleBtn)
    // After click, should show collapse text
    expect(screen.getByText(/收起解析过程/)).toBeDefined()
  })

  it('displays duration for completed steps', () => {
    render(<ReasoningTimeline steps={SAMPLE_STEPS} defaultCollapsed={false} />)
    expect(screen.getByText('0.35s')).toBeDefined()
    expect(screen.getByText('0.12s')).toBeDefined()
  })

  it('shows total duration in toggle button', () => {
    render(<ReasoningTimeline steps={SAMPLE_STEPS} defaultCollapsed={true} />)
    // Total = 0.35 + 0.12 = 0.47
    expect(screen.getByText(/0\.47s/)).toBeDefined()
  })
})
