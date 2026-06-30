import type { ChatMessage, UserProfile, ModulesJson } from './engine';

export type { ChatMessage, ChatMessageAttachment, UserProfile, DatabaseState, AppDatabase, ModulesJson } from './engine';

export interface Penalty {
  id: string;
  duration: number;
  status: 'pending' | 'success' | 'error';
}

/**
 * Minimal frontend app state. The backend no longer exposes game mechanics
 * (points, phases, cycles) to the UI.
 */
export interface AppState {
  chatHistory: ChatMessage[];
  penalties: Penalty[];
  activeVideoUrl?: string | null;
  activeMediaCategory?: string | null;
  activeMediaIndex?: number | null;
  chastityStatus?: string;
  pendingMilestones?: string[];
}

export interface SetupState {
  setupComplete: boolean;
  /** API keys are no longer returned by the state endpoint. */
  keys?: { gemini: string; emlalock: string; holder?: string };
  /** Legacy app state. TODO: remove after migration. */
  state: AppState;
  user_profile: UserProfile;
  chat_history: ChatMessage[];
  modules: ModulesJson;
  media?: { categories: string[] };
}
