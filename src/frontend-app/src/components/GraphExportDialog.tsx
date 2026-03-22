import { useState, useCallback } from 'react';
import { toPng, toSvg } from 'html-to-image';
import { saveAs } from 'file-saver';
import type { Network } from 'vis-network';
import type { KGNode, KGEdge } from './KnowledgeGraphPanel';

type ExportFormat = 'json' | 'png' | 'svg' | 'md';
type ExportScope = 'current' | 'full';

interface GraphExportDialogProps {
    open: boolean;
    onClose: () => void;
    graphRef: React.RefObject<HTMLElement | null>;
    networkRef: React.RefObject<Network | null>;
    allNodes: KGNode[];
    allEdges: KGEdge[];
}

const FORMAT_OPTIONS: { id: ExportFormat; label: string; desc: string; icon: string }[] = [
    { id: 'json', label: 'JSON', desc: '结构化数据', icon: '{ }' },
    { id: 'png', label: 'PNG', desc: '高清图片 2560x1440', icon: 'IMG' },
    { id: 'svg', label: 'SVG', desc: '矢量图形', icon: 'SVG' },
    { id: 'md', label: 'Markdown', desc: '文本表格', icon: 'MD' },
];

function getTimestamp(): string {
    const d = new Date();
    return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}_${String(d.getHours()).padStart(2, '0')}${String(d.getMinutes()).padStart(2, '0')}`;
}

function getScopeLabel(scope: ExportScope): string {
    return scope === 'full' ? '完整' : '当前视图';
}

export function GraphExportDialog({ open, onClose, graphRef, networkRef, allNodes, allEdges }: GraphExportDialogProps) {
    const [format, setFormat] = useState<ExportFormat>('json');
    const [scope, setScope] = useState<ExportScope>('current');
    const [exporting, setExporting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const makeFilename = useCallback((ext: string) => {
        return `古籍知识图谱_${getScopeLabel(scope)}_${getTimestamp()}.${ext}`;
    }, [scope]);

    const handleExport = useCallback(async () => {
        setExporting(true);
        setError(null);

        try {
            switch (format) {
                case 'json': {
                    const data = { nodes: allNodes, edges: allEdges };
                    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json;charset=utf-8' });
                    saveAs(blob, makeFilename('json'));
                    break;
                }
                case 'png': {
                    const el = graphRef.current;
                    if (!el) throw new Error('图谱容器未找到');
                    // 完整图谱导出先 fit
                    if (scope === 'full' && networkRef.current) {
                        networkRef.current.fit();
                        await new Promise(r => setTimeout(r, 500));
                    }
                    const dataUrl = await toPng(el, {
                        width: 2560,
                        height: 1440,
                        pixelRatio: 2,
                        backgroundColor: '#ffffff',
                    });
                    const res = await fetch(dataUrl);
                    const blob = await res.blob();
                    saveAs(blob, makeFilename('png'));
                    break;
                }
                case 'svg': {
                    const el = graphRef.current;
                    if (!el) throw new Error('图谱容器未找到');
                    if (scope === 'full' && networkRef.current) {
                        networkRef.current.fit();
                        await new Promise(r => setTimeout(r, 500));
                    }
                    try {
                        const dataUrl = await toSvg(el, {
                            width: 2560,
                            height: 1440,
                            backgroundColor: '#ffffff',
                        });
                        const res = await fetch(dataUrl);
                        const blob = await res.blob();
                        saveAs(blob, makeFilename('svg'));
                    } catch {
                        throw new Error('SVG 导出失败（Canvas 渲染模式不完全支持 SVG 导出，请尝试 PNG 格式）');
                    }
                    break;
                }
                case 'md': {
                    const lines: string[] = [
                        `# 古籍知识图谱导出`,
                        '',
                        `> 导出时间: ${new Date().toLocaleString('zh-CN')}`,
                        `> 范围: ${getScopeLabel(scope)}`,
                        `> 节点数: ${allNodes.length} / 关系数: ${allEdges.length}`,
                        '',
                        '## 节点',
                        '',
                        '| ID | 名称 | 分类 | 描述 |',
                        '|----|------|------|------|',
                        ...allNodes.map(n => `| ${n.id} | ${n.label} | ${n.group} | ${n.desc || '-'} |`),
                        '',
                        '## 关系',
                        '',
                        '| 源节点 | 关系 | 目标节点 |',
                        '|--------|------|----------|',
                        ...allEdges.map(e => {
                            const fromLabel = allNodes.find(n => n.id === e.from)?.label || e.from;
                            const toLabel = allNodes.find(n => n.id === e.to)?.label || e.to;
                            return `| ${fromLabel} | ${e.label} | ${toLabel} |`;
                        }),
                    ];
                    const blob = new Blob([lines.join('\n')], { type: 'text/markdown;charset=utf-8' });
                    saveAs(blob, makeFilename('md'));
                    break;
                }
            }
            onClose();
        } catch (err: any) {
            setError(err?.message || '导出失败');
        } finally {
            setExporting(false);
        }
    }, [format, scope, allNodes, allEdges, graphRef, networkRef, makeFilename, onClose]);

    if (!open) return null;

    return (
        <div className="absolute inset-0 z-30 flex items-center justify-center">
            {/* 遮罩 */}
            <div className="absolute inset-0 bg-black/20 backdrop-blur-sm" onClick={onClose} />

            {/* 对话框 */}
            <div className="relative w-80 bg-white/95 backdrop-blur-xl border border-white/60 rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                {/* 头部 */}
                <div className="px-5 py-4 border-b border-white/30">
                    <div className="flex items-center justify-between">
                        <h3
                            className="text-base font-medium text-[var(--gf-text)]"
                            style={{ fontFamily: '"ZCOOL XiaoWei", serif' }}
                        >
                            导出图谱
                        </h3>
                        <button
                            onClick={onClose}
                            className="text-[var(--gf-text)]/40 hover:text-[var(--gf-text)] transition-colors"
                        >
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>
                    </div>
                </div>

                {/* 内容 */}
                <div className="px-5 py-4 space-y-4">
                    {/* 格式选择 */}
                    <div className="space-y-2">
                        <label className="text-[11px] text-[var(--gf-text)]/40 tracking-wider">导出格式</label>
                        <div className="grid grid-cols-2 gap-2">
                            {FORMAT_OPTIONS.map(opt => (
                                <button
                                    key={opt.id}
                                    onClick={() => setFormat(opt.id)}
                                    className={`flex flex-col items-center gap-1 px-3 py-2.5 rounded-xl border transition-all text-center ${
                                        format === opt.id
                                            ? 'border-[var(--gf-gugong-red)]/40 bg-[var(--gf-gugong-red)]/5 text-[var(--gf-gugong-red)]'
                                            : 'border-white/40 bg-white/30 text-[var(--gf-text)]/60 hover:bg-white/60'
                                    }`}
                                >
                                    <span className="text-xs font-mono font-bold">{opt.icon}</span>
                                    <span className="text-[10px]">{opt.desc}</span>
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* 范围选择 */}
                    <div className="space-y-2">
                        <label className="text-[11px] text-[var(--gf-text)]/40 tracking-wider">导出范围</label>
                        <div className="flex gap-2">
                            {(['current', 'full'] as ExportScope[]).map(s => (
                                <button
                                    key={s}
                                    onClick={() => setScope(s)}
                                    className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border transition-all text-[11px] ${
                                        scope === s
                                            ? 'border-[var(--gf-gugong-red)]/40 bg-[var(--gf-gugong-red)]/5 text-[var(--gf-gugong-red)]'
                                            : 'border-white/40 bg-white/30 text-[var(--gf-text)]/60 hover:bg-white/60'
                                    }`}
                                >
                                    <span className="w-3 h-3 rounded-full border-2 flex items-center justify-center" style={{ borderColor: scope === s ? 'var(--gf-gugong-red)' : 'rgba(0,0,0,0.15)' }}>
                                        {scope === s && <span className="w-1.5 h-1.5 rounded-full bg-[var(--gf-gugong-red)]" />}
                                    </span>
                                    {s === 'current' ? '当前视图' : '完整图谱'}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* 错误提示 */}
                    {error && (
                        <p className="text-[11px] text-red-500 bg-red-50/80 rounded-lg px-3 py-2">{error}</p>
                    )}
                </div>

                {/* 底部 */}
                <div className="px-5 py-4 border-t border-white/30">
                    <button
                        onClick={handleExport}
                        disabled={exporting}
                        className="w-full flex items-center justify-center gap-2 px-4 py-2 text-[12px] text-white bg-[var(--gf-gugong-red)]/80 hover:bg-[var(--gf-gugong-red)] disabled:opacity-50 rounded-lg transition-all"
                    >
                        {exporting ? (
                            <>
                                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                导出中...
                            </>
                        ) : (
                            <>
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                                </svg>
                                导出 {FORMAT_OPTIONS.find(f => f.id === format)?.label}
                            </>
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
}
