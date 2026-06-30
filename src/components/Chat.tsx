import { useState, useRef, useEffect } from 'react';
import type { FormEvent } from 'react';
import { Send, Loader2, Paperclip, Volume2 } from 'lucide-react';
import type { ChatMessage } from '../types/types';

interface Props {
  chatHistory: ChatMessage[];
  onSendMessage: (msg: string, attachment?: { name: string, type: string, content: string }) => Promise<void>;
  loading: boolean;
  error: string | null;
}

export default function Chat({ chatHistory = [], onSendMessage, loading, error }: Props) {
  const [input, setInput] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatHistory, loading, error]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!input.trim() || loading) return;
    const msg = input.trim();
    setInput('');
    await onSendMessage(msg);
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onloadend = async () => {
      const content = reader.result as string;
      await onSendMessage("", { name: file.name, type: file.type, content });
    };
    reader.readAsDataURL(file);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const playVoice = (url: string) => {
    const audio = new Audio(url);
    audio.play().catch(err => console.error("Voice playback failed:", err));
  };

  return (
    <div className="flex flex-col h-full w-full max-w-2xl mx-auto py-2">
      <div className="flex-1 overflow-y-auto px-4 md:px-8 lg:px-12 space-y-8 custom-scrollbar">
        {chatHistory.length === 0 && (
          <div className="text-center text-white/30 mt-20 space-y-4">
            <div className="w-1 h-12 bg-red-600 mx-auto opacity-50"></div>
            <p className="text-[10px] uppercase tracking-widest">Die Matrix ist initialisiert.</p>
            <p className="text-[10px] uppercase tracking-widest text-white/20">Eingabe erforderlich.</p>
          </div>
        )}
        
        {chatHistory.map((msg, i) => (
          <div key={i} className={`flex flex-col ${msg.role === 'User' ? 'items-end' : 'items-start'} gap-2`}>
            {msg.role === 'User' ? (
              <div className="max-w-[85%] md:max-w-[70%]">
                <span className="text-[9px] uppercase tracking-widest text-white/30 block mb-1 text-right">Subject</span>
                <p className="text-sm font-mono text-white/60 text-right leading-relaxed p-3 bg-white/5 border border-white/10 rounded">{msg.content}</p>
              </div>
            ) : (
              <div className="max-w-[95%] md:max-w-[90%]">
                <div className="flex items-center gap-3 mb-2">
                  <span className="text-[10px] uppercase tracking-widest text-red-500/80 font-semibold">Lyra</span>
                  {msg.voiceUrl && (
                    <button 
                      onClick={() => playVoice(msg.voiceUrl!)}
                      className="text-[9px] flex items-center gap-1 text-red-400/60 hover:text-red-400 transition-colors"
                    >
                      <Volume2 className="w-3 h-3" /> Stimme
                    </button>
                  )}
                </div>
                <p className="text-xl md:text-2xl font-light leading-relaxed font-serif italic text-white/90">
                  &ldquo;{msg.content}&rdquo;
                </p>
                {msg.media && (
                  <div className="mt-4 rounded border border-white/10 overflow-hidden max-w-sm">
                    <img src={msg.media} alt="" className="w-full object-cover" />
                  </div>
                )}
                <div className="flex gap-4 items-center mt-4">
                  <div className="h-[1px] w-12 bg-red-600 opacity-50"></div>
                  <span className="text-[9px] uppercase text-white/30 tracking-widest">Compliance Engine Active</span>
                </div>
              </div>
            )}
          </div>
        ))}
        
        {loading && (
          <div className="flex flex-col items-start gap-2 max-w-[90%]">
            <span className="text-[10px] uppercase tracking-widest text-red-500/50 block mb-1 font-semibold">Lyra</span>
            <div className="text-sm text-white/40 flex items-center gap-3 italic font-serif">
              <Loader2 className="w-4 h-4 animate-spin text-red-600" /> Analysiert Muster...
            </div>
          </div>
        )}

        {error && (
          <div className="flex justify-center mt-6">
            <div className="border border-red-900/50 bg-red-950/20 text-red-500 rounded-sm px-4 py-2 text-[10px] uppercase tracking-widest flex items-center gap-2">
              <div className="w-2 h-2 bg-red-600 rounded-full animate-pulse"></div>
              <span>Intervention fehlgeschlagen. Bitte erneut versuchen.</span>
            </div>
          </div>
        )}
        <div ref={bottomRef} className="h-4" />
      </div>

      <div className="mt-auto px-4 md:px-8 lg:px-12 pt-6 shrink-0">
        <div className="flex justify-between items-end border-b border-white/10 pb-2 mb-4">
          <div className="flex flex-col">
            <span className="text-[9px] uppercase text-white/40 mb-1">Current Input</span>
            <span className="text-xs tracking-wider text-white/60">Verbal Response Protocol</span>
          </div>
        </div>
        
        <form onSubmit={handleSubmit} className="relative glass-panel rounded-sm border-l-2 border-l-red-600 flex items-center p-2 mb-4">
          <input type="file" ref={fileInputRef} className="hidden" onChange={handleFileChange} />
          <button type="button" onClick={() => fileInputRef.current?.click()} className="p-2 text-white/30 hover:text-white transition-colors">
            <Paperclip className="w-4 h-4" />
          </button>
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={loading}
            placeholder="Erwarte Eingabe..."
            className="w-full bg-transparent pl-4 pr-12 py-3 text-sm text-white/80 placeholder:text-white/20 focus:outline-none disabled:opacity-50 font-mono"
          />
          <button
            type="submit"
            disabled={!input.trim() || loading}
            className="absolute right-4 p-2 text-red-600/50 hover:text-red-500 disabled:opacity-20 transition-colors"
          >
            <Send className="w-4 h-4" />
          </button>
        </form>
      </div>
    </div>
  );
}
