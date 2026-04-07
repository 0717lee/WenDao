import { describe, it, expect, beforeEach } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import ComparePanel from '../components/ComparePanel'
import { useDocumentStore } from '../store/useDocumentStore'
import { useGraphStore } from '../store/useGraphStore'

describe('ComparePanel', () => {
  beforeEach(() => {
    useDocumentStore.getState().clearComparisonDocuments()
    useGraphStore.getState().setActiveTab('compare')
  })

  it('routes empty state to reader hub', () => {
    render(<ComparePanel />)

    fireEvent.click(screen.getByRole('button', { name: '去阅读页添加' }))

    expect(useGraphStore.getState().activeTab).toBe('reader')
  })
})
