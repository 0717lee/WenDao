import { create } from 'zustand';

interface Document {
  id: string;
  title: string;
  originalText: string;
  punctuatedText?: string;
  translatedText?: string;
  confidence?: number;
  imageUrl?: string;
}

interface DocumentStore {
  currentDocument: Document | null;
  comparisonDocuments: Document[];
  uploadStatus: 'idle' | 'uploading' | 'processing' | 'done' | 'error';
  processProgress: string;
  setDocument: (doc: Document) => void;
  updateDocument: (updates: Partial<Document>) => void;
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
  uploadStatus: 'idle',
  processProgress: '',
  setDocument: (doc) => set({ currentDocument: doc }),
  updateDocument: (updates) => set((state) => ({
    currentDocument: state.currentDocument ? { ...state.currentDocument, ...updates } : null,
  })),
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
  reset: () => set({ currentDocument: null, comparisonDocuments: [], uploadStatus: 'idle', processProgress: '' }),
}));
