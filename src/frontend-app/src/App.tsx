import { lazy, Suspense, useCallback, useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { LoginPage } from './components/LoginPage';
import { RegisterPage } from './components/RegisterPage';
import { Drawer } from './components/Drawer';
import { SkeletonPage } from './components/Skeleton';
import { ToastHost } from './components/Toast';
import { useDocumentStore } from './store/useDocumentStore';
import { useGraphStore } from './store/useGraphStore';
import { authFetchOptions, useAuthStore } from './store/useAuthStore';
import { useStore } from './store/useStore';
import { toast } from './store/useToastStore';
import { API_BASE } from './lib/api';
import { buildReaderDocument } from './lib/readerDocument';

const DashboardHome = lazy(() => import('./components/DashboardHome'));
const ChatInterface = lazy(() => import('./components/ChatInterface').then((m) => ({ default: m.ChatInterface })));
const SearchPanel = lazy(() => import('./components/SearchPanel'));
const FavoritesList = lazy(() => import('./components/FavoritesList'));
const BookshelfPanel = lazy(() => import('./components/BookshelfPanel'));
const ComparePanel = lazy(() => import('./components/ComparePanel'));
const WordbookPanel = lazy(() => import('./components/WordbookPanel'));
const OCRPreview = lazy(() => import('./components/OCRPreview').then((m) => ({ default: m.OCRPreview })));
const ThreeColumnReader = lazy(() => import('./components/ThreeColumnReader').then((m) => ({ default: m.ThreeColumnReader })));

const TAB_ICONS: Record<string, string> = {
    home: 'M3 10.5l9-7 9 7M5.25 9.75V20h13.5V9.75',
    chat: 'M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z',
    search: 'M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z',
    reader: 'M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253',
    compare: 'M8 7h8M8 12h8M8 17h8M4 7h.01M4 12h.01M4 17h.01M20 7h.01M20 12h.01M20 17h.01',
    favorites: 'M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z',
    wordbook: 'M12 6v13m0-13c-1.746-.776-3.332-1.253-4.5-1.253S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13c1.168-.776 2.753-1.253 4.5-1.253s3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.747 0-3.332.477-4.5 1.253',
};

type AuthPage = 'login' | 'register';

function TabLoader({ label = '正在准备页面...', variant = 'default' }: { label?: string; variant?: 'reader' | 'list' | 'default' }) {
    return <SkeletonPage label={label} variant={variant} />;
}

function App() {
    const { activeTab, setActiveTab, queueReaderHubSection, setReaderReturnTab } = useGraphStore();
    const { currentDocument, comparisonDocuments, setDocument, setUploadStatus, setPendingReaderPanel, setPendingResumeParagraph, toggleComparisonDocument, clearCurrentDocument } = useDocumentStore();
    const { username, logout, validateStoredAuth } = useAuthStore();
    const { setDraftMessage } = useStore();
    const [drawerOpen, setDrawerOpen] = useState(false);
    const [authPage, setAuthPage] = useState<AuthPage>('login');
    const [authChecking, setAuthChecking] = useState(true);
    const [openingDocumentId, setOpeningDocumentId] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;

        setAuthChecking(true);
        validateStoredAuth()
            .catch(() => {})
            .finally(() => {
                if (!cancelled) {
                    setAuthChecking(false);
                }
            });

        return () => {
            cancelled = true;
        };
    }, [validateStoredAuth]);

    const getReaderView = () => {
        if (!currentDocument) return 'hub';
        if (currentDocument.punctuatedText) return 'reader';
        return 'preview';
    };

    const openDocument = useCallback(
        async (documentId: string, options?: { readerPanel?: 'notes' | 'study' | null; resumeParagraph?: number | null }) => {
            setOpeningDocumentId(documentId);
            clearCurrentDocument();
            setReaderReturnTab(activeTab);
            setPendingResumeParagraph(options?.resumeParagraph && options.resumeParagraph > 0 ? options.resumeParagraph : null);
            setActiveTab('reader');
            try {
                const response = await fetch(`${API_BASE}/api/v1/documents/${documentId}/reader`, authFetchOptions());
                if (!response.ok) throw new Error('load failed');
                const data = await response.json();
                const nextDocument = buildReaderDocument(data);
                setDocument(nextDocument);
                setUploadStatus(nextDocument.punctuatedText ? 'done' : 'idle');
                if (options?.readerPanel) {
                    setPendingReaderPanel(options.readerPanel);
                }
            } catch (error) {
                console.error('Failed to open document:', error);
                toast.error('打开古籍没有成功，请稍后再试');
            } finally {
                setOpeningDocumentId(null);
            }
        },
        [activeTab, buildReaderDocument, clearCurrentDocument, setActiveTab, setDocument, setPendingReaderPanel, setPendingResumeParagraph, setReaderReturnTab, setUploadStatus]
    );

    const jumpToChat = useCallback(
        (prompt: string) => {
            setDraftMessage(prompt);
            setActiveTab('chat');
        },
        [setActiveTab, setDraftMessage]
    );

    const openReaderHub = useCallback(() => {
        clearCurrentDocument();
        setReaderReturnTab(activeTab);
        setActiveTab('reader');
    }, [activeTab, clearCurrentDocument, setActiveTab, setReaderReturnTab]);

    const openReaderUpload = useCallback(() => {
        clearCurrentDocument();
        setReaderReturnTab(activeTab);
        queueReaderHubSection('upload');
        setActiveTab('reader');
    }, [activeTab, clearCurrentDocument, queueReaderHubSection, setActiveTab, setReaderReturnTab]);


    const toggleCompare = useCallback(
        async (documentId: string) => {
            const existing = comparisonDocuments.find((item) => item.id === documentId);
            if (existing) {
                toggleComparisonDocument(existing);
                return;
            }
            try {
                const response = await fetch(`${API_BASE}/api/v1/documents/${documentId}`, authFetchOptions());
                if (!response.ok) throw new Error('load failed');
                const data = await response.json();
                toggleComparisonDocument(buildReaderDocument(data));
            } catch (error) {
                console.error('Failed to add document to comparison:', error);
                toast.error('加入对照阅读失败，请稍后再试');
            }
        },
        [buildReaderDocument, comparisonDocuments, toggleComparisonDocument]
    );

    const tabs = [
        { key: 'home' as const, label: '首页' },
        { key: 'reader' as const, label: '阅读' },
        { key: 'search' as const, label: '原文检索' },
        { key: 'chat' as const, label: 'AI问答' },
        { key: 'wordbook' as const, label: '字词记录' },
        { key: 'favorites' as const, label: '文章收藏' },
        { key: 'compare' as const, label: '对照阅读' },
    ];

    const renderActiveTab = () => {
        switch (activeTab) {
            case 'home':
                return (
                    <DashboardHome
                        onOpenDocument={openDocument}
                        onAsk={jumpToChat}
                        onOpenReaderHub={openReaderHub}
                        onOpenReaderUpload={openReaderUpload}
                    />
                );
            case 'chat':
                return <ChatInterface />;
            case 'search':
                return <SearchPanel onOpenDocument={openDocument} onAsk={jumpToChat} />;
            case 'reader':
                if (openingDocumentId) {
                    return <TabLoader label="正在打开古籍..." variant="reader" />;
                }
                if (getReaderView() === 'hub') {
                    return (
                        <BookshelfPanel
                            onOpenDocument={openDocument}
                            onToggleCompare={toggleCompare}
                            comparedDocumentIds={comparisonDocuments.map((item) => item.id)}
                            onOpenCompare={() => setActiveTab('compare')}
                        />
                    );
                }
                if (getReaderView() === 'preview') return <OCRPreview />;
                return <ThreeColumnReader />;
            case 'compare':
                return <ComparePanel />;
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
            <ToastHost />
            {authChecking ? (
                <TabLoader />
            ) : !username ? (
                <>
                    {authPage === 'login' && <LoginPage onSwitchToRegister={() => setAuthPage('register')} />}
                    {authPage === 'register' && <RegisterPage onSwitchToLogin={() => setAuthPage('login')} />}
                </>
            ) : (
                <>
                    <header
                        className="shrink-0 border-b"
                        style={{
                            borderColor: 'rgba(26,30,35,0.08)',
                            background: 'linear-gradient(180deg, rgba(250,248,242,0.92) 0%, rgba(247,246,243,0.82) 100%)',
                            backdropFilter: 'blur(12px)',
                            boxShadow: '0 1px 0 rgba(255,255,255,0.55) inset',
                        }}
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
                                <div className="flex items-center gap-3">
                                    <button
                                        className="flex items-center gap-3 transition-opacity hover:opacity-80"
                                        onClick={() => setActiveTab('home')}
                                        aria-label="返回首页"
                                    >
                                        <img src="/logo.svg" alt="古籍智解" className="hidden sm:flex h-8 w-8 rounded-lg" />
                                        <h1
                                            className="text-lg md:text-xl tracking-widest"
                                            style={{ fontFamily: '"ZCOOL XiaoWei", "Noto Serif SC", serif', color: 'var(--gf-text)' }}
                                        >
                                            古籍智解
                                        </h1>
                                    </button>
                                    <span
                                        className="text-[11px] tracking-[0.24em] hidden md:inline-flex rounded-full px-2.5 py-1"
                                        style={{ color: 'rgba(26,30,35,0.42)', backgroundColor: 'rgba(255,255,255,0.62)' }}
                                    >
                                        疑处，可请 AI 释之
                                    </span>
                                </div>
                            </div>
                            <div className="flex items-center gap-2">
                                <span className="text-xs" style={{ color: 'rgba(26,30,35,0.5)' }} aria-label={`当前用户：${username}`}>{username}</span>
                                <button
                                    onClick={() => { void logout(); }}
                                    className="text-xs px-2 py-1 rounded transition-colors hover:bg-black/5"
                                    style={{ color: 'rgba(26,30,35,0.45)' }}
                                    aria-label="退出登录"
                                >
                                    退出
                                </button>
                            </div>
                        </div>
                    </header>

                    <div className="flex-1 overflow-hidden">
                        <AnimatePresence mode="wait">
                            <motion.div
                                key={activeTab}
                                className="h-full"
                                role="main"
                                aria-label={`${tabs.find((t) => t.key === activeTab)?.label ?? ''}页面`}
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -6 }}
                                transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
                            >
                                <Suspense fallback={<TabLoader />}>{renderActiveTab()}</Suspense>
                            </motion.div>
                        </AnimatePresence>
                    </div>

                    <Drawer
                        side="left"
                        open={drawerOpen}
                        onClose={() => setDrawerOpen(false)}
                        title="页面导航"
                        icon={
                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
                            </svg>
                        }
                    >
                        <nav className="p-4 space-y-2" aria-label="页面导航">
                            {tabs.map((tab) => {
                                const isActive = activeTab === tab.key;
                                return (
                                    <button
                                        key={tab.key}
                                        onClick={() => {
                                            setActiveTab(tab.key);
                                            setDrawerOpen(false);
                                        }}
                                        aria-current={isActive ? 'page' : undefined}
                                        aria-label={`切换到${tab.label}`}
                                        className="stagger-fade-up w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--gf-gugong-red)]/40"
                                        style={{
                                            '--stagger-delay': `${0.05 + tabs.indexOf(tab) * 0.04}s`,
                                            color: isActive ? '#fff' : 'rgba(26,30,35,0.7)',
                                            fontWeight: isActive ? 500 : 400,
                                            backgroundColor: isActive ? 'var(--gf-gugong-red)' : 'rgba(26,30,35,0.03)',
                                            fontFamily: '"Noto Serif SC", serif',
                                        } as React.CSSProperties}
                                    >
                                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={isActive ? 2 : 1.5} aria-hidden="true">
                                            <path strokeLinecap="round" strokeLinejoin="round" d={TAB_ICONS[tab.key]} />
                                        </svg>
                                        <span>{tab.label}</span>
                                    </button>
                                );
                            })}
                        </nav>
                    </Drawer>
                </>
            )}
        </div>
    );
}

export default App;
