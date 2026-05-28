import { useState, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Play, RefreshCw, Search, X, Terminal, StickyNote, ClipboardCopy, ChevronDown, ChevronRight, Pencil, Check } from "lucide-react";

// Side panel that opens from a terminal session and surfaces *both* the
// user's saved Quick Commands and their Notes. Two patterns for editing:
//
//   - Notes are edit-by-default: clicking a row expands it directly into an
//     editable title input + body textarea. No Edit toggle. Save lights up
//     only when the draft diverges from the stored copy, and collapsing the
//     row or switching tabs auto-saves any pending changes so the user
//     can't lose work by clicking away.
//
//   - Commands stay compact by default (one-liner row + action buttons),
//     because they're typically short and a dropped-in textarea per item
//     would bloat the list. An Edit button on each row toggles the same
//     inline editor for that command.
//
// Both kinds get Play (write + CR → execute), Paste (write without CR →
// drop into the prompt for review), and Copy (clipboard) actions. Search
// runs client-side over the active tab's title + body fields.

interface CommandItem { id: number; title: string; content: string; }
interface NoteItem { id: number; title: string; body: string; }
type Tab = "commands" | "notes";

// Single shared "what's being edited right now" slot. Only one row can be
// editing at a time (notes expand-to-edit, commands toggle-to-edit), so a
// flat tagged union is simpler than two parallel sets of useState fields.
type EditTarget =
  | { kind: "command"; id: number; title: string; body: string }
  | { kind: "note"; id: number; title: string; body: string };

export const CmdsPanel = ({ activeTab, onClose }: { activeTab: string; onClose: () => void }) => {
  const [tab, setTab] = useState<Tab>("commands");
  const [commands, setCommands] = useState<CommandItem[]>([]);
  const [notes, setNotes] = useState<NoteItem[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(false);

  const [edit, setEdit] = useState<EditTarget | null>(null);
  const [saving, setSaving] = useState(false);
  // Ref mirror of the edit slot so the cleanup logic in tab-switch /
  // refresh / unmount can read the latest draft without re-binding the
  // effect on every keystroke.
  const editRef = useRef<EditTarget | null>(null);
  useEffect(() => { editRef.current = edit; }, [edit]);

  // Snapshot of the saved title/body for the row currently being edited.
  // Used to gate the Save button (only enabled when the draft differs) and
  // to know whether an auto-save should fire on collapse.
  const originalForEdit = (target: EditTarget): { title: string; body: string } | null => {
    if (target.kind === "command") {
      const c = commands.find((x) => x.id === target.id);
      return c ? { title: c.title || "", body: c.content || "" } : null;
    }
    const n = notes.find((x) => x.id === target.id);
    return n ? { title: n.title || "", body: n.body || "" } : null;
  };

  const isDirty = (target: EditTarget | null): boolean => {
    if (!target) return false;
    const o = originalForEdit(target);
    if (!o) return false;
    return o.title !== target.title || o.body !== target.body;
  };

  const fetchAll = async () => {
    setLoading(true);
    try {
      const [cmds, ns] = await Promise.all([
        invoke<CommandItem[]>("get_commands"),
        invoke<NoteItem[]>("get_notes"),
      ]);
      setCommands(cmds || []);
      setNotes(ns || []);
    } catch (e) {
      console.error("Failed to fetch CMDS panel data:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchAll(); }, []);

  // Save the currently editing row (if dirty), without touching the edit
  // state itself — the caller decides whether to collapse afterwards. We
  // accept a target arg so callers that already cleared local state can
  // still pass through their snapshot.
  const flushIfDirty = async (target: EditTarget | null) => {
    if (!target) return;
    const o = originalForEdit(target);
    if (!o || (o.title === target.title && o.body === target.body)) return;
    try {
      if (target.kind === "command") {
        await invoke("edit_command", { id: target.id, title: target.title, content: target.body });
        setCommands((prev) => prev.map((c) => c.id === target.id ? { ...c, title: target.title, content: target.body } : c));
      } else {
        await invoke("edit_note", { id: target.id, title: target.title, body: target.body });
        setNotes((prev) => prev.map((n) => n.id === target.id ? { ...n, title: target.title, body: target.body } : n));
      }
    } catch (e) {
      console.error("Failed to auto-save:", e);
    }
  };

  // Tab switch: persist whatever's open in the current tab before clearing
  // the editor and search so the next tab starts clean.
  useEffect(() => {
    const snapshot = editRef.current;
    setSearchQuery("");
    setEdit(null);
    flushIfDirty(snapshot);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  const beginEditCommand = (c: CommandItem) => {
    setEdit({ kind: "command", id: c.id, title: c.title || "", body: c.content || "" });
  };
  const beginEditNote = (n: NoteItem) => {
    setEdit({ kind: "note", id: n.id, title: n.title || "", body: n.body || "" });
  };

  const cancelEdit = () => {
    setEdit(null);
  };

  // Collapse the currently expanded note (auto-saves on the way out). Used
  // when the user clicks the chevron-area of an expanded note to retract it.
  const collapseEditedNote = async () => {
    const snapshot = editRef.current;
    setEdit(null);
    await flushIfDirty(snapshot);
  };

  const saveEdit = async () => {
    if (!edit || saving) return;
    setSaving(true);
    try {
      if (edit.kind === "command") {
        await invoke("edit_command", { id: edit.id, title: edit.title, content: edit.body });
        setCommands((prev) => prev.map((c) => c.id === edit.id ? { ...c, title: edit.title, content: edit.body } : c));
      } else {
        await invoke("edit_note", { id: edit.id, title: edit.title, body: edit.body });
        setNotes((prev) => prev.map((n) => n.id === edit.id ? { ...n, title: edit.title, body: edit.body } : n));
      }
      setEdit(null);
      fetchAll();
    } catch (e) {
      console.error("Failed to save:", e);
    } finally {
      setSaving(false);
    }
  };

  // Write `text` into the active PTY. `execute=true` appends a CR so the
  // shell runs the line immediately; false leaves the cursor at the end so
  // the user can review / edit before pressing Enter themselves.
  const writeToTerminal = async (text: string, execute: boolean) => {
    if (!activeTab) return;
    try {
      const payload = execute
        ? (text.endsWith("\n") || text.endsWith("\r") ? text : text + "\r")
        : text;
      const dataBytes = Array.from(new TextEncoder().encode(payload));
      await invoke("write_terminal_data", { terminalId: activeTab, data: dataBytes });
    } catch (e) {
      console.error("Failed to write to terminal:", e);
    }
  };

  const copyToClipboard = async (text: string) => {
    try { await navigator.clipboard.writeText(text); }
    catch (e) { console.error("Clipboard write failed:", e); }
  };

  const q = searchQuery.toLowerCase();
  const filteredCommands = commands.filter(
    (c) => c.title.toLowerCase().includes(q) || c.content.toLowerCase().includes(q)
  );
  const filteredNotes = notes.filter(
    (n) => (n.title || "").toLowerCase().includes(q) || (n.body || "").toLowerCase().includes(q)
  );

  const tabLabel = tab === "commands" ? "Commands" : "Notes";

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-[#09090b]">
      {/* Title Bar */}
      <div className="h-12 px-4 shrink-0 flex items-center justify-between border-b border-white/5 bg-white/5">
        <div className="flex items-center gap-2 min-w-0">
          {tab === "commands" ? <Terminal size={14} className="text-primary shrink-0" /> : <StickyNote size={14} className="text-primary shrink-0" />}
          <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-300 truncate">Library · {tabLabel}</span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={async () => { await flushIfDirty(editRef.current); fetchAll(); }}
            disabled={loading}
            className="p-1.5 rounded-lg text-zinc-500 hover:text-white hover:bg-white/5 transition-all disabled:opacity-50"
            title="Refresh list"
          >
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
          </button>
          <button
            onClick={async () => { await flushIfDirty(editRef.current); onClose(); }}
            className="p-1.5 rounded-lg text-zinc-500 hover:text-white hover:bg-white/5 transition-all"
            title="Close Panel"
          >
            <X size={14} />
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="grid grid-cols-2 shrink-0 border-b border-white/5 bg-black/20">
        <button
          onClick={() => setTab("commands")}
          className={`h-9 flex items-center justify-center gap-1.5 text-[11px] font-bold uppercase tracking-wider transition-all ${
            tab === "commands"
              ? "text-primary bg-primary/5 border-b border-primary"
              : "text-zinc-500 hover:text-zinc-200 hover:bg-white/[0.03] border-b border-transparent"
          }`}
        >
          <Terminal size={12} /> Commands
          <span className="text-[9px] opacity-60">{commands.length}</span>
        </button>
        <button
          onClick={() => setTab("notes")}
          className={`h-9 flex items-center justify-center gap-1.5 text-[11px] font-bold uppercase tracking-wider transition-all ${
            tab === "notes"
              ? "text-primary bg-primary/5 border-b border-primary"
              : "text-zinc-500 hover:text-zinc-200 hover:bg-white/[0.03] border-b border-transparent"
          }`}
        >
          <StickyNote size={12} /> Notes
          <span className="text-[9px] opacity-60">{notes.length}</span>
        </button>
      </div>

      {/* Search Input */}
      <div className="p-3 shrink-0 border-b border-white/5 bg-black/20">
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
          <input
            type="text"
            placeholder={tab === "commands" ? "Search commands (title + body)..." : "Search notes (title + body)..."}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full h-8 pl-9 pr-3 bg-white/5 border border-white/5 rounded-lg text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-primary/50 focus:bg-white/10 transition-all"
          />
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2 no-scrollbar">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-12 text-zinc-500 gap-2">
            <RefreshCw size={24} className="animate-spin text-primary opacity-60" />
            <span className="text-[11px]">Loading {tabLabel.toLowerCase()}...</span>
          </div>
        ) : tab === "commands" ? (
          filteredCommands.length > 0 ? (
            filteredCommands.map((c) => {
              const editing = edit?.kind === "command" && edit.id === c.id;
              return (
                <div
                  key={c.id}
                  className="group relative rounded-lg border border-white/5 bg-white/[0.02] hover:bg-white/[0.04] hover:border-white/10 transition-all"
                >
                  {editing ? (
                    <div className="p-3 space-y-2">
                      <input
                        type="text"
                        value={edit.title}
                        onChange={(e) => setEdit({ ...edit, title: e.target.value })}
                        onKeyDown={(e) => {
                          if (e.key === "Escape") { e.preventDefault(); cancelEdit(); }
                        }}
                        placeholder="Title"
                        className="w-full h-7 px-2 bg-black/40 border border-white/10 rounded text-[11px] text-white placeholder-zinc-600 focus:outline-none focus:border-primary/50"
                        autoFocus
                      />
                      <textarea
                        value={edit.body}
                        onChange={(e) => setEdit({ ...edit, body: e.target.value })}
                        onKeyDown={(e) => {
                          if (e.key === "Escape") { e.preventDefault(); cancelEdit(); }
                          if ((e.ctrlKey || e.metaKey) && e.key === "Enter") { e.preventDefault(); saveEdit(); }
                        }}
                        placeholder="Command body — runnable in shell"
                        rows={5}
                        className="w-full p-2 bg-black/40 border border-white/10 rounded font-mono text-[11px] text-zinc-200 placeholder-zinc-600 leading-relaxed resize-y focus:outline-none focus:border-primary/50 custom-scrollbar"
                      />
                      <div className="flex gap-1.5">
                        <button
                          onClick={cancelEdit}
                          disabled={saving}
                          className="flex-1 h-7 rounded-lg bg-white/[0.04] border border-white/10 hover:bg-white/10 hover:border-white/20 text-zinc-300 hover:text-white flex items-center justify-center gap-1.5 text-[10px] font-bold transition-all disabled:opacity-50"
                        >
                          <X size={11} /> Cancel
                        </button>
                        <button
                          onClick={saveEdit}
                          disabled={saving || !isDirty(edit)}
                          className="flex-1 h-7 rounded-lg bg-primary/10 text-primary border border-primary/20 hover:bg-primary hover:text-zinc-950 hover:border-primary flex items-center justify-center gap-1.5 text-[10px] font-bold transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                          title="Save (Ctrl+Enter)"
                        >
                          {saving ? <RefreshCw size={11} className="animate-spin" /> : <Check size={11} />} Save
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <h4 className="text-xs font-bold text-zinc-200 truncate group-hover:text-primary transition-colors">
                            {c.title}
                          </h4>
                          <pre
                            className="mt-1.5 p-1.5 px-2 bg-black/40 rounded border border-white/5 font-mono text-[10px] text-zinc-400 truncate whitespace-nowrap overflow-hidden"
                            title={c.content}
                          >
                            {c.content.split('\n')[0] || ""}{c.content.split('\n').length > 1 ? " ..." : ""}
                          </pre>
                        </div>
                      </div>
                      <div className="flex gap-1.5 mt-2">
                        <button
                          onClick={() => writeToTerminal(c.content, true)}
                          className="flex-1 h-7 rounded-lg bg-primary/10 text-primary border border-primary/20 hover:bg-primary hover:text-zinc-950 hover:border-primary flex items-center justify-center gap-1.5 text-[10px] font-bold transition-all"
                          title="Run in active terminal (writes + Enter)"
                        >
                          <Play size={11} fill="currentColor" /> Run
                        </button>
                        <button
                          onClick={() => writeToTerminal(c.content, false)}
                          className="flex-1 h-7 rounded-lg bg-white/[0.04] border border-white/10 hover:bg-white/10 hover:border-white/20 text-zinc-300 hover:text-white flex items-center justify-center gap-1.5 text-[10px] font-bold transition-all"
                          title="Paste into active terminal (no Enter)"
                        >
                          <ClipboardCopy size={11} /> Paste
                        </button>
                        <button
                          onClick={() => beginEditCommand(c)}
                          className="flex-1 h-7 rounded-lg bg-white/[0.04] border border-white/10 hover:bg-white/10 hover:border-white/20 text-zinc-300 hover:text-white flex items-center justify-center gap-1.5 text-[10px] font-bold transition-all"
                          title="Edit command inline"
                        >
                          <Pencil size={11} /> Edit
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          ) : (
            <div className="flex flex-col items-center justify-center py-16 text-zinc-600 text-center px-4">
              <Terminal size={32} className="opacity-20 mb-2" />
              <span className="text-xs font-bold text-zinc-500">No Commands Found</span>
              <p className="text-[10px] mt-1 text-zinc-600 max-w-[200px]">
                {searchQuery ? "No matches for your search query." : "Save commands in the main app to surface them here."}
              </p>
            </div>
          )
        ) : filteredNotes.length > 0 ? (
          filteredNotes.map((n) => {
            const expanded = edit?.kind === "note" && edit.id === n.id;
            return (
              <div
                key={n.id}
                className="group relative rounded-lg border border-white/5 bg-white/[0.02] hover:bg-white/[0.04] hover:border-white/10 transition-all"
              >
                <button
                  onClick={() => {
                    if (expanded) {
                      // Click on row again → collapse + auto-save.
                      collapseEditedNote();
                    } else {
                      // Switching from one note to another also auto-saves.
                      flushIfDirty(editRef.current);
                      beginEditNote(n);
                    }
                  }}
                  className="w-full flex items-start gap-2 px-3 pt-3 pb-2 text-left"
                >
                  <span className="mt-0.5 text-zinc-500 group-hover:text-zinc-300 shrink-0">
                    {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                  </span>
                  <div className="flex-1 min-w-0">
                    <h4 className="text-xs font-bold text-zinc-200 truncate group-hover:text-primary transition-colors">
                      {(expanded ? edit.title : n.title) || "Untitled"}
                    </h4>
                    {!expanded && (
                      <p className="mt-1 text-[10px] text-zinc-500 truncate">
                        {(n.body || "").split('\n')[0] || <span className="italic">(empty)</span>}
                      </p>
                    )}
                  </div>
                </button>

                {expanded && (
                  <div className="px-3 pb-3 space-y-2">
                    <input
                      type="text"
                      value={edit.title}
                      onChange={(e) => setEdit({ ...edit, title: e.target.value })}
                      placeholder="Title"
                      className="w-full h-7 px-2 bg-black/40 border border-white/10 rounded text-[11px] text-white placeholder-zinc-600 focus:outline-none focus:border-primary/50"
                    />
                    <textarea
                      value={edit.body}
                      onChange={(e) => setEdit({ ...edit, body: e.target.value })}
                      onKeyDown={(e) => {
                        if ((e.ctrlKey || e.metaKey) && e.key === "Enter") { e.preventDefault(); saveEdit(); }
                      }}
                      placeholder="Note body — markdown, paths, snippets…"
                      rows={6}
                      className="w-full p-2 bg-black/40 border border-white/10 rounded font-sans text-[11px] text-zinc-200 placeholder-zinc-600 leading-relaxed resize-y focus:outline-none focus:border-primary/50 custom-scrollbar"
                      autoFocus
                    />
                    <div className="flex gap-1.5 flex-wrap">
                      <button
                        onClick={() => copyToClipboard(edit.body || "")}
                        className="flex-1 h-7 min-w-[64px] rounded-lg bg-white/[0.04] border border-white/10 hover:bg-white/10 hover:border-white/20 text-zinc-300 hover:text-white flex items-center justify-center gap-1.5 text-[10px] font-bold transition-all"
                        title="Copy current body to clipboard"
                      >
                        <ClipboardCopy size={11} /> Copy
                      </button>
                      <button
                        onClick={() => writeToTerminal(edit.body || "", false)}
                        className="flex-1 h-7 min-w-[64px] rounded-lg bg-white/[0.04] border border-white/10 hover:bg-white/10 hover:border-white/20 text-zinc-300 hover:text-white flex items-center justify-center gap-1.5 text-[10px] font-bold transition-all"
                        title="Paste body into active terminal (no Enter)"
                      >
                        <Play size={11} fill="currentColor" /> Paste
                      </button>
                      <button
                        onClick={saveEdit}
                        disabled={saving || !isDirty(edit)}
                        className="flex-1 h-7 min-w-[64px] rounded-lg bg-primary/10 text-primary border border-primary/20 hover:bg-primary hover:text-zinc-950 hover:border-primary flex items-center justify-center gap-1.5 text-[10px] font-bold transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                        title={isDirty(edit) ? "Save changes (Ctrl+Enter)" : "No unsaved changes"}
                      >
                        {saving ? <RefreshCw size={11} className="animate-spin" /> : <Check size={11} />} Save
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })
        ) : (
          <div className="flex flex-col items-center justify-center py-16 text-zinc-600 text-center px-4">
            <StickyNote size={32} className="opacity-20 mb-2" />
            <span className="text-xs font-bold text-zinc-500">No Notes Found</span>
            <p className="text-[10px] mt-1 text-zinc-600 max-w-[200px]">
              {searchQuery ? "No matches for your search query." : "Add notes from the Notes tab to surface them here."}
            </p>
          </div>
        )}
      </div>
    </div>
  );
};
