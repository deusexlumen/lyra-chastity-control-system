import { useState, useRef, useEffect } from 'react';
import type { FormEvent } from 'react';
import { Send, Loader2, Paperclip, Volume2, Pencil, Trash2, RefreshCw, Check, X, CheckCheck, MoreVertical } from 'lucide-react';
import type { ChatMessage } from '../types/types';

interface Props {
  chatHistory: ChatMessage[];
  onSendMessage: (msg: string, attachment?: { name: string, type: string, content: string }) => Promise<void>;
  onDeleteMessage: (messageId: string) => Promise<void>;
  onEditMessage: (messageId: string, content: string) => Promise<void>;
  onRegenerateMessage: (messageId: string) => Promise<void>;
  loading: boolean;
  error: string | null;
}

function formatMessageTime(ts?: number): string {
  if (!ts) return '';
  const d = new Date(ts);
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  const time = d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
  if (isToday) return time;
  const date = d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' });
  return `${date}, ${time}`;
}

export default function Chat({
  chatHistory = [],
  onSendMessage,
  onDeleteMessage,
  onEditMessage,
  onRegenerateMessage,
  loading,
  error,
}: Props) {
  const [input, setInput] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState('');
  const [voiceLoading, setVoiceLoading] = useState<Record<string, boolean>>({});
  const [voiceUrls, setVoiceUrls] = useState<Record<string, string>>({});
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const lastLyraMessageId = [...chatHistory].reverse().find((m) => m.role === 'Lyra')?.id;

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

  const playVoice = async (msg: ChatMessage) => {
    const id = msg.id;
    if (!id) return;
    if (voiceUrls[id]) {
      const audio = new Audio(voiceUrls[id]);
      audio.play().catch(err => console.error("Voice playback failed:", err));
      return;
    }
    setVoiceLoading((prev) => ({ ...prev, [id]: true }));
    try {
      const res = await fetch('/api/voice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: msg.content }),
      });
      if (!res.ok) throw new Error('Voice failed');
      const data = await res.json();
      if (data.audioUrl) {
        setVoiceUrls((prev) => ({ ...prev, [id]: data.audioUrl }));
        const audio = new Audio(data.audioUrl);
        audio.play().catch(err => console.error("Voice playback failed:", err));
      }
    } catch (err) {
      console.error(err);
    } finally {
      setVoiceLoading((prev) => ({ ...prev, [id]: false }));
    }
  };

  const startEdit = (msg: ChatMessage) => {
    if (!msg.id) return;
    setEditingId(msg.id);
    setEditContent(msg.content);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditContent('');
  };

  const saveEdit = async (msg: ChatMessage) => {
    if (!msg.id) return;
    await onEditMessage(msg.id, editContent);
    setEditingId(null);
  };

  const confirmDelete = async (msg: ChatMessage) => {
    if (!msg.id) return;
    if (window.confirm('Diese Nachricht wirklich löschen?')) {
      await onDeleteMessage(msg.id);
    }
  };

  const isImageAttachment = (type?: string) => type?.startsWith('image/');

  return (
    <div className="flex flex-col h-full w-full max-w-3xl mx-auto">
      <div className="flex-1 overflow-y-auto px-4 md:px-8 py-6 space-y-6 custom-scrollbar">
        {chatHistory.length === 0 && (
          <div className="text-center text-white/30 mt-20 space-y-4">
            <p className="text-[10px] uppercase tracking-widest">Noch keine Nachrichten.</p>
          </div>
        )}

        {chatHistory.map((msg, i) => (
          <div key={msg.id ?? i} className={`flex ${msg.role === 'User' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[85%] md:max-w-[70%] flex flex-col ${msg.role === 'User' ? 'items-end' : 'items-start'} gap-1`}>
              {msg.role === 'User' ? (
                <>
                  <div className="bg-red-900/40 text-white/90 px-4 py-2.5 rounded-2xl rounded-tr-sm border border-red-900/30 text-sm leading-relaxed">
                    {msg.content}
                    {msg.attachment && (
                      <div className="mt-2">
                        {isImageAttachment(msg.attachment.type) ? (
                          <img src={msg.attachment.content} alt="" className="max-w-[200px] rounded border border-white/10" />
                        ) : (
                          <span className="text-[10px] text-white/50 block">{msg.attachment.name}</span>
                        )}
                      </div>
                    )}
                  </div>
                  <span className="text-[9px] text-white/30 px-1">{formatMessageTime(msg.createdAt)}</span>
                </>
              ) : (
                <>
                  {editingId === msg.id ? (
                    <div className="w-full space-y-2">
                      <textarea
                        value={editContent}
                        onChange={(e) => setEditContent(e.target.value)}
                        disabled={loading}
                        rows={3}
                        className="w-full bg-white/5 border border-white/10 rounded-lg p-3 text-sm text-white/90 focus:outline-none focus:border-red-600/50 resize-none"
                      />
                      <div className="flex gap-2 justify-end">
                        <button
                          onClick={() => saveEdit(msg)}
                          disabled={loading || !editContent.trim()}
                          className="flex items-center gap-1 px-2 py-1 text-[10px] uppercase tracking-widest text-emerald-400 hover:text-emerald-300 border border-emerald-900/30 rounded disabled:opacity-30 transition-colors"
                        >
                          <Check className="w-3 h-3" /> Speichern
                        </button>
                        <button
                          onClick={cancelEdit}
                          disabled={loading}
                          className="flex items-center gap-1 px-2 py-1 text-[10px] uppercase tracking-widest text-white/50 hover:text-white/80 border border-white/10 rounded transition-colors"
                        >
                          <X className="w-3 h-3" /> Abbrechen
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="bg-white/[0.05] text-white/90 px-4 py-3 rounded-2xl rounded-tl-sm border border-white/10 text-sm leading-relaxed">
                        {msg.content}
                        {msg.media && (
                          <div className="mt-3 rounded-lg overflow-hidden border border-white/10 max-w-sm">
                            <img src={msg.media} alt="" className="w-full object-cover" />
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-2 px-1">
                        <span className="text-[9px] text-white/30">{formatMessageTime(msg.createdAt)}</span>
                        {msg.id === lastLyraMessageId && (
                          <span className="text-[9px] text-red-500/60 flex items-center gap-0.5">
                            <CheckCheck className="w-3 h-3" /> Gelesen
                          </span>
                        )}
                      </div>
                      {(() => {
                        const id = msg.id;
                        if (!id) return null;
                        const menuOpen = openMenuId === id;
                        return (
                          <div className="relative mt-1 px-1">
                            <button
                              onClick={() => setOpenMenuId(menuOpen ? null : id)}
                              disabled={loading}
                              className="text-white/20 hover:text-white/60 disabled:opacity-30 transition-colors p-1"
                              aria-label="Nachrichtenaktionen"
                            >
                              <MoreVertical className="w-3.5 h-3.5" />
                            </button>
                            {menuOpen && (
                              <div className="absolute left-0 top-6 z-10 min-w-[140px] bg-[#111] border border-white/10 rounded shadow-lg py-1">
                                <button
                                  onClick={() => { playVoice(msg); setOpenMenuId(null); }}
                                  disabled={loading || voiceLoading[id]}
                                  className="w-full flex items-center gap-2 px-3 py-1.5 text-[10px] text-white/60 hover:bg-white/5 disabled:opacity-30 transition-colors"
                                >
                                  <Volume2 className="w-3 h-3" /> Anhören
                                </button>
                                <button
                                  onClick={() => { startEdit(msg); setOpenMenuId(null); }}
                                  disabled={loading}
                                  className="w-full flex items-center gap-2 px-3 py-1.5 text-[10px] text-white/60 hover:bg-white/5 disabled:opacity-30 transition-colors"
                                >
                                  <Pencil className="w-3 h-3" /> Bearbeiten
                                </button>
                                <button
                                  onClick={() => { confirmDelete(msg); setOpenMenuId(null); }}
                                  disabled={loading}
                                  className="w-full flex items-center gap-2 px-3 py-1.5 text-[10px] text-white/60 hover:bg-white/5 disabled:opacity-30 transition-colors"
                                >
                                  <Trash2 className="w-3 h-3" /> Löschen
                                </button>
                                <button
                                  onClick={() => { onRegenerateMessage(id); setOpenMenuId(null); }}
                                  disabled={loading}
                                  className="w-full flex items-center gap-2 px-3 py-1.5 text-[10px] text-white/60 hover:bg-white/5 disabled:opacity-30 transition-colors"
                                >
                                  <RefreshCw className="w-3 h-3" /> Neu
                                </button>
                              </div>
                            )}
                          </div>
                        );
                      })()}
                    </>
                  )}
                </>
              )}
            </div>
          </div>
        ))}

        {loading && (
          <div className="flex justify-start">
            <div className="bg-white/[0.03] border border-white/10 rounded-2xl rounded-tl-sm px-4 py-3 flex items-center gap-3">
              <Loader2 className="w-4 h-4 animate-spin text-red-500/60" />
              <span className="text-[11px] text-white/40">Lyra schreibt…</span>
            </div>
          </div>
        )}

        {error && (
          <div className="flex justify-center mt-4">
            <div className="border border-red-900/50 bg-red-950/20 text-red-500 rounded-full px-4 py-2 text-[10px] uppercase tracking-widest flex items-center gap-2">
              <div className="w-2 h-2 bg-red-600 rounded-full animate-pulse"></div>
              <span>Nachricht konnte nicht gesendet werden.</span>
            </div>
          </div>
        )}
        <div ref={bottomRef} className="h-2" />
      </div>

      <div className="px-4 md:px-8 py-4 border-t border-white/5 bg-[#0A0A0A]">
        <form onSubmit={handleSubmit} className="flex items-center gap-3">
          <input type="file" ref={fileInputRef} className="hidden" onChange={handleFileChange} />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="p-2 text-white/30 hover:text-white transition-colors"
          >
            <Paperclip className="w-5 h-5" />
          </button>
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={loading}
            placeholder="Schreib Lyra…"
            className="flex-1 bg-white/[0.03] border border-white/10 rounded-full px-5 py-3 text-sm text-white/90 placeholder:text-white/20 focus:outline-none focus:border-red-600/50 disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={!input.trim() || loading}
            className="p-3 bg-red-600/80 hover:bg-red-600 text-white rounded-full disabled:opacity-20 transition-colors"
          >
            <Send className="w-4 h-4" />
          </button>
        </form>
      </div>
    </div>
  );
}
