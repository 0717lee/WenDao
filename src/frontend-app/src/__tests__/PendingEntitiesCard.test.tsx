/**
 * PendingEntitiesCard Tests (KG-03)
 * Coverage: Rendering, approve/reject, type badges, confidence, empty states
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { PendingEntitiesCard, type PendingEntity } from '../components/PendingEntitiesCard'

const SAMPLE_ENTITIES: PendingEntity[] = [
  { label: '大学', group: '典籍', desc: '四书之一', confidence: 0.9 },
  { label: '程朱理学', group: '思想流派', desc: '宋代理学', confidence: 0.5 },
  { label: '曾子', group: '人物', desc: '孔子弟子', confidence: 0.8 },
]

describe('PendingEntitiesCard', () => {
  const mockApprove = vi.fn()
  const mockReject = vi.fn()
  const mockApproveAll = vi.fn()

  beforeEach(() => {
    mockApprove.mockReset()
    mockReject.mockReset()
    mockApproveAll.mockReset()
  })

  it('renders nothing when no pending entities', () => {
    const { container } = render(
      <PendingEntitiesCard
        entities={[]}
        onApprove={mockApprove}
        onReject={mockReject}
        onApproveAll={mockApproveAll}
      />
    )
    expect(container.innerHTML).toBe('')
  })

  it('renders pending entity count', () => {
    render(
      <PendingEntitiesCard
        entities={SAMPLE_ENTITIES}
        onApprove={mockApprove}
        onReject={mockReject}
        onApproveAll={mockApproveAll}
      />
    )
    expect(screen.getByText('3')).toBeDefined()
  })

  it('approve button calls approve handler', () => {
    render(
      <PendingEntitiesCard
        entities={SAMPLE_ENTITIES}
        onApprove={mockApprove}
        onReject={mockReject}
        onApproveAll={mockApproveAll}
      />
    )
    // Expand first
    fireEvent.click(screen.getByText(/新实体/))
    // Click first approve button
    const approveButtons = screen.getAllByTitle('批准')
    fireEvent.click(approveButtons[0])
    expect(mockApprove).toHaveBeenCalledWith(SAMPLE_ENTITIES[0])
  })

  it('reject button calls reject handler', () => {
    render(
      <PendingEntitiesCard
        entities={SAMPLE_ENTITIES}
        onApprove={mockApprove}
        onReject={mockReject}
        onApproveAll={mockApproveAll}
      />
    )
    fireEvent.click(screen.getByText(/新实体/))
    const rejectButtons = screen.getAllByTitle('拒绝')
    fireEvent.click(rejectButtons[0])
    expect(mockReject).toHaveBeenCalledWith(SAMPLE_ENTITIES[0])
  })

  it('shows entity type badge', () => {
    render(
      <PendingEntitiesCard
        entities={SAMPLE_ENTITIES}
        onApprove={mockApprove}
        onReject={mockReject}
        onApproveAll={mockApproveAll}
      />
    )
    fireEvent.click(screen.getByText(/新实体/))
    expect(screen.getByText('典籍')).toBeDefined()
    expect(screen.getByText('思想流派')).toBeDefined()
    expect(screen.getByText('人物')).toBeDefined()
  })

  it('shows confidence warning for low confidence', () => {
    render(
      <PendingEntitiesCard
        entities={SAMPLE_ENTITIES}
        onApprove={mockApprove}
        onReject={mockReject}
        onApproveAll={mockApproveAll}
      />
    )
    fireEvent.click(screen.getByText(/新实体/))
    // 程朱理学 has confidence 0.5 < 0.7
    expect(screen.getByText('低置信度')).toBeDefined()
  })

  it('handles empty entity name gracefully', () => {
    const entities: PendingEntity[] = [
      { label: '', group: '人物', desc: 'test', confidence: 0.5 },
    ]
    // Should not crash
    const { container } = render(
      <PendingEntitiesCard
        entities={entities}
        onApprove={mockApprove}
        onReject={mockReject}
        onApproveAll={mockApproveAll}
      />
    )
    // Empty label entity still renders (label is empty string but entity exists)
    expect(container.innerHTML).not.toBe('')
  })

  it('approve all button works', () => {
    render(
      <PendingEntitiesCard
        entities={SAMPLE_ENTITIES}
        onApprove={mockApprove}
        onReject={mockReject}
        onApproveAll={mockApproveAll}
      />
    )
    fireEvent.click(screen.getByText(/新实体/))
    fireEvent.click(screen.getByText('全部批准'))
    expect(mockApproveAll).toHaveBeenCalledTimes(1)
  })
})
