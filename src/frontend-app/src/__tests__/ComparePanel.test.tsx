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

  it('renders only original and punctuated columns for comparison', () => {
    useDocumentStore.getState().toggleComparisonDocument({
      id: 'doc-1',
      title: '《论语》',
      originalText: '学而时习之',
      punctuatedText: '学而时习之。',
      translatedText: '学习后经常复习它。',
    })

    render(<ComparePanel />)

    expect(screen.getByText('原文')).toBeInTheDocument()
    expect(screen.getByText('标点文')).toBeInTheDocument()
    expect(screen.queryByText('白话')).toBeNull()
  })
})
