import { useState } from 'react';
import { CircleCheck, Loader2, Key } from 'lucide-react';

interface Props {
  onComplete: () => void;
}

export default function Onboarding({ onComplete }: Props) {
  const [geminiKey, setGeminiKey] = useState('');
  const [emlalockKey, setEmlalockKey] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSetup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!geminiKey || !emlalockKey) {
      setError('System Requirement: Keys missing.');
      return;
    }
    setLoading(true);
    setError('');

    try {
      const res = await fetch('/api/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gemini: geminiKey, emlalock: emlalockKey }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Initialization Failed');
      onComplete();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Fatal Exception.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#050505] text-[#e5e5e5] font-sans flex items-center justify-center relative overflow-hidden">
      <div className="absolute inset-0 opacity-20 pointer-events-none z-0">
        <div className="absolute top-0 left-0 w-[50%] h-[50%] rounded-full bg-red-900 blur-[150px]"></div>
        <div className="absolute bottom-0 right-0 w-[50%] h-[50%] rounded-full bg-slate-900 blur-[150px]"></div>
      </div>

      <div className="w-full max-w-md space-y-10 p-10 glass-panel rounded-none border border-white/10 z-10 relative box-border mx-4">
        <div className="space-y-4 text-center">
          <div className="w-12 h-12 flex items-center justify-center border border-red-600/30 rounded-full mx-auto nuria-glow bg-red-950/20">
            <Key className="w-5 h-5 text-red-500" />
          </div>
          <h1 className="text-xl font-light tracking-[0.2em] text-white uppercase mt-4">System Init</h1>
          <p className="text-[10px] uppercase tracking-widest text-white/40">Secure Connection Required</p>
        </div>

        <form onSubmit={handleSetup} className="space-y-6">
          <div className="space-y-2">
            <label className="text-[10px] font-bold uppercase tracking-widest text-white/50 block">Gemini API Key</label>
            <input
              type="password"
              className="w-full bg-white/[0.03] border border-white/10 rounded-sm px-4 py-3 text-sm focus:outline-none border-l-2 focus:border-l-red-600 font-mono text-white/80 transition-colors"
              placeholder="AI_..."
              value={geminiKey}
              onChange={(e) => setGeminiKey(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <label className="text-[10px] font-bold uppercase tracking-widest text-white/50 block">Emlalock Token</label>
            <input
              type="password"
              className="w-full bg-white/[0.03] border border-white/10 rounded-sm px-4 py-3 text-sm focus:outline-none border-l-2 focus:border-l-red-600 font-mono text-white/80 transition-colors"
              placeholder="USERID:APIKEY"
              value={emlalockKey}
              onChange={(e) => setEmlalockKey(e.target.value)}
            />
          </div>
          
          {error && (
            <div className="text-red-500 text-[10px] uppercase tracking-wider border border-red-900/50 bg-red-950/20 p-2 rounded">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-red-600 hover:bg-red-700 text-white text-[10px] font-bold tracking-[0.2em] uppercase py-4 rounded-sm transition-colors flex items-center justify-center gap-3 disabled:opacity-50 mt-4"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <><CircleCheck className="w-4 h-4" /> Authenticate &gt;_</>}
          </button>
        </form>
      </div>
    </div>
  );
}
