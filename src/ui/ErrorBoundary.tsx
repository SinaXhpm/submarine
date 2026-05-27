import { Component, ReactNode } from "react";
import { AlertTriangle } from "lucide-react";

// React error boundaries must be class components — hooks can't catch render
// errors. Used around session tabs so a malformed terminal frame or SFTP
// response can't take down the whole app.

interface Props {
  children: ReactNode;
  // Optional label shown above the fallback (e.g. session name) so users can
  // tell which tab crashed when several sessions are open.
  label?: string;
  // Called when the user clicks "Reset" — typically used by the parent to
  // remount the boundary with a fresh `key` so its child rebuilds from scratch.
  onReset?: () => void;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: { componentStack?: string | null }) {
    // Keep this visible in dev; production should pipe to a real logger.
    console.error("[ErrorBoundary] caught:", error, info.componentStack);
  }

  handleReset = () => {
    this.setState({ error: null });
    this.props.onReset?.();
  };

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="max-w-md w-full bg-zinc-900 border border-red-500/40 rounded-xl p-6 space-y-4">
          <div className="flex items-center gap-3">
            <AlertTriangle className="text-red-400 shrink-0" size={22} />
            <div className="min-w-0">
              <h3 className="text-white font-semibold text-[15px]">
                {this.props.label ? `"${this.props.label}" crashed` : "Something went wrong"}
              </h3>
              <p className="text-zinc-400 text-[12px]">The rest of the app is still running.</p>
            </div>
          </div>
          <pre className="text-[11px] text-red-300/90 bg-black/40 rounded-lg p-3 overflow-auto max-h-40 whitespace-pre-wrap break-words">
            {this.state.error.message}
          </pre>
          <button
            onClick={this.handleReset}
            className="w-full h-9 rounded-lg bg-primary/90 hover:bg-primary text-black text-[13px] font-semibold transition-colors"
          >
            Reset
          </button>
        </div>
      </div>
    );
  }
}
