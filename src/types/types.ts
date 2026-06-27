import type { ChatMessage } from './engine';
export type { ChatMessage, UserProfile, DatabaseState } from './engine';

export interface Penalty {
  id: string;
  duration: number;
  status: 'pending' | 'success' | 'error';
}

export interface ChatMessageAttachment {
  name: string;
  type: string;
  content: string;
}

export interface AppState {
  module: number;
  points: number;
  chatHistory: ChatMessage[];
  penalties: Penalty[];
  activeVideoUrl?: string | null;
  userName?: string;
  daysDenied?: number;
  chastityStatus?: string;
  sissyLevel?: number;
  obedienceScore?: number;
  currentPhase?: number;
  loopCycle?: number;
  tagesform?: string;
  contentFingerprint?: string[];
  lastUsedAt?: Record<string, number>;
  messageIndex?: number;
}

export interface SetupState {
  setupComplete: boolean;
  keys: { gemini: string; emlalock: string; holder?: string };
  state: AppState;
  user_profile: import('./engine').UserProfile;
  chat_history: import('./engine').ChatMessage[];
  modules: import('./engine').ModulesJson;
  media?: { categories: string[] };
}
