import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { queuePenalty, processQueue, applyPenalty, parseEmlalockKeys } from '../src/lib/emlalockService.js';
import type { UserProfile } from '../src/types/engine.js';

function mockFetch(ok: boolean, json: unknown = {}): () => Promise<{ ok: boolean; json: () => Promise<unknown> }> {
  return async () => ({ ok, json: async () => json });
}

describe('emlalockService', () => {
  it('queues a penalty when API fails', async () => {
    const profile: UserProfile = {
      compliance_points: 0,
      current_module_id: 1,
      lock_status: 'LOCKED',
      emlalock_session_id: 'session_123',
      story_flags: {},
      penalty_queue: [],
    };

    const result = await queuePenalty(profile, 'user:pass', 60, async () => {
      throw new Error('timeout');
    });

    assert.equal(result.success, false);
    assert.equal(result.profile.penalty_queue.length, 1);
    assert.equal(result.profile.penalty_queue[0].minutes, 60);
  });

  it('processes queued penalties', async () => {
    const profile: UserProfile = {
      compliance_points: 0,
      current_module_id: 1,
      lock_status: 'LOCKED',
      emlalock_session_id: 'session_123',
      story_flags: {},
      penalty_queue: [{ minutes: 30, enqueuedAt: Date.now(), retries: 0 }],
    };

    let calls = 0;
    const result = await processQueue(profile, 'user:pass', async () => {
      calls++;
      return { ok: true, json: async () => ({}) };
    });

    assert.equal(calls, 1);
    assert.equal(result.penalty_queue.length, 0);
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

  it('returns false for invalid keys', async () => {
    const result = await applyPenalty(30, 'invalid', mockFetch(true));
    assert.equal(result, false);
  });

  it('parses combined Emlalock credentials', () => {
    assert.deepEqual(parseEmlalockKeys('user:pass'), { userid: 'user', apikey: 'pass' });
    assert.equal(parseEmlalockKeys('invalid'), null);
  });
});
