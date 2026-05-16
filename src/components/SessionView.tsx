import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { TerminalSquare, Folder, Network, AlertTriangle, Check, X, ShieldAlert } from "lucide-react";
import TerminalView from "./TerminalView";
import SFTPPanel from "./SFTPPanel";

export const SessionView = ({ session, onClose, addLog }: any) => {
  const [status, setStatus] = useState<'connecting' | 'connected' | 'failed'>('connecting');
  const [logs, setLogs] = useState<{ msg: string, type: string }[]>([]);
  const [fingerprintPrompt, setFingerprintPrompt] = useState<any>(null);
  const [customPassword, setCustomPassword] = useState("");
  const [terminals, setTerminals] = useState<{id: string, title: string}[]>([{ id: `term-0`, title: '1' }]);
  const [activeTab, setActiveTab] = useState<string>('term-0');

  useEffect(() => {
    // Start connection
    invoke("initiate_connection", { sessionId: session.id, serverId: session.serverId, customPassword: customPassword || null })
      .catch(e => {
        setLogs(prev => [...prev, { msg: `Failed to initiate: ${e}`, type: 'error' }]);
        setStatus('failed');
      });

    // Setup listeners
    const unlistenLog = listen(`session-log-${session.id}`, (event: any) => {
      setLogs(prev => [...prev, event.payload]);
    });

    const unlistenPrompt = listen(`fingerprint-prompt-${session.id}`, (event: any) => {
      setFingerprintPrompt(event.payload);
    });

    const unlistenSuccess = listen(`connection-success-${session.id}`, () => {
      setStatus('connected');
    });

    const unlistenFailed = listen(`connection-failed-${session.id}`, (event: any) => {
      setLogs(prev => [...prev, { msg: `Connection failed: ${event.payload?.reason}`, type: 'error' }]);
      setStatus('failed');
      addLog(`SSH_CONNECTION_FAILED [${session.serverName}]: ${event.payload?.reason}`, "error");
    });

    return () => {
      unlistenLog.then(f => f());
      unlistenPrompt.then(f => f());
      unlistenSuccess.then(f => f());
      unlistenFailed.then(f => f());
      invoke("disconnect_session", { sessionId: session.id }).catch(console.error);
    };
  }, [session.id, session.serverId]);

  const handleFingerprintResponse = async (accepted: boolean) => {
    setFingerprintPrompt(null);
    try {
      await invoke("verify_fingerprint_response", { sessionId: session.id, accepted });
    } catch (e) {
      console.error(e);
    }
  };

  if (status === 'connecting' || status === 'failed') {
    return (
      <div className="flex-1 flex flex-col p-8 bg-[#0a0a0c] text-white overflow-hidden">
        <div className="max-w-2xl w-full mx-auto flex-1 flex flex-col">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-xl font-black uppercase tracking-[0.2em]">{session.serverName}</h2>
              <p className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest mt-1">
                {status === 'connecting' ? 'Establishing Connection...' : 'Connection Failed'}
              </p>
            </div>
            {status === 'failed' && (
              <div className="flex gap-2 items-center">
                <input 
                  type="password" 
                  placeholder="Password..." 
                  className="h-8 bg-[#1a1a1e] rounded-lg px-3 text-xs text-white border border-white/10 outline-none focus:border-primary/50"
                  value={customPassword}
                  onChange={e => setCustomPassword(e.target.value)}
                  onKeyDown={e => {
                    if(e.key === 'Enter') {
                      setStatus('connecting');
                      setLogs([]);
                      invoke("initiate_connection", { sessionId: session.id, serverId: session.serverId, customPassword: customPassword || null }).catch(console.error);
                    }
                  }}
                />
                <button onClick={() => {
                  setStatus('connecting');
                  setLogs([]);
                  invoke("initiate_connection", { sessionId: session.id, serverId: session.serverId, customPassword: customPassword || null }).catch(console.error);
                }} className="px-4 py-2 bg-primary/10 text-primary hover:bg-primary/20 rounded-lg text-xs font-bold uppercase tracking-wider transition-colors">
                  Reconnect
                </button>
                <button onClick={onClose} className="px-4 py-2 bg-red-500/10 text-red-500 hover:bg-red-500/20 rounded-lg text-xs font-bold uppercase tracking-wider transition-colors">
                  Close Session
                </button>
              </div>
            )}
          </div>

          {/* Log Window */}
          <div className="flex-1 bg-[#121214] border border-white/5 rounded-2xl p-4 font-mono text-[11px] overflow-y-auto custom-scrollbar shadow-inner relative">
            {logs.map((l, i) => (
              <div key={i} className={`mb-2 ${l.type === 'error' ? 'text-red-400' : l.type === 'success' ? 'text-primary' : 'text-zinc-400'}`}>
                <span className="text-zinc-600 opacity-50 mr-3">[{new Date().toLocaleTimeString()}]</span>
                {l.msg}
              </div>
            ))}

            {/* Fingerprint Prompt */}
            {fingerprintPrompt && (
              <div className="mt-6 p-4 border border-amber-500/30 bg-amber-500/5 rounded-xl animate-in fade-in slide-in-from-bottom-4">
                <div className="flex items-start gap-3">
                  <ShieldAlert className="text-amber-500 mt-1" size={20} />
                  <div>
                    <h3 className="text-sm font-bold text-amber-500 uppercase tracking-widest">Unknown Host Fingerprint</h3>
                    <p className="text-zinc-400 mt-2 mb-4 leading-relaxed">
                      The authenticity of host '{fingerprintPrompt.host}' can't be established.<br/>
                      {fingerprintPrompt.keyType} key fingerprint is <span className="text-white font-bold">{fingerprintPrompt.fingerprint}</span>.<br/>
                      Are you sure you want to continue connecting?
                    </p>
                    <div className="flex gap-3">
                      <button 
                        onClick={() => handleFingerprintResponse(true)}
                        className="px-6 py-2 bg-amber-500 text-black font-bold text-xs uppercase tracking-wider rounded-lg hover:bg-amber-400 transition-colors flex items-center gap-2"
                      >
                        <Check size={14} /> Accept & Save
                      </button>
                      <button 
                        onClick={() => handleFingerprintResponse(false)}
                        className="px-6 py-2 bg-white/5 text-zinc-300 font-bold text-xs uppercase tracking-wider rounded-lg hover:bg-white/10 transition-colors flex items-center gap-2"
                      >
                        <X size={14} /> Reject
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Connected State with Nested Tabs
  return (
    <div className="flex-1 flex flex-col bg-background overflow-hidden animate-in fade-in">
      {/* Nested Tab Bar */}
      <div className="h-12 border-b border-white/5 bg-[#121214]/50 flex items-center px-4 shrink-0 justify-between">
        <div 
          className="flex items-center gap-1 overflow-x-auto no-scrollbar flex-1 mr-4 mask-fade-right"
          onWheel={(e) => { e.currentTarget.scrollLeft += e.deltaY; }}
        >
        {terminals.map(t => (
          <div key={t.id} className="group relative flex items-center">
            <button 
              onClick={() => setActiveTab(t.id)}
              className={`h-8 px-4 pr-6 rounded-lg flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider transition-all ${activeTab === t.id ? 'bg-primary/10 text-primary border border-primary/20 shadow-inner' : 'text-zinc-500 hover:bg-white/5 hover:text-zinc-300 border border-transparent'}`}
            >
              <TerminalSquare size={14} /> {t.title}
            </button>
            {terminals.length > 1 && (
              <button 
                onClick={(e) => {
                  e.stopPropagation();
                  setTerminals(prev => prev.filter(x => x.id !== t.id));
                  if (activeTab === t.id) setActiveTab(terminals[0].id);
                }}
                className="absolute right-1 w-5 h-5 flex items-center justify-center opacity-0 group-hover:opacity-100 hover:text-red-500 text-zinc-500 transition-opacity"
              >
                <X size={12} />
              </button>
            )}
          </div>
        ))}

          <button 
            onClick={() => {
              const newId = `term-${Date.now()}`;
              setTerminals(prev => [...prev, { id: newId, title: `${prev.length + 1}` }]);
              setActiveTab(newId);
            }}
            className="h-8 w-8 ml-1 shrink-0 rounded-lg flex items-center justify-center text-zinc-500 hover:bg-white/10 hover:text-white transition-all border border-dashed border-white/10"
            title="New Terminal"
          >
            <div className="text-[14px] font-bold">+</div>
          </button>
        </div>

        <div className="flex items-center gap-1 shrink-0 border-l border-white/5 pl-4">
          <button 
            onClick={() => setActiveTab('sftp')}
            className={`h-8 px-4 rounded-lg flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider transition-all ${activeTab === 'sftp' ? 'bg-primary/10 text-primary border border-primary/20 shadow-inner' : 'text-zinc-500 hover:bg-white/5 hover:text-zinc-300 border border-transparent'}`}
          >
            <Folder size={14} /> SFTP
          </button>
          <button 
            onClick={() => setActiveTab('tunnels')}
            className={`h-8 px-4 rounded-lg flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider transition-all ${activeTab === 'tunnels' ? 'bg-primary/10 text-primary border border-primary/20 shadow-inner' : 'text-zinc-500 hover:bg-white/5 hover:text-zinc-300 border border-transparent'}`}
          >
            <Network size={14} /> Ports
          </button>
        </div>
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-hidden relative bg-[#09090b]">
        {terminals.map(t => (
          <div key={t.id} className={`absolute inset-0 ${activeTab === t.id ? 'opacity-100 z-10' : 'opacity-0 z-0 pointer-events-none'}`}>
            <TerminalView sessionId={session.id} terminalId={t.id} />
          </div>
        ))}
        
        {activeTab === 'sftp' && (
          <div className="absolute inset-0 z-10 bg-background">
            <SFTPPanel />
          </div>
        )}
        
        {activeTab === 'tunnels' && (
          <div className="absolute inset-0 z-10 bg-background flex flex-col items-center justify-center text-zinc-500 p-8">
            <Network size={48} className="mb-4 opacity-20" />
            <h3 className="text-sm font-bold uppercase tracking-widest text-zinc-400">Port Forwarding</h3>
            <p className="text-xs mt-2 max-w-md text-center">Manage active local and remote port forwards for this session.</p>
          </div>
        )}
      </div>
    </div>
  );

};
