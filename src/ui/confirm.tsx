import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { AlertTriangle, X } from "lucide-react";

// Themed replacement for the browser-native `confirm()` dialog. Anywhere in
// the tree, `useConfirm()` returns a function that opens the modal and
// resolves to true / false. Cross-platform (pure React + CSS), no native
// dialog quirks, and lets us style destructive actions consistently.

export interface ConfirmOptions {
  title?: string;
  message: string;
  okLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
}

type Resolver = (value: boolean) => void;

const ConfirmContext = createContext<((opts: ConfirmOptions | string) => Promise<boolean>) | null>(null);

export const ConfirmProvider = ({ children }: { children: React.ReactNode }) => {
  const [state, setState] = useState<{ opts: ConfirmOptions; resolve: Resolver } | null>(null);

  const confirm = useCallback((opts: ConfirmOptions | string) => {
    return new Promise<boolean>((resolve) => {
      const normalized = typeof opts === "string" ? { message: opts } : opts;
      setState({ opts: normalized, resolve });
    });
  }, []);

  const close = (value: boolean) => {
    state?.resolve(value);
    setState(null);
  };

  // Esc cancels, Enter confirms — matches the native dialog conventions so
  // muscle memory keeps working.
  useEffect(() => {
    if (!state) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.preventDefault(); close(false); }
      if (e.key === "Enter")  { e.preventDefault(); close(true); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {state && createPortal(
        <div className="fixed inset-0 z-[9999] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
             onClick={() => close(false)}>
          <div onClick={(e) => e.stopPropagation()}
               className="w-full max-w-[380px] bg-[#121214] border border-white/10 rounded-xl shadow-2xl p-4 font-mono text-[12px] animate-in zoom-in-95 fade-in duration-150">
            <div className="flex items-start justify-between gap-3 mb-3">
              <div className="flex items-center gap-2">
                <AlertTriangle size={14} className={state.opts.destructive ? "text-rose-400" : "text-amber-400"} />
                <span className="text-[11px] font-black uppercase tracking-widest text-zinc-200">
                  {state.opts.title || (state.opts.destructive ? "Confirm action" : "Are you sure?")}
                </span>
              </div>
              <button onClick={() => close(false)} className="text-zinc-500 hover:text-white shrink-0">
                <X size={12} />
              </button>
            </div>
            <p className="text-[12px] text-zinc-300 leading-relaxed mb-4 whitespace-pre-wrap break-words">
              {state.opts.message}
            </p>
            <div className="flex justify-end gap-2">
              <button onClick={() => close(false)}
                      className="px-3 h-8 rounded text-[11px] font-bold uppercase tracking-wider bg-white/[0.04] border border-white/10 text-zinc-300 hover:bg-white/[0.08] hover:text-white">
                {state.opts.cancelLabel || "Cancel"}
              </button>
              <button onClick={() => close(true)} autoFocus
                      className={`px-3 h-8 rounded text-[11px] font-bold uppercase tracking-wider border ${
                        state.opts.destructive
                          ? "bg-rose-500/15 border-rose-500/40 text-rose-300 hover:bg-rose-500/25"
                          : "bg-primary/15 border-primary/40 text-primary hover:bg-primary/25"
                      }`}>
                {state.opts.okLabel || (state.opts.destructive ? "Delete" : "OK")}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </ConfirmContext.Provider>
  );
};

export const useConfirm = () => {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error("useConfirm must be used within <ConfirmProvider>");
  return ctx;
};
