import { useEffect, useState } from 'react';
import {
    PieChart, Pie, Cell,
    BarChart, Bar,
    AreaChart, Area,
    XAxis, YAxis, CartesianGrid, Tooltip,
    ResponsiveContainer,
} from 'recharts';
import { API_BASE } from '../lib/api';

/* ── National-style palette ── */
const COLORS = {
    gugongRed: '#8c1a11',
    gold: '#c9a063',
    paper: '#f4f1e1',
    text: '#1a1e23',
};

const GROUP_COLORS: Record<string, string> = {
    '人物': '#c97b2e',
    '典籍': '#5b8aab',
    '历史事件': '#b03a3a',
    '思想流派': '#3c8a51',
};

const FALLBACK_PALETTE = ['#c97b2e', '#5b8aab', '#b03a3a', '#3c8a51', '#8c6bb1', '#d4a259'];

/* ── Types ── */
interface OverviewData {
    entity_distribution: Record<string, number>;
    top_entities: { id: string; label: string; count: number }[];
    edge_type_distribution: Record<string, number>;
    dynasty_distribution: Record<string, number>;
    total_nodes: number;
    total_edges: number;
}

/* ── Card wrapper ── */
function Card({ title, children }: { title: string; children: React.ReactNode }) {
    return (
        <div
            className="rounded-lg p-5 flex flex-col"
            style={{
                backgroundColor: '#fff',
                border: '1px solid rgba(26,30,35,0.08)',
                boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
            }}
        >
            <h3
                className="text-base mb-4"
                style={{
                    fontFamily: '"ZCOOL XiaoWei", "Noto Serif SC", serif',
                    color: COLORS.text,
                    fontWeight: 500,
                }}
            >
                {title}
            </h3>
            <div className="flex-1 min-h-0">{children}</div>
        </div>
    );
}

/* ── Custom tooltip ── */
function ChartTooltip({ active, payload, label }: any) {
    if (!active || !payload?.length) return null;
    return (
        <div
            className="rounded px-3 py-2 text-xs"
            style={{
                backgroundColor: 'rgba(26,30,35,0.92)',
                color: '#fff',
                border: 'none',
            }}
        >
            <p>{label ?? payload[0].name}</p>
            <p style={{ color: COLORS.gold }}>{payload[0].value}</p>
        </div>
    );
}

/* ── Main component ── */
export default function AnalyticsDashboard() {
    const [data, setData] = useState<OverviewData | null>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        fetch(`${API_BASE}/api/v1/analytics/overview`)
            .then(r => {
                if (!r.ok) throw new Error(`HTTP ${r.status}`);
                return r.json();
            })
            .then(setData)
            .catch(e => setError(e.message));
    }, []);

    if (error) {
        return (
            <div className="flex items-center justify-center h-full">
                <p className="text-sm" style={{ color: 'rgba(26,30,35,0.45)' }}>
                    加载分析数据失败：{error}
                </p>
            </div>
        );
    }

    if (!data) {
        return (
            <div className="flex items-center justify-center h-full">
                <p className="text-sm" style={{ color: 'rgba(26,30,35,0.45)' }}>加载中...</p>
            </div>
        );
    }

    /* Prepare chart data */
    const pieData = Object.entries(data.entity_distribution).map(([name, value]) => ({
        name,
        value,
    }));

    const barData = data.top_entities.map(e => ({
        name: e.label,
        count: e.count,
    }));

    const dynastyData = Object.entries(data.dynasty_distribution).map(([name, value]) => ({
        name,
        count: value,
    }));

    const edgeData = Object.entries(data.edge_type_distribution).map(([name, value]) => ({
        name,
        count: value,
    }));

    return (
        <div className="h-full overflow-y-auto p-4 md:p-6" style={{ backgroundColor: 'var(--gf-bg)' }}>
            {/* Summary strip */}
            <div className="flex items-center gap-6 mb-5">
                <span className="text-sm" style={{ color: 'rgba(26,30,35,0.55)' }}>
                    实体总数 <strong style={{ color: COLORS.text }}>{data.total_nodes}</strong>
                </span>
                <span className="text-sm" style={{ color: 'rgba(26,30,35,0.55)' }}>
                    关系总数 <strong style={{ color: COLORS.text }}>{data.total_edges}</strong>
                </span>
            </div>

            {/* 2x2 grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                {/* 1. Entity type distribution — Donut */}
                <Card title="实体类型分布">
                    <ResponsiveContainer width="100%" height={260}>
                        <PieChart>
                            <Pie
                                data={pieData}
                                cx="50%"
                                cy="50%"
                                innerRadius="45%"
                                outerRadius="72%"
                                paddingAngle={3}
                                dataKey="value"
                                nameKey="name"
                                stroke="none"
                            >
                                {pieData.map((entry, idx) => (
                                    <Cell
                                        key={entry.name}
                                        fill={GROUP_COLORS[entry.name] ?? FALLBACK_PALETTE[idx % FALLBACK_PALETTE.length]}
                                    />
                                ))}
                            </Pie>
                            <Tooltip content={<ChartTooltip />} />
                        </PieChart>
                    </ResponsiveContainer>
                    {/* Legend */}
                    <div className="flex flex-wrap gap-3 mt-2 justify-center">
                        {pieData.map((entry, idx) => (
                            <span key={entry.name} className="flex items-center gap-1 text-xs" style={{ color: 'rgba(26,30,35,0.65)' }}>
                                <span
                                    className="inline-block w-2.5 h-2.5 rounded-sm"
                                    style={{ backgroundColor: GROUP_COLORS[entry.name] ?? FALLBACK_PALETTE[idx % FALLBACK_PALETTE.length] }}
                                />
                                {entry.name} ({entry.value})
                            </span>
                        ))}
                    </div>
                </Card>

                {/* 2. Top entities — Horizontal bar */}
                <Card title="高频实体排行">
                    <ResponsiveContainer width="100%" height={290}>
                        <BarChart data={barData} layout="vertical" margin={{ left: 10, right: 20, top: 0, bottom: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="rgba(26,30,35,0.06)" />
                            <XAxis type="number" tick={{ fontSize: 11, fill: 'rgba(26,30,35,0.45)' }} />
                            <YAxis
                                type="category"
                                dataKey="name"
                                width={70}
                                tick={{ fontSize: 12, fill: COLORS.text }}
                            />
                            <Tooltip content={<ChartTooltip />} />
                            <Bar dataKey="count" fill={COLORS.gugongRed} radius={[0, 4, 4, 0]} barSize={16} />
                        </BarChart>
                    </ResponsiveContainer>
                </Card>

                {/* 3. Dynasty distribution — Area chart */}
                <Card title="朝代分布">
                    <ResponsiveContainer width="100%" height={260}>
                        <AreaChart data={dynastyData} margin={{ left: 0, right: 10, top: 5, bottom: 0 }}>
                            <defs>
                                <linearGradient id="goldGrad" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="0%" stopColor={COLORS.gold} stopOpacity={0.5} />
                                    <stop offset="100%" stopColor={COLORS.gold} stopOpacity={0.05} />
                                </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" stroke="rgba(26,30,35,0.06)" />
                            <XAxis dataKey="name" tick={{ fontSize: 11, fill: 'rgba(26,30,35,0.55)' }} />
                            <YAxis tick={{ fontSize: 11, fill: 'rgba(26,30,35,0.45)' }} allowDecimals={false} />
                            <Tooltip content={<ChartTooltip />} />
                            <Area
                                type="monotone"
                                dataKey="count"
                                stroke={COLORS.gold}
                                strokeWidth={2}
                                fill="url(#goldGrad)"
                            />
                        </AreaChart>
                    </ResponsiveContainer>
                </Card>

                {/* 4. Edge type distribution — Bar chart */}
                <Card title="关系类型分布">
                    <ResponsiveContainer width="100%" height={260}>
                        <BarChart data={edgeData} margin={{ left: 0, right: 10, top: 5, bottom: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="rgba(26,30,35,0.06)" />
                            <XAxis
                                dataKey="name"
                                tick={{ fontSize: 11, fill: 'rgba(26,30,35,0.55)' }}
                                interval={0}
                                angle={-30}
                                textAnchor="end"
                                height={60}
                            />
                            <YAxis tick={{ fontSize: 11, fill: 'rgba(26,30,35,0.45)' }} allowDecimals={false} />
                            <Tooltip content={<ChartTooltip />} />
                            <Bar dataKey="count" fill={COLORS.gugongRed} radius={[4, 4, 0, 0]} barSize={24} />
                        </BarChart>
                    </ResponsiveContainer>
                </Card>
            </div>
        </div>
    );
}
