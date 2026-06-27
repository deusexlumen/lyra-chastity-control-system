import type { ChatMessage, UserProfile, ModulesJson } from './engine';

export type { ChatMessage, ChatMessageAttachment, UserProfile, DatabaseState, AppDatabase, ModulesJson } from './engine';

export interface Penalty {
  id: string;
  duration: number;
  status: 'pending' | 'success' | 'error';
}

/**
 * Legacy app state. Kept during migration to UserProfile.
 * TODO: Remove once frontend fully uses user_profile.
 */
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
  /** Legacy app state. TODO: remove after migration. */
  state: AppState;
  user_profile: UserProfile;
  chat_history: ChatMessage[];
  modules: ModulesJson;
  media?: { categories: string[] };
}
