import { Settings, Palette, RefreshCw, Pipette } from "lucide-react";

const SettingsPanel = ({ settings, setSettings }: any) => {
  const accentColors = [
    { name: 'Emerald', value: '#10b981' },
    { name: 'Blue', value: '#3b82f6' },
    { name: 'Purple', value: '#a855f7' },
    { name: 'Rose', value: '#f43f5e' },
    { name: 'Amber', value: '#f59e0b' },
    { name: 'Sky', value: '#0ea5e9' },
  ];

  const bgColors = [
    { name: 'Onyx', value: '#050505' },
    { name: 'Charcoal', value: '#0a0a0c' },
    { name: 'Slate', value: '#0f172a' },
    { name: 'Nord', value: '#2e3440' },
    { name: 'Dark Gray', value: '#1a1a1a' },
    { name: 'Deep Space', value: '#0d0d10' },
  ];

  return (
    <div className="flex-1 p-10 overflow-y-auto custom-scrollbar animate-in">
      <header className="mb-10">
        <h2 className="text-2xl font-black text-white uppercase tracking-[0.2em] flex items-center gap-3">
          <Settings size={24} className="text-primary" /> Settings
        </h2>
        <p className="text-[10px] text-zinc-500 mt-2 font-black uppercase tracking-[0.3em]">System Configuration & Aesthetics</p>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {/* Appearance Section */}
        <section className="space-y-6">
          <div className="flex items-center gap-2 text-zinc-400 font-bold uppercase tracking-widest text-xs mb-4">
            <Palette size={14} /> UI Customization
          </div>

          <div className="bg-[#121215] border border-white/5 rounded-2xl p-6 space-y-8 shadow-xl">
            {/* Accent Color */}
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <label className="text-[11px] font-black text-zinc-500 uppercase tracking-wider">Primary Accent Color</label>
                <div className="flex items-center gap-2">
                  <input 
                    type="color" 
                    value={settings.primaryColor} 
                    onChange={(e) => setSettings({ ...settings, primaryColor: e.target.value })}
                    className="w-6 h-6 rounded-md bg-transparent cursor-pointer border-none p-0"
                  />
                  <input 
                    type="text" 
                    value={settings.primaryColor} 
                    onChange={(e) => setSettings({ ...settings, primaryColor: e.target.value })}
                    className="w-20 h-6 bg-black border border-white/10 rounded px-1.5 text-[10px] font-mono text-zinc-400 focus:border-primary/50 outline-none"
                  />
                </div>
              </div>
              <div className="grid grid-cols-6 gap-3">
                {accentColors.map(c => (
                  <button
                    key={c.value}
                    onClick={() => setSettings({ ...settings, primaryColor: c.value })}
                    className={`w-full aspect-square rounded-xl border-2 transition-all ${settings.primaryColor === c.value ? 'border-white scale-110 shadow-lg' : 'border-transparent hover:scale-105'}`}
                    style={{ backgroundColor: c.value }}
                    title={c.name}
                  />
                ))}
              </div>
            </div>

            {/* Background Theme */}
            <div className="space-y-4 pt-6 border-t border-white/5">
              <div className="flex justify-between items-center">
                <label className="text-[11px] font-black text-zinc-500 uppercase tracking-wider">Background Theme</label>
                <div className="flex items-center gap-2">
                  <input 
                    type="color" 
                    value={settings.backgroundColor} 
                    onChange={(e) => setSettings({ ...settings, backgroundColor: e.target.value })}
                    className="w-6 h-6 rounded-md bg-transparent cursor-pointer border-none p-0"
                  />
                  <input 
                    type="text" 
                    value={settings.backgroundColor} 
                    onChange={(e) => setSettings({ ...settings, backgroundColor: e.target.value })}
                    className="w-20 h-6 bg-black border border-white/10 rounded px-1.5 text-[10px] font-mono text-zinc-400 focus:border-primary/50 outline-none"
                  />
                </div>
              </div>
              <div className="grid grid-cols-6 gap-3">
                {bgColors.map(c => (
                  <button
                    key={c.value}
                    onClick={() => setSettings({ ...settings, backgroundColor: c.value })}
                    className={`w-full aspect-square rounded-xl border-2 transition-all ${settings.backgroundColor === c.value ? 'border-white scale-110 shadow-lg' : 'border-transparent hover:scale-105'}`}
                    style={{ backgroundColor: c.value }}
                    title={c.name}
                  />
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* Terminal Section */}
        <section className="space-y-6">
          <div className="flex items-center gap-2 text-zinc-400 font-bold uppercase tracking-widest text-xs mb-4">
            <Settings size={14} /> Terminal Configuration
          </div>
          
          <div className="bg-[#121215] border border-white/5 rounded-2xl p-6 space-y-4 shadow-xl">
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <label className="text-[11px] font-black text-zinc-500 uppercase tracking-wider">Font Size (px)</label>
                <input 
                  type="number" 
                  value={settings.terminalFontSize || 14} 
                  onChange={(e) => setSettings({ ...settings, terminalFontSize: parseInt(e.target.value) || 14 })}
                  className="w-16 h-8 bg-black border border-white/10 rounded-lg px-2 text-[12px] font-bold text-white focus:border-primary/50 outline-none text-center"
                />
              </div>
              <input 
                type="range" 
                min="10" 
                max="24" 
                value={settings.terminalFontSize || 14} 
                onChange={(e) => setSettings({ ...settings, terminalFontSize: parseInt(e.target.value) || 14 })}
                className="w-full accent-primary"
              />
            </div>
          </div>
        </section>

        {/* Maintenance Section */}
        <section className="space-y-6">
          <div className="flex items-center gap-2 text-zinc-400 font-bold uppercase tracking-widest text-xs mb-4">
            <RefreshCw size={14} /> Maintenance
          </div>
          
          <div className="bg-[#121215] border border-white/5 rounded-2xl p-6 space-y-4 shadow-xl">
            <p className="text-sm text-zinc-400 leading-relaxed">
              These preferences are persisted in your local environment. Resetting will revert all UI aesthetics to factory defaults.
            </p>
            <button 
              onClick={() => {
                if(window.confirm('Reset all UI customizations?')) {
                  setSettings({ primaryColor: '#10b981', backgroundColor: '#0a0a0c', terminalFontSize: 14 });
                }
              }}
              className="px-4 h-9 bg-zinc-900 border border-white/5 text-zinc-300 rounded-xl text-xs font-bold uppercase hover:bg-white/5 transition-all w-full"
            >
              Reset to Defaults
            </button>
          </div>
        </section>
      </div>
    </div>
  );
};

export default SettingsPanel;
