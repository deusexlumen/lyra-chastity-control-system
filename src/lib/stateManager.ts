import fs from 'fs/promises';
import type { DatabaseState, UserProfile, PenaltyQueueItem, ChatMessage } from '../types/engine.js';

export const DEFAULT_PROFILE: UserProfile = {
  compliance_points: 0,
  current_module_id: 1,
  lock_status: 'LOCKED',
  emlalock_session_id: '',
  story_flags: {
    assessment_completed: false,
    nuria_trauma_score: 0,
    promised_obedience: false,
    voluntary_relock_count: 0,
  },
  penalty_queue: [],
};

function isNodeError(err: unknown): err is NodeJS.ErrnoException {
  return err instanceof Error && 'code' in err;
}

export async function readDB(dbPath: string): Promise<DatabaseState> {
  try {
    const data = await fs.readFile(dbPath, 'utf-8');
    const parsed = JSON.parse(data) as unknown;
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      if (isValidDatabaseState(parsed)) return parsed;
      if (!('user_profile' in parsed)) return migrateLegacyState(parsed);
    }
    throw new Error('Invalid database state');
  } catch (err: unknown) {
    if (isNodeError(err) && err.code === 'ENOENT') {
      return { user_profile: { ...DEFAULT_PROFILE }, chat_history: [] };
    }
    throw err;
  }
}

export async function writeDB(dbPath: string, db: DatabaseState): Promise<void> {
  await fs.writeFile(dbPath, JSON.stringify(db, null, 2));
}

function isRecord(value: unknown): value is Record<PropertyKey, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isPenaltyQueueItem(value: unknown): value is PenaltyQueueItem {
  if (!isRecord(value)) return false;
  return (
    typeof value.minutes === 'number' &&
    typeof value.enqueuedAt === 'number' &&
    typeof value.retries === 'number'
  );
}

function isChatMessage(value: unknown): value is ChatMessage {
  if (!isRecord(value)) return false;
  return (
    (value.role === 'User' || value.role === 'Lyra') &&
    typeof value.content === 'string'
  );
}

export function isValidDatabaseState(parsed: unknown): parsed is DatabaseState {
  if (!isRecord(parsed)) return false;
  if (!isRecord(parsed.user_profile)) return false;
  if (typeof parsed.user_profile.compliance_points !== 'number') return false;
  if (typeof parsed.user_profile.current_module_id !== 'number') return false;
  if (!['LOCKED', 'UNLOCKED'].includes(parsed.user_profile.lock_status as string)) return false;
  if (typeof parsed.user_profile.emlalock_session_id !== 'string') return false;
  if (!isRecord(parsed.user_profile.story_flags)) return false;
  if (
    !Array.isArray(parsed.user_profile.penalty_queue) ||
    !parsed.user_profile.penalty_queue.every(isPenaltyQueueItem)
  )
    return false;
  if (
    !Array.isArray(parsed.chat_history) ||
    !parsed.chat_history.every(isChatMessage)
  )
    return false;
  return true;
}

export async function initDB(dbPath: string): Promise<DatabaseState> {
  try {
    await fs.access(dbPath);
    return readDB(dbPath);
  } catch (err: unknown) {
    if (!isNodeError(err) || err.code !== 'ENOENT') throw err;
    const db: DatabaseState = { user_profile: { ...DEFAULT_PROFILE }, chat_history: [] };
    await writeDB(dbPath, db);
    return db;
  }
}

function isLegacyPenalty(value: unknown): value is { status?: string; duration?: number } {
  return isRecord(value) && (typeof value.status === 'string' || typeof value.status === 'undefined') && (typeof value.duration === 'number' || typeof value.duration === 'undefined');
}

export function migrateLegacyState(legacy: unknown): DatabaseState {
  if (!isRecord(legacy)) {
    throw new Error('Invalid legacy state');
  }
  const state = isRecord(legacy.state) ? legacy.state : {};
  const chatHistory = Array.isArray(state.chatHistory) ? state.chatHistory : [];
  const penalties = Array.isArray(state.penalties) ? state.penalties : [];

  return {
    user_profile: {
      compliance_points: typeof state.points === 'number' ? state.points : 0,
      current_module_id: typeof state.currentPhase === 'number'
        ? state.currentPhase
        : typeof state.module === 'number'
          ? state.module
          : 1,
      lock_status: state.chastityStatus === 'free' ? 'UNLOCKED' : 'LOCKED',
      emlalock_session_id: '',
      story_flags: {
        assessment_completed: false,
        nuria_trauma_score: 0,
        promised_obedience: false,
        voluntary_relock_count: 0,
      },
      penalty_queue: penalties
        .filter(isLegacyPenalty)
        .filter((p) => p.status === 'pending' || (!p.status && (p.duration ?? 0) > 0))
        .map((p) => ({
          minutes: p.duration ?? 0,
          enqueuedAt: Date.now(),
          retries: 0,
        })),
    },
    chat_history: chatHistory,
  };
}
