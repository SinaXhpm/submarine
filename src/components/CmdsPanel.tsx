import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Play, RefreshCw, Search, X, Terminal, StickyNote, ClipboardCopy, ChevronDown, ChevronRight, Pencil, Check } from "lucide-react";

// Side panel that opens from a terminal session and surfaces *both* the
// user's saved Quick Commands and their Notes side by side. Commands have a
// "Play" button that writes them into the active PTY with a trailing CR so
// the shell executes them immediately; notes are reference material — they
// expand inline on click and offer "copy to clipboard" + a paste-into-PTY
// button that writes the body without the trailing CR (so the user can
// review before hitting Enter themselves).
//
// One fetch per kind on mount, refreshable via the header button. Search
// runs client-side over title + content/body of whichever tab is active.

interface CommandItem {
  id: number;
  title: string;
  content: string;
}

interface NoteItem {
  id: number;
  title: string;
  body: string;
}

type Tab = "commands" | "notes";

export const CmdsPanel = ({ activeTab, onClose }: { activeTab: string; onClose: () => void }) => {
  const [tab, setTab] = useState<Tab>("commands");
  const [commands, setCommands] = useState<CommandItem[]>([]);
  const [notes, setNotes] = useState<NoteItem[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [expandedNoteId, setExpandedNoteId] = useState<number | null>(null);
  // Per-note editor state. Held alongside expandedNoteId so the user can
  // expand to read without entering edit mode (and the textarea instance
  // is only mounted while editing, avoiding wasted DOM nodes for long
  // lists).
  const [editingNoteId, setEditingNoteId] = useState<number | null>(null);
  const [editingTitle, setEditingTitle] = useState("");
  const [editingBody, setEditingBody] = useState("");
  const [savingNote, setSavingNote] = useState(false);

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

  useEffect(() => {
    fetchAll();
  }, []);

  // Reset the search box and any expanded note when the user flips tabs —
  // otherwise the search filter silently applies to the new tab's items
  // and looks broken when nothing matches.
  useEffect(() => {
    setSearchQuery("");
    setExpandedNoteId(null);
    setEditingNoteId(null);
  }, [tab]);

  const beginEditNote = (n: NoteItem) => {
    setEditingNoteId(n.id);
    setEditingTitle(n.title || "");
    setEditingBody(n.body || "");
    setExpandedNoteId(n.id);
  };

  const cancelEditNote = () => {
    setEditingNoteId(null);
    setEditingTitle("");
    setEditingBody("");
  };

  const saveEditNote = async () => {
    if (editingNoteId == null || savingNote) return;
    setSavingNote(true);
    try {
      await invoke("edit_note", {
        id: editingNoteId,
        title: editingTitle,
        body: editingBody,
      });
      // Patch the local cache so the UI updates without a round-trip.
      // We still refetch in the background to stay in sync if the user
      // edits the same profile from another window.
      setNotes((prev) =>
        prev.map((n) =>
          n.id === editingNoteId ? { ...n, title: editingTitle, body: editingBody } : n
        )
      );
      cancelEditNote();
      fetchAll();
    } catch (e) {
      console.error("Failed to save note:", e);
    } finally {
      setSavingNote(false);
    }
  };

  const runCommand = async (content: string) => {
    if (!activeTab) return;
    try {
      const commandToExecute = content.endsWith("\n") || content.endsWith("\r") ? content : content + "\r";
      const dataBytes = Array.from(new TextEncoder().encode(commandToExecute));
      await invoke("write_terminal_data", {
        terminalId: activeTab,
        data: dataBytes,
      });
    } catch (e) {
      console.error("Failed to run command:", e);
    }
  };

  // Notes get a softer "paste" that intentionally OMITS the trailing CR.
  // The user typed a note as reference, not necessarily as a one-shot
  // command, so we leave the cursor at the end and let them decide.
  const pasteNote = async (body: string) => {
    if (!activeTab) return;
    try {
      const dataBytes = Array.from(new TextEncoder().encode(body));
      await invoke("write_terminal_data", {
        terminalId: activeTab,
        data: dataBytes,
      });
    } catch (e) {
      console.error("Failed to paste note:", e);
    }
  };

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch (e) {
      console.error("Clipboard write failed:", e);
    }
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
          <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-300 truncate">Reference · {tabLabel}</span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={fetchAll}
            disabled={loading}
            className="p-1.5 rounded-lg text-zinc-500 hover:text-white hover:bg-white/5 transition-all disabled:opacity-50"
            title="Refresh list"
          >
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
          </button>
          <button
            onClick={onClose}
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
            placeholder={tab === "commands" ? "Search commands..." : "Search notes (title + content)..."}
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
            filteredCommands.map((c) => (
              <div
                key={c.id}
                className="group relative p-3 rounded-lg border border-white/5 bg-white/[0.02] hover:bg-white/[0.04] hover:border-white/10 transition-all"
              >
                <div className="flex items-start justify-between gap-4">
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
                  <button
                    onClick={() => runCommand(c.content)}
                    className="shrink-0 h-7 w-7 rounded-lg bg-primary/10 text-primary border border-primary/20 hover:bg-primary hover:text-zinc-950 hover:border-primary flex items-center justify-center transition-all shadow-sm"
                    title="Run command in active terminal"
                  >
                    <Play size={12} fill="currentColor" className="ml-0.5" />
                  </button>
                </div>
              </div>
            ))
          ) : (
            <div className="flex flex-col items-center justify-center py-16 text-zinc-600 text-center px-4">
              <Terminal size={32} className="opacity-20 mb-2" />
              <span className="text-xs font-bold text-zinc-500">No Commands Found</span>
              <p className="text-[10px] mt-1 text-zinc-600 max-w-[200px]">
                {searchQuery ? "No matches for your search query." : "Save commands in the main app to run them quickly here."}
              </p>
            </div>
          )
        ) : filteredNotes.length > 0 ? (
          filteredNotes.map((n) => {
            const expanded = expandedNoteId === n.id;
            return (
              <div
                key={n.id}
                className="group relative rounded-lg border border-white/5 bg-white/[0.02] hover:bg-white/[0.04] hover:border-white/10 transition-all"
              >
                <button
                  onClick={() => setExpandedNoteId(expanded ? null : n.id)}
                  className="w-full flex items-start gap-2 p-3 text-left"
                >
                  <span className="mt-0.5 text-zinc-500 group-hover:text-zinc-300 shrink-0">
                    {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                  </span>
                  <div className="flex-1 min-w-0">
                    <h4 className="text-xs font-bold text-zinc-200 truncate group-hover:text-primary transition-colors">
                      {n.title || "Untitled"}
                    </h4>
                    {!expanded && (
                      <p className="mt-1 text-[10px] text-zinc-500 truncate">
                        {(n.body || "").split('\n')[0] || <span className="italic">(empty)</span>}
                      </p>
                    )}
                  </div>
                </button>

                {expanded && (
                  editingNoteId === n.id ? (
                    // Inline editor — same layout footprint as the read mode
                    // so swapping in/out doesn't reflow the surrounding list.
                    // Ctrl/Cmd+Enter is the textarea power-user shortcut for
                    // Save; Escape always cancels.
                    <div className="px-3 pb-3 -mt-1 space-y-2">
                      <input
                        type="text"
                        value={editingTitle}
                        onChange={(e) => setEditingTitle(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Escape") { e.preventDefault(); cancelEditNote(); }
                        }}
                        placeholder="Title"
                        className="w-full h-7 px-2 bg-black/40 border border-white/10 rounded text-[11px] text-white placeholder-zinc-600 focus:outline-none focus:border-primary/50"
                        autoFocus
                      />
                      <textarea
                        value={editingBody}
                        onChange={(e) => setEditingBody(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Escape") { e.preventDefault(); cancelEditNote(); }
                          if ((e.ctrlKey || e.metaKey) && e.key === "Enter") { e.preventDefault(); saveEditNote(); }
                        }}
                        placeholder="Note body — markdown, paths, snippets…"
                        rows={6}
                        className="w-full p-2 bg-black/40 border border-white/10 rounded font-sans text-[11px] text-zinc-200 placeholder-zinc-600 leading-relaxed resize-y focus:outline-none focus:border-primary/50 custom-scrollbar"
                      />
                      <div className="flex gap-1.5">
                        <button
                          onClick={cancelEditNote}
                          disabled={savingNote}
                          className="flex-1 h-7 rounded-lg bg-white/[0.04] border border-white/10 hover:bg-white/10 hover:border-white/20 text-zinc-300 hover:text-white flex items-center justify-center gap-1.5 text-[10px] font-bold transition-all disabled:opacity-50"
                        >
                          <X size={11} /> Cancel
                        </button>
                        <button
                          onClick={saveEditNote}
                          disabled={savingNote}
                          className="flex-1 h-7 rounded-lg bg-primary/10 text-primary border border-primary/20 hover:bg-primary hover:text-zinc-950 hover:border-primary flex items-center justify-center gap-1.5 text-[10px] font-bold transition-all disabled:opacity-50"
                          title="Save (Ctrl+Enter)"
                        >
                          {savingNote ? <RefreshCw size={11} className="animate-spin" /> : <Check size={11} />} Save
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="px-3 pb-3 -mt-1 space-y-2">
                      <pre className="p-2.5 bg-black/40 rounded border border-white/5 font-sans text-[11px] text-zinc-300 whitespace-pre-wrap leading-relaxed max-h-64 overflow-y-auto custom-scrollbar">
                        {n.body || <span className="italic text-zinc-600">(empty)</span>}
                      </pre>
                      <div className="flex gap-1.5">
                        <button
                          onClick={() => copyToClipboard(n.body || "")}
                          className="flex-1 h-7 rounded-lg bg-white/[0.04] border border-white/10 hover:bg-white/10 hover:border-white/20 text-zinc-300 hover:text-white flex items-center justify-center gap-1.5 text-[10px] font-bold transition-all"
                          title="Copy to clipboard"
                        >
                          <ClipboardCopy size={11} /> Copy
                        </button>
                        <button
                          onClick={() => pasteNote(n.body || "")}
                          className="flex-1 h-7 rounded-lg bg-white/[0.04] border border-white/10 hover:bg-white/10 hover:border-white/20 text-zinc-300 hover:text-white flex items-center justify-center gap-1.5 text-[10px] font-bold transition-all"
                          title="Paste body into active terminal (no auto-execute)"
                        >
                          <Play size={11} fill="currentColor" /> Paste
                        </button>
                        <button
                          onClick={() => beginEditNote(n)}
                          className="flex-1 h-7 rounded-lg bg-primary/10 text-primary border border-primary/20 hover:bg-primary hover:text-zinc-950 hover:border-primary flex items-center justify-center gap-1.5 text-[10px] font-bold transition-all"
                          title="Edit note inline"
                        >
                          <Pencil size={11} /> Edit
                        </button>
                      </div>
                    </div>
                  )
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
