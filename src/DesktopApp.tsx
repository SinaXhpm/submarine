import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow, LogicalSize } from "@tauri-apps/api/window";
import {
  Plus, X, RefreshCw, Terminal, Key, Trash2,
  ArrowLeftRight, Shield, User, Cpu, TerminalSquare, List, Edit2
} from "lucide-react";

import AuthPage from "./components/AuthPage";
import { Sidebar } from "./components/Sidebar";
import { NodeGrid } from "./components/NodeGrid";
import AddNodePanel from "./components/AddNodePanel";
import SFTPPanel from "./components/SFTPPanel";
import TerminalView from "./components/TerminalView";
import SettingsPanel from "./components/SettingsPanel";
import { SessionView } from "./components/SessionView";

const appWindow = getCurrentWindow();

type Session = { id: string; serverId: number; serverName: string; };

const hexToRgb = (hex: string) => {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `${r} ${g} ${b}`;
};

function DesktopApp() {
  const [loading, setLoading] = useState(true);
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [dbExists, setDbExists] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [activeView, setActiveView] = useState<string>("nodes");
  const [sessions, setSessions] = useState<Session[]>([]);
  const [isPanelOpen, setIsPanelOpen] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [servers, setServers] = useState<any[]>([]);
  const [credentials, setCredentials] = useState<any[]>([]);
  const [sshKeys, setSshKeys] = useState<any[]>([]);
  const [folders, setFolders] = useState<any[]>([]);
  const [commands, setCommands] = useState<any[]>([]);
  const [logs, setLogs] = useState<{ msg: string, type: string, time: string }[]>([]);
  const [isCommandPanelOpen, setIsCommandPanelOpen] = useState(false);
  const [editCommandData, setEditCommandData] = useState<{ id: number | null, title: string, content: string }>({ id: null, title: "", content: "" });

  const [isCredPanelOpen, setIsCredPanelOpen] = useState(false);
  const [editCredData, setEditCredData] = useState<any>({ id: null, name: "", auth_type: "password", username: "", password: "", key_id: null });
  
  const [isKeyPanelOpen, setIsKeyPanelOpen] = useState(false);
  const [editKeyData, setEditKeyData] = useState<any>({ id: null, name: "", public_key: "", private_key: "", passphrase: "" });
  const [formError, setFormError] = useState("");

  const defaultNode = {
    id: null as number | null,
    name: "", host: "", port: 22, username: "", password: "",
    authType: "vault", credentialId: "", folderId: "",
    proxyType: "none", proxyHost: "", proxyPort: 1080,
    tunnels: [] as { local: string, remote: string, type: string }[]
  };

  const [isMobile, setIsMobile] = useState(false);

  const [newNode, setNewNode] = useState(defaultNode);
  const [appSettings, setAppSettings] = useState({
    primaryColor: localStorage.getItem('omni-primary-color') || '#10b981',
    backgroundColor: localStorage.getItem('omni-bg-color') || '#0a0a0c',
    terminalFontSize: parseInt(localStorage.getItem('omni-terminal-font-size') || '14')
  });

  useEffect(() => {
    const rgb = hexToRgb(appSettings.primaryColor);
    document.documentElement.style.setProperty('--primary', rgb);
    document.documentElement.style.setProperty('--primary-hex', appSettings.primaryColor);
    document.documentElement.style.setProperty('--background', appSettings.backgroundColor);
    localStorage.setItem('omni-primary-color', appSettings.primaryColor);
    localStorage.setItem('omni-bg-color', appSettings.backgroundColor);
    localStorage.setItem('omni-terminal-font-size', appSettings.terminalFontSize.toString());
  }, [appSettings]);

  useEffect(() => {
    const init = async () => {
      try {
        // Restore window size
        const savedW = localStorage.getItem('omni-window-width');
        const savedH = localStorage.getItem('omni-window-height');
        if (savedW && savedH) {
          try {
            await appWindow.setSize(new LogicalSize(parseInt(savedW), parseInt(savedH)));
          } catch(e) { console.error("Window resize failed", e); }
        }

        // Listen for resize (only for persistence, not for mobile detection)
        await appWindow.onResized(async () => {
          const size = await appWindow.innerSize();
          const logical = size.toLogical(await appWindow.scaleFactor());
          localStorage.setItem('omni-window-width', logical.width.toString());
          localStorage.setItem('omni-window-height', logical.height.toString());
        });

        // Initial mobile check (using UserAgent as a more principled parameter)
        const isMobileDevice = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
        setIsMobile(isMobileDevice);

        const exists = await invoke("check_db_exists");
        setDbExists(exists as boolean);
      } catch (e) { 
        console.error("Initialization error", e);
        addLog(`INIT_EXCEPTION: ${e}`, "error"); 
      } finally { 
        setLoading(false); 
      }
    };
    init();
  }, []);

  const addLog = (msg: string, type = "info") => {
    setLogs(prev => [...prev.slice(-99), { msg, type, time: new Date().toLocaleTimeString() }]);
  };

  const refreshData = async () => {
    try {
      const [s, c, k, f, cmd] = await Promise.all([
        invoke("get_servers"),
        invoke("get_credentials"),
        invoke("get_ssh_keys"),
        invoke("get_folders"),
        invoke("get_commands")
      ]);
      setServers(s as any[]);
      setCredentials(c as any[]);
      setSshKeys(k as any[]);
      setFolders(f as any[]);
      setCommands(cmd as any[]);
    } catch (e) { addLog(`SYNC_EXCEPTION: ${e}`, "error"); }
  };

  const removeServer = async (id: number) => {
    try {
      await invoke("delete_server", { id });
      refreshData();
      addLog("Node removed.", "info");
    } catch (e) { addLog(`DELETE_EXCEPTION: ${e}`, "error"); }
  };

  const removeFolder = async (id: number) => {
    try {
      await invoke("delete_folder", { id });
      refreshData();
      addLog("Group removed.", "info");
    } catch (e) { addLog(`DELETE_EXCEPTION: ${e}`, "error"); }
  };

  const handleAuth = async () => {
    if (!dbExists && password !== confirmPassword) {
      setError("KEYS_DO_NOT_MATCH");
      return;
    }
    try {
      await invoke("setup_master_db", { password });
      setIsUnlocked(true);
      refreshData();
      addLog("Vault authorized.", "success");
    } catch (err) {
      setError("ACCESS_DENIED");
      addLog(`AUTH_EXCEPTION: ${err}`, "error");
    }
  };

  const openServer = (server: any) => {
    const sessionId = `session-${server.id}`;
    const existing = sessions.find(s => s.id === sessionId);
    if (!existing) {
      setSessions([...sessions, {
        id: sessionId,
        serverId: server.id,
        serverName: server.name
      }]);
    }

    setActiveView(sessionId);
  };

  const handleEditNode = (server: any) => {
    setNewNode({
      id: server.id,
      name: server.name || "",
      host: server.host || "",
      port: server.port || 22,
      username: server.username || "",
      password: server.password || "",
      authType: server.credential_id ? "vault" : "custom_pass",
      credentialId: server.credential_id?.toString() || "",
      folderId: server.folder_id?.toString() || "",
      proxyType: server.proxy_type || "none",
      proxyHost: server.proxy_host || "",
      proxyPort: server.proxy_port || 1080,
      tunnels: server.tunnels ? JSON.parse(server.tunnels) : []
    });
    setIsPanelOpen(true);
  };

  const TitleBar = () => (
    <div data-tauri-drag-region className="h-10 bg-[#0d0d10] border-b border-white/5 flex items-center justify-between px-3 select-none shrink-0 z-50 drag absolute top-0 left-0 right-0">
      <div className="flex items-center gap-2 pr-4 pl-[75px] md:pl-2" data-tauri-drag-region>
        <div className="w-6 h-6 bg-primary/10 text-primary rounded-lg flex items-center justify-center font-black border border-primary/20 text-[12px]">Ω</div>
        <span className="text-[11px] font-black text-white uppercase tracking-[0.2em]">Omni</span>
      </div>
      
      <div className="flex-1 flex gap-1 overflow-x-auto no-scrollbar h-full items-end pb-1" data-tauri-drag-region>
        {sessions.map(s => (
          <div
            key={s.id}
            onClick={() => setActiveView(s.id)}
            className={`group no-drag flex items-center h-7 px-4 rounded-full cursor-pointer transition-all min-w-[100px] max-w-[180px] mr-1 ${activeView === s.id ? 'bg-primary text-black shadow-lg shadow-primary/20' : 'bg-white/5 text-zinc-500 hover:bg-white/10'}`}
          >
            <span className="text-[10px] font-bold truncate flex-1 uppercase tracking-tight">{s.serverName}</span>
            <X size={10} className="ml-2 opacity-0 group-hover:opacity-100 hover:text-red-500" onClick={(e) => { e.stopPropagation(); setSessions(sessions.filter(sess => sess.id !== s.id)); if (activeView === s.id) setActiveView("nodes"); }} />
          </div>
        ))}
      </div>
      <div className="flex items-center h-full gap-1 no-drag">
        <button onClick={() => appWindow.minimize()} className="w-10 h-full flex items-center justify-center hover:bg-white/5 transition-colors"><div className="w-3.5 h-[1.5px] bg-zinc-600" /></button>
        <button onClick={() => appWindow.close()} className="w-10 h-full flex items-center justify-center hover:bg-red-500 group transition-all"><X size={14} className="text-zinc-600 group-hover:text-white" /></button>
      </div>
    </div>
  );

  if (loading) return <div className="h-screen bg-black flex items-center justify-center font-mono text-xs text-primary animate-pulse">INITIALIZING OMNI</div>;

  return (
    <div className="h-screen w-full bg-background flex flex-col overflow-hidden text-zinc-200 select-none">
      <TitleBar />
      {!isUnlocked ? (
        <AuthPage
          dbExists={dbExists} password={password} setPassword={setPassword}
          confirmPassword={confirmPassword} setConfirmPassword={setConfirmPassword}
          error={error} handleAuth={handleAuth} handleReset={() => invoke("reset_db").then(() => window.location.reload())}
          showResetConfirm={showResetConfirm} setShowResetConfirm={setShowResetConfirm}
        />
      ) : (
        <div className="flex-1 flex overflow-hidden pt-10">
          <Sidebar activeTab={activeView.startsWith('session-') ? 'nodes' : activeView} setActiveTab={setActiveView} isMobile={isMobile} />

          <main className="flex-1 flex flex-col min-w-0 bg-transparent">
            {activeView === "nodes" && (
              <NodeGrid
                servers={servers}
                folders={folders}
                onOpenServer={openServer}
                onEditServer={handleEditNode}
                onAddClick={() => { setNewNode(defaultNode); setIsPanelOpen(true); }}
                onRemoveServer={removeServer}
                onRemoveFolder={removeFolder}
                isMobile={isMobile}
              />
            )}

            {activeView === "settings" && (
              <SettingsPanel 
                settings={appSettings} 
                setSettings={setAppSettings} 
                isMobile={isMobile}
              />
            )}

            {activeView === "vault" && (
              <div className="flex-1 flex flex-col p-8 space-y-8 animate-in overflow-y-auto custom-scrollbar">
                <header className="flex justify-between items-center border-b border-zinc-700 pb-6 shrink-0">
                  <div>
                    <h2 className="text-[22px] font-bold text-white uppercase tracking-tight">Identity Vault</h2>
                    <p className="text-[14px] text-zinc-400 font-medium">Security Credentials & Keys</p>
                  </div>
                  <div className="flex gap-2">
                    <button 
                      onClick={() => { setEditCredData({ id: null, name: "", auth_type: "password", username: "", password: "", key_id: null }); setIsCredPanelOpen(true); }}
                      className="h-9 px-4 bg-zinc-900 text-zinc-200 text-[13px] font-bold rounded-xl border border-white/5 hover:bg-zinc-800 transition-all flex items-center gap-2"
                    >
                      <Plus size={14} /> Add Password
                    </button>
                    <button 
                      onClick={() => { setEditKeyData({ id: null, name: "", public_key: "", private_key: "", passphrase: "" }); setIsKeyPanelOpen(true); }}
                      className="h-9 px-4 bg-zinc-900 text-zinc-200 text-[13px] font-bold rounded-xl border border-white/5 hover:bg-zinc-800 transition-all flex items-center gap-2"
                    >
                      <Plus size={14} /> Add Key
                    </button>
                    <button 
                      onClick={() => {
                        const name = window.prompt("Enter a name for the new SSH key:");
                        if (name) invoke("generate_ssh_key", { name }).then(() => refreshData());
                      }} 
                      className="h-9 px-4 bg-primary text-black text-[13px] font-bold rounded-xl shadow-lg shadow-primary/20 flex items-center gap-2"
                    >
                      <Key size={14} /> Generate Key
                    </button>
                  </div>
                </header>

                <div className="space-y-10 pb-10">
                  <section>
                    <h3 className="text-[12px] font-black text-zinc-500 uppercase tracking-[0.2em] mb-4 flex items-center gap-2">
                      <Shield size={14} /> Saved Credentials
                    </h3>
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-2">
                      {credentials.length === 0 ? (
                        <div className="col-span-full py-10 text-center text-zinc-600 text-[14px] italic border border-dashed border-white/5 rounded-2xl">No passwords saved.</div>
                      ) : (
                        credentials.map(c => (
                          <div key={c.id} className="bg-[#16161a] border border-white/5 rounded-xl p-3 group relative hover:border-primary/30 transition-all">
                            <div className="flex justify-between items-start mb-1">
                              <h4 className="text-[14px] font-bold text-zinc-100 truncate pr-8">{c.name}</h4>
                              <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity absolute right-3 top-3">
                                <button onClick={() => { setEditCredData(c); setIsCredPanelOpen(true); }} className="text-zinc-500 hover:text-white"><Edit2 size={14} /></button>
                                <button onClick={() => invoke("delete_credential", { id: c.id }).then(() => refreshData())} className="text-zinc-500 hover:text-red-500"><Trash2 size={14} /></button>
                              </div>
                            </div>
                            <div className="flex flex-col gap-0.5">
                              <div className="flex items-center gap-2 text-[11px] text-zinc-500 uppercase font-bold">
                                <User size={10} /> {c.username}
                              </div>
                              <div className="flex items-center gap-2 text-[11px] text-zinc-500 uppercase font-bold">
                                <Key size={10} /> {c.password ? "••••••••" : "Key Linked"}
                              </div>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </section>

                  <section>
                    <h3 className="text-[12px] font-black text-zinc-500 uppercase tracking-[0.2em] mb-4 flex items-center gap-2">
                      <Key size={14} /> SSH Keys
                    </h3>
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-2">
                      {sshKeys.length === 0 ? (
                        <div className="col-span-full py-10 text-center text-zinc-600 text-[14px] italic border border-dashed border-white/5 rounded-2xl">No SSH keys saved.</div>
                      ) : (
                        sshKeys.map(k => (
                          <div key={k.id} className="bg-[#16161a] border border-white/5 rounded-xl p-3 group relative hover:border-primary/30 transition-all">
                            <div className="flex justify-between items-start mb-1">
                              <h4 className="text-[14px] font-bold text-zinc-100 truncate pr-8">{k.name}</h4>
                              <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity absolute right-3 top-3">
                                <button onClick={() => { setEditKeyData(k); setIsKeyPanelOpen(true); }} className="text-zinc-500 hover:text-white"><Edit2 size={14} /></button>
                                <button onClick={() => invoke("delete_ssh_key", { id: k.id }).then(() => refreshData())} className="text-zinc-500 hover:text-red-500"><Trash2 size={14} /></button>
                              </div>
                            </div>
                            <div className="flex flex-col gap-0.5">
                              <div className="flex items-center gap-2 text-[10px] text-zinc-500 font-mono truncate">
                                {k.public_key.substring(0, 24)}...
                              </div>
                              <div className="text-[10px] text-primary/40 font-black uppercase tracking-widest">
                                RSA SECURED
                              </div>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </section>
                </div>
              </div>
            )}

            {sessions.map(sess => (
              <div key={sess.id} className={`flex-1 flex flex-col overflow-hidden ${activeView === sess.id ? '' : 'hidden'}`}>
                <SessionView 
                  session={sess} 
                  onClose={() => {
                    setSessions(sessions.filter(s => s.id !== sess.id));
                    if (activeView === sess.id) setActiveView("nodes");
                  }}
                  addLog={addLog}
                />
              </div>
            ))}

            {activeView === "commands" && (
              <div className="flex-1 flex flex-col p-8 space-y-6 animate-in overflow-y-auto custom-scrollbar">
                <header className="flex justify-between items-center border-b border-zinc-700 pb-6 shrink-0">
                  <div>
                    <h2 className="text-[22px] font-bold text-white uppercase tracking-tight">Saved Commands</h2>
                    <p className="text-[14px] text-zinc-400 font-medium">Manage reusable terminal scripts</p>
                  </div>
                  <button 
                    onClick={() => { setEditCommandData({ id: null, title: "", content: "" }); setIsCommandPanelOpen(true); }} 
                    className="h-9 px-4 bg-primary text-black text-[13px] font-bold rounded-xl shadow-lg shadow-primary/20 flex items-center gap-2 transition-all hover:bg-primary"
                  >
                    <Plus size={14} /> Add Command
                  </button>
                </header>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 pb-10">
                  {commands.length === 0 ? (
                    <div className="col-span-full py-12 text-center text-zinc-500 text-[14px] italic border border-dashed border-white/10 rounded-2xl">
                      No saved commands yet.
                    </div>
                  ) : (
                    commands.map(cmd => (
                      <div key={cmd.id} className="bg-[#16161a] border border-white/5 rounded-2xl p-4 flex flex-col group relative overflow-hidden shadow-inner h-[150px]">
                        <div className="flex justify-between items-start mb-2">
                          <h3 className="text-[16px] font-bold text-primary tracking-tight">{cmd.title}</h3>
                          <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button onClick={() => { setEditCommandData(cmd); setIsCommandPanelOpen(true); }} className="text-zinc-500 hover:text-white transition-colors"><Edit2 size={14} /></button>
                            <button onClick={() => invoke("delete_command", { id: cmd.id }).then(() => refreshData())} className="text-zinc-500 hover:text-red-500 transition-colors"><Trash2 size={14} /></button>
                          </div>
                        </div>
                        <div className="bg-black/30 rounded-xl p-3 border border-white/5 flex-1 relative group-hover:border-primary/20 transition-colors overflow-hidden">
                          <pre className="text-[12px] text-zinc-400 font-mono whitespace-pre-wrap leading-relaxed line-clamp-3">{cmd.content}</pre>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}

            {activeView === "logs" && (
              <div className="flex-1 flex flex-col p-8 space-y-6 animate-in overflow-hidden">
                <header className="flex justify-between items-center border-b border-zinc-700 pb-6 shrink-0">
                  <div>
                    <h2 className="text-[22px] font-bold text-white uppercase tracking-tight">System Logs</h2>
                    <p className="text-[14px] text-zinc-400 font-medium">Application event history</p>
                  </div>
                  <button onClick={() => setLogs([])} className="h-9 px-4 bg-zinc-900 text-zinc-200 text-[13px] font-bold rounded-xl border border-white/5 hover:bg-red-500/20 hover:text-red-400 hover:border-primary/50 transition-all flex items-center gap-2">
                    <Trash2 size={14} /> Clear Logs
                  </button>
                </header>

                <div className="flex-1 overflow-y-auto custom-scrollbar bg-black/50 rounded-2xl border border-white/5 p-4 space-y-1 shadow-inner">
                  {logs.length === 0 ? (
                    <div className="h-full flex items-center justify-center text-zinc-600 text-[14px] font-mono italic">
                      System logs are empty.
                    </div>
                  ) : (
                    [...logs].reverse().map((log, i) => (
                      <div key={i} className="flex items-start gap-3 text-[12px] font-mono group hover:bg-white/5 p-1 rounded-md transition-colors">
                        <span className="text-zinc-600 shrink-0 w-20">{log.time}</span>
                        <span className={`shrink-0 w-24 font-bold uppercase ${log.type === 'error' ? 'text-red-500' : log.type === 'success' ? 'text-primary' : log.type === 'warn' ? 'text-amber-500' : 'text-blue-500'}`}>
                          [{log.type}]
                        </span>
                        <span className="text-zinc-300 break-all">{log.msg}</span>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}

          </main>
        </div>
      )}

      <AddNodePanel
        isOpen={isPanelOpen} onClose={() => { setIsPanelOpen(false); setFormError(""); }}
        newNode={newNode} setNewNode={setNewNode}
        isEditMode={!!newNode.id}
        onSave={async () => {
          if (!newNode.name || !newNode.host) {
            setFormError("Name and Host are required.");
            addLog("Name and Host are required.", "error");
            return;
          }
          try {
            const payload = {
              ...newNode,
              credentialId: newNode.credentialId ? parseInt(newNode.credentialId) : null,
              folderId: newNode.folderId ? parseInt(newNode.folderId) : null,
              password: newNode.authType === "custom_pass" ? (newNode.password || null) : null
            };
            const action = newNode.id 
              ? invoke("edit_server", { id: newNode.id, ...payload }) 
              : invoke("add_server", payload);
              
            await action;
            setIsPanelOpen(false);
            setFormError("");
            refreshData();
            addLog(`Node ${newNode.id ? 'updated' : 'added'} successfully.`, "success");
          } catch (e) {
            setFormError(`Failed to save: ${e}`);
            addLog(`SAVE_ERROR: ${e}`, "error");
          }
        }}
        formError={formError}
        credentials={credentials} sshKeys={sshKeys} folders={folders} refreshData={refreshData}
        isMobile={isMobile}
      />

      <div className={`fixed inset-0 z-50 transition-all duration-500 flex justify-end ${isCommandPanelOpen ? 'bg-black/80 backdrop-blur-sm' : 'opacity-0 pointer-events-none'}`} onClick={() => setIsCommandPanelOpen(false)}>
        <div className={`w-full max-w-[400px] bg-[#09090b] border-l border-white/5 shadow-2xl transition-all duration-500 h-full flex flex-col ${isCommandPanelOpen ? 'translate-x-0' : 'translate-x-full'}`} onClick={(e) => e.stopPropagation()}>
          <div className="flex justify-between items-center p-6 border-b border-white/5 shrink-0">
            <h2 className="text-[16px] font-black text-white uppercase tracking-widest flex items-center gap-2">
              <TerminalSquare size={18} className="text-primary" />
              {editCommandData.id ? "Edit Command" : "New Command"}
            </h2>
            <button onClick={() => { setIsCommandPanelOpen(false); setFormError(""); }} className="w-7 h-7 flex items-center justify-center text-zinc-500 hover:text-white bg-black border border-white/5 hover:bg-white/10 rounded-full transition-all">
              <X size={16} />
            </button>
          </div>
          <div className="p-6 flex-1 overflow-y-auto space-y-6">
            {formError && <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-red-500 text-[12px] font-bold">{formError}</div>}
            <div className="space-y-1.5">
              <label className="text-[12px] font-bold text-zinc-400 uppercase tracking-wider ml-1">Title</label>
              <input type="text" className="w-full h-10 bg-black rounded-lg px-3 text-[13px] text-white border border-white/10 outline-none focus:border-primary/50 focus:bg-zinc-900/50 transition-all shadow-inner" placeholder="e.g. Update System" value={editCommandData.title} onChange={e => setEditCommandData({ ...editCommandData, title: e.target.value })} />
            </div>
            <div className="space-y-1.5 flex-1 flex flex-col h-64">
              <label className="text-[12px] font-bold text-zinc-400 uppercase tracking-wider ml-1">Script Content</label>
              <textarea className="w-full flex-1 bg-black rounded-lg p-3 text-[13px] text-zinc-300 font-mono border border-white/10 outline-none focus:border-primary/50 focus:bg-zinc-900/50 transition-all shadow-inner custom-scrollbar resize-none" placeholder="sudo apt update && sudo apt upgrade -y" value={editCommandData.content} onChange={e => setEditCommandData({ ...editCommandData, content: e.target.value })} />
            </div>
          </div>
          <div className="p-6 border-t border-white/5 shrink-0">
            <button 
              onClick={async () => {
                if (!editCommandData.title || !editCommandData.content) {
                  addLog("Title and Content are required.", "error");
                  return;
                }
                try {
                  const action = editCommandData.id 
                    ? invoke("edit_command", { id: editCommandData.id, title: editCommandData.title, content: editCommandData.content })
                    : invoke("add_command", { title: editCommandData.title, content: editCommandData.content });
                  await action;
                  setIsCommandPanelOpen(false);
                  refreshData();
                  addLog("Command saved.", "success");
                } catch (e) {
                  setFormError(`Failed to save command: ${e}`);
                  addLog(`COMMAND_SAVE_ERROR: ${e}`, "error");
                }
              }} 
              className="w-full h-10 bg-primary text-black font-black rounded-lg uppercase text-[13px] tracking-wider hover:bg-primary transition-all active:scale-[0.98] shadow-[0_0_15px_rgba(var(--primary),0.2)] flex items-center justify-center gap-2"
            >
              Save Command
            </button>
          </div>
        </div>
      </div>

      <div className={`fixed inset-0 z-50 transition-all duration-500 flex justify-end ${isCredPanelOpen ? 'bg-black/80 backdrop-blur-sm' : 'opacity-0 pointer-events-none'}`} onClick={() => setIsCredPanelOpen(false)}>
        <div className={`w-full max-w-[400px] bg-[#09090b] border-l border-white/5 shadow-2xl transition-all duration-500 h-full flex flex-col ${isCredPanelOpen ? 'translate-x-0' : 'translate-x-full'}`} onClick={(e) => e.stopPropagation()}>
          <div className="flex justify-between items-center p-6 border-b border-white/5 shrink-0">
            <h2 className="text-[16px] font-black text-white uppercase tracking-widest flex items-center gap-2">
              <Shield size={18} className="text-primary" />
              {editCredData.id ? "Edit Credential" : "New Credential"}
            </h2>
            <button onClick={() => { setIsCredPanelOpen(false); setFormError(""); }} className="w-7 h-7 flex items-center justify-center text-zinc-500 hover:text-white bg-black border border-white/5 hover:bg-white/10 rounded-full transition-all">
              <X size={16} />
            </button>
          </div>
          <div className="p-6 flex-1 overflow-y-auto space-y-6">
            {formError && <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-red-500 text-[12px] font-bold">{formError}</div>}
            <div className="space-y-1.5">
              <label className="text-[12px] font-bold text-zinc-400 uppercase tracking-wider ml-1">Name</label>
              <input type="text" className="w-full h-10 bg-black rounded-lg px-3 text-[13px] text-white border border-white/10 outline-none focus:border-primary/50 focus:bg-zinc-900/50 transition-all shadow-inner" placeholder="e.g. My Server" value={editCredData.name} onChange={e => setEditCredData({ ...editCredData, name: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <label className="text-[12px] font-bold text-zinc-400 uppercase tracking-wider ml-1">Username</label>
              <input type="text" className="w-full h-10 bg-black rounded-lg px-3 text-[13px] text-white border border-white/10 outline-none focus:border-primary/50 focus:bg-zinc-900/50 transition-all shadow-inner" placeholder="root" value={editCredData.username} onChange={e => setEditCredData({ ...editCredData, username: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <label className="text-[12px] font-bold text-zinc-400 uppercase tracking-wider ml-1">Password</label>
              <input type="password" className="w-full h-10 bg-black rounded-lg px-3 text-[13px] text-white border border-white/10 outline-none focus:border-primary/50 focus:bg-zinc-900/50 transition-all shadow-inner" value={editCredData.password || ""} onChange={e => setEditCredData({ ...editCredData, password: e.target.value })} />
            </div>
          </div>
          <div className="p-6 border-t border-white/5 shrink-0">
            <button 
              onClick={async () => {
                if (!editCredData.name || !editCredData.username) {
                  addLog("Name and Username are required.", "error");
                  return;
                }
                try {
                  const payload = {
                    id: editCredData.id,
                    name: editCredData.name,
                    authType: editCredData.auth_type,
                    username: editCredData.username,
                    password: editCredData.password,
                    keyId: editCredData.key_id
                  };
                  const action = editCredData.id 
                    ? invoke("edit_credential", payload)
                    : invoke("add_credential", { ...payload });
                  await action;
                  setIsCredPanelOpen(false);
                  refreshData();
                  addLog("Credential saved.", "success");
                } catch (e) {
                  setFormError(`Failed to save credential: ${e}`);
                  addLog(`CRED_SAVE_ERROR: ${e}`, "error");
                }
              }} 
              className="w-full h-10 bg-primary text-black font-black rounded-lg uppercase text-[13px] tracking-wider hover:bg-primary transition-all active:scale-[0.98] flex items-center justify-center gap-2"
            >
              Save Credential
            </button>
          </div>
        </div>
      </div>

      <div className={`fixed inset-0 z-50 transition-all duration-500 flex justify-end ${isKeyPanelOpen ? 'bg-black/80 backdrop-blur-sm' : 'opacity-0 pointer-events-none'}`} onClick={() => setIsKeyPanelOpen(false)}>
        <div className={`w-full max-w-[450px] bg-[#09090b] border-l border-white/5 shadow-2xl transition-all duration-500 h-full flex flex-col ${isKeyPanelOpen ? 'translate-x-0' : 'translate-x-full'}`} onClick={(e) => e.stopPropagation()}>
          <div className="flex justify-between items-center p-6 border-b border-white/5 shrink-0">
            <h2 className="text-[16px] font-black text-white uppercase tracking-widest flex items-center gap-2">
              <Key size={18} className="text-primary" />
              {editKeyData.id ? "Edit SSH Key" : "New SSH Key"}
            </h2>
            <button onClick={() => { setIsKeyPanelOpen(false); setFormError(""); }} className="w-7 h-7 flex items-center justify-center text-zinc-500 hover:text-white bg-black border border-white/5 hover:bg-white/10 rounded-full transition-all">
              <X size={16} />
            </button>
          </div>
          <div className="p-6 flex-1 overflow-y-auto space-y-6">
            {formError && <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-red-500 text-[12px] font-bold">{formError}</div>}
            <div className="space-y-1.5">
              <label className="text-[12px] font-bold text-zinc-400 uppercase tracking-wider ml-1">Name</label>
              <input type="text" className="w-full h-10 bg-black rounded-lg px-3 text-[13px] text-white border border-white/10 outline-none focus:border-primary-500/50 focus:bg-zinc-900/50 transition-all shadow-inner" placeholder="e.g. My SSH Key" value={editKeyData.name} onChange={e => setEditKeyData({ ...editKeyData, name: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <label className="text-[12px] font-bold text-zinc-400 uppercase tracking-wider ml-1">Public Key</label>
              <textarea className="w-full h-24 bg-black rounded-lg p-3 text-[13px] text-zinc-400 font-mono border border-white/10 outline-none focus:border-primary-500/50 focus:bg-zinc-900/50 transition-all shadow-inner custom-scrollbar resize-none" placeholder="ssh-ed25519 ..." value={editKeyData.public_key} onChange={e => setEditKeyData({ ...editKeyData, public_key: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <label className="text-[12px] font-bold text-zinc-400 uppercase tracking-wider ml-1">Private Key (Masked)</label>
              <textarea className="w-full h-32 bg-black rounded-lg p-3 text-[13px] text-zinc-400 font-mono border border-white/10 outline-none focus:border-primary-500/50 focus:bg-zinc-900/50 transition-all shadow-inner custom-scrollbar resize-none" placeholder="-----BEGIN OPENSSH PRIVATE KEY-----" value={editKeyData.private_key} onChange={e => setEditKeyData({ ...editKeyData, private_key: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <label className="text-[12px] font-bold text-zinc-400 uppercase tracking-wider ml-1">Passphrase</label>
              <input type="password" className="w-full h-10 bg-black rounded-lg px-3 text-[13px] text-white border border-white/10 outline-none focus:border-primary-500/50 focus:bg-zinc-900/50 transition-all shadow-inner" value={editKeyData.passphrase || ""} onChange={e => setEditKeyData({ ...editKeyData, passphrase: e.target.value })} />
            </div>
          </div>
          <div className="p-6 border-t border-white/5 shrink-0">
            <button 
              onClick={async () => {
                if (!editKeyData.name || !editKeyData.private_key) {
                  addLog("Name and Private Key are required.", "error");
                  return;
                }
                try {
                  const payload = {
                    id: editKeyData.id,
                    name: editKeyData.name,
                    publicKey: editKeyData.public_key,
                    privateKey: editKeyData.private_key,
                    passphrase: editKeyData.passphrase
                  };
                  const action = editKeyData.id 
                    ? invoke("edit_ssh_key", payload)
                    : invoke("add_ssh_key", { ...payload });
                  await action;
                  setIsKeyPanelOpen(false);
                  refreshData();
                  addLog("SSH Key saved.", "success");
                } catch (e) {
                  setFormError(`Failed to save SSH Key: ${e}`);
                  addLog(`KEY_SAVE_ERROR: ${e}`, "error");
                }
              }} 
              className="w-full h-10 bg-primary text-black font-black rounded-lg uppercase text-[13px] tracking-wider hover:bg-primary transition-all active:scale-[0.98] flex items-center justify-center gap-2"
            >
              Save SSH Key
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default DesktopApp;