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

async function callEmlalock(fetchImpl: EmlalockApiCall, url: string): Promise<boolean> {
  try {
    const res = await fetchImpl(url);
    if (!res.ok) return false;
    const body = await res.json();
    return !isEmlalockError(body);
  } catch {
    return false;
  }
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
  holderKey?: string,
  fetchImpl: EmlalockApiCall = async (url) => {
    const res = await fetch(url);
    return { ok: res.ok, json: () => res.json() as Promise<unknown> };
  }
): Promise<boolean> {
  if (minutes === 0) return false;

  const parsed = parseEmlalockKeys(keys);
  if (!parsed) return false;

  const durationSeconds = Math.abs(minutes) * 60;
  const encodedUserId = encodeURIComponent(parsed.userid);
  const encodedApiKey = encodeURIComponent(parsed.apikey);
  const text = encodeURIComponent('Lyra_Core_Penalty');
  const baseParams = `userid=${encodedUserId}&apikey=${encodedApiKey}`;

  if (minutes > 0) {
    const addUrl = `https://api.emlalock.com/addrandom?${baseParams}&from=${durationSeconds}&to=${durationSeconds}&text=${text}`;
    const maxUrl = `https://api.emlalock.com/addmaximum?${baseParams}&value=${durationSeconds}`;
    return (await callEmlalock(fetchImpl, addUrl)) && (await callEmlalock(fetchImpl, maxUrl));
  }

  if (!holderKey) return false;
  const subUrl = `https://api.emlalock.com/sub?${baseParams}&holderapikey=${encodeURIComponent(holderKey)}&value=${durationSeconds}&text=${text}`;
  return callEmlalock(fetchImpl, subUrl);
}

export async function queuePenalty(
  profile: UserProfile,
  keys: string,
  minutes: number,
  holderKey?: string,
  fetchImpl?: EmlalockApiCall
): Promise<EmlalockResult> {
  if (minutes === 0) return { success: false, profile };
  const success = await applyPenalty(minutes, keys, holderKey, fetchImpl);
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
  holderKey?: string,
  fetchImpl?: EmlalockApiCall
): Promise<UserProfile> {
  const remaining: PenaltyQueueItem[] = [];
  for (const item of profile.penalty_queue) {
    if (item.minutes === 0) continue;
    const success = await applyPenalty(item.minutes, keys, holderKey, fetchImpl);
    if (!success) {
      remaining.push({ ...item, retries: item.retries + 1 });
    }
  }
  return { ...profile, penalty_queue: remaining };
}
