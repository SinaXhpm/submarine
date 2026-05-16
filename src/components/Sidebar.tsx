import { Server, Shield, TerminalSquare, List, Settings } from "lucide-react";

export const Sidebar = ({ activeTab, setActiveTab, isMobile }: any) => {
  const items = [
    { id: 'nodes', icon: Server, label: 'Nodes' },
    { id: 'vault', icon: Shield, label: 'Vault' },
    { id: 'commands', icon: TerminalSquare, label: 'CMDS' },
    { id: 'logs', icon: List, label: 'Logs' },
  ];

  return (
    <aside className={`${isMobile ? 'w-16' : 'w-20'} h-full bg-background border-r border-white/5 flex flex-col items-center py-6 shrink-0 relative z-10 shadow-2xl brightness-95 transition-all`}>
      <nav className="flex flex-col gap-2 w-full px-2">
        {items.map((item) => (
          <button
            key={item.id}
            onClick={() => setActiveTab(item.id)}
            className={`p-2 rounded-xl transition-all duration-300 relative group flex flex-col items-center gap-1 ${
              activeTab === item.id 
                ? 'text-primary bg-primary/10 shadow-[0_0_20px_rgba(var(--primary),0.15)]' 
                : 'text-zinc-500 hover:text-zinc-200 hover:bg-white/5'
            }`}
          >
            <item.icon size={22} className={activeTab === item.id ? "drop-shadow-[0_0_8px_rgba(var(--primary),0.5)]" : ""} />
            {!isMobile && <span className="text-[10px] font-black uppercase tracking-widest">{item.label}</span>}
            {activeTab === item.id && <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-1/2 bg-primary rounded-r-full shadow-[0_0_10px_rgba(var(--primary),1)]" />}
          </button>
        ))}
      </nav>

      <button 
        onClick={() => setActiveTab('settings')}
        className={`mt-auto p-3 rounded-xl transition-all flex flex-col items-center gap-1.5 ${
          activeTab === 'settings' 
            ? 'text-primary bg-primary/10 shadow-[0_0_20px_rgba(var(--primary),0.15)]' 
            : 'text-zinc-600 hover:text-zinc-200 hover:bg-white/5'
        }`}
      >
        <Settings size={22} className={activeTab === 'settings' ? "drop-shadow-[0_0_8px_rgba(var(--primary),0.5)]" : ""} />
        {!isMobile && <span className="text-[10px] font-black uppercase tracking-widest">Settings</span>}
      </button>
    </aside>
  );
};