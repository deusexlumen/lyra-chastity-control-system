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
  active_media_category?: string | null;
  active_media_index?: number | null;
  // Personal realism anchors
  real_name?: string;
  ex_name?: string;
  setup_friend?: string;
  trapper?: string;
  // Contract / key timeline
  contract_signed_at?: number;
  cage_locked_at?: number;
  key_sent_at?: number;
  key_received_at?: number;
  first_contact_at?: number;
  setup_completed_at?: number;
  last_active_at?: number;
  last_email_sent_at?: number;
  email_count_today?: number;
  // Memory
  memory_highlights?: string[];
  // Language Lyra should respond in
  language?: string;
}

export interface ChatMessageAttachment {
  name: string;
  type: string;
  content: string;
}

export interface ChatMessage {
  id?: string;
  role: 'User' | 'Lyra';
  content: string;
  attachment?: ChatMessageAttachment;
  media?: string | null;
  voiceUrl?: string | null;
  createdAt?: number;
  meta?: {
    moduleId?: number;
    flags?: StoryFlags;
  };
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
  completion_flags?: string[];
}

export interface ModulesJson {
  global_directives?: {
    tone?: string;
  };
  modules: Module[];
}

export type MilestoneType = 'photo' | 'media' | 'combo';

export interface Milestone {
  id: string;
  title: string;
  description: string;
  type: MilestoneType;
  module_id: number;
  flag: string;
  media_trigger?: string;
  required_flags?: string[];
  points_bonus: number;
}

export interface MilestonesJson {
  milestones: Milestone[];
}

export interface ParsedActions {
  setModule: number | null;
  setFlags: Array<{ key: string; value: boolean | number | string }>;
  penalties: number[];
  addPoints: number;
  forceMedia: Array<{ category: string; index: number }>;
  cleanText: string;
}
