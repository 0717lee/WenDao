import { useEffect, useState } from 'react';
import { useStore } from '../store/useStore';
import { Radar, RadarChart, PolarGrid, PolarAngleAxis, ResponsiveContainer, AreaChart, Area } from 'recharts';
import { ShieldAlert, Activity, Wind, Thermometer, Map, Grid, Box } from 'lucide-react';
import { API_BASE } from '../lib/api';

// 监测数据类型定义
interface MonitoringMetrics {
    subject: string;
    value: number;
    unit: string;
    status: string;
    threshold_warning: number;
    threshold_danger: number;
}

interface MonitoringData {
    building_id: string;
    building_name: string;
    timestamp: string;
    overall_status: string;
    metrics: MonitoringMetrics[];
    environmental: {
        wind_speed: number;
        temperature: number;
        humidity: number;
        surface_moisture: number;
    };
    trend_data: Array<{ timestamp: number; value: number }>;
}

// 模拟雷达图数据（作为后备）
const initialRadarData = [
    { subject: '结构沉降', A: 30, fullMark: 100 },
    { subject: '水平倾斜', A: 20, fullMark: 100 },
    { subject: '构件应力', A: 45, fullMark: 100 },
    { subject: '风载耗损', A: 60, fullMark: 100 },
    { subject: '温湿度衰变', A: 40, fullMark: 100 },
    { subject: '火险隐患', A: 15, fullMark: 100 },
];

export function HudDashboardPanel() {
    const scaleLevel = useStore(state => state.scaleLevel);
    const activeCatalog = useStore(state => state.activeCatalog);
    const activeBuilding = useStore(state => state.activeBuilding);
    const lastCommand = useStore(state => state.lastCommand);

    const [radarData, setRadarData] = useState(initialRadarData);
    const [seriesData, setSeriesData] = useState<Array<{ name: number; value: number }>>([]);
    const [alertLevel, setAlertLevel] = useState<'safe' | 'warning' | 'danger'>('safe');
    const [environmental, setEnvironmental] = useState({ wind_speed: 2.4, surface_moisture: 14.2 });
    const [isLoading, setIsLoading] = useState(false);

    // 从后端获取真实监测数据
    useEffect(() => {
        if (scaleLevel === 'MACRO') return;

        const fetchMonitoringData = async () => {
            try {
                setIsLoading(true);
                const buildingId = activeBuilding?.id || 'dougong';

                const response = await fetch(`${API_BASE}/api/v1/monitoring/health/${buildingId}`);
                if (!response.ok) throw new Error('Failed to fetch monitoring data');

                const data: MonitoringData = await response.json();

                // 转换为雷达图格式
                const newRadarData = data.metrics.map(m => ({
                    subject: m.subject,
                    A: m.value,
                    fullMark: 100,
                }));
                setRadarData(newRadarData);

                // 设置趋势数据
                const newSeriesData = data.trend_data.map(t => ({
                    name: t.timestamp,
                    value: t.value,
                }));
                setSeriesData(newSeriesData);

                // 设置环境数据
                setEnvironmental({
                    wind_speed: data.environmental.wind_speed,
                    surface_moisture: data.environmental.surface_moisture,
                });

                // 设置警报级别
                setAlertLevel(data.overall_status as 'safe' | 'warning' | 'danger');

            } catch (error) {
                console.error('获取监测数据失败:', error);
                // 失败时使用模拟数据
                setRadarData(initialRadarData);
            } finally {
                setIsLoading(false);
            }
        };

        // 首次加载
        fetchMonitoringData();

        // 每30秒刷新一次数据（模拟实时监测）
        const interval = setInterval(fetchMonitoringData, 30000);
        return () => clearInterval(interval);
    }, [scaleLevel, activeBuilding]);

    // 处理应力指令
    useEffect(() => {
        if (scaleLevel === 'MACRO') return;

        if (lastCommand?.action === 'stress') {
            const severity = (lastCommand.message || '').includes('危险') || (lastCommand.message || '').includes('高') ? 'danger' : 'warning';
            setAlertLevel(severity);
        }
    }, [lastCommand, scaleLevel]);

    const getStatusColor = () => {
        if (scaleLevel === 'MACRO') return 'text-sky-500';
        if (alertLevel === 'danger') return 'text-red-500';
        if (alertLevel === 'warning') return 'text-amber-500';
        return 'text-emerald-500';
    };

    const getStatusBgColor = () => {
        if (scaleLevel === 'MACRO') return 'bg-sky-500/10 border-sky-500/30';
        if (alertLevel === 'danger') return 'bg-red-500/20 border-red-500/50';
        if (alertLevel === 'warning') return 'bg-amber-500/20 border-amber-500/50';
        return 'bg-emerald-500/10 border-emerald-500/30';
    };

    return (
        <div className="w-full flex flex-col gap-4 p-4">
            <div className={`w-full flex flex-col bg-white/40 backdrop-blur-xl border rounded-2xl shadow-[0_8px_32px_rgba(0,0,0,0.08)] overflow-hidden transition-all duration-500 ${getStatusBgColor()}`}>
                
                {/* Header */}
                <div className="px-5 py-3 border-b border-[var(--gf-text)]/5 flex items-center justify-between bg-gradient-to-r from-white/60 to-transparent">
                    <h3 className="text-xl font-medium text-[var(--gf-text)] tracking-widest flex items-center gap-2" style={{ fontFamily: '"ZCOOL XiaoWei", serif' }}>
                        <ShieldAlert className={`w-4 h-4 ${getStatusColor()}`} />
                        {scaleLevel === 'MACRO' ? '系统宏观统计' : '木构安防监测'}
                    </h3>
                    <span className={`text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full border ${scaleLevel === 'MACRO' ? 'bg-sky-100 text-sky-700 border-sky-200' : alertLevel === 'danger' ? 'bg-[var(--gf-gugong-red)] text-white border-[var(--gf-gugong-red)] animate-pulse' : alertLevel === 'warning' ? 'bg-amber-500 text-white border-amber-600' : 'bg-emerald-100 text-emerald-700 border-emerald-200'}`}>
                        {scaleLevel === 'MACRO' ? 'OVERVIEW' : alertLevel === 'danger' ? 'CRITICAL' : alertLevel === 'warning' ? 'WARNING' : 'NORMAL'}
                    </span>
                </div>

                <div className="p-4 space-y-4">
                    {/* 根据状态按需渲染宏大或微观内容 */}
                    {scaleLevel === 'MACRO' && activeCatalog ? (
                        <>
                            {/* MACRO: 宏观建筑信息面板 */}
                            <div className="space-y-3">
                                <div className="bg-gradient-to-br from-white/60 to-white/30 rounded-xl border border-white/50 p-5 text-center">
                                    <div className="text-2xl font-bold text-[var(--gf-text)] mb-2" style={{ fontFamily: '"ZCOOL XiaoWei", serif' }}>
                                        {activeCatalog.type === 'imperial' ? '皇家巨制' : activeCatalog.type === 'official' ? '官衙规制' : activeCatalog.type === 'residential' ? '民间法式' : '连心石拱'}
                                    </div>
                                    <div className="text-sm text-[var(--gf-text)]/60 space-y-1" style={{ fontFamily: '"Noto Serif SC", serif' }}>
                                        <div>面阔 {activeCatalog.bayCount} 间 · 进深 {activeCatalog.depthCount} 间</div>
                                        <div className="text-xs">
                                            {activeCatalog.roofType === 'wudian' ? '庑殿顶' :
                                             activeCatalog.roofType === 'xieshan' ? '歇山顶' :
                                             activeCatalog.roofType === 'yingshan' ? '硬山顶' : '石拱桥'}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </>
                    ) : (
                        <>
                            {/* MICRO: 微观警报与力学雷达图表 (原有逻辑) */}
                            <div className="h-44 w-full relative">
                                <ResponsiveContainer width="100%" height="100%">
                                    <RadarChart cx="50%" cy="50%" outerRadius="70%" data={radarData}>
                                        <PolarGrid stroke="rgba(26, 30, 35, 0.15)" />
                                        <PolarAngleAxis dataKey="subject" tick={{ fill: 'rgba(26, 30, 35, 0.7)', fontSize: 10, fontFamily: '"Noto Serif SC", serif' }} />
                                        <Radar name="Health" dataKey="A" stroke={alertLevel === 'danger' ? 'var(--gf-gugong-red)' : alertLevel === 'warning' ? '#f59e0b' : 'var(--gf-text)'} fill={alertLevel === 'danger' ? 'var(--gf-gugong-red)' : alertLevel === 'warning' ? '#f59e0b' : 'var(--gf-text)'} fillOpacity={alertLevel === 'safe' ? 0.2 : 0.6} />
                                    </RadarChart>
                                </ResponsiveContainer>
                            </div>

                            <div className="grid grid-cols-2 gap-2">
                                <div className="bg-white/50 rounded-lg p-2.5 flex items-center gap-3 border border-white/60">
                                    <div className="p-1.5 bg-[#ab1f22]/10 rounded-md text-[#ab1f22]"><Wind className="w-3.5 h-3.5" /></div>
                                    <div className="flex flex-col"><span className="text-[9px] text-[#1a1e23]/50 font-['Noto_Serif_SC'] uppercase tracking-wider">风载流速</span><span className="text-sm font-bold text-[#1a1e23]">{environmental.wind_speed}<span className="text-[10px] text-[#1a1e23]/50 ml-0.5 font-sans">m/s</span></span></div>
                                </div>
                                <div className="bg-white/50 rounded-lg p-2.5 flex items-center gap-3 border border-white/60">
                                    <div className="p-1.5 bg-amber-500/10 rounded-md text-amber-600"><Thermometer className="w-3.5 h-3.5" /></div>
                                    <div className="flex flex-col"><span className="text-[9px] text-[#1a1e23]/50 font-['Noto_Serif_SC'] uppercase tracking-wider">表皮含水率</span><span className="text-sm font-bold text-[#1a1e23]">{environmental.surface_moisture}<span className="text-[10px] text-[#1a1e23]/50 ml-0.5 font-sans">%</span></span></div>
                                </div>
                            </div>
                            
                            <div className="h-20 w-full mt-2">
                                <div className="text-[10px] text-[#1a1e23]/50 font-['Noto_Serif_SC'] mb-1 tracking-widest flex items-center justify-between">
                                    <span>局部微观结构应变趋势</span>
                                    <Activity className="w-3 h-3 text-[rgba(26,30,35,0.4)]" />
                                </div>
                                <ResponsiveContainer width="100%" height="100%">
                                    <AreaChart data={seriesData} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
                                        <defs>
                                            <linearGradient id="colorValue" x1="0" y1="0" x2="0" y2="1">
                                                <stop offset="5%" stopColor={alertLevel === 'danger' ? 'var(--gf-gugong-red)' : 'var(--gf-text)'} stopOpacity={0.3} />
                                                <stop offset="95%" stopColor={alertLevel === 'danger' ? 'var(--gf-gugong-red)' : 'var(--gf-text)'} stopOpacity={0} />
                                            </linearGradient>
                                        </defs>
                                        <Area type="monotone" dataKey="value" stroke={alertLevel === 'danger' ? 'var(--gf-gugong-red)' : 'var(--gf-text)'} strokeWidth={2} fillOpacity={1} fill="url(#colorValue)" isAnimationActive={false} />
                                    </AreaChart>
                                </ResponsiveContainer>
                            </div>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}
