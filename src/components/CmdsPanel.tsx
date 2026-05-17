import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Play, RefreshCw, Search, X, Terminal } from "lucide-react";

interface CommandItem {
  id: number;
  title: string;
  content: string;
}

export const CmdsPanel = ({ activeTab, onClose }: { activeTab: string; onClose: () => void }) => {
  const [commands, setCommands] = useState<CommandItem[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(false);

  const fetchCommands = async () => {
    setLoading(true);
    try {
      const list = await invoke<CommandItem[]>("get_commands");
      setCommands(list || []);
    } catch (e) {
      console.error("Failed to fetch commands:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCommands();
  }, []);

  const runCommand = async (content: string) => {
    if (!activeTab) return;
    try {
      // Append newline to execute instantly in PTY
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

  const filteredCommands = commands.filter(
    (c) =>
      c.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.content.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-[#09090b]">
      {/* Title Bar */}
      <div className="h-12 px-4 shrink-0 flex items-center justify-between border-b border-white/5 bg-white/5">
        <div className="flex items-center gap-2">
          <Terminal size={14} className="text-primary" />
          <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-300">Quick Commands (CMDS)</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={fetchCommands}
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

      {/* Search Input */}
      <div className="p-3 shrink-0 border-b border-white/5 bg-black/20">
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
          <input
            type="text"
            placeholder="Search commands..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full h-8 pl-9 pr-3 bg-white/5 border border-white/5 rounded-lg text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-primary/50 focus:bg-white/10 transition-all"
          />
        </div>
      </div>

      {/* Commands List */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2 no-scrollbar">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-12 text-zinc-500 gap-2">
            <RefreshCw size={24} className="animate-spin text-primary opacity-60" />
            <span className="text-[11px]">Loading saved commands...</span>
          </div>
        ) : filteredCommands.length > 0 ? (
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
        )}
      </div>
    </div>
  );
};
