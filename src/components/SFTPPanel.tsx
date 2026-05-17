import { HardDrive, Globe, Folder, File, ArrowUp, RefreshCw } from "lucide-react";
import { useState } from "react";

const SFTPPanel = () => {
  const [localPath, setLocalPath] = useState("C:\\Users\\harve\\Documents");
  const [remotePath, setRemotePath] = useState("/home/ubuntu/project");

  return (
    <div className="flex-1 flex flex-col h-full bg-[#09090b] p-3 gap-3 overflow-y-auto no-scrollbar">
      {/* Local Filesystem (Top Pane) */}
      <div className="flex-1 min-h-[220px] border border-white/5 rounded-xl bg-[#121214] flex flex-col overflow-hidden">
        {/* Title Bar */}
        <div className="p-2.5 border-b border-white/5 bg-white/5 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <HardDrive size={13} className="text-zinc-400" />
            <span className="text-[9px] font-black uppercase tracking-widest text-zinc-300">Local Filesystem</span>
          </div>
          <button className="p-1 rounded text-zinc-500 hover:text-white transition-colors">
            <RefreshCw size={12} />
          </button>
        </div>

        {/* Directory Bar */}
        <div className="p-2 border-b border-white/5 bg-black/20 flex items-center gap-1.5 shrink-0">
          <button className="p-1 rounded bg-white/5 border border-white/5 text-zinc-400 hover:text-white hover:bg-white/10 transition-all" title="Go up one directory">
            <ArrowUp size={12} />
          </button>
          <input 
            type="text"
            value={localPath}
            onChange={(e) => setLocalPath(e.target.value)}
            className="flex-1 h-6 px-2 bg-white/5 border border-white/5 rounded text-[10px] text-zinc-300 font-mono focus:outline-none focus:border-primary/40 focus:bg-white/10 transition-all"
          />
        </div>

        {/* File List */}
        <div className="flex-1 overflow-y-auto p-2 space-y-1 font-mono text-[10px] no-scrollbar">
          <div className="flex items-center gap-2 p-1.5 rounded hover:bg-white/5 cursor-pointer text-zinc-400 transition-colors">
            <Folder size={12} className="text-primary/70" />
            <span>..</span>
          </div>
          <div className="flex items-center gap-2 p-1.5 rounded hover:bg-white/5 cursor-pointer text-zinc-300 transition-colors">
            <Folder size={12} className="text-primary/70" />
            <span>Downloads</span>
          </div>
          <div className="flex items-center gap-2 p-1.5 rounded hover:bg-white/5 cursor-pointer text-zinc-300 transition-colors">
            <Folder size={12} className="text-primary/70" />
            <span>Projects</span>
          </div>
          <div className="flex items-center justify-between p-1.5 rounded hover:bg-white/5 cursor-pointer text-zinc-400 transition-colors">
            <div className="flex items-center gap-2">
              <File size={12} className="text-zinc-500" />
              <span>config.json</span>
            </div>
            <span className="text-[9px] text-zinc-600">1.2 KB</span>
          </div>
          <div className="flex items-center justify-between p-1.5 rounded hover:bg-white/5 cursor-pointer text-zinc-400 transition-colors">
            <div className="flex items-center gap-2">
              <File size={12} className="text-zinc-500" />
              <span>id_rsa.pub</span>
            </div>
            <span className="text-[9px] text-zinc-600">412 B</span>
          </div>
        </div>
      </div>

      {/* Remote Host Filesystem (Bottom Pane) */}
      <div className="flex-1 min-h-[220px] border border-white/5 rounded-xl bg-[#121214] flex flex-col overflow-hidden shadow-inner">
        {/* Title Bar */}
        <div className="p-2.5 border-b border-white/5 bg-white/5 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2 text-primary">
            <Globe size={13} />
            <span className="text-[9px] font-black uppercase tracking-widest">Remote Host</span>
          </div>
          <button className="p-1 rounded text-zinc-500 hover:text-white transition-colors">
            <RefreshCw size={12} />
          </button>
        </div>

        {/* Directory Bar */}
        <div className="p-2 border-b border-white/5 bg-black/20 flex items-center gap-1.5 shrink-0">
          <button className="p-1 rounded bg-white/5 border border-white/5 text-zinc-400 hover:text-white hover:bg-white/10 transition-all" title="Go up one directory">
            <ArrowUp size={12} />
          </button>
          <input 
            type="text"
            value={remotePath}
            onChange={(e) => setRemotePath(e.target.value)}
            className="flex-1 h-6 px-2 bg-white/5 border border-white/5 rounded text-[10px] text-zinc-300 font-mono focus:outline-none focus:border-primary/40 focus:bg-white/10 transition-all"
          />
        </div>

        {/* File List */}
        <div className="flex-1 overflow-y-auto p-2 space-y-1 font-mono text-[10px] no-scrollbar">
          <div className="flex items-center gap-2 p-1.5 rounded hover:bg-white/5 cursor-pointer text-zinc-400 transition-colors">
            <Folder size={12} className="text-primary/70" />
            <span>..</span>
          </div>
          <div className="flex items-center gap-2 p-1.5 rounded hover:bg-white/5 cursor-pointer text-zinc-300 transition-colors">
            <Folder size={12} className="text-primary/70" />
            <span>src</span>
          </div>
          <div className="flex items-center gap-2 p-1.5 rounded hover:bg-white/5 cursor-pointer text-zinc-300 transition-colors">
            <Folder size={12} className="text-primary/70" />
            <span>node_modules</span>
          </div>
          <div className="flex items-center justify-between p-1.5 rounded hover:bg-white/5 cursor-pointer text-zinc-400 transition-colors">
            <div className="flex items-center gap-2">
              <File size={12} className="text-zinc-500" />
              <span>package.json</span>
            </div>
            <span className="text-[9px] text-zinc-600">812 B</span>
          </div>
          <div className="flex items-center justify-between p-1.5 rounded hover:bg-white/5 cursor-pointer text-zinc-400 transition-colors">
            <div className="flex items-center gap-2">
              <File size={12} className="text-zinc-500" />
              <span>server.js</span>
            </div>
            <span className="text-[9px] text-zinc-600">4.5 KB</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SFTPPanel;