import { useEffect, useState, useCallback, useRef } from 'react';
import Onboarding from './components/Onboarding';
import Chat from './components/Chat';
import ForcedMediaOverlay from './components/ForcedMediaOverlay';
import type { SetupState, Penalty } from './types/types';
import { Lock, Unlock, Loader2, Languages, Camera } from 'lucide-react';

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

  // Poll while waiting for Lyra's first contact or while penalties are pending.
  useEffect(() => {
    if (!setup?.setupComplete) return;
    const waitingFirstContact = setup.user_profile && !setup.user_profile.first_contact_at;
    const hasPending = (setup.state?.penalties || []).some((p: Penalty) => p.status === 'pending');
    if (!waitingFirstContact && !hasPending) return;

    const interval = setInterval(() => fetchStateRef.current(), waitingFirstContact ? 3000 : 5000);
    return () => clearInterval(interval);
  }, [setup]);

  const handleSendMessage = async (msg: string, attachment?: { name: string, type: string, content: string }) => {
    if (!setup) return;
    setChatLoading(true);
    setChatError(null);

    const optimisticState = {
      ...setup,
      state: {
        ...(setup?.state || { penalties: [] }),
        chatHistory: [...(setup?.state?.chatHistory || []), { role: 'User' as const, content: msg, attachment, createdAt: Date.now() }]
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

  const handleDeleteMessage = async (messageId: string) => {
    try {
      const res = await fetch('/api/chat/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messageId }),
      });
      if (!res.ok) throw new Error('Delete failed');
      const data = await res.json();
      setSetup((prev) => prev ? { ...prev, state: data.state } : null);
    } catch (err) {
      console.error('Delete message error:', err);
    }
  };

  const handleEditMessage = async (messageId: string, content: string) => {
    try {
      const res = await fetch('/api/chat/edit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messageId, content }),
      });
      if (!res.ok) throw new Error('Edit failed');
      const data = await res.json();
      setSetup((prev) => prev ? { ...prev, state: data.state } : null);
    } catch (err) {
      console.error('Edit message error:', err);
    }
  };

  const handleRegenerateMessage = async (messageId: string) => {
    if (!setup) return;
    setChatLoading(true);
    setChatError(null);
    try {
      const res = await fetch('/api/chat/regenerate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messageId }),
      });
      if (!res.ok) throw new Error('Regenerate failed');
      const data = await res.json();
      setSetup((prev) => prev ? { ...prev, state: data.state } : null);
    } catch (err: unknown) {
      setChatError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setChatLoading(false);
    }
  };

  const handleLanguageChange = async (language: string) => {
    try {
      const res = await fetch('/api/state', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_profile: { language } }),
      });
      if (res.ok) {
        const data = await res.json();
        setSetup((prev) => prev ? { ...prev, user_profile: data.user_profile } : null);
      }
    } catch (e) { console.error(e); }
  };

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

  if (loading) {
    return <div className="min-h-screen bg-[#050505] flex items-center justify-center text-white/50 text-[10px] uppercase tracking-widest">Kanal wird aufgebaut…</div>;
  }

  if (!setup?.setupComplete) {
    return <Onboarding onComplete={fetchState} />;
  }

  const profile = setup.user_profile;
  const state = setup.state;
  const isLocked = profile?.lock_status === 'LOCKED';
  const pendingMinutes = (profile?.penalty_queue || []).reduce((sum: number, p) => sum + p.minutes, 0);

  // Waiting screen before Lyra's first contact.
  if (!profile?.first_contact_at) {
    return (
      <div className="min-h-screen bg-[#050505] text-[#e5e5e5] flex flex-col items-center justify-center px-6">
        <div className="w-24 h-24 rounded-full overflow-hidden border border-red-900/50 shadow-[0_0_30px_rgba(220,38,38,0.2)] mb-8">
          <img src="/lyra_avatar.jpg" alt="Lyra" className="w-full h-full object-cover" />
        </div>
        <h1 className="text-lg tracking-[0.2em] uppercase text-white mb-3">Lyra prüft deinen Vertrag</h1>
        <p className="text-[11px] text-white/40 text-center max-w-sm leading-relaxed mb-6">
          Der Schlüssel ist unterwegs. Sobald Lyra ihn erhalten und deinen Beweis geprüft hat, wird sie sich melden.
        </p>
        <div className="flex items-center gap-3 text-[10px] text-white/30 uppercase tracking-widest">
          <Loader2 className="w-4 h-4 animate-spin text-red-600" /> Warte auf Antwort
        </div>
      </div>
    );
  }

  const lastLyraMessage = [...(state.chatHistory || [])].reverse().find((m) => m.role === 'Lyra');
  const lastSeen = lastLyraMessage?.createdAt
    ? new Date(lastLyraMessage.createdAt).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })
    : (profile?.last_active_at
        ? new Date(profile.last_active_at).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })
        : 'unbekannt');

  return (
    <div className="min-h-screen bg-[#050505] text-[#e5e5e5] font-sans flex flex-col md:flex-row">
      {/* Minimal sidebar */}
      <aside className="w-full md:w-64 border-r border-white/5 p-6 flex flex-col items-center gap-6 shrink-0">
        <div className="w-24 h-24 rounded-full overflow-hidden border border-red-900/50 shadow-[0_0_20px_rgba(220,38,38,0.2)]">
          <img src="/lyra_avatar.jpg" alt="Lyra" className="w-full h-full object-cover" />
        </div>
        <div className="text-center">
          <h1 className="text-sm font-bold tracking-widest">LYRA</h1>
          <p className="text-[10px] text-white/40 tracking-widest mt-1">Keyholder</p>
        </div>

        <div className="w-full space-y-3">
          <div className={`flex items-center justify-between p-3 rounded border ${isLocked ? 'bg-red-950/20 border-red-900/30 text-red-400' : 'bg-emerald-950/20 border-emerald-900/30 text-emerald-400'}`}>
            <span className="text-[10px] uppercase tracking-widest">Status</span>
            <span className="text-[10px] font-mono flex items-center gap-1">
              {isLocked ? <Lock className="w-3 h-3" /> : <Unlock className="w-3 h-3" />}
              {isLocked ? 'Verschlossen' : 'Frei'}
            </span>
          </div>
          {pendingMinutes > 0 && (
            <div className="p-3 bg-white/[0.02] border border-white/5 rounded">
              <span className="text-[10px] uppercase tracking-widest text-white/40 block mb-1">Gesperrt für</span>
              <span className="text-sm font-mono text-white/80">{pendingMinutes} Min</span>
            </div>
          )}
          {(state?.pendingMilestones?.length || 0) > 0 && (
            <div className="p-3 bg-white/[0.02] border border-white/5 rounded">
              <span className="text-[10px] uppercase tracking-widest text-white/40 block mb-2 flex items-center gap-1">
                <Camera className="w-3 h-3" /> Offene Nachweise
              </span>
              <ul className="space-y-1">
                {state.pendingMilestones?.map((title, i) => (
                  <li key={i} className="text-[10px] text-white/70 leading-relaxed">• {title}</li>
                ))}
              </ul>
            </div>
          )}
          <div className="p-3 bg-white/[0.02] border border-white/5 rounded">
            <label className="text-[10px] uppercase tracking-widest text-white/40 block mb-2 flex items-center gap-1">
              <Languages className="w-3 h-3" /> Sprache
            </label>
            <select
              value={profile?.language || 'de'}
              onChange={(e) => handleLanguageChange(e.target.value)}
              className="w-full bg-transparent text-sm text-white/80 focus:outline-none cursor-pointer"
            >
              <option value="de" className="bg-[#111]">Deutsch</option>
              <option value="en" className="bg-[#111]">English</option>
              <option value="fr" className="bg-[#111]">Français</option>
              <option value="es" className="bg-[#111]">Español</option>
              <option value="it" className="bg-[#111]">Italiano</option>
            </select>
          </div>
        </div>
      </aside>

      {/* Main messenger area */}
      <main className="flex-1 flex flex-col min-w-0 bg-[#0A0A0A]">
        <header className="h-16 flex items-center px-6 border-b border-white/5 bg-[#050505]">
          <div className="flex items-center gap-3">
            <div className="relative">
              <div className="w-9 h-9 rounded-full overflow-hidden border border-white/10">
                <img src="/lyra_avatar.jpg" alt="Lyra" className="w-full h-full object-cover" />
              </div>
              <span className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-emerald-500 rounded-full border-2 border-[#050505]"></span>
            </div>
            <div>
              <h2 className="text-sm font-medium text-white">Lyra</h2>
              <p className="text-[10px] text-white/40">zuletzt online {lastSeen}</p>
            </div>
          </div>
        </header>

        <div className="flex-1 overflow-hidden relative">
          {state.activeVideoUrl ? (
            <ForcedMediaOverlay mediaUrl={state.activeVideoUrl} category={state.activeMediaCategory} onComplete={handleVideoComplete} />
          ) : (
            <Chat
              chatHistory={state.chatHistory || []}
              onSendMessage={handleSendMessage}
              onDeleteMessage={handleDeleteMessage}
              onEditMessage={handleEditMessage}
              onRegenerateMessage={handleRegenerateMessage}
              loading={chatLoading}
              error={chatError}
            />
          )}
        </div>
      </main>
    </div>
  );
}
