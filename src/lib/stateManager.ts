import fs from 'fs/promises';
import type { DatabaseState, UserProfile } from '../types/engine.js';

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

export async function readDB(dbPath: string): Promise<DatabaseState> {
  try {
    const data = await fs.readFile(dbPath, 'utf-8');
    const parsed = JSON.parse(data);
    if (isValidDatabaseState(parsed)) return parsed;
    if (parsed.user_profile === undefined) return migrateLegacyState(parsed);
    throw new Error('Invalid V3 database state shape');
  } catch (err: any) {
    if (err.code === 'ENOENT') {
      return { user_profile: { ...DEFAULT_PROFILE }, chat_history: [] };
    }
    throw err;
  }
}

export async function writeDB(dbPath: string, db: DatabaseState): Promise<void> {
  await fs.writeFile(dbPath, JSON.stringify(db, null, 2));
}

export function isValidDatabaseState(parsed: any): parsed is DatabaseState {
  if (!parsed || typeof parsed !== 'object') return false;
  if (!parsed.user_profile || typeof parsed.user_profile !== 'object') return false;
  if (typeof parsed.user_profile.compliance_points !== 'number') return false;
  if (!Array.isArray(parsed.chat_history)) return false;
  return true;
}

export async function initDB(dbPath: string): Promise<DatabaseState> {
  try {
    await fs.access(dbPath);
    return readDB(dbPath);
  } catch (err: any) {
    if (err.code !== 'ENOENT') throw err;
    const db: DatabaseState = { user_profile: { ...DEFAULT_PROFILE }, chat_history: [] };
    await writeDB(dbPath, db);
    return db;
  }
}

export function migrateLegacyState(legacy: any): DatabaseState {
  const state = legacy.state || {};
  return {
    user_profile: {
      compliance_points: state.points || 0,
      current_module_id: state.currentPhase || state.module || 1,
      lock_status: state.chastityStatus === 'free' ? 'UNLOCKED' : 'LOCKED',
      emlalock_session_id: '',
      story_flags: {
        assessment_completed: false,
        nuria_trauma_score: 0,
        promised_obedience: false,
        voluntary_relock_count: 0,
      },
      penalty_queue: (state.penalties || [])
        .filter((p: any) => p?.status === 'pending' || p?.duration)
        .map((p: any) => ({
          minutes: p.duration || 0,
          enqueuedAt: Date.now(),
          retries: 0,
        })),
    },
    chat_history: state.chatHistory || [],
  };
}
