export type LockStatus = 'LOCKED' | 'UNLOCKED';

export interface StoryFlags {
  assessment_completed?: boolean;
  nuria_trauma_score?: number;
  promised_obedience?: boolean;
  voluntary_relock_count?: number;
  [key: string]: boolean | number | undefined;
}

export interface PenaltyQueueItem {
  minutes: number;
  enqueuedAt: number;
  retries: number;
}

export interface UserProfile {
  compliance_points: number;
  current_module_id: number;
  lock_status: LockStatus;
  emlalock_session_id: string;
  story_flags: StoryFlags;
  penalty_queue: PenaltyQueueItem[];
  active_video_url?: string | null;
}

export interface ChatMessageAttachment {
  name: string;
  type: string;
  content: string;
}

export interface ChatMessage {
  role: 'User' | 'Lyra';
  content: string;
  attachment?: ChatMessageAttachment;
  media?: string | null;
  voiceUrl?: string | null;
}

export interface DatabaseState {
  user_profile: UserProfile;
  chat_history: ChatMessage[];
}

export interface AppDatabase extends DatabaseState {
  keys?: { gemini?: string; emlalock?: string; holder?: string };
  setupComplete?: boolean;
}

export interface MediaJson {
  lyra?: Record<string, { urls?: string[]; tags?: string[] }>;
  [key: string]: unknown;
}

export interface VideoJson {
  sissy_hypno?: string[];
  [key: string]: unknown;
}

export interface MediaTrigger {
  entry_media?: string;
  compliance_gifs?: string;
  relock_sweet_poison?: string;
  relock_love_letter_threat?: string;
  [key: string]: string | undefined;
}

export interface Module {
  id: number;
  title: string;
  requirementPoints: number;
  ai_prompt: string;
  media_triggers?: MediaTrigger;
}

export interface ModulesJson {
  global_directives?: {
    tone?: string;
  };
  modules: Module[];
}

export interface ParsedActions {
  setModule: number | null;
  setFlags: Array<{ key: string; value: boolean | number | string }>;
  penalties: number[];
  addPoints: number;
  forceMedia: Array<{ category: string; index: number }>;
  cleanText: string;
}
