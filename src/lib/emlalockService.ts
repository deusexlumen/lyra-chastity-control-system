import type { UserProfile, PenaltyQueueItem } from '../types/engine.js';

export interface EmlalockResult {
  success: boolean;
  profile: UserProfile;
}

export type EmlalockApiCall = (url: string) => Promise<{ ok: boolean; json: () => Promise<unknown> }>;

function isEmlalockError(body: unknown): boolean {
  if (typeof body !== 'object' || body === null) return false;
  return 'error' in body && (body as Record<string, unknown>).error !== undefined;
}

export function parseEmlalockKeys(combined: string): { userid: string; apikey: string } | null {
  const separatorIndex = combined.indexOf(':');
  if (separatorIndex === -1) return null;
  const userid = combined.slice(0, separatorIndex);
  const apikey = combined.slice(separatorIndex + 1);
  if (!userid || !apikey) return null;
  return { userid, apikey };
}

export async function applyPenalty(
  minutes: number,
  keys: string,
  fetchImpl: EmlalockApiCall = async (url) => {
    const res = await fetch(url);
    return { ok: res.ok, json: () => res.json() as Promise<unknown> };
  }
): Promise<boolean> {
  if (minutes === 0) return false;

  const parsed = parseEmlalockKeys(keys);
  if (!parsed) return false;

  const durationSeconds = Math.abs(minutes) * 60;
  const operation = minutes >= 0 ? 'addrandom' : 'removesessiontime';
  const url = `https://api.emlalock.com/${operation}?userid=${encodeURIComponent(parsed.userid)}&apikey=${encodeURIComponent(parsed.apikey)}&from=${durationSeconds}&to=${durationSeconds}&text=Lyra_Core_Penalty`;

  try {
    const res = await fetchImpl(url);
    if (!res.ok) return false;

    const body = await res.json();
    if (isEmlalockError(body)) return false;

    return true;
  } catch {
    return false;
  }
}

export async function queuePenalty(
  profile: UserProfile,
  keys: string,
  minutes: number,
  fetchImpl?: EmlalockApiCall
): Promise<EmlalockResult> {
  if (minutes === 0) return { success: false, profile };
  const success = await applyPenalty(minutes, keys, fetchImpl);
  if (success) return { success: true, profile };

  const item: PenaltyQueueItem = {
    minutes,
    enqueuedAt: Date.now(),
    retries: 0,
  };
  return {
    success: false,
    profile: {
      ...profile,
      penalty_queue: [...profile.penalty_queue, item],
    },
  };
}

export async function processQueue(
  profile: UserProfile,
  keys: string,
  fetchImpl?: EmlalockApiCall
): Promise<UserProfile> {
  const remaining: PenaltyQueueItem[] = [];
  for (const item of profile.penalty_queue) {
    if (item.minutes === 0) continue;
    const success = await applyPenalty(item.minutes, keys, fetchImpl);
    if (!success) {
      remaining.push({ ...item, retries: item.retries + 1 });
    }
  }
  return { ...profile, penalty_queue: remaining };
}
