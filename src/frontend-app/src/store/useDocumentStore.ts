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
  uploadStatus: 'idle' | 'uploading' | 'processing' | 'done' | 'error';
  processProgress: string;
  setDocument: (doc: Document) => void;
  updateDocument: (updates: Partial<Document>) => void;
  setUploadStatus: (status: DocumentStore['uploadStatus']) => void;
  setProcessProgress: (progress: string) => void;
  reset: () => void;
}

export const useDocumentStore = create<DocumentStore>((set) => ({
  currentDocument: null,
  uploadStatus: 'idle',
  processProgress: '',
  setDocument: (doc) => set({ currentDocument: doc }),
  updateDocument: (updates) => set((state) => ({
    currentDocument: state.currentDocument ? { ...state.currentDocument, ...updates } : null,
  })),
  setUploadStatus: (status) => set({ uploadStatus: status }),
  setProcessProgress: (progress) => set({ processProgress: progress }),
  reset: () => set({ currentDocument: null, uploadStatus: 'idle', processProgress: '' }),
}));
