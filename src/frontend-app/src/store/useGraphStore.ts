import { create } from 'zustand';

type TabType = 'home' | 'chat' | 'search' | 'reader' | 'bookshelf' | 'compare' | 'history' | 'favorites' | 'wordbook';

interface GraphStore {
    // Tab navigation (shared so any component can switch tabs)
    activeTab: TabType;
    setActiveTab: (tab: TabType) => void;

    // Cross-Tab navigation state
    pendingReaderDocId: string | null;
    pendingSearchQuery: string;
    readerReturnTab: TabType | null;

    // Actions
    navigateToReader: (docId: string) => void;
    clearReaderNavigation: () => void;
    setReaderReturnTab: (tab: TabType | null) => void;
    queueSearchQuery: (query: string) => void;
    consumeSearchQuery: () => string;
}

export const useGraphStore = create<GraphStore>((set, get) => ({
    activeTab: 'home',
    pendingReaderDocId: null,
    pendingSearchQuery: '',
    readerReturnTab: null,

    setActiveTab: (tab) => set({ activeTab: tab }),
    navigateToReader: (docId) => set({ pendingReaderDocId: docId }),
    clearReaderNavigation: () => set({ pendingReaderDocId: null }),
    setReaderReturnTab: (readerReturnTab) => set({ readerReturnTab }),
    queueSearchQuery: (query) => set({ pendingSearchQuery: query }),
    consumeSearchQuery: () => {
        const query = get().pendingSearchQuery
        if (query) set({ pendingSearchQuery: '' })
        return query
    },
}));
