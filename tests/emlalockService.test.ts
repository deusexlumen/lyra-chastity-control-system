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

    const result = await queuePenalty(profile, 'user:pass', 60, async () => {
      throw new Error('timeout');
    });

    assert.equal(result.success, false);
    assert.equal(result.profile.penalty_queue.length, 1);
    assert.equal(result.profile.penalty_queue[0].minutes, 60);
  });

  it('does not queue a penalty on success', async () => {
    const profile = baseProfile();
    const result = await queuePenalty(profile, 'user:pass', 60, mockFetch(true));

    assert.equal(result.success, true);
    assert.equal(result.profile.penalty_queue.length, 0);
  });

  it('processes queued penalties', async () => {
    const profile = baseProfile([{ minutes: 30, enqueuedAt: Date.now(), retries: 0 }]);

    let calls = 0;
    const result = await processQueue(profile, 'user:pass', async () => {
      calls++;
      return { ok: true, json: async () => ({}) };
    });

    assert.equal(calls, 1);
    assert.equal(result.penalty_queue.length, 0);
  });

  it('applies positive penalties (addrandom) with seconds', async () => {
    let url = '';
    const result = await applyPenalty(60, 'user:pass', async (u) => {
      url = u;
      return { ok: true, json: async () => ({}) };
    });

    assert.equal(result, true);
    assert.ok(url.includes('addrandom'));
    assert.ok(url.includes('from=3600'));
    assert.ok(url.includes('to=3600'));
  });

  it('applies negative penalties (time reduction)', async () => {
    let url = '';
    const result = await applyPenalty(-120, 'user:pass', async (u) => {
      url = u;
      return { ok: true, json: async () => ({}) };
    });

    assert.equal(result, true);
    assert.ok(url.includes('removesessiontime'));
    assert.ok(url.includes('from=7200'));
  });

  it('returns false when API response body contains an error', async () => {
    const result = await applyPenalty(30, 'user:pass', mockFetch(true, { error: 'invalid api key' }));
    assert.equal(result, false);
  });

  it('returns false for invalid keys', async () => {
    const result = await applyPenalty(30, 'invalid', mockFetch(true));
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
    await applyPenalty(10, 'us er:pa@ss#', async (u) => {
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
    const result = await processQueue(profile, 'user:pass', async () => {
      call++;
      return call === 2 ? { ok: true, json: async () => ({}) } : { ok: false, json: async () => ({}) };
    });

    assert.equal(result.penalty_queue.length, 2);
    assert.deepEqual(result.penalty_queue.map((i) => i.minutes), [10, 30]);
    assert.deepEqual(result.penalty_queue.map((i) => i.retries), [1, 1]);
  });

  it('increments retries on queue failure', async () => {
    const profile = baseProfile([{ minutes: 15, enqueuedAt: Date.now(), retries: 0 }]);
    const result = await processQueue(profile, 'user:pass', mockFetch(false));

    assert.equal(result.penalty_queue.length, 1);
    assert.equal(result.penalty_queue[0].retries, 1);
  });

  it('returns false for zero-minute penalties without calling fetch', async () => {
    let calls = 0;
    const result = await applyPenalty(0, 'user:pass', async () => {
      calls++;
      return { ok: true, json: async () => ({}) };
    });

    assert.equal(result, false);
    assert.equal(calls, 0);
  });

  it('drops queue items after MAX_RETRIES', async () => {
    const profile = baseProfile([
      { minutes: 5, enqueuedAt: Date.now(), retries: 2 },
      { minutes: 10, enqueuedAt: Date.now(), retries: 3 },
    ]);

    const result = await processQueue(profile, 'user:pass', mockFetch(false));

    assert.equal(result.penalty_queue.length, 1);
    assert.equal(result.penalty_queue[0].minutes, 5);
    assert.equal(result.penalty_queue[0].retries, 3);
  });
});
