import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Cpu, X, Link2, ArrowLeftRight, Shield, Key, User, FolderPlus } from "lucide-react";

const AddNodePanel = ({ isOpen, onClose, newNode, setNewNode, onSave, credentials, sshKeys, folders, refreshData, isEditMode, formError, isMobile }: any) => {
  const [isCreatingFolder, setIsCreatingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");

  const handleCreateFolder = async () => {
    if (!newFolderName.trim()) return;
    try {
      await invoke("add_folder", { name: newFolderName, parentId: null });
      setNewFolderName("");
      setIsCreatingFolder(false);
      refreshData();
    } catch (e) {
      console.error(e);
    }
  };

  const updateTunnel = (idx: number, field: string, value: string) => {
    const newT = [...newNode.tunnels];
    newT[idx][field] = value;
    setNewNode({ ...newNode, tunnels: newT });
  };

  return (
    <div className={`fixed inset-0 z-50 transition-all duration-500 flex justify-end ${isOpen ? 'bg-black/60 backdrop-blur-sm' : 'opacity-0 pointer-events-none'}`} onClick={onClose}>
      <div className={`w-full ${isMobile ? 'max-w-full' : 'max-w-[450px]'} bg-background border-l border-white/5 shadow-2xl transition-all duration-500 h-full flex flex-col ${isOpen ? 'translate-x-0' : 'translate-x-full'}`} onClick={(e) => e.stopPropagation()}>

        {/* Header */}
        <div className="flex justify-between items-center p-6 border-b border-white/5 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-primary/10 rounded-lg flex items-center justify-center text-primary shadow-inner border border-primary/20">
              <Cpu size={16} />
            </div>
            <h2 className="text-[12px] font-black text-white uppercase tracking-[0.2em]">Node Configuration</h2>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center text-zinc-500 hover:text-white bg-black border border-white/5 hover:bg-white/10 rounded-xl transition-all shadow-inner">
            <X size={16} />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="p-6 flex-1 overflow-y-auto custom-scrollbar space-y-6">
          {formError && <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-red-500 text-[12px] font-bold">{formError}</div>}

          <div className="grid grid-cols-1 gap-4">
            <div className="space-y-1.5">
              <label className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider ml-1">Alias Name</label>
              <input type="text" className="w-full h-9 bg-[#1a1a1e] rounded-lg px-3 text-[12px] text-white border border-white/10 outline-none focus:border-primary/50 focus:bg-[#232328] transition-all shadow-inner" placeholder="Production Server" value={newNode.name} onChange={e => setNewNode({ ...newNode, name: e.target.value })} />
            </div>

            <div className="space-y-1.5">
              <label className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider ml-1">Group / Folder</label>
              {!isCreatingFolder ? (
                <div className="flex gap-2">
                  <select className="flex-1 h-9 bg-[#1a1a1e] rounded-lg px-3 text-[12px] text-white border border-white/10 outline-none focus:border-primary/50 focus:bg-[#232328] transition-all shadow-inner" value={newNode.folderId} onChange={e => setNewNode({ ...newNode, folderId: e.target.value })}>
                    <option value="" className="bg-[#1a1a1e] text-zinc-500">-- Root --</option>
                    {folders?.map((f: any) => <option key={f.id} value={f.id} className="bg-[#1a1a1e] text-white">{f.name}</option>)}
                  </select>
                  <button onClick={() => setIsCreatingFolder(true)} className="w-9 h-9 bg-white/5 border border-white/10 rounded-lg text-primary hover:bg-white/10 transition-all flex items-center justify-center shrink-0">
                    <FolderPlus size={14} />
                  </button>
                </div>
              ) : (
                <div className="flex gap-2 animate-in fade-in">
                  <input type="text" className="flex-1 h-9 bg-[#1a1a1e] rounded-lg px-3 text-[12px] text-white border border-white/10 outline-none focus:border-primary/50 transition-all shadow-inner" placeholder="New Folder..." value={newFolderName} onChange={e => setNewFolderName(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleCreateFolder()} />
                  <button onClick={handleCreateFolder} className="h-9 px-3 bg-primary text-black font-bold text-[12px] rounded-lg hover:bg-primary transition-all uppercase">Add</button>
                  <button onClick={() => setIsCreatingFolder(false)} className="w-9 h-9 bg-white/5 text-zinc-400 rounded-lg hover:bg-white/10 transition-all flex justify-center items-center shrink-0"><X size={14} /></button>
                </div>
              )}
            </div>

            <div className="grid grid-cols-4 gap-4">
              <div className="col-span-3 space-y-1.5">
                <label className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider ml-1">Host</label>
                <input type="text" className="w-full h-9 bg-[#1a1a1e] rounded-lg px-3 text-[12px] text-white border border-white/10 outline-none focus:border-primary/50 focus:bg-[#232328] transition-all shadow-inner" placeholder="192.168.1.1" value={newNode.host} onChange={e => setNewNode({ ...newNode, host: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider ml-1">Port</label>
                <input type="number" className="w-full h-9 bg-[#1a1a1e] rounded-lg px-3 text-[12px] text-white border border-white/10 outline-none focus:border-primary/50 focus:bg-[#232328] transition-all shadow-inner" value={newNode.port} onChange={e => setNewNode({ ...newNode, port: parseInt(e.target.value) })} />
              </div>
            </div>
          </div>

          <div className="pt-5 border-t border-white/5 space-y-4">
            <div className="flex justify-between items-center">
              <label className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider">Authentication Method</label>
              <select
                className="bg-transparent text-[11px] font-black text-primary outline-none uppercase cursor-pointer tracking-wider"
                value={newNode.authType}
                onChange={(e) => setNewNode({ ...newNode, authType: e.target.value })}
              >
                <option value="vault" className="bg-[#121215] text-primary">Vault Identity</option>
                <option value="custom_pass" className="bg-[#121215] text-primary">Manual Password</option>
                <option value="custom_key" className="bg-[#121215] text-primary">Manual SSH Key</option>
              </select>
            </div>

            {newNode.authType === 'vault' && (
              <div className="space-y-4 animate-in fade-in slide-in-from-top-1">
                <div className="space-y-1.5">
                  <label className="text-[11px] font-bold text-zinc-500 uppercase tracking-wider ml-1">Identity</label>
                  <select className="w-full h-9 bg-[#1a1a1e] rounded-lg px-3 text-[12px] text-zinc-300 border border-white/10 outline-none focus:border-primary/50 transition-all shadow-inner" value={newNode.credentialId} onChange={e => setNewNode({ ...newNode, credentialId: e.target.value })}>
                    <option value="" className="bg-[#1a1a1e] text-zinc-500">-- Select Identity --</option>
                    {credentials?.map((c: any) => <option key={c.id} value={c.id} className="bg-[#1a1a1e] text-zinc-300">{c.name} ({c.username})</option>)}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-[11px] font-bold text-zinc-500 uppercase tracking-wider ml-1">SSH_Key (Optional)</label>
                  <select className="w-full h-9 bg-[#1a1a1e] rounded-lg px-3 text-[12px] text-zinc-300 border border-white/10 outline-none focus:border-primary/50 transition-all shadow-inner">
                    <option value="" className="bg-[#1a1a1e] text-zinc-500">-- None --</option>
                    {sshKeys?.map((k: any) => <option key={k.id} value={k.id} className="bg-[#1a1a1e] text-zinc-300">{k.name}</option>)}
                  </select>
                </div>
              </div>
            )}

            {newNode.authType === 'custom_pass' && (
              <div className="grid grid-cols-2 gap-4 animate-in fade-in">
                <div className="space-y-1.5">
                  <label className="text-[11px] font-bold text-zinc-500 uppercase tracking-wider ml-1">User</label>
                  <input type="text" className="w-full h-9 bg-[#1a1a1e] rounded-lg px-3 text-[12px] text-white border border-white/10 outline-none focus:border-primary/50 transition-all shadow-inner" placeholder="root" value={newNode.username} onChange={e => setNewNode({ ...newNode, username: e.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[11px] font-bold text-zinc-500 uppercase tracking-wider ml-1">Pass</label>
                  <input type="password" value={newNode.password || ""} onChange={e => setNewNode({ ...newNode, password: e.target.value })} className="w-full h-9 bg-[#1a1a1e] rounded-lg px-3 text-[12px] text-white border border-white/10 outline-none focus:border-primary/50 transition-all shadow-inner" placeholder="••••••" />
                </div>
              </div>
            )}

            {newNode.authType === 'custom_key' && (
              <div className="space-y-4 animate-in fade-in">
                <div className="space-y-1.5">
                  <label className="text-[11px] font-bold text-zinc-500 uppercase tracking-wider ml-1">User</label>
                  <input type="text" className="w-full h-9 bg-[#1a1a1e] rounded-lg px-3 text-[12px] text-white border border-white/10 outline-none focus:border-primary/50 transition-all shadow-inner" placeholder="root" />
                </div>
                <div className="p-3 border-2 border-dashed border-white/10 rounded-lg text-center hover:border-primary/40 hover:bg-primary/5 transition-colors cursor-pointer bg-[#1a1a1e]">
                  <p className="text-[11px] font-bold text-zinc-500 uppercase tracking-wider">Upload key file</p>
                </div>
              </div>
            )}
          </div>

          <div className="pt-5 border-t border-white/5 space-y-4">
            <div className="flex justify-between items-center">
              <label className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider">Traffic Relay</label>
              <select className="bg-transparent text-[11px] font-black text-zinc-400 outline-none uppercase cursor-pointer tracking-wider" value={newNode.proxyType} onChange={e => setNewNode({ ...newNode, proxyType: e.target.value })}>
                <option value="none" className="bg-[#121215] text-zinc-400">Direct</option>
                <option value="socks5" className="bg-[#121215] text-zinc-400">SOCKS5</option>
                <option value="http" className="bg-[#121215] text-zinc-400">HTTP</option>
              </select>
            </div>

            {newNode.proxyType !== 'none' && (
              <div className="grid grid-cols-4 gap-3 animate-in fade-in">
                <input className="col-span-3 h-9 bg-[#1a1a1e] rounded-lg px-3 text-[12px] text-white border border-white/10 outline-none focus:border-primary/50 transition-all shadow-inner" placeholder="Proxy Host" />
                <input className="h-9 bg-[#1a1a1e] rounded-lg px-3 text-[12px] text-white border border-white/10 outline-none focus:border-primary/50 transition-all shadow-inner" placeholder="Port" />
              </div>
            )}

            <div className="space-y-2.5">
              <div className="flex justify-between items-center">
                <span className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider">Tunnels</span>
                <button onClick={() => setNewNode({ ...newNode, tunnels: [...newNode.tunnels, { local: "1080", remote: "", type: "D" }] })} className="text-[10px] font-black text-primary hover:text-primary uppercase transition-colors tracking-wider">+ New Rule</button>
              </div>

              <div className="space-y-2">
                {newNode.tunnels?.map((t: any, idx: number) => (
                  <div key={idx} className="flex items-center gap-2 p-2 bg-[#1a1a1e] rounded-lg border border-white/5 group transition-all hover:border-primary/30">
                    <select
                      className="bg-transparent text-[11px] font-black outline-none text-primary uppercase tracking-wider cursor-pointer pl-1"
                      value={t.type}
                      onChange={e => updateTunnel(idx, 'type', e.target.value)}
                    >
                      <option value="D" className="bg-[#1a1a1e] text-primary">Dynamic</option>
                      <option value="L" className="bg-[#1a1a1e] text-primary">Local</option>
                      <option value="R" className="bg-[#1a1a1e] text-primary">Remote</option>
                    </select>

                    <div className="h-4 w-px bg-white/10 mx-1" />

                    <input
                      className="flex-1 min-w-0 bg-transparent text-[12px] font-mono outline-none text-zinc-300 placeholder:text-zinc-700"
                      placeholder={t.type === 'D' ? "Port (1080)" : "Local (8080)"}
                      value={t.local}
                      onChange={e => updateTunnel(idx, 'local', e.target.value)}
                    />

                    {t.type !== 'D' && (
                      <>
                        <ArrowLeftRight size={10} className="text-zinc-700 shrink-0 mx-1" />
                        <input
                          className="flex-1 min-w-0 bg-transparent text-[12px] font-mono outline-none text-primary placeholder:text-zinc-700"
                          placeholder="Remote (80)"
                          value={t.remote}
                          onChange={e => updateTunnel(idx, 'remote', e.target.value)}
                        />
                      </>
                    )}

                    <button onClick={() => setNewNode({ ...newNode, tunnels: newNode.tunnels.filter((_: any, i: number) => i !== idx) })} className="opacity-0 group-hover:opacity-100 w-6 h-6 flex items-center justify-center text-red-500 hover:bg-red-500/10 rounded transition-all shrink-0">
                      <X size={12} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-white/5 shrink-0">
          <button onClick={onSave} className="w-full h-10 bg-primary text-black font-black rounded-lg uppercase text-[12px] tracking-wider hover:bg-primary hover:shadow-[0_0_20px_rgba(var(--primary),0.3)] transition-all active:scale-[0.98] flex items-center justify-center gap-2">
            <Cpu size={14} /> {isEditMode ? "Edit Node" : "Deploy Node"}
          </button>
        </div>
      </div>
    </div>
  );
};

export default AddNodePanel;