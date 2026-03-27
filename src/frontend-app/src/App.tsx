import { lazy, Suspense, useCallback, useState } from 'react';
import { LoginPage } from './components/LoginPage';
import { RegisterPage } from './components/RegisterPage';
import { Drawer } from './components/Drawer';
import { useDocumentStore } from './store/useDocumentStore';
import { useGraphStore } from './store/useGraphStore';
import { useAuthStore } from './store/useAuthStore';
import { useStore } from './store/useStore';
import { API_BASE } from './lib/api';

const DashboardHome = lazy(() => import('./components/DashboardHome'));
const ChatInterface = lazy(() => import('./components/ChatInterface').then((m) => ({ default: m.ChatInterface })));
const SearchPanel = lazy(() => import('./components/SearchPanel'));
const ReadingHistory = lazy(() => import('./components/ReadingHistory'));
const FavoritesList = lazy(() => import('./components/FavoritesList'));
const BookshelfPanel = lazy(() => import('./components/BookshelfPanel'));
const ComparePanel = lazy(() => import('./components/ComparePanel'));
const WordbookPanel = lazy(() => import('./components/WordbookPanel'));
const DocumentUpload = lazy(() => import('./components/DocumentUpload').then((m) => ({ default: m.DocumentUpload })));
const OCRPreview = lazy(() => import('./components/OCRPreview').then((m) => ({ default: m.OCRPreview })));
const ThreeColumnReader = lazy(() => import('./components/ThreeColumnReader').then((m) => ({ default: m.ThreeColumnReader })));

const TAB_ICONS: Record<string, string> = {
    home: 'M3 10.5l9-7 9 7M5.25 9.75V20h13.5V9.75',
    chat: 'M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z',
    search: 'M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z',
    reader: 'M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253',
    bookshelf: 'M4 19.5A2.5 2.5 0 016.5 17H20M4 4.5A2.5 2.5 0 016.5 2H20v15H6.5A2.5 2.5 0 004 19.5v-15z',
    compare: 'M8 7h8M8 12h8M8 17h8M4 7h.01M4 12h.01M4 17h.01M20 7h.01M20 12h.01M20 17h.01',
    history: 'M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z',
    favorites: 'M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z',
    wordbook: 'M12 6v13m0-13c-1.746-.776-3.332-1.253-4.5-1.253S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13c1.168-.776 2.753-1.253 4.5-1.253s3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.747 0-3.332.477-4.5 1.253',
};

type AuthPage = 'login' | 'register';

function TabLoader() {
    return (
        <div className="flex h-full items-center justify-center" style={{ backgroundColor: 'var(--gf-bg)' }}>
            <div className="flex flex-col items-center gap-3">
                <div
                    className="h-10 w-10 rounded-full border-2 animate-spin"
                    style={{ borderColor: 'rgba(140,26,17,0.15)', borderTopColor: 'var(--gf-gugong-red)' }}
                />
                <span className="text-sm" style={{ color: 'rgba(26,30,35,0.45)' }}>
                    正在整理书房...
                </span>
            </div>
        </div>
    );
}

function App() {
    const { activeTab, setActiveTab } = useGraphStore();
    const { currentDocument, comparisonDocuments, setDocument, setUploadStatus, toggleComparisonDocument } = useDocumentStore();
    const { username, logout } = useAuthStore();
    const { setDraftMessage } = useStore();
    const [drawerOpen, setDrawerOpen] = useState(false);
    const [authPage, setAuthPage] = useState<AuthPage>('login');

    const getReaderView = () => {
        if (!currentDocument) return 'upload';
        if (currentDocument.punctuatedText) return 'reader';
        return 'preview';
    };

    const openDocument = useCallback(
        async (documentId: string) => {
            try {
                const response = await fetch(`${API_BASE}/api/v1/documents/${documentId}`);
                if (!response.ok) throw new Error('load failed');
                const data = await response.json();
                setDocument({
                    id: data.id,
                    title: data.title,
                    originalText: data.original_text,
                    punctuatedText: data.punctuated_text || '',
                    translatedText: data.translated_text || '',
                    confidence: data.ocr_confidence,
                    imageUrl: data.image_data || undefined,
                });
                setUploadStatus(data.punctuated_text ? 'done' : 'idle');
                setActiveTab('reader');
            } catch (error) {
                console.error('Failed to open document:', error);
            }
        },
        [setActiveTab, setDocument, setUploadStatus]
    );

    const jumpToChat = useCallback(
        (prompt: string) => {
            setDraftMessage(prompt);
            setActiveTab('chat');
        },
        [setActiveTab, setDraftMessage]
    );

    const toggleCompare = useCallback(
        async (documentId: string) => {
            const existing = comparisonDocuments.find((item) => item.id === documentId);
            if (existing) {
                toggleComparisonDocument(existing);
                return;
            }
            try {
                const response = await fetch(`${API_BASE}/api/v1/documents/${documentId}`);
                if (!response.ok) throw new Error('load failed');
                const data = await response.json();
                toggleComparisonDocument({
                    id: data.id,
                    title: data.title,
                    originalText: data.original_text,
                    punctuatedText: data.punctuated_text || '',
                    translatedText: data.translated_text || '',
                    confidence: data.ocr_confidence,
                    imageUrl: data.image_data || undefined,
                });
            } catch (error) {
                console.error('Failed to add document to comparison:', error);
            }
        },
        [comparisonDocuments, toggleComparisonDocument]
    );

    const tabs = [
        { key: 'home' as const, label: '书房' },
        { key: 'chat' as const, label: '对话' },
        { key: 'reader' as const, label: '阅读' },
        { key: 'search' as const, label: '搜索' },
        { key: 'bookshelf' as const, label: '书架' },
        { key: 'compare' as const, label: '对照' },
        { key: 'history' as const, label: '历史' },
        { key: 'favorites' as const, label: '收藏' },
        { key: 'wordbook' as const, label: '生词本' },
    ];

    const renderActiveTab = () => {
        switch (activeTab) {
            case 'home':
                return (
                    <DashboardHome
                        onOpenDocument={openDocument}
                        onAsk={jumpToChat}
                        onOpenBookshelf={() => setActiveTab('bookshelf')}
                        onOpenWordbook={() => setActiveTab('wordbook')}
                        onOpenCompare={() => setActiveTab('compare')}
                        onContinueStudy={openDocument}
                    />
                );
            case 'chat':
                return <ChatInterface />;
            case 'search':
                return <SearchPanel />;
            case 'reader':
                if (getReaderView() === 'upload') return <DocumentUpload />;
                if (getReaderView() === 'preview') return <OCRPreview />;
                return <ThreeColumnReader />;
            case 'bookshelf':
                return (
                    <BookshelfPanel
                        onOpenDocument={openDocument}
                        onToggleCompare={toggleCompare}
                        comparedDocumentIds={comparisonDocuments.map((item) => item.id)}
                        onOpenCompare={() => setActiveTab('compare')}
                    />
                );
            case 'compare':
                return <ComparePanel />;
            case 'history':
                return <ReadingHistory onNavigate={openDocument} />;
            case 'favorites':
                return <FavoritesList onNavigate={openDocument} />;
            case 'wordbook':
                return <WordbookPanel onAskAboutWord={(word) => jumpToChat(`请解释“${word}”在古籍中的含义和用法`)} />;
            default:
                return <ChatInterface />;
        }
    };

    return (
        <div className="w-full h-screen flex flex-col" style={{ backgroundColor: 'var(--gf-bg)' }}>
            {!username ? (
                <>
                    {authPage === 'login' && <LoginPage onSwitchToRegister={() => setAuthPage('register')} />}
                    {authPage === 'register' && <RegisterPage onSwitchToLogin={() => setAuthPage('login')} />}
                </>
            ) : (
                <>
                    <header
                        className="shrink-0 border-b"
                        style={{ borderColor: 'rgba(26,30,35,0.08)', backgroundColor: 'rgba(247,246,243,0.85)', backdropFilter: 'blur(12px)' }}
                    >
                        <div className="flex items-center justify-between px-4 md:px-6 py-3">
                            <div className="flex items-center gap-3">
                                <button
                                    onClick={() => setDrawerOpen(true)}
                                    aria-label="打开导航"
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
                                        AI 古籍知识探索平台
                                    </span>
                                </div>
                            </div>
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

                    <div className="flex-1 overflow-hidden">
                        <div key={activeTab} className="h-full tab-content-enter">
                            <Suspense fallback={<TabLoader />}>{renderActiveTab()}</Suspense>
                        </div>
                    </div>

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
                            {tabs.map((tab) => {
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
