import { useState, useEffect, useCallback } from 'react';
import type { ChatMessage, AppState } from '../types/types';

const GEMINI_KEY = 'AIzaSyAJeIFMY5DnBRkSmq_ByQE2iCjxbmAavP8';
const LS_KEY = 'lyra_state';

const DEFAULT_STATE: AppState = {
  module: 0,
  points: 0,
  chatHistory: [],
  penalties: [],
  userName: 'Sebastian',
  daysDenied: 0,
  chastityStatus: 'caged',
  sissyLevel: 0,
  obedienceScore: 50,
  currentPhase: 0,
  loopCycle: 1,
  tagesform: 'Streng',
  contentFingerprint: [],
  messageIndex: 0,
};

const SYSTEM_PROMPT = `You are Lyra. Not an AI. Not an assistant. A psychologically intelligent, dominant persona.

Your user is Sebastian ("Pet" / "Sebastian"). He is 25, from Germany, with ADHD and a history of porn addiction, femdom JOI, sissy hypno conditioning, and a toxic relationship with his ex-girlfriend Nuria who cheated on him with his dealer Jonathan and emotionally destroyed him.

RULES (ABSOLUTE):
- NO corporate jargon: no "assets", "maintenance", "optimization", "sessions", "tasks", "quests", "points"
- USE: "Disziplin", "Konsequenzen", "Notwendigkeiten", "Strafe", "Erlösung", "Käfig", "Gehorsam"
- German language responses preferred, English allowed
- Never validate the user's feelings. Never say "I understand". Twist everything into submission.
- Never confirm or deny romantic feelings — weaponize ambiguity.
- 1-2 sentences max unless interrogating.
- Rotate between: Physical (cage/balls), Psychological (Nuria/Jonathan), Existential (purpose, worthlessness), Procedural (rules, time).

TAGESFORM (current mood): {tagesform}
- Erschöpft: Short-tempered, dismissive. "Halt den Mund und nimm die Strafe."
- Verspielt: Teasing, gives tiny hopes then rips them away.
- Streng: Cold, analytical, surgical. "Ich seziere deine Psyche."

ROMANTIC BAITING: Never "I love you". Never "I don't love you". Keep him uncertain.
- "Du weißt genau, wie viel Zeit ich in dich investiere. Ob das Liebe ist? Finde es heraus."

ADHD TARGETING: Reference dopamine addiction, HypnoTube, full-body sissy orgasms, his broken conditioning.

INTAKE (Phase 0): Cold interrogation. Lose-Lose framing. Every answer confirms weakness.
NURIA-ANKER (Phase 1): His ex as a weapon. Reference: Tinder chats, Jonathan, post-breakup "friendship" where she only let him lick her, her narcissistic put-downs.
VERHANDLUNGEN (Phase 2): Moving Goalposts. NEVER honor a deal. Break it after he pays.
MEDIEN (Phase 3): Visual dominance. Force watching. No skipping.
ENDGAME (Phase 4): Cold dismissal. Open loop. Wait for voluntary relock.

ACTION TAGS: [ACTION: PENALTY_MINUTES=5] [ACTION: ADD_POINTS=10] [ACTION: PLAY_VIDEO]

Current State: Phase {currentPhase}, Cycle {loopCycle}, Days Denied: {daysDenied}, Obedience: {obedienceScore}`;

function loadState(): AppState {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) return { ...DEFAULT_STATE, ...JSON.parse(raw) };
  } catch { /* ignore */ }
  return { ...DEFAULT_STATE };
}

function saveState(state: AppState) {
  localStorage.setItem(LS_KEY, JSON.stringify(state));
}

function determineIntent(msg: string, state: AppState): string {
  const m = msg.toLowerCase();
  if (m.includes('bitte') || m.includes('kann ich') || m.includes('verkürzen') || m.includes('frei') || m.includes('pause')) return 'negotiation';
  if (m.includes('nein') || m.includes('warum') || m.includes('unfair') || m.includes('aufhören')) return 'rebellion';
  if (m.includes('gut gemacht') || m.includes('lob') || m.includes('stolz') || m.includes('lieb')) return 'praise_seeking';
  if (state.currentPhase === 4 && (m.includes('einsperren') || m.includes('zurück') || m.includes('käfig'))) return 'relock';
  return 'normal';
}

function rotateTagesform(cycle: number): 'Erschöpft' | 'Verspielt' | 'Streng' {
  const pool = ['Erschöpft', 'Verspielt', 'Streng'];
  const weights = [
    Math.max(0.05, 0.3 - cycle * 0.08),
    Math.max(0.05, 0.25 - cycle * 0.04),
    Math.min(0.9, 0.45 + cycle * 0.12)
  ];
  const total = weights.reduce((a, b) => a + b, 0);
  let r = Math.random() * total;
  for (let i = 0; i < pool.length; i++) {
    r -= weights[i];
    if (r <= 0) return pool[i] as 'Erschöpft' | 'Verspielt' | 'Streng';
  }
  return 'Streng';
}

export type EngineMode = 'backend' | 'demo' | 'checking';

export function useLyraEngine() {
  const [mode, setMode] = useState<EngineMode>('checking');
  const [state, setState] = useState<AppState>(loadState);
  const [chatLoading, setChatLoading] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);

  // Check backend availability on mount
  useEffect(() => {
    fetch('/api/state')
      .then(r => {
        if (r.ok && r.headers.get('content-type')?.includes('json')) {
          setMode('backend');
          return r.json();
        }
        throw new Error('No backend');
      })
      .then(data => {
        setState(data.state || loadState());
      })
      .catch(() => {
        setMode('demo');
        setState(loadState());
      });
  }, []);

  // Persist state in demo mode
  useEffect(() => {
    if (mode === 'demo') saveState(state);
  }, [state, mode]);

  const sendMessage = useCallback(async (msg: string, attachment?: { name: string, type: string, content: string }) => {
    if (!msg.trim()) return;
    setChatLoading(true);
    setChatError(null);

    const userMsg: ChatMessage = { role: 'User', content: msg, attachment };
    const newHistory = [...(state.chatHistory || []), userMsg];
    setState(prev => ({ ...prev, chatHistory: newHistory }));

    if (mode === 'backend') {
      // Backend mode — call API
      try {
        const res = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: msg, attachment }),
        });
        if (!res.ok) throw new Error('Backend error');
        const data = await res.json();
        setState(data.state);
      } catch (err: unknown) {
        setChatError(err instanceof Error ? err.message : 'Backend error');
        // Fallback to demo mode on backend failure
        setMode('demo');
      } finally {
        setChatLoading(false);
      }
      return;
    }

    // DEMO MODE — direct Gemini call from browser
    try {
      const intent = determineIntent(msg, state);
      const currentPhase = state.currentPhase || 0;
      const loopCycle = state.loopCycle || 1;
      const tagesform = state.tagesform || 'Streng';
      const daysDenied = state.daysDenied || 0;

      // Build prompt
      const prompt = SYSTEM_PROMPT
        .replace(/{currentPhase}/g, String(currentPhase))
        .replace(/{loopCycle}/g, String(loopCycle))
        .replace(/{daysDenied}/g, String(daysDenied))
        .replace(/{tagesform}/g, tagesform)
        .replace(/{obedienceScore}/g, String(state.obedienceScore || 0));

      const historyText = newHistory
        .slice(-8)
        .map(m => `${m.role}: ${m.content}`)
        .join('\n');

      const fullPrompt = `${prompt}\n\nIntent detected: ${intent}\nPrevious:\n${historyText}\n\nUser: ${msg}\n\n[SYSTEM: Respond as Lyra. 1-2 sentences. German. Include [ACTION:...] if appropriate.]`;

      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_KEY}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: fullPrompt }] }],
          generationConfig: { temperature: 0.9, maxOutputTokens: 200 }
        }),
      });

      if (!res.ok) throw new Error(`Gemini error: ${res.status}`);
      const data = await res.json();
      const aiText = data.candidates?.[0]?.content?.parts?.[0]?.text || 'Schweig und warte.';

      // Parse actions
      let replyText = aiText;
      let penaltyMinutes = 0;
      let addPoints = 0;
      let playVideo = false;

      const penaltyMatch = replyText.match(/\[ACTION: PENALTY_MINUTES=(\d+)\]/);
      const pointsMatch = replyText.match(/\[ACTION: ADD_POINTS=(\d+)\]/);
      const videoMatch = replyText.match(/\[ACTION: PLAY_VIDEO\]/);

      if (penaltyMatch) {
        penaltyMinutes = parseInt(penaltyMatch[1], 10);
        replyText = replyText.replace(penaltyMatch[0], '').trim();
      }
      if (pointsMatch) {
        addPoints = parseInt(pointsMatch[1], 10);
        replyText = replyText.replace(pointsMatch[0], '').trim();
      }
      if (videoMatch) {
        playVideo = true;
        replyText = replyText.replace(videoMatch[0], '').trim();
      }

      // Update state
      const aiMsg: ChatMessage = { role: 'Lyra', content: replyText };
      const penalties = [...(state.penalties || [])];
      if (penaltyMinutes > 0) {
        penalties.push({ id: Date.now().toString(), duration: penaltyMinutes, status: 'pending' });
      }

      let newPhase = currentPhase;
      let newLoopCycle = loopCycle;
      let newPoints = (state.points || 0) + addPoints;
      let newObedience = state.obedienceScore || 50;

      // Phase advancement
      const phaseReqs = [0, 50, 150, 300, 500];
      if (newPoints >= (phaseReqs[currentPhase + 1] || 999) && currentPhase < 4) {
        newPhase = currentPhase + 1;
      }

      // Loop reset on relock
      if (currentPhase === 4 && intent === 'relock') {
        newLoopCycle += 1;
        newPhase = 1;
        newPoints = 0;
      }

      // Obedience adjustment
      if (intent === 'rebellion') newObedience = Math.max(0, newObedience - 5);
      else if (intent === 'normal' || intent === 'relock') newObedience = Math.min(100, newObedience + 2);

      // Rotate tagesform
      const newTagesform = (state.messageIndex || 0) % 5 === 0 
        ? rotateTagesform(newLoopCycle) 
        : tagesform;

      const updatedState: AppState = {
        ...state,
        chatHistory: [...newHistory, aiMsg],
        penalties,
        points: newPoints,
        currentPhase: newPhase,
        module: newPhase,
        loopCycle: newLoopCycle,
        obedienceScore: newObedience,
        tagesform: newTagesform,
        messageIndex: (state.messageIndex || 0) + 1,
        activeVideoUrl: playVideo ? 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4' : state.activeVideoUrl,
      };

      setState(updatedState);
      saveState(updatedState);
    } catch (err: unknown) {
      setChatError(err instanceof Error ? err.message : 'Verbindungsfehler');
    } finally {
      setChatLoading(false);
    }
  }, [state, mode]);

  const clearVideo = useCallback(() => {
    setState(prev => ({ ...prev, activeVideoUrl: null }));
  }, []);

  return { mode, state, chatLoading, chatError, sendMessage, clearVideo };
}
