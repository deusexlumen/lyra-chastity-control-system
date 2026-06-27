import type { UserProfile, PenaltyQueueItem } from '../types/engine.js';

export interface EmlalockResult {
  success: boolean;
  profile: UserProfile;
}

export type EmlalockApiCall = (url: string) => Promise<{ ok: boolean; json: () => Promise<unknown> }>;

export function parseEmlalockKeys(combined: string): { userid: string; apikey: string } | null {
  const [userid, apikey] = combined.split(':');
  if (!userid || !apikey) return null;
  return { userid, apikey };
}

export async function applyPenalty(
  minutes: number,
  keys: string,
  fetchImpl: EmlalockApiCall = fetch as EmlalockApiCall
): Promise<boolean> {
  const parsed = parseEmlalockKeys(keys);
  if (!parsed) return false;
  const durationSeconds = Math.abs(minutes) * 60;
  const operation = minutes >= 0 ? 'addrandom' : 'removesessiontime';
  const url = `https://api.emlalock.com/${operation}?userid=${parsed.userid}&apikey=${parsed.apikey}&from=${durationSeconds}&to=${durationSeconds}&text=Lyra_Core_Penalty`;
  try {
    const res = await fetchImpl(url);
    return res.ok;
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
    const success = await applyPenalty(item.minutes, keys, fetchImpl);
    if (!success) {
      remaining.push({ ...item, retries: item.retries + 1 });
    }
  }
  return { ...profile, penalty_queue: remaining };
}
