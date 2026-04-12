import { create } from 'zustand';

export interface DocumentSegment {
  index: number;
  title: string;
  text: string;
  excerpt?: string;
  summary?: string;
  charCount?: number;
  lineCount?: number;
}

export interface ReaderContentState {
  offset: number;
  limit: number;
  returned: number;
  loadedSegmentCount: number;
  totalSegments: number;
  nextOffset: number | null;
  hasMore: boolean;
}

export interface Document {
  id: string;
  title: string;
  author?: string;
  dynasty?: string;
  category?: string;
  sourceName?: string;
  sourceUrl?: string;
  chapterTitles?: string[];
  chapterCount?: number;
  featuredExcerpt?: string;
  difficulty?: string;
  guideSummary?: string;
  readingTip?: string;
  recommendedChapters?: string[];
  segmentGuides?: Array<{ title: string; excerpt: string; summary: string }>;
  segments?: DocumentSegment[];
  translationCache?: Array<{ title: string; punctuated: string; translated: string }>;
  translationStatus?: string;
  readerContent?: ReaderContentState;
  originalText: string;
  punctuatedText?: string;
  translatedText?: string;
  confidence?: number;
  imageUrl?: string;
  sourceType?: string;
}

interface DocumentStore {
  currentDocument: Document | null;
  comparisonDocuments: Document[];
  pendingAnchorText: string;
  pendingResumeParagraph: number | null;
  pendingReaderPanel: 'notes' | 'study' | 'explain' | null;
  uploadStatus: 'idle' | 'uploading' | 'processing' | 'done' | 'error';
  processProgress: string;
  setDocument: (doc: Document) => void;
  updateDocument: (updates: Partial<Document>) => void;
  clearCurrentDocument: () => void;
  setPendingAnchorText: (anchor: string) => void;
  consumePendingAnchorText: () => string;
  setPendingResumeParagraph: (paragraph: number | null) => void;
  consumePendingResumeParagraph: () => number | null;
  setPendingReaderPanel: (panel: 'notes' | 'study' | 'explain' | null) => void;
  consumePendingReaderPanel: () => 'notes' | 'study' | 'explain' | null;
  toggleComparisonDocument: (doc: Document) => void;
  removeComparisonDocument: (documentId: string) => void;
  clearComparisonDocuments: () => void;
  setUploadStatus: (status: DocumentStore['uploadStatus']) => void;
  setProcessProgress: (progress: string) => void;
  reset: () => void;
}

export const useDocumentStore = create<DocumentStore>((set) => ({
  currentDocument: null,
  comparisonDocuments: [],
  pendingAnchorText: '',
  pendingResumeParagraph: null,
  pendingReaderPanel: null,
  uploadStatus: 'idle',
  processProgress: '',
  setDocument: (doc) => set({ currentDocument: doc }),
  updateDocument: (updates) => set((state) => ({
    currentDocument: state.currentDocument ? { ...state.currentDocument, ...updates } : null,
  })),
  clearCurrentDocument: () => set({ currentDocument: null, uploadStatus: 'idle', processProgress: '' }),
  setPendingAnchorText: (pendingAnchorText) => set({ pendingAnchorText }),
  consumePendingAnchorText: () => {
    let anchor = ''
    set((state) => {
      anchor = state.pendingAnchorText
      return { pendingAnchorText: '' }
    })
    return anchor
  },
  setPendingResumeParagraph: (pendingResumeParagraph) => set({ pendingResumeParagraph }),
  consumePendingResumeParagraph: () => {
    let paragraph: number | null = null
    set((state) => {
      paragraph = state.pendingResumeParagraph
      return { pendingResumeParagraph: null }
    })
    return paragraph
  },
  setPendingReaderPanel: (pendingReaderPanel) => set({ pendingReaderPanel }),
  consumePendingReaderPanel: () => {
    let panel: 'notes' | 'study' | 'explain' | null = null
    set((state) => {
      panel = state.pendingReaderPanel
      return { pendingReaderPanel: null }
    })
    return panel
  },
  toggleComparisonDocument: (doc) => set((state) => {
    const exists = state.comparisonDocuments.some((item) => item.id === doc.id)
    if (exists) {
      return { comparisonDocuments: state.comparisonDocuments.filter((item) => item.id !== doc.id) }
    }
    const next = [...state.comparisonDocuments, doc].slice(-2)
    return { comparisonDocuments: next }
  }),
  removeComparisonDocument: (documentId) => set((state) => ({
    comparisonDocuments: state.comparisonDocuments.filter((item) => item.id !== documentId),
  })),
  clearComparisonDocuments: () => set({ comparisonDocuments: [] }),
  setUploadStatus: (status) => set({ uploadStatus: status }),
  setProcessProgress: (progress) => set({ processProgress: progress }),
  reset: () => set({ currentDocument: null, comparisonDocuments: [], pendingAnchorText: '', pendingResumeParagraph: null, pendingReaderPanel: null, uploadStatus: 'idle', processProgress: '' }),
}));
