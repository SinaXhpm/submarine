import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { Plus, X, Activity, AlertTriangle, Globe, ArrowRight, ArrowDownLeft, Square } from "lucide-react";

// Tunnels panel — lists active SSH port-forwards for a session and lets the
// user start / stop them on the fly. The full set is also auto-started from
// the server's saved tunnel rules at connect time (see initiate_connection).

interface TunnelStatus {
  id: string;
  session_id: string;
  kind: string;        // "dynamic" | "local" | "remote"
  listen_addr: string;
  target: string;
  state: string;       // "starting" | "listening" | "error" | "closed"
  error?: string;
  conns_total: number;
  bytes_in: number;
  bytes_out: number;
}

interface TunnelsPanelProps {
  sessionId: string;
  disabled?: boolean;
}

const KIND_TO_SPEC: Record<string, "D" | "L" | "R"> = {
  dynamic: "D", local: "L", remote: "R",
};

const TunnelsPanel = ({ sessionId, disabled = false }: TunnelsPanelProps) => {
  const [tunnels, setTunnels] = useState<Record<string, TunnelStatus>>({});
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState<{ type: "D" | "L" | "R"; local: string; remote: string }>({
    type: "D", local: "1080", remote: "",
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Initial snapshot
  const reload = async () => {
    try {
      const list: TunnelStatus[] = await invoke("list_tunnels", { sessionId });
      const next: Record<string, TunnelStatus> = {};
      for (const t of list) next[t.id] = t;
      setTunnels(next);
    } catch (e: any) {
      setError(String(e));
    }
  };

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  // Live updates: every status transition (starting → listening, new
  // connection counted, error, closed) fires a per-session event.
  useEffect(() => {
    let unlisten: (() => void) | null = null;
    listen<TunnelStatus>(`tunnel-update-${sessionId}`, (event) => {
      const t = event.payload;
      if (!t || !t.id) return;
      setTunnels((prev) => {
        if (t.state === "closed") {
          const { [t.id]: _, ...rest } = prev;
          return rest;
        }
        return { ...prev, [t.id]: t };
      });
    }).then((fn) => { unlisten = fn; });
    return () => { if (unlisten) unlisten(); };
  }, [sessionId]);

  const addTunnel = async () => {
    if (busy) return;
    setBusy(true); setError(null);
    // Catch obvious port mistakes (0, 65536+, non-numeric tail) in the UI so
    // we don't roundtrip to Rust just to bind() and fail. Accepts bare port
    // ("8080") or host:port ("0.0.0.0:8080") for L/R; D always wants a bare
    // port. Targets are intentionally NOT pre-resolved — DNS is the backend's
    // problem.
    const localStr = draft.local.trim();
    const portPart = localStr.includes(":") ? localStr.slice(localStr.lastIndexOf(":") + 1) : localStr;
    const portNum = Number(portPart);
    if (!Number.isInteger(portNum) || portNum < 1 || portNum > 65535) {
      setError(`Listen port must be between 1 and 65535 (got "${portPart}")`);
      setBusy(false);
      return;
    }
    if (draft.type !== "D") {
      const target = draft.remote.trim();
      const colonIdx = target.lastIndexOf(":");
      const targetPort = colonIdx > 0 ? Number(target.slice(colonIdx + 1)) : NaN;
      if (!target || colonIdx <= 0 || !Number.isInteger(targetPort) || targetPort < 1 || targetPort > 65535) {
        setError(`Target must be host:port with a valid port (got "${target}")`);
        setBusy(false);
        return;
      }
    }
    try {
      await invoke("start_tunnel", {
        sessionId,
        spec: { type: draft.type, local: draft.local, remote: draft.remote },
      });
      setAdding(false);
      setDraft({ type: "D", local: "1080", remote: "" });
      // The list updates via the live event — no manual reload needed.
    } catch (e: any) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };

  const stopOne = async (id: string) => {
    try { await invoke("stop_tunnel", { tunnelId: id }); }
    catch (e: any) { setError(String(e)); }
  };

  const arr = Object.values(tunnels);

  return (
    <div className="flex-1 flex flex-col h-full bg-[#09090b] overflow-hidden relative">
      {disabled && (
        <div className="absolute inset-0 z-30 bg-black/55 backdrop-blur-[1px] flex items-center justify-center text-zinc-300 text-xs font-mono uppercase">
          <span className="px-3 py-1.5 bg-red-500/15 border border-red-500/30 rounded text-red-300">
            Session disconnected
          </span>
        </div>
      )}

      {/* Header: counts + add button */}
      <div className="shrink-0 px-3 py-2 flex items-center justify-between border-b border-white/5 bg-[#121214]">
        <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-zinc-400">
          <Activity size={12} />
          <span>{arr.length} {arr.length === 1 ? "tunnel" : "tunnels"}</span>
        </div>
        <button
          onClick={() => { setAdding((a) => !a); setError(null); }}
          className="h-6 px-2.5 rounded text-[10px] font-bold uppercase tracking-wider bg-primary/15 text-primary border border-primary/30 hover:bg-primary/25 flex items-center gap-1.5"
        >
          {adding ? <X size={11} /> : <Plus size={11} />}
          <span>{adding ? "Cancel" : "Add"}</span>
        </button>
      </div>

      {/* Add form — fields stacked top-to-bottom so the 1/3-width tool pane
          doesn't squeeze both inputs into illegible slivers. */}
      {adding && (
        <div className="shrink-0 p-3 border-b border-white/5 bg-[#0f0f12] space-y-2">
          <div className="flex items-center gap-2">
            <select
              value={draft.type}
              onChange={(e) => setDraft({ ...draft, type: e.target.value as "D" | "L" | "R" })}
              className="h-7 px-1.5 bg-white/[0.04] border border-white/10 rounded text-[11px] text-primary font-bold uppercase shrink-0"
            >
              <option value="D" className="bg-[#1a1a1e]">Dynamic</option>
              <option value="L" className="bg-[#1a1a1e]">Local</option>
              <option value="R" className="bg-[#1a1a1e]">Remote</option>
            </select>
            <input
              value={draft.local}
              onChange={(e) => setDraft({ ...draft, local: e.target.value })}
              placeholder={
                draft.type === "D" ? "Listen port (1080)" :
                draft.type === "L" ? "Local addr (8080 or 0.0.0.0:8080)" :
                                      "Server bind (8080 or 0.0.0.0:8080)"
              }
              className="flex-1 min-w-0 h-7 px-2 bg-white/[0.04] border border-white/10 rounded text-[11px] font-mono text-zinc-200"
            />
          </div>
          {draft.type !== "D" && (
            <div className="flex items-center gap-2 pl-1">
              <ArrowRight size={12} className="text-zinc-500 shrink-0" />
              <input
                value={draft.remote}
                onChange={(e) => setDraft({ ...draft, remote: e.target.value })}
                placeholder={draft.type === "L" ? "Target host:port (eg intranet:80)" : "Local target host:port"}
                className="flex-1 min-w-0 h-7 px-2 bg-white/[0.04] border border-white/10 rounded text-[11px] font-mono text-zinc-200"
              />
            </div>
          )}
          <div className="flex items-start justify-between gap-2">
            <span className="text-[10px] text-zinc-500 font-mono flex-1 leading-snug">
              {draft.type === "D" && "SOCKS5 proxy on this machine; traffic exits via the server."}
              {draft.type === "L" && "Connections to your local addr are tunneled to the target through the server."}
              {draft.type === "R" && "Server listens on bind addr (defaults to 0.0.0.0); incoming connections are forwarded back here. Needs GatewayPorts in sshd_config to listen externally."}
            </span>
            <button
              onClick={addTunnel}
              disabled={busy}
              className="h-7 px-3 rounded text-[10px] font-bold uppercase tracking-wider bg-primary/15 text-primary border border-primary/30 hover:bg-primary/25 disabled:opacity-50 shrink-0"
            >
              {busy ? "…" : "Start"}
            </button>
          </div>
          {error && (
            <div className="text-[10.5px] text-rose-400 font-mono flex items-start gap-1.5">
              <AlertTriangle size={11} className="mt-0.5 shrink-0" /> <span className="break-words">{error}</span>
            </div>
          )}
        </div>
      )}

      {/* List */}
      <div className="flex-1 overflow-auto p-2 space-y-1.5">
        {arr.length === 0 ? (
          <div className="text-center py-12 text-zinc-500 text-[11px] font-mono">
            No active tunnels.<br />
            <span className="text-zinc-600 text-[10px]">Add one above, or define rules on the node.</span>
          </div>
        ) : (
          arr.map((t) => {
            const stateTone =
              t.state === "listening" ? "border-emerald-500/30 bg-emerald-950/30 text-emerald-300" :
              t.state === "starting"  ? "border-indigo-500/30 bg-indigo-950/30 text-indigo-300" :
              t.state === "error"     ? "border-rose-500/30 bg-rose-950/30 text-rose-300" :
                                        "border-white/10 bg-white/[0.03] text-zinc-400";
            const KindIcon = t.kind === "dynamic" ? Globe : t.kind === "remote" ? ArrowDownLeft : ArrowRight;
            return (
              <div key={t.id} className={`rounded border ${stateTone} p-2 font-mono text-[11px]`}>
                <div className="flex items-center gap-2">
                  <KindIcon size={12} className="shrink-0" />
                  <span className="font-bold uppercase tracking-wider text-[10px] opacity-80">{t.kind}</span>
                  <span className="text-zinc-300 truncate flex-1">{t.listen_addr}</span>
                  {t.kind !== "dynamic" && (
                    <>
                      <ArrowRight size={11} className="text-zinc-500 shrink-0" />
                      <span className="text-zinc-400 truncate flex-1">{t.target}</span>
                    </>
                  )}
                  <button
                    onClick={() => stopOne(t.id)}
                    title="Stop"
                    className="ml-1 p-0.5 rounded hover:bg-white/10 text-zinc-400 hover:text-rose-400 shrink-0"
                  >
                    <Square size={11} />
                  </button>
                </div>
                <div className="mt-1 flex items-center gap-3 text-[10px] text-zinc-500">
                  <span className={`px-1.5 rounded ${
                    t.state === "listening" ? "bg-emerald-500/15 text-emerald-300" :
                    t.state === "starting"  ? "bg-indigo-500/15 text-indigo-300" :
                    t.state === "error"     ? "bg-rose-500/15 text-rose-300" :
                                              "bg-white/5 text-zinc-400"
                  }`}>
                    {t.state}
                  </span>
                  <span title="connections accepted since this tunnel started">
                    {t.conns_total} {t.conns_total === 1 ? "conn" : "conns"}
                  </span>
                  {t.error && (
                    <span className="text-rose-400 truncate" title={t.error}>· {t.error}</span>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};

export default TunnelsPanel;
