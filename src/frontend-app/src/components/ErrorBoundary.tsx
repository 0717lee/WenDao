import { Component, type ErrorInfo, type ReactNode } from 'react';
import { ShieldAlert } from 'lucide-react';

interface Props {
  children?: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught React UI error:', error, errorInfo);
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: undefined });
    window.location.reload();
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="flex h-screen w-full flex-col items-center justify-center p-4" style={{ backgroundColor: 'var(--gf-bg)' }}>
          <div 
            className="flex flex-col items-center max-w-md rounded-[28px] p-8 text-center"
            style={{ 
              backgroundColor: 'rgba(255,255,255,0.78)', 
              boxShadow: '0 24px 64px rgba(26,30,35,0.08), inset 0 1px 0 rgba(255,255,255,0.5)', 
              backdropFilter: 'blur(20px)',
              border: '1px solid rgba(26,30,35,0.06)'
            }}
          >
            <div className="mx-auto flex h-16 w-16 mb-5 items-center justify-center rounded-full bg-[rgba(140,26,17,0.06)]">
                <ShieldAlert className="h-8 w-8 text-[var(--gf-gugong-red)]" />
            </div>
            <h2 className="text-2xl font-medium mb-3 text-[var(--gf-text)]" style={{ fontFamily: '"ZCOOL XiaoWei", serif' }}>
              页面加载出了点小问题
            </h2>
            <p className="text-sm leading-relaxed text-[rgba(26,30,35,0.55)] mb-8">
              先重新加载一下页面，通常就能继续使用。
            </p>
            <button
              onClick={this.handleReset}
              className="rounded-2xl px-8 py-3.5 text-sm font-medium text-white transition-all hover:-translate-y-0.5"
              style={{ backgroundColor: 'var(--gf-gugong-red)', boxShadow: '0 12px 24px rgba(140,26,17,0.22)' }}
            >
              重新加载页面
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
