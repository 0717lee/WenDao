import { create } from 'zustand';
import { API_BASE } from '../lib/api';
import { authHeaders } from './useAuthStore';

interface KGNodeRef {
    id: string;
    label: string;
    group: string;
}

export interface CitationNode {
    node: KGNodeRef & { desc?: string };
    edge: { id: string; from: string; to: string; label: string };
    depth: number;
    fromId: string;
    toId: string;
}

export interface PendingNode {
    id?: string;
    label: string;
    group: string;
    desc: string;
    confidence: number;
    status: 'pending' | 'approved' | 'rejected';
    similar_to?: { id: string; label: string; similarity: number };
}

type TabType = 'home' | 'chat' | 'search' | 'reader' | 'graph' | 'bookshelf' | 'compare' | 'history' | 'favorites' | 'wordbook';

interface GraphStore {
    // Cross-Tab state
    highlightedEntityIds: string[];
    selectedEntity: KGNodeRef | null;
    pendingGraphFocus: string | null;
    pendingReaderDocId: string | null;
    pendingSearchQuery: string;

    // Citation chain state
    citationChainMode: boolean;
    citationChainRoot: string | null;
    citationChain: CitationNode[];

    // Pending nodes (dynamic entity review)
    pendingNodes: PendingNode[];
    addPendingNodes: (nodes: PendingNode[]) => void;
    approveNode: (label: string) => void;
    rejectNode: (label: string) => void;
    approveAllPending: () => void;

    // Tab navigation (shared so any component can switch tabs)
    activeTab: TabType;
    setActiveTab: (tab: TabType) => void;

    // Entity frequency data (reading frequency -> node sizing)
    entityFrequencies: Record<string, number>;
    setEntityFrequencies: (freq: Record<string, number>) => void;

    // Actions
    setHighlightedEntityIds: (ids: string[]) => void;
    setSelectedEntity: (entity: KGNodeRef | null) => void;
    focusEntityInGraph: (entityId: string) => void;
    clearGraphFocus: () => void;
    navigateToReader: (docId: string) => void;
    clearReaderNavigation: () => void;
    queueSearchQuery: (query: string) => void;
    consumeSearchQuery: () => string;
    enterCitationChain: (rootId: string, chain: CitationNode[]) => void;
    exitCitationChain: () => void;
}

export const useGraphStore = create<GraphStore>((set, get) => ({
    highlightedEntityIds: [],
    selectedEntity: null,
    pendingGraphFocus: null,
    pendingReaderDocId: null,
    pendingSearchQuery: '',
    citationChainMode: false,
    citationChainRoot: null,
    citationChain: [],
    pendingNodes: [],
    activeTab: 'home',
    entityFrequencies: {},

    setActiveTab: (tab) => set({ activeTab: tab }),
    setEntityFrequencies: (freq) => set({ entityFrequencies: freq }),
    setHighlightedEntityIds: (ids) => set({ highlightedEntityIds: ids }),
    setSelectedEntity: (entity) => set({ selectedEntity: entity }),
    focusEntityInGraph: (entityId) => set({ pendingGraphFocus: entityId }),
    clearGraphFocus: () => set({ pendingGraphFocus: null }),
    navigateToReader: (docId) => set({ pendingReaderDocId: docId }),
    clearReaderNavigation: () => set({ pendingReaderDocId: null }),
    queueSearchQuery: (query) => set({ pendingSearchQuery: query }),
    consumeSearchQuery: () => {
        const query = get().pendingSearchQuery
        if (query) set({ pendingSearchQuery: '' })
        return query
    },
    enterCitationChain: (rootId, chain) => set({
        citationChainMode: true,
        citationChainRoot: rootId,
        citationChain: chain,
    }),
    exitCitationChain: () => set({
        citationChainMode: false,
        citationChainRoot: null,
        citationChain: [],
    }),

    addPendingNodes: (nodes) => set((state) => ({
        pendingNodes: [
            ...state.pendingNodes,
            ...nodes.filter(n => !state.pendingNodes.some(p => p.label === n.label)),
        ],
    })),

    approveNode: (label) => {
        const state = get();
        const node = state.pendingNodes.find(n => n.label === label);
        if (!node) return;
        // Call API to approve
        if (node.id) {
            fetch(`${API_BASE}/api/v1/knowledge-graph/nodes/${node.id}/approve`, { method: 'PUT', headers: authHeaders() })
                .catch(err => console.error('Failed to approve node:', err));
        }
        set({
            pendingNodes: state.pendingNodes.map(n =>
                n.label === label ? { ...n, status: 'approved' as const } : n
            ),
        });
    },

    rejectNode: (label) => {
        const state = get();
        const node = state.pendingNodes.find(n => n.label === label);
        if (!node) return;
        if (node.id) {
            fetch(`${API_BASE}/api/v1/knowledge-graph/nodes/${node.id}`, { method: 'DELETE', headers: authHeaders() })
                .catch(err => console.error('Failed to reject node:', err));
        }
        set({
            pendingNodes: state.pendingNodes.filter(n => n.label !== label),
        });
    },

    approveAllPending: () => {
        const state = get();
        const pending = state.pendingNodes.filter(n => n.status === 'pending');
        pending.forEach(node => {
            if (node.id) {
                fetch(`${API_BASE}/api/v1/knowledge-graph/nodes/${node.id}/approve`, { method: 'PUT', headers: authHeaders() })
                    .catch(err => console.error('Failed to approve node:', err));
            }
        });
        set({
            pendingNodes: state.pendingNodes.map(n =>
                n.status === 'pending' ? { ...n, status: 'approved' as const } : n
            ),
        });
    },
}));
