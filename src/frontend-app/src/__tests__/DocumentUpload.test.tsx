/**
 * DocumentUpload & useDocumentStore Tests
 * Coverage: Document state management, drag-and-drop upload, OCR API call
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { useDocumentStore } from '../store/useDocumentStore'
import { DocumentUpload } from '../components/DocumentUpload'
import { API_BASE } from '../lib/api'

describe('useDocumentStore', () => {
  beforeEach(() => {
    useDocumentStore.getState().reset()
  })

  it('has initial state with null document and idle status', () => {
    const state = useDocumentStore.getState()
    expect(state.currentDocument).toBeNull()
    expect(state.uploadStatus).toBe('idle')
    expect(state.processProgress).toBe('')
  })

  it('setDocument stores document correctly', () => {
    const doc = {
      id: 'test-1',
      title: 'test.png',
      originalText: 'some OCR text',
      confidence: 0.95,
    }
    useDocumentStore.getState().setDocument(doc)
    expect(useDocumentStore.getState().currentDocument).toEqual(doc)
  })

  it('updateDocument merges partial updates', () => {
    useDocumentStore.getState().setDocument({
      id: 'test-1',
      title: 'test.png',
      originalText: 'original',
    })
    useDocumentStore.getState().updateDocument({
      punctuatedText: 'punctuated version',
      translatedText: 'translated version',
    })
    const doc = useDocumentStore.getState().currentDocument
    expect(doc?.punctuatedText).toBe('punctuated version')
    expect(doc?.translatedText).toBe('translated version')
    expect(doc?.originalText).toBe('original')
  })

  it('setUploadStatus updates status', () => {
    useDocumentStore.getState().setUploadStatus('uploading')
    expect(useDocumentStore.getState().uploadStatus).toBe('uploading')
    useDocumentStore.getState().setUploadStatus('done')
    expect(useDocumentStore.getState().uploadStatus).toBe('done')
  })

  it('reset clears all state', () => {
    useDocumentStore.getState().setDocument({
      id: 'test-1',
      title: 'test.png',
      originalText: 'text',
    })
    useDocumentStore.getState().setUploadStatus('done')
    useDocumentStore.getState().reset()
    expect(useDocumentStore.getState().currentDocument).toBeNull()
    expect(useDocumentStore.getState().uploadStatus).toBe('idle')
  })
})

describe('DocumentUpload', () => {
  beforeEach(() => {
    useDocumentStore.getState().reset()
    vi.mocked(global.fetch).mockReset()
  })

  it('renders drag-and-drop zone', () => {
    render(<DocumentUpload />)
    expect(screen.getByText(/拖拽图片|点击上传/)).toBeTruthy()
  })

  it('calls upload API on file drop and stores result', async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        document_id: 'doc-123',
        text: 'OCR recognized text',
        confidence: 0.92,
        image_url: 'data:image/png;base64,ZmFrZQ==',
      }),
    } as Response)

    render(<DocumentUpload />)

    const input = document.querySelector('input[type="file"]') as HTMLInputElement
    const file = new File(['image data'], 'ancient-text.png', { type: 'image/png' })

    // Simulate file drop via the hidden input
    fireEvent.change(input, { target: { files: [file] } })

    await waitFor(() => {
      const state = useDocumentStore.getState()
      expect(state.currentDocument).not.toBeNull()
      expect(state.currentDocument?.id).toBe('doc-123')
      expect(state.currentDocument?.originalText).toBe('OCR recognized text')
      expect(state.currentDocument?.imageUrl).toContain('data:image/png;base64')
      expect(state.uploadStatus).toBe('done')
    })

    expect(global.fetch).toHaveBeenCalledWith(
      `${API_BASE}/api/v1/documents/upload`,
      expect.objectContaining({ method: 'POST' })
    )
  })

  it('shows error state on upload failure', async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: async () => ({ detail: 'Server error' }),
    } as Response)

    render(<DocumentUpload />)

    const input = document.querySelector('input[type="file"]') as HTMLInputElement
    const file = new File(['image data'], 'test.png', { type: 'image/png' })

    fireEvent.change(input, { target: { files: [file] } })

    await waitFor(() => {
      const state = useDocumentStore.getState()
      expect(state.uploadStatus).toBe('error')
    })
  })
})
