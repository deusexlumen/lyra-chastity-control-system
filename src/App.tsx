import { useEffect, useState, useCallback, useRef } from 'react';
import Onboarding from './components/Onboarding';
import Chat from './components/Chat';
import PenaltyDispatcher from './components/PenaltyDispatcher';
import ForcedMediaOverlay from './components/ForcedMediaOverlay';
import type { SetupState, Penalty } from './types/types';
import { RefreshCw } from 'lucide-react';

export default function App() {
  const [setup, setSetup] = useState<SetupState | null>(null);
  const [loading, setLoading] = useState(true);
  const [chatLoading, setChatLoading] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);

  const fetchState = useCallback(async () => {
    try {
      const res = await fetch('/api/state');
      if (res.ok) {
        const data = await res.json();
        setSetup(data);
      }
    } catch (e) {
      console.error('Failed to fetch state', e);
    } finally {
      setLoading(false);
    }
  }, []);
  const fetchStateRef = useRef(fetchState);
  useEffect(() => { fetchStateRef.current = fetchState; }, [fetchState]);

  useEffect(() => { fetchStateRef.current(); }, []);

  useEffect(() => {
    if (!setup?.setupComplete || !setup?.state?.penalties) return;
    const hasPending = setup.state.penalties.some((p: Penalty) => p.status === 'pending');
    if (!hasPending) return;
    const interval = setInterval(() => fetchStateRef.current(), 3000);
    return () => clearInterval(interval);
  }, [setup]);

  const handleSendMessage = async (msg: string, attachment?: { name: string, type: string, content: string }) => {
    if (!setup) return;
    setChatLoading(true);
    setChatError(null);
    
    const optimisticState = { 
      ...setup, 
      state: { 
        ...(setup?.state || { module: 0, points: 0, penalties: [] }), 
        chatHistory: [...(setup?.state?.chatHistory || []), { role: 'User' as const, content: msg, attachment }] 
      } 
    } as SetupState;
    setSetup(optimisticState);

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: msg, attachment }),
      });
      
      if (!res.ok) throw new Error('Network response was not ok');
      const data = await res.json();
      setSetup((prev) => prev ? { ...prev, state: data.state } : null);

      (data.state.penalties || []).forEach((p: Penalty) => {
        if (p.status === 'pending') {
          fetch('/api/hardware/penalty', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: p.id })
          }).catch((err) => console.error('Hardware penalty sync error:', err));
        }
      });
    } catch (err: unknown) {
      setChatError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setChatLoading(false);
    }
  };

  if (loading) {
    return <div className="min-h-screen bg-[#050505] flex items-center justify-center text-white/50 text-[10px] uppercase tracking-widest">Initializing Core...</div>;
  }

  if (!setup?.setupComplete) {
    return <Onboarding onComplete={fetchState} />;
  }

  const state = setup.state;
  const loopCycle = state.loopCycle || 1;
  const intensityLabel = loopCycle === 1 ? 'Standard' : loopCycle === 2 ? 'Harsh' : loopCycle === 3 ? 'Relentless' : 'Total';
  const tagesform = state.tagesform || 'Streng';
  const tagesformColor = tagesform === 'Erschöpft' ? 'text-amber-500' : tagesform === 'Verspielt' ? 'text-pink-400' : 'text-red-500';

  const handleVideoComplete = async () => {
    try {
      const res = await fetch('/api/media/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      if (res.ok) {
        const data = await res.json();
        setSetup((prev) => prev ? { ...prev, state: data.state } : null);
      }
    } catch (e) { console.error(e); }
  };

  return (
    <div className="min-h-screen bg-[#0A0A0A] text-[#e5e5e5] font-sans flex flex-col md:flex-row">
      {/* Sidebar */}
      <aside className="w-full md:w-80 border-r border-white/5 p-6 flex flex-col gap-6">
        {/* Avatar */}
        <div className="flex flex-col items-center gap-4">
          <div className="w-32 h-32 rounded-full overflow-hidden border-2 border-red-900/50 shadow-[0_0_20px_rgba(220,38,38,0.2)]">
            <img src="/lyra_avatar.jpg" alt="Lyra" className="w-full h-full object-cover" />
          </div>
          <h1 className="text-sm font-bold tracking-widest">LYRA</h1>
          <span className="text-[10px] text-white/50 tracking-[0.2em] uppercase">Status: Online</span>
        </div>

        {/* Stats Panel */}
        <div className="p-4 bg-white/[0.02] border border-white/5 rounded-lg space-y-4">
          <div className="flex justify-between items-center text-[11px]">
            <span className="text-white/40 uppercase tracking-widest">Phase</span>
            <span className="font-mono text-amber-500 tracking-widest">{state.currentPhase !== undefined ? state.currentPhase : state.module || 0}</span>
          </div>
          <div className="flex justify-between items-center text-[11px]">
            <span className="text-white/40 uppercase tracking-widest">Loop</span>
            <span className="font-mono text-red-500 tracking-widest">{loopCycle} — {intensityLabel}</span>
          </div>
          <div className="flex justify-between items-center text-[11px]">
            <span className="text-white/40 uppercase tracking-widest">Tagesform</span>
            <span className={`font-mono tracking-widest ${tagesformColor}`}>{tagesform}</span>
          </div>
          <div className="flex justify-between items-center text-[11px]">
            <span className="text-white/40 uppercase tracking-widest">Score</span>
            <span className="font-mono text-white tracking-widest">{state.points || 0} PTS</span>
          </div>
          <div className="flex justify-between items-center text-[11px]">
            <span className="text-white/40 uppercase tracking-widest">Obedience</span>
            <div className="flex items-center gap-2">
              <div className="w-16 h-1 bg-white/10 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-red-600 transition-all duration-500" 
                  style={{ width: `${state.obedienceScore || 0}%` }}
                />
              </div>
              <span className="font-mono text-white/60">{state.obedienceScore || 0}</span>
            </div>
          </div>
          <div className="flex justify-between items-center text-[11px]">
            <span className="text-white/40 uppercase tracking-widest">Days Denied</span>
            <span className="font-mono text-white/60 tracking-widest">{state.daysDenied || 0}</span>
          </div>
          {state.sissyLevel ? (
            <div className="flex justify-between items-center text-[11px]">
              <span className="text-white/40 uppercase tracking-widest">Sissy Level</span>
              <span className="font-mono text-pink-400/60 tracking-widest">{state.sissyLevel}</span>
            </div>
          ) : null}
        </div>
        
        {/* Penalties */}
        <div className="flex-1 overflow-y-auto">
          <PenaltyDispatcher penalties={state.penalties || []} />
        </div>

        {/* Manual Ambush Button */}
        <button
          onClick={async () => {
            try {
              await fetch('/api/ambush', { method: 'POST' });
            } catch (e) { console.error(e); }
          }}
          className="w-full text-[9px] uppercase tracking-widest text-red-500/40 hover:text-red-500 border border-red-900/20 hover:border-red-900/50 p-2 rounded transition-all flex items-center justify-center gap-2"
        >
          <RefreshCw className="w-3 h-3" /> Reality Bleed
        </button>
      </aside>

      {/* Main */}
      <main className="flex-1 flex flex-col min-w-0">
        <header className="h-16 flex items-center justify-between px-6 border-b border-white/5">
          <div className="flex items-center gap-3">
            <span className="font-bold text-sm tracking-widest">CONVERSATION</span>
            <span className="text-[9px] text-white/30 uppercase tracking-widest">
              {setup.modules?.modules?.find((m) => m.id === state.module)?.title || `Module ${state.module || 0}`}
            </span>
          </div>
          <div className="flex items-center gap-3">
            <span className={`text-[9px] px-2 py-0.5 rounded border uppercase tracking-widest font-mono ${setup.user_profile?.lock_status === 'LOCKED' ? 'bg-red-950/50 text-red-500 border-red-900/50' : 'bg-emerald-950/50 text-emerald-500 border-emerald-900/50'}`}>
              {setup.user_profile?.lock_status === 'LOCKED' ? 'LOCKED' : 'UNLOCKED'}
            </span>
            <span className="text-[9px] uppercase tracking-widest text-white/30">Cycle</span>
            <span className="text-[10px] font-mono text-red-500">{loopCycle}</span>
            <div className="w-px h-3 bg-white/10"></div>
            <span className="text-[9px] uppercase tracking-widest text-white/30">Mood</span>
            <span className={`text-[10px] font-mono ${tagesformColor}`}>{tagesform}</span>
          </div>
        </header>
        
        <div className="flex-1 overflow-hidden relative">
          {state.activeVideoUrl ? (
            <ForcedMediaOverlay videoUrl={state.activeVideoUrl} onComplete={handleVideoComplete} />
          ) : (
            <Chat 
              chatHistory={state.chatHistory || []} 
              onSendMessage={handleSendMessage} 
              loading={chatLoading} 
              error={chatError} 
            />
          )}
        </div>
      </main>
    </div>
  );
}
