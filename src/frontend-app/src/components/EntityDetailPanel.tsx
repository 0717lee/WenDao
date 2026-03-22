import { useEffect, useState } from 'react';
import type { KGNode, KGEdge } from './KnowledgeGraphPanel';
import { useGraphStore } from '../store/useGraphStore';
import type { CitationNode } from '../store/useGraphStore';
import { API_BASE } from '../lib/api';

/* ── 分组配色（与 KnowledgeGraphPanel 一致） ─────── */
const GROUP_COLORS: Record<string, { bg: string; border: string }> = {
    '人物': { bg: '#fce4c8', border: '#c97b2e' },
    '典籍': { bg: '#d1e5f0', border: '#5b8aab' },
    '历史事件': { bg: '#fadbd8', border: '#b03a3a' },
    '思想流派': { bg: '#d4edda', border: '#3c8a51' },
};
const DEFAULT_COLOR = { bg: '#eeeeee', border: '#999999' };

interface ConnectedEntity {
    node: KGNode;
    relationship: string;
    direction: 'from' | 'to';
}

interface EntityDetailPanelProps {
    node: KGNode | null;
    onClose: () => void;
    onViewRelatedTexts?: (nodeId: string) => void;
    onFocusInGraph?: (nodeId: string) => void;
    onSelectNode?: (node: KGNode) => void;
}

export function EntityDetailPanel({ node, onClose, onViewRelatedTexts, onFocusInGraph, onSelectNode }: EntityDetailPanelProps) {
    const [connected, setConnected] = useState<ConnectedEntity[]>([]);
    const [loading, setLoading] = useState(false);
    const [citationToast, setCitationToast] = useState<string | null>(null);
    const [citationLoading, setCitationLoading] = useState(false);

    async function handleViewCitations(nodeId: string) {
        setCitationLoading(true);
        try {
            const resp = await fetch(`${API_BASE}/api/v1/knowledge-graph/node/${nodeId}/citations`);
            const data = await resp.json();
            if (data.chain && data.chain.length > 0) {
                const chain: CitationNode[] = data.chain.map((c: any) => ({
                    node: c.node,
                    edge: c.edge,
                    depth: c.depth,
                    fromId: c.from_id,
                    toId: c.to_id,
                }));
                useGraphStore.getState().enterCitationChain(nodeId, chain);
            } else {
                setCitationToast('暂无引用关系');
                setTimeout(() => setCitationToast(null), 2500);
            }
        } catch {
            setCitationToast('查询失败，请稍后重试');
            setTimeout(() => setCitationToast(null), 2500);
        } finally {
            setCitationLoading(false);
        }
    }

    /* ── 加载关联实体 ─────────────────────────────── */
    useEffect(() => {
        if (!node) {
            setConnected([]);
            return;
        }

        setLoading(true);
        fetch(`${API_BASE}/api/v1/knowledge-graph/node/${node.id}`)
            .then(r => r.json())
            .then((data: { node: KGNode; edges: KGEdge[]; neighbors: KGNode[] }) => {
                const entities: ConnectedEntity[] = data.edges.map(edge => {
                    const isFrom = edge.from === node.id;
                    const neighborId = isFrom ? edge.to : edge.from;
                    const neighbor = data.neighbors.find(n => n.id === neighborId);
                    return {
                        node: neighbor || { id: neighborId, label: neighborId, group: '' },
                        relationship: edge.label,
                        direction: isFrom ? 'to' as const : 'from' as const,
                    };
                });
                setConnected(entities);
            })
            .catch(() => setConnected([]))
            .finally(() => setLoading(false));
    }, [node]);

    if (!node) return null;

    const color = GROUP_COLORS[node.group] || DEFAULT_COLOR;

    // 按关系类型分组
    const groupedByRelation: Record<string, ConnectedEntity[]> = {};
    connected.forEach(c => {
        const key = c.relationship;
        if (!groupedByRelation[key]) groupedByRelation[key] = [];
        groupedByRelation[key].push(c);
    });

    return (
        <div className="absolute top-4 right-4 w-72 max-h-[calc(100%-2rem)] bg-white/90 backdrop-blur-xl border border-white/60 rounded-xl shadow-lg overflow-hidden animate-in fade-in slide-in-from-right-4 duration-300 flex flex-col z-20">
            {/* 头部 */}
            <div className="px-4 pt-4 pb-3 border-b border-white/30">
                <div className="flex items-start justify-between mb-2">
                    <h4
                        className="text-lg font-medium text-[var(--gf-text)] leading-tight"
                        style={{ fontFamily: '"ZCOOL XiaoWei", serif' }}
                    >
                        {node.label}
                    </h4>
                    <button
                        onClick={onClose}
                        className="text-[var(--gf-text)]/40 hover:text-[var(--gf-text)] transition-colors shrink-0 ml-2"
                    >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>
                <span
                    className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px]"
                    style={{ backgroundColor: color.bg, color: color.border, border: `1px solid ${color.border}40` }}
                >
                    <span className="w-2 h-2 rounded-full" style={{ backgroundColor: color.border }} />
                    {node.group}
                </span>
            </div>

            {/* 描述 */}
            <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3" style={{ fontFamily: '"Noto Serif SC", serif' }}>
                {node.desc && (
                    <p className="text-xs text-[var(--gf-text)]/70 leading-relaxed">
                        {node.desc}
                    </p>
                )}

                {/* 关联实体 */}
                <div className="space-y-2">
                    <h5 className="text-[11px] text-[var(--gf-text)]/40 tracking-wider">关联实体</h5>
                    {loading ? (
                        <div className="flex items-center gap-2 py-2">
                            <div className="w-4 h-4 border border-[var(--gf-text)]/20 border-t-[var(--gf-text)]/60 rounded-full animate-spin" />
                            <span className="text-[11px] text-[var(--gf-text)]/40">加载中...</span>
                        </div>
                    ) : connected.length === 0 ? (
                        <p className="text-[11px] text-[var(--gf-text)]/30 py-1">暂无关联实体</p>
                    ) : (
                        Object.entries(groupedByRelation).map(([relation, entities]) => (
                            <div key={relation} className="space-y-1">
                                <span className="text-[10px] text-[var(--gf-text)]/30">{relation}</span>
                                <div className="flex flex-wrap gap-1">
                                    {entities.map(e => {
                                        const ec = GROUP_COLORS[e.node.group] || DEFAULT_COLOR;
                                        return (
                                            <button
                                                key={e.node.id}
                                                onClick={() => onSelectNode?.(e.node)}
                                                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] hover:opacity-80 transition-opacity cursor-pointer"
                                                style={{ backgroundColor: ec.bg, color: ec.border, border: `1px solid ${ec.border}30` }}
                                            >
                                                <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: ec.border }} />
                                                {e.node.label}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </div>

            {/* 操作按钮 */}
            <div className="px-4 py-3 border-t border-white/30 space-y-2">
                {(node.group === '典籍' || node.group === '典故') && (
                    <button
                        onClick={() => handleViewCitations(node.id)}
                        disabled={citationLoading}
                        className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 text-[11px] text-white bg-[var(--gf-gold)]/80 hover:bg-[var(--gf-gold)] rounded-lg transition-all disabled:opacity-50"
                    >
                        {citationLoading ? (
                            <div className="w-3.5 h-3.5 border border-white/40 border-t-white rounded-full animate-spin" />
                        ) : (
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                            </svg>
                        )}
                        查看引用溯源
                    </button>
                )}
                {onFocusInGraph && (
                    <button
                        onClick={() => onFocusInGraph(node.id)}
                        className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 text-[11px] text-[var(--gf-text)]/70 hover:text-[var(--gf-text)] bg-white/50 hover:bg-white/80 border border-white/40 rounded-lg transition-all"
                    >
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                        </svg>
                        在图谱中查看
                    </button>
                )}
                {onViewRelatedTexts && (
                    <button
                        onClick={() => onViewRelatedTexts(node.id)}
                        className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 text-[11px] text-white bg-[var(--gf-gugong-red)]/80 hover:bg-[var(--gf-gugong-red)] rounded-lg transition-all"
                    >
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                        </svg>
                        查看相关古籍
                    </button>
                )}
            </div>

            {/* Citation toast */}
            {citationToast && (
                <div className="absolute bottom-16 left-1/2 -translate-x-1/2 px-3 py-1.5 bg-black/70 text-white text-[11px] rounded-lg whitespace-nowrap animate-in fade-in duration-200">
                    {citationToast}
                </div>
            )}
        </div>
    );
}
