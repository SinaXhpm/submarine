import { HardDrive, Globe } from "lucide-react";

const SFTPPanel = () => {
  return (
    <div className="flex-1 flex overflow-hidden p-3 gap-3 bg-[#09090b]">
      <div className="flex-1 border border-white/5 rounded-xl bg-[#121214] flex flex-col overflow-hidden">
        <div className="p-3 border-b border-white/5 bg-white/5 flex items-center gap-2">
          <HardDrive size={14} className="text-zinc-500" />
          <span className="text-[10px] font-black uppercase tracking-widest">Local Filesystem</span>
        </div>
        <div className="flex-1 p-4 text-[11px] font-mono text-zinc-600 italic">Drop files here to upload...</div>
      </div>
      <div className="flex-1 border border-white/5 rounded-xl bg-[#121214] flex flex-col overflow-hidden shadow-inner">
        <div className="p-3 border-b border-white/5 bg-white/5 flex items-center gap-2 text-primary">
          <Globe size={14} />
          <span className="text-[10px] font-black uppercase tracking-widest">Remote Host</span>
        </div>
        <div className="flex-1 p-4 text-[11px] font-mono text-zinc-600 italic">Waiting for connection...</div>
      </div>
    </div>
  );
};

export default SFTPPanel;