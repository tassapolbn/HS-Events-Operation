import { Component, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
}

/** Catches unexpected rendering errors and shows a friendly reload prompt instead of a blank page */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-slate-50 p-6 text-center dark:bg-slate-950">
          <img src="/logo-square-light.png" alt="HeadStart" className="h-16 w-16 object-contain" />
          <p className="text-lg font-bold text-navy-800 dark:text-white">Something went wrong</p>
          <p className="max-w-sm text-sm text-slate-500 dark:text-slate-400">
            Please reload the page. If this keeps happening, the database may need the latest update from the deployment guide.
          </p>
          <button
            onClick={() => window.location.reload()}
            className="rounded-xl bg-gold-400 px-6 py-2.5 text-sm font-bold text-navy-900 hover:bg-gold-300"
          >
            Reload
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
