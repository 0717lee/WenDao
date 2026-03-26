import { useState } from 'react';
import { ChatInterface } from './components/ChatInterface';
import SearchPanel from './components/SearchPanel';
import ReadingHistory from './components/ReadingHistory';
import FavoritesList from './components/FavoritesList';
import { DocumentUpload } from './components/DocumentUpload';
import { OCRPreview } from './components/OCRPreview';
import { ThreeColumnReader } from './components/ThreeColumnReader';
import { LoginPage } from './components/LoginPage';
import { RegisterPage } from './components/RegisterPage';
import { Drawer } from './components/Drawer';
import { useDocumentStore } from './store/useDocumentStore';
import { useGraphStore } from './store/useGraphStore';
import { useAuthStore } from './store/useAuthStore';


const TAB_ICONS: Record<string, string> = {
    chat: 'M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z',
    search: 'M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z',
    reader: 'M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253',
    history: 'M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z',
    favorites: 'M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z',
};

type AuthPage = 'login' | 'register';

function App() {
    const { activeTab, setActiveTab } = useGraphStore();
    const { currentDocument, uploadStatus } = useDocumentStore();
    const { username, logout } = useAuthStore();
    const [drawerOpen, setDrawerOpen] = useState(false);
    const [authPage, setAuthPage] = useState<AuthPage>('login');

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
        { key: 'history' as const, label: '历史' },
        { key: 'favorites' as const, label: '收藏' },
    ];

    return (
        <div className="w-full h-screen flex flex-col" style={{ backgroundColor: 'var(--gf-bg)' }}>
            {/* 未登录：显示认证页面 */}
            {!username ? (
                <>
                    {authPage === 'login' && (
                        <LoginPage onSwitchToRegister={() => setAuthPage('register')} />
                    )}
                    {authPage === 'register' && (
                        <RegisterPage
                            onSwitchToLogin={() => setAuthPage('login')}
                        />
                    )}
                </>
            ) : (
                <>
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
                        </div>
                    </header>

                    {/* Content Area */}
                    <div className="flex-1 overflow-hidden">
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
                            {activeTab === 'history' && <ReadingHistory onNavigate={() => setActiveTab('reader')} />}
                            {activeTab === 'favorites' && <FavoritesList onNavigate={() => setActiveTab('reader')} />}
                        </div>
                    </div>

                    {/* Navigation Drawer */}
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
                </>
            )}
        </div>
    );
}

export default App;
