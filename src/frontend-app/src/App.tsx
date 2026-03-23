import { useEffect, useState } from 'react';
import { ChatInterface } from './components/ChatInterface';
import SearchPanel from './components/SearchPanel';
import ReadingHistory from './components/ReadingHistory';
import FavoritesList from './components/FavoritesList';
import { DocumentUpload } from './components/DocumentUpload';
import { OCRPreview } from './components/OCRPreview';
import { ThreeColumnReader } from './components/ThreeColumnReader';
import { KnowledgeGraphPanel } from './components/KnowledgeGraphPanel';
import AnalyticsDashboard from './components/AnalyticsDashboard';
import { AuthModal } from './components/AuthModal';
import { Drawer } from './components/Drawer';
import { useWebSocket } from './hooks/useWebSocket';
import { useDocumentStore } from './store/useDocumentStore';
import { useGraphStore } from './store/useGraphStore';
import { useAuthStore } from './store/useAuthStore';


const TAB_ICONS: Record<string, string> = {
    chat: 'M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z',
    search: 'M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z',
    reader: 'M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253',
    graph: 'M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1',
    history: 'M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z',
    favorites: 'M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z',
    analytics: 'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z',
};

function App() {
    // WebSocket connection (backward compat, not used in current phase)
    useWebSocket();

    const { activeTab, setActiveTab } = useGraphStore();
    const { currentDocument, uploadStatus } = useDocumentStore();
    const pendingGraphFocus = useGraphStore(s => s.pendingGraphFocus);
    const { username, logout } = useAuthStore();
    const [authOpen, setAuthOpen] = useState(false);
    const [drawerOpen, setDrawerOpen] = useState(false);

    // Auto-switch to graph tab when pendingGraphFocus is set
    useEffect(() => {
        if (pendingGraphFocus && activeTab !== 'graph') {
            setActiveTab('graph');
        }
    }, [pendingGraphFocus, activeTab, setActiveTab]);

    // Reader view state machine
    const getReaderView = () => {
        if (!currentDocument) return 'upload';
        if (uploadStatus === 'done' && currentDocument.punctuatedText) return 'reader';
        return 'preview';
    };

    const tabs = [
        { key: 'chat' as const, label: '对话' },
        { key: 'search' as const, label: '搜索' },
        { key: 'reader' as const, label: '阅读' },
        { key: 'graph' as const, label: '图谱' },
        { key: 'history' as const, label: '历史' },
        { key: 'favorites' as const, label: '收藏' },
        { key: 'analytics' as const, label: '洞察' },
    ];

    return (
        <div className="w-full h-screen flex flex-col" style={{ backgroundColor: 'var(--gf-bg)' }}>
            {/* Header with title + menu trigger */}
            <header className="shrink-0 border-b" style={{ borderColor: 'rgba(26,30,35,0.08)', backgroundColor: 'rgba(247,246,243,0.85)', backdropFilter: 'blur(12px)' }}>
                <div className="flex items-center justify-between px-4 md:px-6 py-3">
                    {/* Left: Menu trigger + Title */}
                    <div className="flex items-center gap-3">
                        <button
                            onClick={() => setDrawerOpen(true)}
                            className="w-9 h-9 rounded-lg flex items-center justify-center transition-colors hover:bg-black/5"
                            style={{ color: 'var(--gf-gugong-red)' }}
                        >
                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
                            </svg>
                        </button>
                        <div className="flex items-center gap-2">
                            <h1
                                className="text-lg md:text-xl tracking-widest"
                                style={{ fontFamily: '"ZCOOL XiaoWei", "Noto Serif SC", serif', color: 'var(--gf-text)' }}
                            >
                                古籍智解
                            </h1>
                            <span className="text-xs tracking-wider ml-1 hidden sm:inline" style={{ color: 'rgba(26,30,35,0.35)' }}>
                                AI古籍知识探索平台
                            </span>
                        </div>
                    </div>
                    {/* Right: User info */}
                    {username && (
                        <div className="flex items-center gap-2">
                            <span className="text-xs" style={{ color: 'rgba(26,30,35,0.5)' }}>{username}</span>
                            <button
                                onClick={logout}
                                className="text-xs px-2 py-1 rounded transition-colors hover:bg-black/5"
                                style={{ color: 'rgba(26,30,35,0.45)' }}
                            >
                                退出
                            </button>
                        </div>
                    )}
                </div>
            </header>

            {/* Content Area */}
            <div className="flex-1 overflow-hidden">
                {!username ? (
                    // 未登录引导页 - 文化叙事风格
                    <div className="h-full flex items-center justify-center bg-xuan-paper">
                        <div className="max-w-md text-center px-6">
                            <div className="mb-8">
                                {/* 古籍图标 */}
                                <div className="w-24 h-24 mx-auto mb-6 rounded-full flex items-center justify-center relative" style={{ backgroundColor: 'rgba(171,31,34,0.08)' }}>
                                    <svg className="w-12 h-12" style={{ color: 'var(--gf-gugong-red)' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                                    </svg>
                                    {/* 装饰性圆环 */}
                                    <div className="absolute inset-0 rounded-full border-2 opacity-20" style={{ borderColor: 'var(--gf-gugong-red)' }} />
                                </div>
                                {/* 标题 */}
                                <h2 className="text-3xl mb-4 tracking-wider" style={{ fontFamily: '"ZCOOL XiaoWei", "Noto Serif SC", serif', color: 'var(--gf-text)' }}>
                                    典籍浩瀚，智解千年
                                </h2>
                                {/* 副标题 */}
                                <p className="text-sm mb-2 leading-relaxed tracking-wide" style={{ color: 'rgba(26,30,35,0.65)', fontFamily: '"Noto Serif SC", serif' }}>
                                    以AI之力，穿越时空对话先贤
                                </p>
                                <p className="text-xs mb-8 leading-relaxed" style={{ color: 'rgba(26,30,35,0.45)', fontFamily: '"Noto Serif SC", serif' }}>
                                    登录后，开启您的古籍探索之旅
                                </p>
                            </div>
                            {/* 登录按钮 */}
                            <button
                                onClick={() => setAuthOpen(true)}
                                className="px-8 py-3 rounded-lg text-white font-medium transition-all hover:shadow-lg hover:scale-105 active:scale-95"
                                style={{ backgroundColor: 'var(--gf-gugong-red)', fontFamily: '"Noto Serif SC", serif' }}
                            >
                                开启探索
                            </button>
                            {/* 功能预览 */}
                            <div className="mt-10 pt-8 border-t" style={{ borderColor: 'rgba(26,30,35,0.08)' }}>
                                <p className="text-xs mb-4 tracking-widest" style={{ color: 'rgba(26,30,35,0.4)', fontFamily: '"Noto Serif SC", serif' }}>
                                    核心功能
                                </p>
                                <div className="grid grid-cols-2 gap-4 text-xs" style={{ color: 'rgba(26,30,35,0.6)' }}>
                                    <div className="flex items-center gap-2">
                                        <span className="w-1 h-1 rounded-full" style={{ backgroundColor: 'var(--gf-gold)' }} />
                                        <span style={{ fontFamily: '"Noto Serif SC", serif' }}>AI古籍对话</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <span className="w-1 h-1 rounded-full" style={{ backgroundColor: 'var(--gf-gold)' }} />
                                        <span style={{ fontFamily: '"Noto Serif SC", serif' }}>知识图谱探索</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <span className="w-1 h-1 rounded-full" style={{ backgroundColor: 'var(--gf-gold)' }} />
                                        <span style={{ fontFamily: '"Noto Serif SC", serif' }}>智能语义搜索</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <span className="w-1 h-1 rounded-full" style={{ backgroundColor: 'var(--gf-gold)' }} />
                                        <span style={{ fontFamily: '"Noto Serif SC", serif' }}>古籍深度阅读</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                ) : (
                    <div key={activeTab} className="h-full tab-content-enter">
                        {activeTab === 'chat' && <ChatInterface />}
                        {activeTab === 'search' && <SearchPanel />}
                        {activeTab === 'reader' && (
                            <>
                                {getReaderView() === 'upload' && <DocumentUpload />}
                                {getReaderView() === 'preview' && <OCRPreview />}
                                {getReaderView() === 'reader' && <ThreeColumnReader />}
                            </>
                        )}
                        {activeTab === 'graph' && <KnowledgeGraphPanel />}
                        {activeTab === 'history' && <ReadingHistory onNavigate={() => setActiveTab('reader')} />}
                        {activeTab === 'favorites' && <FavoritesList onNavigate={() => setActiveTab('reader')} />}
                        {activeTab === 'analytics' && <AnalyticsDashboard />}
                    </div>
                )}
            </div>

            {/* Auth Modal */}
            <AuthModal open={authOpen} onClose={() => setAuthOpen(false)} />

            {/* Navigation Drawer */}
            {username && (
                <Drawer
                    side="left"
                    open={drawerOpen}
                    onClose={() => setDrawerOpen(false)}
                    title="功能导航"
                    icon={
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
                        </svg>
                    }
                >
                    <div className="p-4 space-y-2">
                        {tabs.map(tab => {
                            const isActive = activeTab === tab.key;
                            return (
                                <button
                                    key={tab.key}
                                    onClick={() => {
                                        setActiveTab(tab.key);
                                        setDrawerOpen(false);
                                    }}
                                    className="w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm transition-all duration-200"
                                    style={{
                                        color: isActive ? '#fff' : 'rgba(26,30,35,0.7)',
                                        fontWeight: isActive ? 500 : 400,
                                        backgroundColor: isActive ? 'var(--gf-gugong-red)' : 'rgba(26,30,35,0.03)',
                                        fontFamily: '"Noto Serif SC", serif',
                                    }}
                                >
                                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={isActive ? 2 : 1.5}>
                                        <path strokeLinecap="round" strokeLinejoin="round" d={TAB_ICONS[tab.key]} />
                                    </svg>
                                    <span>{tab.label}</span>
                                </button>
                            );
                        })}
                    </div>
                </Drawer>
            )}
        </div>
    );
}

export default App;
