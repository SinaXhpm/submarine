import { ShieldCheck, Lock, Trash2 } from "lucide-react";

const AuthPage = ({ 
  dbExists, password, setPassword, confirmPassword, setConfirmPassword, 
  error, handleAuth, handleReset, showResetConfirm, setShowResetConfirm 
}: any) => {
  return (
    <div className="flex-1 flex items-center justify-center p-6 bg-background">
      <div className="w-full max-w-[380px] p-10 bg-background/50 backdrop-blur-md rounded-[2.5rem] border border-white/10 shadow-2xl relative">
        
        {/* هدر */}
        <div className="flex items-center gap-4 mb-10">
          <div className="w-12 h-12 bg-primary/10 rounded-2xl flex items-center justify-center border border-primary/20 shadow-[0_0_15px_rgba(var(--primary),0.1)]">
            <ShieldCheck className="text-primary" size={28} />
          </div>
          <div>
            <h1 className="text-xl font-black text-white uppercase tracking-[0.2em] leading-none">OMNI VAULT</h1>
            <p className="text-[10px] text-zinc-500 font-black uppercase tracking-[0.3em] mt-2">Security Protocol Active</p>
          </div>
        </div>

        <div className="space-y-4">
          <input 
            type="password" 
            placeholder="Master Key" 
            className="w-full h-12 bg-zinc-900/50 rounded-2xl px-5 text-sm text-primary border border-white/5 outline-none focus:border-primary/50 focus:bg-zinc-900 transition-all shadow-inner"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleAuth()}
          />
          
          {!dbExists && (
            <input 
              type="password" 
              placeholder="Confirm Key" 
              className="w-full h-12 bg-zinc-900/50 rounded-2xl px-5 text-sm text-primary border border-white/5 outline-none focus:border-primary/50 focus:bg-zinc-900 transition-all shadow-inner animate-in"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
            />
          )}

          <button 
            onClick={handleAuth}
            className="w-full h-12 bg-primary text-black font-black rounded-2xl flex items-center justify-center gap-2 hover:bg-primary hover:shadow-[0_0_20px_rgba(var(--primary),0.3)] transition-all uppercase text-xs"
          >
            <Lock size={18} /> Establish Link
          </button>

          {/* دکمه ریست - دقیقاً اینجا بدون هیچ شرطی */}
          <div className="pt-4 mt-2 border-t border-white/5">
            {!showResetConfirm ? (
              <button 
                onClick={() => setShowResetConfirm(true)}
                className="w-full text-zinc-600 hover:text-red-500 text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-2 transition-colors"
              >
                <Trash2 size={12} /> Wipe System Data
              </button>
            ) : (
              <div className="space-y-3 p-3 bg-red-500/5 border border-red-500/10 rounded-xl animate-in">
                <p className="text-[9px] text-red-500 text-center font-bold uppercase">Confirm Destruction?</p>
                <div className="flex gap-2">
                  <button onClick={handleReset} className="flex-1 h-8 bg-red-600 text-white rounded-lg text-[9px] font-bold hover:bg-red-500 transition-colors">YES</button>
                  <button onClick={() => setShowResetConfirm(false)} className="flex-1 h-8 bg-white/5 text-zinc-400 rounded-lg text-[9px] font-bold hover:bg-white/10 hover:text-white transition-colors">NO</button>
                </div>
              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  );
};

export default AuthPage;