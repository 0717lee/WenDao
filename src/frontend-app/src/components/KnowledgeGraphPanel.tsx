import { useEffect, useState, useRef, useCallback } from 'react';
import Graph from 'react-graph-vis';
import { useStore } from '../store/useStore';
import { useGraphStore } from '../store/useGraphStore';
import { Network, Edge, Node } from 'vis-network';
import { EntityDetailPanel } from './EntityDetailPanel';
import { GraphExportDialog } from './GraphExportDialog';
import { API_BASE } from '../lib/api';

/* ── 类型 ───────────────────────────────────────────── */
export interface KGNode {
    id: string;
    label: string;
    group: string;  // "人物" | "典籍" | "历史事件" | "思想流派"
    desc?: string;
}
export interface KGEdge {
    id: string;
    from: string;
    to: string;
    label: string;
}
export interface KGData {
    nodes: KGNode[];
    edges: KGEdge[];
    stats: { node_count: number; edge_count: number; groups: string[] };
}

/* ── 分组配色（古籍知识图谱 4 类实体） ──────────────── */
const GROUP_COLORS: Record<string, { bg: string; border: string }> = {
    '人物': { bg: '#fce4c8', border: '#c97b2e' },
    '典籍': { bg: '#d1e5f0', border: '#5b8aab' },
    '历史事件': { bg: '#fadbd8', border: '#b03a3a' },
    '思想流派': { bg: '#d4edda', border: '#3c8a51' },
};

const DEFAULT_COLOR = { bg: '#eeeeee', border: '#999999' };

/* ── 从 group 获取 vis-network 的 color 对象 ──────── */
function groupColor(group: string) {
    const c = GROUP_COLORS[group] || DEFAULT_COLOR;
    return { background: c.bg, border: c.border, highlight: { background: c.bg, border: c.border } };
}

/* ── 内联知识图谱数据（离线兜底） ────────────────── */
const FALLBACK_NODES: KGNode[] = [
    { id: 'kongzi', label: '孔子', group: '人物', desc: '儒家学派创始人，春秋时期思想家、教育家' },
    { id: 'lunyu', label: '论语', group: '典籍', desc: '记录孔子及其弟子言行的儒家经典' },
    { id: 'chunqiu', label: '春秋时期', group: '历史事件', desc: '东周前半段，公元前770年-公元前476年' },
    { id: 'rujia', label: '儒家', group: '思想流派', desc: '以仁义礼智信为核心的思想体系' },
    { id: 'mengzi', label: '孟子', group: '人物', desc: '儒家代表人物，被称为亚圣' },
    { id: 'mengzi_shu', label: '孟子(书)', group: '典籍', desc: '记录孟子言行的儒家经典' },
    { id: 'laozi', label: '老子', group: '人物', desc: '道家学派创始人，著有《道德经》' },
    { id: 'daodejing', label: '道德经', group: '典籍', desc: '道家核心经典，又称《老子》' },
    { id: 'daojia', label: '道家', group: '思想流派', desc: '以道法自然为核心的思想体系' },
    { id: 'zhanguo', label: '战国时期', group: '历史事件', desc: '东周后半段，诸子百家争鸣的时代' },
];
const FALLBACK_EDGES: KGEdge[] = [
    { id: 'f1', from: 'kongzi', to: 'lunyu', label: '著作' },
    { id: 'f2', from: 'kongzi', to: 'rujia', label: '创立' },
    { id: 'f3', from: 'kongzi', to: 'chunqiu', label: '生活于' },
    { id: 'f4', from: 'mengzi', to: 'rujia', label: '属于' },
    { id: 'f5', from: 'mengzi', to: 'mengzi_shu', label: '著作' },
    { id: 'f6', from: 'mengzi', to: 'zhanguo', label: '生活于' },
    { id: 'f7', from: 'laozi', to: 'daodejing', label: '著作' },
    { id: 'f8', from: 'laozi', to: 'daojia', label: '创立' },
    { id: 'f9', from: 'laozi', to: 'chunqiu', label: '生活于' },
    { id: 'f10', from: 'rujia', to: 'zhanguo', label: '兴盛于' },
];

/* ── 主组件 ──────────────────────────────────────── */
export function KnowledgeGraphPanel() {
    const selectedNode = useStore(state => state.selectedNode);
    const setHighlightedType = useStore(state => state.setHighlightedType);
    const networkRef = useRef<Network | null>(null);
    const graphContainerRef = useRef<HTMLDivElement | null>(null);

    const [allNodes, setAllNodes] = useState<KGNode[]>(FALLBACK_NODES);
    const [allEdges, setAllEdges] = useState<KGEdge[]>(FALLBACK_EDGES);
    const [graphData, setGraphData] = useState<{ nodes: Node[]; edges: Edge[] }>({ nodes: [], edges: [] });
    const [focusNode, setFocusNode] = useState<string | null>(null);
    const [stats, setStats] = useState({ nodes: 0, edges: 0 });
    const [selectedNodeDetail, setSelectedNodeDetail] = useState<KGNode | null>(null);
    const [showExportDialog, setShowExportDialog] = useState(false);
    const [stabilizing, setStabilizing] = useState(true);
    const [stabilizationProgress, setStabilizationProgress] = useState(0);

    // Cross-tab highlighting from useGraphStore
    const highlightedEntityIds = useGraphStore(s => s.highlightedEntityIds);
    const pendingGraphFocus = useGraphStore(s => s.pendingGraphFocus);
    const clearGraphFocus = useGraphStore(s => s.clearGraphFocus);
    const setActiveTab = useGraphStore(s => s.setActiveTab);
    const citationChainMode = useGraphStore(s => s.citationChainMode);
    const citationChainRoot = useGraphStore(s => s.citationChainRoot);
    const citationChain = useGraphStore(s => s.citationChain);
    const exitCitationChain = useGraphStore(s => s.exitCitationChain);
    const pendingNodes = useGraphStore(s => s.pendingNodes);
    const entityFrequencies = useGraphStore(s => s.entityFrequencies);
    const setEntityFrequencies = useGraphStore(s => s.setEntityFrequencies);
    const highlightTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    /* ── 加载后端知识图谱 ─────────────────────────── */
    useEffect(() => {
        fetch(`${API_BASE}/api/v1/knowledge-graph`)
            .then(r => r.json())
            .then((data: KGData) => {
                setAllNodes(data.nodes);
                setAllEdges(data.edges);
                setStats({ nodes: data.stats.node_count, edges: data.stats.edge_count });
            })
            .catch(() => {
                setStats({ nodes: FALLBACK_NODES.length, edges: FALLBACK_EDGES.length });
            });
    }, []);

    /* ── 加载阅读频率数据 ─────────────────────────── */
    useEffect(() => {
        fetch(`${API_BASE}/api/v1/reader/entity-frequency`)
            .then(r => r.json())
            .then(data => {
                if (data.frequencies?.length > 0) {
                    const freqMap: Record<string, number> = {};
                    data.frequencies.forEach((f: { entity_id: string; count: number }) => {
                        freqMap[f.entity_id] = f.count;
                    });
                    setEntityFrequencies(freqMap);
                }
            })
            .catch(() => {});
    }, []);

    /* ── 构建当前显示的图（全量或聚焦） ──────────── */
    const buildSubgraph = useCallback((center: string | null) => {
        // Merge approved pending nodes into display
        const approvedPending = pendingNodes.filter(n => n.status === 'approved');
        const pendingDisplay = pendingNodes.filter(n => n.status === 'pending');
        const mergedNodes = [
            ...allNodes,
            ...approvedPending.map(n => ({ id: n.id || n.label, label: n.label, group: n.group, desc: n.desc })),
        ];
        const pendingIds = new Set(pendingDisplay.map(n => n.id || n.label));
        const allDisplayNodes = [
            ...mergedNodes,
            ...pendingDisplay.map(n => ({ id: n.id || n.label, label: `${n.label} (待审核)`, group: n.group, desc: n.desc })),
        ];

        if (!center) {
            // 显示全部节点
            const hasHighlight = highlightedEntityIds.length > 0;
            // Compute frequency scale for node sizing
            const freqValues = Object.values(entityFrequencies);
            const freqMax = freqValues.length > 0 ? Math.max(...freqValues) : 1;
            const freqBonus = (id: string) => {
                const count = entityFrequencies[id] || 0;
                return count > 0 ? (count / freqMax) * 10 : 0;  // 0-10 bonus
            };
            const visNodes = allDisplayNodes.map(n => {
                // 找到连接数最多的节点作为视觉中心
                const connectionCount = allEdges.filter(e => e.from === n.id || e.to === n.id).length;
                const isHub = connectionCount >= 4;
                const isHighlighted = hasHighlight && highlightedEntityIds.includes(n.id);
                const isPending = pendingIds.has(n.id);
                return {
                    id: n.id,
                    label: n.label,
                    group: n.group,
                    color: isHighlighted
                        ? { background: '#fef3c7', border: '#c94043', highlight: { background: '#fef3c7', border: '#c94043' } }
                        : isPending
                            ? { background: '#fff8e1', border: '#b8860b', highlight: { background: '#fff8e1', border: '#b8860b' } }
                            : groupColor(n.group),
                    size: isHighlighted ? 35 : (isHub ? 30 + freqBonus(n.id) : (isPending ? 18 : 20 + freqBonus(n.id))),
                    font: {
                        size: isHighlighted ? 18 : (isHub ? 16 : (isPending ? 11 : 12)),
                        color: isHighlighted ? '#c94043' : isPending ? '#b8860b' : 'var(--gf-text, #1a1e23)',
                    },
                    title: n.desc || n.label,
                    opacity: isPending ? 0.5 : (hasHighlight ? (isHighlighted ? 1 : 0.3) : 1),
                    borderDashes: isPending ? [5, 5] : false,
                };
            });
            setGraphData({ nodes: visNodes as any, edges: allEdges });
            return;
        }

        // 以 center 为核心展开 2 层邻居
        const layer1 = new Set<string>();
        const layer2 = new Set<string>();
        layer1.add(center);

        allEdges.forEach(e => {
            if (e.from === center) layer1.add(e.to);
            if (e.to === center) layer1.add(e.from);
        });
        allEdges.forEach(e => {
            if (layer1.has(e.from) && !layer1.has(e.to)) layer2.add(e.to);
            if (layer1.has(e.to) && !layer1.has(e.from)) layer2.add(e.from);
        });

        const allVisible = new Set([...layer1, ...layer2]);
        const visEdges = allEdges.filter(e => allVisible.has(e.from) && allVisible.has(e.to));
        const visNodes = allNodes
            .filter(n => allVisible.has(n.id))
            .map(n => {
                const isCenter = n.id === center;
                const isL1 = layer1.has(n.id);
                return {
                    id: n.id,
                    label: n.label,
                    group: n.group,
                    color: groupColor(n.group),
                    size: isCenter ? 35 : isL1 ? 22 : 15,
                    font: {
                        size: isCenter ? 18 : isL1 ? 13 : 10,
                        color: isCenter ? '#c94043' : 'var(--gf-text, #1a1e23)',
                    },
                    title: n.desc || n.label,
                    opacity: isL1 ? 1 : 0.7,
                };
            });
        setGraphData({ nodes: visNodes as any, edges: visEdges });
    }, [allNodes, allEdges, highlightedEntityIds, pendingNodes, entityFrequencies]);

    /* ── 当数据或焦点变化时重建子图 ──────────────── */
    useEffect(() => {
        buildSubgraph(focusNode || selectedNode || null);
    }, [focusNode, selectedNode, buildSubgraph]);

    /* ── 处理 pendingGraphFocus（从其他 Tab 导航过来时聚焦） */
    useEffect(() => {
        if (pendingGraphFocus && networkRef.current) {
            networkRef.current.focus(pendingGraphFocus, { scale: 1.5, animation: true });
            networkRef.current.selectNodes([pendingGraphFocus]);
            clearGraphFocus();
        }
    }, [pendingGraphFocus, clearGraphFocus]);

    /* ── 高亮自动清除（10秒后） */
    useEffect(() => {
        if (highlightedEntityIds.length > 0) {
            if (highlightTimerRef.current) clearTimeout(highlightTimerRef.current);
            highlightTimerRef.current = setTimeout(() => {
                useGraphStore.getState().setHighlightedEntityIds([]);
            }, 10000);
        }
        return () => {
            if (highlightTimerRef.current) clearTimeout(highlightTimerRef.current);
        };
    }, [highlightedEntityIds]);

    /* ── 引用链聚焦模式 ─────────────────────────── */
    useEffect(() => {
        if (citationChainMode && citationChainRoot && networkRef.current) {
            const chainNodeIds = new Set([citationChainRoot, ...citationChain.map(c => c.node.id)]);
            const chainEdgeIds = new Set(citationChain.map(c => c.edge.id));

            // Depth-based colors
            const depthColors: Record<number, { bg: string; border: string }> = {
                0: { bg: '#fadbd8', border: 'var(--gf-gugong-red, #8c1a11)' },
                1: { bg: '#f5c6c6', border: '#c94043' },
                2: { bg: '#fef3c7', border: 'var(--gf-gold, #b8860b)' },
                3: { bg: '#fef9e7', border: '#d4a844' },
            };

            // Build depth map
            const nodeDepthMap: Record<string, number> = { [citationChainRoot]: 0 };
            citationChain.forEach(c => { nodeDepthMap[c.node.id] = c.depth; });

            // Rebuild graph with citation focus
            const visNodes = allNodes.map(n => {
                const isInChain = chainNodeIds.has(n.id);
                const depth = nodeDepthMap[n.id] ?? -1;
                const dc = depthColors[depth] || depthColors[3];
                return {
                    id: n.id,
                    label: n.label,
                    group: n.group,
                    color: isInChain
                        ? { background: dc.bg, border: dc.border, highlight: { background: dc.bg, border: dc.border } }
                        : { background: '#eeeeee', border: '#cccccc', highlight: { background: '#eeeeee', border: '#cccccc' } },
                    size: isInChain ? (depth === 0 ? 35 : 25) : 10,
                    font: {
                        size: isInChain ? (depth === 0 ? 18 : 13) : 8,
                        color: isInChain ? (depth === 0 ? 'var(--gf-gugong-red, #8c1a11)' : '#1a1e23') : 'rgba(0,0,0,0.1)',
                    },
                    title: n.desc || n.label,
                    opacity: isInChain ? 1 : 0.15,
                };
            });

            const visEdges = allEdges.map(e => {
                const isChainEdge = chainEdgeIds.has(e.id);
                return {
                    ...e,
                    color: isChainEdge
                        ? { color: 'var(--gf-gugong-red, #8c1a11)', highlight: 'var(--gf-gugong-red, #8c1a11)' }
                        : { color: 'rgba(0,0,0,0.03)', highlight: 'rgba(0,0,0,0.03)' },
                    width: isChainEdge ? 3 : 0.5,
                    font: isChainEdge
                        ? { size: 11, color: 'var(--gf-gugong-red, #8c1a11)', strokeWidth: 2, strokeColor: '#fff', face: '"Noto Serif SC", serif' }
                        : { size: 0, color: 'transparent' },
                };
            });

            setGraphData({ nodes: visNodes as any, edges: visEdges as any });

            // Focus camera on chain nodes
            setTimeout(() => {
                if (networkRef.current) {
                    networkRef.current.fit({ nodes: [...chainNodeIds], animation: { duration: 600, easingFunction: 'easeInOutQuad' } });
                }
            }, 100);
        } else if (!citationChainMode) {
            // Restore full graph when exiting chain mode
            buildSubgraph(focusNode || selectedNode || null);
        }
    }, [citationChainMode, citationChainRoot, citationChain]);

    /* ── vis-network 配置（200+ 节点性能优化） ───── */
    const options = {
        layout: { hierarchical: false },
        nodes: {
            shape: 'dot',
            scaling: { min: 10, max: 35 },
            font: { face: '"Noto Serif SC", serif' },
            borderWidth: 2,
        },
        edges: {
            color: { color: 'rgba(26,30,35,0.25)', highlight: 'rgba(26,30,35,0.6)' },
            width: 1,
            font: {
                size: 9,
                face: '"Noto Serif SC", serif',
                color: 'rgba(26,30,35,0.5)',
                strokeWidth: 2,
                strokeColor: '#ffffff',
            },
            arrows: { to: { enabled: true, scaleFactor: 0.4 } },
            smooth: false,  // 禁用平滑边以优化 200+ 节点性能
        },
        physics: {
            forceAtlas2Based: {
                gravitationalConstant: -40,
                centralGravity: 0.008,
                springLength: 100,
                springConstant: 0.06,
                damping: 0.4,
            },
            solver: 'forceAtlas2Based',
            timestep: 0.35,
            stabilization: { iterations: 150 },
        },
        interaction: { hover: true, zoomView: true, dragView: true, tooltipDelay: 200 },
    };

    /* ── 事件 ────────────────────────────────────── */
    const events = {
        doubleClick: (event: any) => {
            if (event.nodes?.length > 0) {
                setFocusNode(event.nodes[0]);
            }
        },
        select: (event: any) => {
            if (event.nodes?.length > 0) {
                const nodeId = event.nodes[0];
                const nodeData = allNodes.find(n => n.id === nodeId);
                setSelectedNodeDetail(nodeData || null);
                setHighlightedType(nodeId);
            } else {
                setSelectedNodeDetail(null);
                setHighlightedType(null);
            }
        },
        deselectNode: () => {
            setSelectedNodeDetail(null);
            setHighlightedType(null);
        },
        stabilizationProgress: (params: { iterations: number; total: number }) => {
            setStabilizationProgress(params.iterations / params.total);
        },
        stabilizationIterationsDone: () => {
            setStabilizing(false);
            setStabilizationProgress(1);
            // 稳定后关闭物理引擎提升交互性能
            if (networkRef.current) {
                networkRef.current.setOptions({ physics: false });
            }
        },
    };

    /* ── 渲染 ────────────────────────────────────── */
    return (
        <div className="w-full h-full flex flex-col overflow-hidden" style={{ backgroundColor: 'var(--gf-bg)' }}>
            {/* 标题栏 */}
            <div className="px-5 py-3 border-b flex items-center justify-between" style={{ borderColor: 'rgba(26,30,35,0.06)', backgroundColor: 'rgba(255,255,255,0.4)' }}>
                <h3
                    className="text-lg font-medium text-[var(--gf-text)] tracking-widest flex items-center gap-2"
                    style={{ fontFamily: '"ZCOOL XiaoWei", serif' }}
                >
                    <span className="w-1.5 h-1.5 bg-[var(--gf-gugong-red)] rounded-full" />
                    古籍知识图谱
                </h3>
                <div className="flex items-center gap-3">
                    <span className="text-[10px] text-[var(--gf-text)]/40 tracking-wider">
                        {stats.nodes} 节点 / {stats.edges} 关系
                    </span>
                    <button
                        onClick={() => setShowExportDialog(true)}
                        className="flex items-center gap-1 px-2.5 py-1 text-[11px] text-[var(--gf-text)]/60 hover:text-[var(--gf-text)] bg-white/40 hover:bg-white/70 border border-white/40 rounded-lg transition-all"
                        title="导出图谱"
                    >
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                        </svg>
                        导出
                    </button>
                </div>
            </div>

            {/* 面包屑导航 */}
            {focusNode && !citationChainMode && (
                <div className="px-4 py-1.5 text-xs border-b flex items-center gap-1" style={{ color: 'rgba(26,30,35,0.5)', backgroundColor: 'rgba(255,255,255,0.3)', borderColor: 'rgba(26,30,35,0.04)' }}>
                    <button
                        className="transition-colors cursor-pointer"
                        style={{ color: 'rgba(26,30,35,0.5)' }}
                        onMouseEnter={e => (e.currentTarget.style.color = 'var(--gf-gugong-red)')}
                        onMouseLeave={e => (e.currentTarget.style.color = 'rgba(26,30,35,0.5)')}
                        onClick={() => setFocusNode(null)}
                    >
                        全局
                    </button>
                    <span className="opacity-40">/</span>
                    <span className="text-[var(--gf-gugong-red)]">
                        {allNodes.find(n => n.id === focusNode)?.label || focusNode}
                    </span>
                </div>
            )}

            {/* 引用溯源面包屑 */}
            {citationChainMode && citationChainRoot && (
                <div className="px-4 py-2 text-xs border-b flex items-center justify-between" style={{ backgroundColor: 'rgba(140,26,17,0.06)', borderColor: 'rgba(140,26,17,0.1)' }}>
                    <div className="flex items-center gap-1.5 flex-wrap" style={{ fontFamily: '"Noto Serif SC", serif' }}>
                        <svg className="w-3.5 h-3.5 text-[var(--gf-gugong-red)] shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                        </svg>
                        <span className="text-[var(--gf-text)]/50">引用溯源:</span>
                        <span className="text-[var(--gf-gugong-red)] font-medium">
                            {allNodes.find(n => n.id === citationChainRoot)?.label || citationChainRoot}
                        </span>
                        {[1, 2, 3].map(depth => {
                            const nodesAtDepth = citationChain.filter(c => c.depth === depth);
                            if (nodesAtDepth.length === 0) return null;
                            return (
                                <span key={depth} className="flex items-center gap-1">
                                    <span className="text-[var(--gf-text)]/20 mx-0.5">&rarr;</span>
                                    <span className="text-[var(--gf-text)]/60">
                                        {nodesAtDepth.map(c => c.node.label).join(', ')}
                                    </span>
                                </span>
                            );
                        })}
                        {citationChain.length === 0 && (
                            <span className="text-[var(--gf-text)]/30 ml-1">暂无引用关系</span>
                        )}
                    </div>
                    <button
                        onClick={exitCitationChain}
                        className="shrink-0 ml-3 flex items-center gap-1 px-2.5 py-1 text-[11px] text-[var(--gf-gugong-red)] hover:text-white bg-white/60 hover:bg-[var(--gf-gugong-red)] border border-[var(--gf-gugong-red)]/20 rounded-lg transition-all"
                    >
                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                        退出引用溯源
                    </button>
                </div>
            )}

            {/* 图谱渲染区 */}
            <div className="flex-1 w-full relative" ref={graphContainerRef}>
                {/* 稳定化加载指示器 */}
                {stabilizing && (
                    <div className="absolute inset-0 z-10 flex items-center justify-center" style={{ backgroundColor: 'rgba(247,246,243,0.7)', backdropFilter: 'blur(8px)' }}>
                        <div className="flex flex-col items-center gap-3">
                            <div className="w-10 h-10 border-2 rounded-full animate-spin" style={{ borderColor: 'rgba(140,26,17,0.15)', borderTopColor: 'var(--gf-gugong-red)' }} />
                            <span className="text-xs text-[var(--gf-text)]/50">
                                图谱布局中... {Math.round(stabilizationProgress * 100)}%
                            </span>
                        </div>
                    </div>
                )}

                <Graph
                    key={graphData.nodes.map((n: any) => n.id).join(',')}
                    graph={graphData}
                    options={options}
                    events={events}
                    getNetwork={(network: Network) => {
                        networkRef.current = network;
                    }}
                />

                {/* 节点详情面板 */}
                <EntityDetailPanel
                    node={selectedNodeDetail}
                    onClose={() => setSelectedNodeDetail(null)}
                    onFocusInGraph={(nodeId) => setFocusNode(nodeId)}
                    onSelectNode={(n) => setSelectedNodeDetail(n)}
                    onViewRelatedTexts={() => setActiveTab('reader')}
                />
            </div>

            {/* 底部图例（移动端隐藏） */}
            <div className="hidden md:flex px-4 py-2 border-t flex-wrap gap-x-3 gap-y-1" style={{ borderColor: 'rgba(26,30,35,0.06)', backgroundColor: 'rgba(255,255,255,0.3)' }}>
                {['人物', '典籍', '历史事件', '思想流派'].map(g => {
                    const c = GROUP_COLORS[g] || DEFAULT_COLOR;
                    return (
                        <span key={g} className="flex items-center gap-1 text-[10px] text-[var(--gf-text)]/50">
                            <span
                                className="inline-block w-2 h-2 rounded-full"
                                style={{ backgroundColor: c.border }}
                            />
                            {g}
                        </span>
                    );
                })}
            </div>

            {/* 导出对话框 */}
            <GraphExportDialog
                open={showExportDialog}
                onClose={() => setShowExportDialog(false)}
                graphRef={graphContainerRef}
                networkRef={networkRef}
                allNodes={allNodes}
                allEdges={allEdges}
            />
        </div>
    );
}
