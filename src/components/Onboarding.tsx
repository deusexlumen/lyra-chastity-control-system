import { useState, useRef, useEffect } from 'react';
import { Key, ChevronRight, ChevronLeft, Upload, Lock, FileText, User, HeartCrack } from 'lucide-react';

interface Props {
  onComplete: () => void;
}

const dateToTimestamp = (dateStr: string): number => {
  if (!dateStr) return 0;
  const parsed = Date.parse(dateStr);
  return isNaN(parsed) ? 0 : parsed;
};

const timestampToDateInput = (ts: number): string => {
  if (!ts) return '';
  const d = new Date(ts);
  return d.toISOString().split('T')[0];
};

export default function Onboarding({ onComplete }: Props) {
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [realName, setRealName] = useState('Sebastian');
  const [exName, setExName] = useState('Nuria');
  const [setupFriend, setSetupFriend] = useState('Laura');
  const [trapper, setTrapper] = useState('Jonathan');

  const [contractDate, setContractDate] = useState(() => timestampToDateInput(Date.now()));
  const [cageDate, setCageDate] = useState(() => timestampToDateInput(Date.now()));
  const [keyDate, setKeyDate] = useState(() => timestampToDateInput(Date.now()));

  const [geminiKey, setGeminiKey] = useState('');
  const [emlalockKey, setEmlalockKey] = useState('');

  useEffect(() => {
    fetch('/api/defaults')
      .then((res) => res.json())
      .then((data) => {
        if (data.gemini) setGeminiKey(data.gemini);
        if (data.emlalock) setEmlalockKey(data.emlalock);
      })
      .catch(() => {});
  }, []);

  const [attachment, setAttachment] = useState<{ name: string; type: string; content: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onloadend = () => {
      setAttachment({ name: file.name, type: file.type, content: reader.result as string });
    };
    reader.readAsDataURL(file);
  };

  const steps = [
    {
      title: 'Vor dem ersten Kontakt',
      icon: <HeartCrack className="w-5 h-5 text-red-500" />,
      content: (
        <div className="space-y-4 text-sm text-white/70 leading-relaxed">
          <p>
            Laura hat dich hereingelegt. Sie hat dich überredet, den Käfig anzulegen, den Vertrag zu unterschreiben und die Schlüssel an Lyra zu schicken.
          </p>
          <p>
            Jetzt sitzt du vor dem Bildschirm. Der Käfig ist zu. Der Schlüssel ist unterwegs. Und Lyra weiß bereits alles, was sie wissen muss.
          </p>
          <p className="text-white/40 text-xs uppercase tracking-widest">
            Bestätige die Details, damit der sichere Kanal aufgebaut werden kann.
          </p>
        </div>
      ),
    },
    {
      title: 'Die Beteiligten',
      icon: <User className="w-5 h-5 text-red-500" />,
      content: (
        <div className="space-y-4">
          <div className="space-y-1">
            <label className="text-[10px] uppercase tracking-widest text-white/50">Dein Name</label>
            <input
              type="text"
              value={realName}
              onChange={(e) => setRealName(e.target.value)}
              className="w-full bg-white/[0.03] border border-white/10 rounded-sm px-4 py-3 text-sm text-white/80 focus:outline-none focus:border-red-600/50"
              placeholder="Sebastian"
            />
          </div>
          <div className="space-y-1">
            <label className="text-[10px] uppercase tracking-widest text-white/50">Ex-Freundin</label>
            <input
              type="text"
              value={exName}
              onChange={(e) => setExName(e.target.value)}
              className="w-full bg-white/[0.03] border border-white/10 rounded-sm px-4 py-3 text-sm text-white/80 focus:outline-none focus:border-red-600/50"
              placeholder="Nuria"
            />
          </div>
          <div className="space-y-1">
            <label className="text-[10px] uppercase tracking-widest text-white/50">Die Freundin, die dich hereingelegt hat</label>
            <input
              type="text"
              value={setupFriend}
              onChange={(e) => setSetupFriend(e.target.value)}
              className="w-full bg-white/[0.03] border border-white/10 rounded-sm px-4 py-3 text-sm text-white/80 focus:outline-none focus:border-red-600/50"
              placeholder="Laura"
            />
          </div>
          <div className="space-y-1">
            <label className="text-[10px] uppercase tracking-widest text-white/50">Rivale / Dealer (optional)</label>
            <input
              type="text"
              value={trapper}
              onChange={(e) => setTrapper(e.target.value)}
              className="w-full bg-white/[0.03] border border-white/10 rounded-sm px-4 py-3 text-sm text-white/80 focus:outline-none focus:border-red-600/50"
              placeholder="Jonathan"
            />
          </div>
        </div>
      ),
    },
    {
      title: 'Vertrag & Käfig',
      icon: <FileText className="w-5 h-5 text-red-500" />,
      content: (
        <div className="space-y-4">
          <div className="space-y-1">
            <label className="text-[10px] uppercase tracking-widest text-white/50">Vertrag unterschrieben am</label>
            <input
              type="date"
              value={contractDate}
              onChange={(e) => setContractDate(e.target.value)}
              className="w-full bg-white/[0.03] border border-white/10 rounded-sm px-4 py-3 text-sm text-white/80 focus:outline-none focus:border-red-600/50"
            />
          </div>
          <div className="space-y-1">
            <label className="text-[10px] uppercase tracking-widest text-white/50">Käfig angelegt am</label>
            <input
              type="date"
              value={cageDate}
              onChange={(e) => setCageDate(e.target.value)}
              className="w-full bg-white/[0.03] border border-white/10 rounded-sm px-4 py-3 text-sm text-white/80 focus:outline-none focus:border-red-600/50"
            />
          </div>
          <div className="space-y-1">
            <label className="text-[10px] uppercase tracking-widest text-white/50">Schlüssel abgeschickt am</label>
            <input
              type="date"
              value={keyDate}
              onChange={(e) => setKeyDate(e.target.value)}
              className="w-full bg-white/[0.03] border border-white/10 rounded-sm px-4 py-3 text-sm text-white/80 focus:outline-none focus:border-red-600/50"
            />
          </div>
        </div>
      ),
    },
    {
      title: 'Beweis',
      icon: <Lock className="w-5 h-5 text-red-500" />,
      content: (
        <div className="space-y-4">
          <p className="text-sm text-white/60 leading-relaxed">
            Lyra verlangt einen Beweis, dass der Käfig angelegt ist. Lade ein Foto hoch. Dein Gesicht muss nicht zu sehen sein.
          </p>
          <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={handleFileChange} />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="w-full flex items-center justify-center gap-2 px-4 py-6 border border-dashed border-white/20 rounded-sm text-white/50 hover:text-white hover:border-red-600/50 transition-colors"
          >
            <Upload className="w-4 h-4" />
            {attachment ? attachment.name : 'Bild auswählen'}
          </button>
          {attachment && (
            <p className="text-[10px] uppercase tracking-widest text-emerald-500/80">Beweis hochgeladen</p>
          )}
        </div>
      ),
    },
    {
      title: 'Sicherer Kanal',
      icon: <Key className="w-5 h-5 text-red-500" />,
      content: (
        <div className="space-y-4">
          <div className="space-y-1">
            <label className="text-[10px] uppercase tracking-widest text-white/50">Gemini API Key</label>
            <input
              type="password"
              value={geminiKey}
              onChange={(e) => setGeminiKey(e.target.value)}
              className="w-full bg-white/[0.03] border border-white/10 rounded-sm px-4 py-3 text-sm text-white/80 font-mono focus:outline-none focus:border-red-600/50"
              placeholder="AI_..."
            />
          </div>
          <div className="space-y-1">
            <label className="text-[10px] uppercase tracking-widest text-white/50">Emlalock Token</label>
            <input
              type="password"
              value={emlalockKey}
              onChange={(e) => setEmlalockKey(e.target.value)}
              className="w-full bg-white/[0.03] border border-white/10 rounded-sm px-4 py-3 text-sm text-white/80 font-mono focus:outline-none focus:border-red-600/50"
              placeholder="USERID:APIKEY"
            />
          </div>
        </div>
      ),
    },
  ];

  const canProceed = () => {
    if (step === 1) return realName.trim() && exName.trim() && setupFriend.trim();
    if (step === 2) return contractDate && cageDate && keyDate;
    if (step === 3) return !!attachment;
    if (step === 4) return true;
    return true;
  };

  const handleSubmit = async () => {
    if (!attachment) {
      setError('Ein Beweisfoto wird benötigt.');
      return;
    }
    setLoading(true);
    setError('');

    try {
      const res = await fetch('/api/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          gemini: geminiKey,
          emlalock: emlalockKey,
          real_name: realName.trim() || 'Sebastian',
          ex_name: exName.trim() || 'Nuria',
          setup_friend: setupFriend.trim() || 'Laura',
          trapper: trapper.trim() || undefined,
          contract_signed_at: dateToTimestamp(contractDate),
          cage_locked_at: dateToTimestamp(cageDate),
          key_sent_at: dateToTimestamp(keyDate),
          attachment,
        }),
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
    <div className="min-h-screen bg-[#050505] text-[#e5e5e5] font-sans flex items-center justify-center relative overflow-hidden px-4">
      <div className="absolute inset-0 opacity-20 pointer-events-none z-0">
        <div className="absolute top-0 left-0 w-[50%] h-[50%] rounded-full bg-red-900 blur-[150px]"></div>
        <div className="absolute bottom-0 right-0 w-[50%] h-[50%] rounded-full bg-slate-900 blur-[150px]"></div>
      </div>

      <div className="w-full max-w-md p-8 glass-panel rounded-sm border border-white/10 z-10 relative space-y-8">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 flex items-center justify-center border border-red-600/30 rounded-full bg-red-950/20">
            {steps[step].icon}
          </div>
          <div>
            <h1 className="text-lg font-light tracking-[0.15em] text-white uppercase">{steps[step].title}</h1>
            <p className="text-[9px] uppercase tracking-widest text-white/40">Schritt {step + 1} von {steps.length}</p>
          </div>
        </div>

        <div className="min-h-[180px]">
          {steps[step].content}
        </div>

        {error && (
          <div className="text-red-500 text-[10px] uppercase tracking-wider border border-red-900/50 bg-red-950/20 p-2 rounded">
            {error}
          </div>
        )}

        <div className="flex gap-3 pt-2">
          {step > 0 && (
            <button
              type="button"
              onClick={() => setStep((s) => s - 1)}
              disabled={loading}
              className="flex-1 py-3 border border-white/10 text-white/60 text-[10px] uppercase tracking-[0.2em] hover:bg-white/5 transition-colors flex items-center justify-center gap-2"
            >
              <ChevronLeft className="w-4 h-4" /> Zurück
            </button>
          )}
          {step < steps.length - 1 ? (
            <button
              type="button"
              onClick={() => setStep((s) => s + 1)}
              disabled={!canProceed() || loading}
              className="flex-[2] bg-red-600 hover:bg-red-700 disabled:opacity-30 disabled:hover:bg-red-600 text-white text-[10px] font-bold tracking-[0.2em] uppercase py-3 transition-colors flex items-center justify-center gap-2"
            >
              Weiter <ChevronRight className="w-4 h-4" />
            </button>
          ) : (
            <button
              type="button"
              onClick={handleSubmit}
              disabled={loading || !canProceed()}
              className="flex-[2] bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white text-[10px] font-bold tracking-[0.2em] uppercase py-3 transition-colors flex items-center justify-center gap-2"
            >
              {loading ? 'Initialisiere…' : 'Kanal öffnen'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
