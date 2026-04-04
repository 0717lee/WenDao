/**
 * DocumentUpload & useDocumentStore Tests
 * Coverage: Document state management, dual-entry page, OCR upload flow
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { useDocumentStore } from '../store/useDocumentStore'
import { DocumentUpload } from '../components/DocumentUpload'
import { API_BASE } from '../lib/api'

const SAMPLE_LIST = {
  documents: [
    {
      id: 'sample-1',
      title: '体验样例 · 《论语·学而》',
      preview: '学习后经常复习实践，不也是快乐的吗？',
    },
  ],
}

const SAMPLE_DETAIL = {
  id: 'sample-1',
  title: '体验样例 · 《论语·学而》',
  original_text: '学而时习之不亦说乎',
  punctuated_text: '学而时习之，不亦说乎？',
  translated_text: '学习后经常复习实践，不也是快乐的吗？',
  ocr_confidence: 1,
  image_data: null,
}

function installFetchMock(options?: {
  uploadResponse?: Response | Promise<Response>
  sampleListResponse?: Response | Promise<Response>
  sampleDetailResponse?: Response | Promise<Response>
}) {
  ;(global.fetch as any).mockImplementation((url: string) => {
    if (typeof url === 'string' && url.includes('/api/v1/documents?limit=6&source_type=sample')) {
      return options?.sampleListResponse ?? Promise.resolve({
        ok: true,
        json: async () => SAMPLE_LIST,
      } as Response)
    }

    if (typeof url === 'string' && url.includes('/api/v1/documents/sample-1')) {
      return options?.sampleDetailResponse ?? Promise.resolve({
        ok: true,
        json: async () => SAMPLE_DETAIL,
      } as Response)
    }

    if (typeof url === 'string' && url.includes('/api/v1/documents/upload')) {
      return options?.uploadResponse ?? Promise.resolve({
        ok: true,
        json: async () => ({
          document_id: 'doc-123',
          text: 'OCR recognized text',
          confidence: 0.92,
          image_url: 'data:image/png;base64,ZmFrZQ==',
        }),
      } as Response)
    }

    return Promise.resolve({
      ok: true,
      json: async () => ({ documents: [] }),
    } as Response)
  })
}

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
    installFetchMock()
  })

  it('renders dual-entry page with upload zone and sample area', async () => {
    render(<DocumentUpload />)

    expect(screen.getByText(/无古籍图片，亦可即刻起读/)).toBeInTheDocument()
    expect(screen.getByText(/拖拽图片|点击上传/)).toBeInTheDocument()
    expect(await screen.findByText('体验样例 · 《论语·学而》')).toBeInTheDocument()
  })

  it('opens a sample document and stores full reader content', async () => {
    render(<DocumentUpload />)

    fireEvent.click(await screen.findByText('体验样例 · 《论语·学而》'))

    await waitFor(() => {
      const state = useDocumentStore.getState()
      expect(state.currentDocument?.id).toBe('sample-1')
      expect(state.currentDocument?.punctuatedText).toBe('学而时习之，不亦说乎？')
      expect(state.currentDocument?.translatedText).toBe('学习后经常复习实践，不也是快乐的吗？')
      expect(state.uploadStatus).toBe('done')
    })
  })

  it('calls upload API on file drop and stores result', async () => {
    installFetchMock({
      uploadResponse: Promise.resolve({
        ok: true,
        json: async () => ({
          document_id: 'doc-123',
          text: 'OCR recognized text',
          confidence: 0.92,
          image_url: 'data:image/png;base64,ZmFrZQ==',
        }),
      } as Response),
    })

    render(<DocumentUpload />)

    const input = document.querySelector('input[type="file"]') as HTMLInputElement
    const file = new File(['image data'], 'ancient-text.png', { type: 'image/png' })

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
    installFetchMock({
      uploadResponse: Promise.resolve({
        ok: false,
        status: 500,
        json: async () => ({ detail: 'Server error' }),
      } as Response),
    })

    render(<DocumentUpload />)

    const input = document.querySelector('input[type="file"]') as HTMLInputElement
    const file = new File(['image data'], 'test.png', { type: 'image/png' })

    fireEvent.change(input, { target: { files: [file] } })

    await waitFor(() => {
      const state = useDocumentStore.getState()
      expect(state.uploadStatus).toBe('error')
      expect(screen.getByText(/上传没有成功/)).toBeInTheDocument()
      expect(screen.getByRole('button', { name: '转至体验样例' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: '先问一句古文' })).toBeInTheDocument()
    })
  })

  it('falls back to local demo samples when sample API is unavailable', async () => {
    ;(global.fetch as any).mockImplementation((url: string) => {
      if (typeof url === 'string' && url.includes('/api/v1/documents?limit=6&source_type=sample')) {
        return Promise.reject(new Error('network down'))
      }

      if (typeof url === 'string' && url.includes('/api/v1/documents/')) {
        return Promise.reject(new Error('network down'))
      }

      if (typeof url === 'string' && url.includes('/api/v1/documents/upload')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            document_id: 'doc-123',
            text: 'OCR recognized text',
            confidence: 0.92,
            image_url: 'data:image/png;base64,ZmFrZQ==',
          }),
        } as Response)
      }

      return Promise.resolve({
        ok: true,
        json: async () => ({ documents: [] }),
      } as Response)
    })

    render(<DocumentUpload />)

    expect(await screen.findByText('体验样例 · 《论语·学而》')).toBeInTheDocument()
    expect(screen.getByText(/当前展示本地样例/)).toBeInTheDocument()

    fireEvent.click(screen.getByText('体验样例 · 《论语·学而》'))

    await waitFor(() => {
      const state = useDocumentStore.getState()
      expect(state.currentDocument?.title).toBe('体验样例 · 《论语·学而》')
      expect(state.currentDocument?.translatedText).toContain('学习之后经常温习实践')
      expect(state.uploadStatus).toBe('done')
    })
  })
})
