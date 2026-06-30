import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.error('ErrorBoundary caught:', error, errorInfo);
  }

  render(): ReactNode {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }
      return (
        <div className="min-h-screen grid place-items-center p-6 bg-slate-50">
          <div className="max-w-md w-full p-6 bg-white rounded-xl border border-red-200 shadow-sm">
            <h2 className="text-lg font-bold text-red-700 mb-2">页面出错了</h2>
            <p className="text-sm text-zinc-600 mb-4">
              {this.state.error?.message || '发生了未知错误'}
            </p>
            <button
              className="inline-flex items-center justify-center h-9 px-4 rounded-lg bg-black text-white text-[13px] font-semibold hover:bg-zinc-800 transition-all"
              onClick={() => window.location.reload()}
            >
              刷新页面
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
