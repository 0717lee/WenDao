import { useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

interface DrawerProps {
  side: 'left' | 'right';
  open: boolean;
  onClose: () => void;
  title: string;
  icon?: ReactNode;
  children: ReactNode;
}

export function Drawer({ side, open, onClose, title, icon, children }: DrawerProps) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return;

    previouslyFocusedRef.current = document.activeElement as HTMLElement | null;
    const firstFocusable = panelRef.current?.querySelector<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    firstFocusable?.focus();

    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onCloseRef.current();
      }
      if (e.key === 'Tab') {
        const focusable = Array.from(panelRef.current?.querySelectorAll<HTMLElement>(
          'button:not(:disabled), [href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex="0"]'
        ) ?? []).filter((element) => element.getClientRects().length > 0);
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    };
    const appRoot = document.getElementById('root');
    const wasInert = appRoot?.inert ?? false;
    if (appRoot) appRoot.inert = true;
    window.addEventListener('keydown', handleKey);

    return () => {
      window.removeEventListener('keydown', handleKey);
      if (appRoot) appRoot.inert = wasInert;
      previouslyFocusedRef.current?.focus?.();
    };
  }, [open]);

  return createPortal(
    <>
      {/* 背景遮罩 */}
      <div
        className={`
          fixed inset-0 z-30 bg-black/10 backdrop-blur-[2px]
          transition-opacity duration-500
          ${open ? 'opacity-100' : 'opacity-0 pointer-events-none'}
        `}
        onClick={onClose}
        aria-hidden="true"
      />

      {/* 抽屉面板 */}
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        aria-hidden={!open}
        inert={!open}
        className={`
          fixed top-0 ${side === 'left' ? 'left-0' : 'right-0'}
          h-dvh w-[24rem] max-w-[calc(100vw-1rem)] z-40
          bg-[#faf8f2] backdrop-blur-2xl
          ${side === 'left' ? 'border-r' : 'border-l'} border-white/60
          shadow-[0_8px_32px_rgba(0,0,0,0.12)]
          transition-transform duration-500 ease-[cubic-bezier(0.32,0.72,0,1)]
          ${open
            ? 'translate-x-0'
            : side === 'left' ? '-translate-x-full' : 'translate-x-full'
          }
          flex flex-col
        `}
      >
        {/* 头部 */}
        <div className="px-5 py-4 border-b border-black/5 bg-gradient-to-r from-white/60 to-transparent flex items-center justify-between flex-shrink-0">
          <h3
            className="text-lg font-medium tracking-widest flex items-center gap-2 text-[#1a1e23]"
            style={{ fontFamily: '"ZCOOL XiaoWei", serif' }}
          >
            {icon}
            {title}
          </h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="关闭抽屉"
            className="w-8 h-8 rounded-lg flex items-center justify-center text-[#1a1e23]/40 hover:text-[#1a1e23] hover:bg-black/5 transition-all"
          >
            <X className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>

        {/* 内容区域 */}
        <div className="flex-1 overflow-auto">
          {children}
        </div>
      </div>
    </>,
    document.body
  );
}
