import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { queuePenalty, processQueue, applyPenalty, parseEmlalockKeys } from '../src/lib/emlalockService.js';
import type { UserProfile } from '../src/types/engine.js';

function mockFetch(ok: boolean, json: unknown = {}): () => Promise<{ ok: boolean; json: () => Promise<unknown> }> {
  return async () => ({ ok, json: async () => json });
}

function baseProfile(queue: UserProfile['penalty_queue'] = []): UserProfile {
  return {
    compliance_points: 0,
    current_module_id: 1,
    lock_status: 'LOCKED',
    emlalock_session_id: 'session_123',
    story_flags: {},
    penalty_queue: queue,
  };
}

describe('emlalockService', () => {
  it('queues a penalty when API fails', async () => {
    const profile = baseProfile();

    const result = await queuePenalty(profile, 'user:pass', 60, undefined, async () => {
      throw new Error('timeout');
    });

    assert.equal(result.success, false);
    assert.equal(result.profile.penalty_queue.length, 1);
    assert.equal(result.profile.penalty_queue[0].minutes, 60);
  });

  it('does not queue a penalty on success', async () => {
    const profile = baseProfile();
    const result = await queuePenalty(profile, 'user:pass', 60, undefined, mockFetch(true));

    assert.equal(result.success, true);
    assert.equal(result.profile.penalty_queue.length, 0);
  });

  it('processes queued penalties', async () => {
    const profile = baseProfile([{ minutes: 30, enqueuedAt: Date.now(), retries: 0 }]);

    let calls = 0;
    const result = await processQueue(profile, 'user:pass', undefined, async () => {
      calls++;
      return { ok: true, json: async () => ({}) };
    });

    assert.equal(calls, 2);
    assert.equal(result.penalty_queue.length, 0);
  });

  it('applies positive penalties by adding duration and maximum time', async () => {
    const urls: string[] = [];
    const result = await applyPenalty(60, 'user:pass', undefined, async (u) => {
      urls.push(u);
      return { ok: true, json: async () => ({}) };
    });

    assert.equal(result, true);
    assert.equal(urls.length, 2);
    assert.ok(urls[0].includes('addrandom'));
    assert.ok(urls[0].includes('from=3600'));
    assert.ok(urls[0].includes('to=3600'));
    assert.ok(urls[1].includes('addmaximum'));
    assert.ok(urls[1].includes('value=3600'));
  });

  it('returns false when maximum-time call fails', async () => {
    let call = 0;
    const result = await applyPenalty(10, 'user:pass', undefined, async () => {
      call++;
      return call === 1
        ? { ok: true, json: async () => ({}) }
        : { ok: false, json: async () => ({}) };
    });

    assert.equal(result, false);
    assert.equal(call, 2);
  });

  it('applies negative penalties via /sub with holder key', async () => {
    let url = '';
    const result = await applyPenalty(-120, 'user:pass', 'holder123', async (u) => {
      url = u;
      return { ok: true, json: async () => ({}) };
    });

    assert.equal(result, true);
    assert.ok(url.includes('/sub'));
    assert.ok(url.includes('holderapikey=holder123'));
    assert.ok(url.includes('value=7200'));
  });

  it('returns false for negative penalties without holder key', async () => {
    let calls = 0;
    const result = await applyPenalty(-30, 'user:pass', undefined, async () => {
      calls++;
      return { ok: true, json: async () => ({}) };
    });

    assert.equal(result, false);
    assert.equal(calls, 0);
  });

  it('returns false when API response body contains an error', async () => {
    const result = await applyPenalty(30, 'user:pass', undefined, mockFetch(true, { error: 'invalid api key' }));
    assert.equal(result, false);
  });

  it('returns false for invalid keys', async () => {
    const result = await applyPenalty(30, 'invalid', undefined, mockFetch(true));
    assert.equal(result, false);
  });

  it('parses combined Emlalock credentials', () => {
    assert.deepEqual(parseEmlalockKeys('user:pass'), { userid: 'user', apikey: 'pass' });
    assert.equal(parseEmlalockKeys('invalid'), null);
  });

  it('parses API keys containing colons', () => {
    assert.deepEqual(parseEmlalockKeys('user:key:with:colons'), { userid: 'user', apikey: 'key:with:colons' });
  });

  it('URL-encodes special characters in credentials', async () => {
    let url = '';
    await applyPenalty(10, 'us er:pa@ss#', undefined, async (u) => {
      url = u;
      return { ok: true, json: async () => ({}) };
    });

    assert.ok(url.includes('userid=us%20er'));
    assert.ok(url.includes('apikey=pa%40ss%23'));
  });

  it('does not queue zero-minute penalties', async () => {
    const profile: UserProfile = {
      compliance_points: 0,
      current_module_id: 1,
      lock_status: 'LOCKED',
      emlalock_session_id: 'session_123',
      story_flags: {},
      penalty_queue: [],
    };
    const result = await queuePenalty(profile, 'user:pass', 0);
    assert.equal(result.success, false);
    assert.equal(result.profile.penalty_queue.length, 0);
  });

  it('processes queue with mixed success and failure', async () => {
    const profile = baseProfile([
      { minutes: 10, enqueuedAt: Date.now(), retries: 0 },
      { minutes: 20, enqueuedAt: Date.now(), retries: 0 },
      { minutes: 30, enqueuedAt: Date.now(), retries: 0 },
    ]);

    let call = 0;
    const result = await processQueue(profile, 'user:pass', undefined, async () => {
      call++;
      // Nur der zweite Queue-Eintrag (20 Min) muss beide Calls erfolgreich abschließen.
      return call === 2 || call === 3
        ? { ok: true, json: async () => ({}) }
        : { ok: false, json: async () => ({}) };
    });

    assert.equal(result.penalty_queue.length, 2);
    assert.deepEqual(result.penalty_queue.map((i) => i.minutes), [10, 30]);
    assert.deepEqual(result.penalty_queue.map((i) => i.retries), [1, 1]);
  });

  it('increments retries on queue failure', async () => {
    const profile = baseProfile([{ minutes: 15, enqueuedAt: Date.now(), retries: 0 }]);
    const result = await processQueue(profile, 'user:pass', undefined, mockFetch(false));

    assert.equal(result.penalty_queue.length, 1);
    assert.equal(result.penalty_queue[0].retries, 1);
  });

  it('returns false for zero-minute penalties without calling fetch', async () => {
    let calls = 0;
    const result = await applyPenalty(0, 'user:pass', undefined, async () => {
      calls++;
      return { ok: true, json: async () => ({}) };
    });

    assert.equal(result, false);
    assert.equal(calls, 0);
  });

  it('keeps failed queue items indefinitely', async () => {
    const profile = baseProfile([
      { minutes: 5, enqueuedAt: Date.now(), retries: 10 },
      { minutes: 10, enqueuedAt: Date.now(), retries: 99 },
    ]);

    const result = await processQueue(profile, 'user:pass', undefined, mockFetch(false));

    assert.equal(result.penalty_queue.length, 2);
    assert.equal(result.penalty_queue[0].minutes, 5);
    assert.equal(result.penalty_queue[0].retries, 11);
    assert.equal(result.penalty_queue[1].minutes, 10);
    assert.equal(result.penalty_queue[1].retries, 100);
  });

  it('skips zero-minute queue items', async () => {
    const profile = baseProfile([
      { minutes: 0, enqueuedAt: Date.now(), retries: 0 },
      { minutes: 10, enqueuedAt: Date.now(), retries: 0 },
    ]);

    let calls = 0;
    const result = await processQueue(profile, 'user:pass', undefined, async () => {
      calls++;
      return { ok: false, json: async () => ({}) };
    });

    assert.equal(calls, 1);
    assert.equal(result.penalty_queue.length, 1);
    assert.equal(result.penalty_queue[0].minutes, 10);
    assert.equal(result.penalty_queue[0].retries, 1);
  });
});
