import { create } from 'zustand';

type TabType = 'home' | 'chat' | 'search' | 'reader' | 'bookshelf' | 'compare' | 'history' | 'favorites' | 'wordbook';
type ReaderHubSection = 'upload'

interface GraphStore {
    // Global tab navigation (shared so any component can switch tabs)
    activeTab: TabType;
    setActiveTab: (tab: TabType) => void;

    // Cross-Tab navigation state
    pendingReaderDocId: string | null;
    pendingSearchQuery: string;
    pendingReaderHubSection: ReaderHubSection | null;
    readerReturnTab: TabType | null;

    // Actions
    navigateToReader: (docId: string) => void;
    clearReaderNavigation: () => void;
    setReaderReturnTab: (tab: TabType | null) => void;
    queueSearchQuery: (query: string) => void;
    consumeSearchQuery: () => string;
    queueReaderHubSection: (section: ReaderHubSection) => void;
    consumeReaderHubSection: () => ReaderHubSection | null;
}

export const useGraphStore = create<GraphStore>((set, get) => ({
    activeTab: 'home',
    pendingReaderDocId: null,
    pendingSearchQuery: '',
    pendingReaderHubSection: null,
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
    queueReaderHubSection: (section) => set({ pendingReaderHubSection: section }),
    consumeReaderHubSection: () => {
        const section = get().pendingReaderHubSection
        if (section) set({ pendingReaderHubSection: null })
        return section
    },
}));
