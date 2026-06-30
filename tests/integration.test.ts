import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseActions } from '../src/lib/actionParser.js';
import { queuePenalty, applyPenalty } from '../src/lib/emlalockService.js';
import type { UserProfile } from '../src/types/engine.js';

function createProfile(overrides: Partial<UserProfile> = {}): UserProfile {
  return {
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
    active_video_url: null,
    ...overrides,
  };
}

describe('V3.1 integration scenarios', () => {
  it('Test 1: Module Transition', () => {
    const profile = createProfile({ current_module_id: 1 });
    const aiResponse = '[ACTION: SET_MODULE=2][ACTION: SET_FLAG=assessment_completed:true]Du hast das Assessment bestanden. Willkommen in der nächsten Phase.';

    const actions = parseActions(aiResponse);
    assert.equal(actions.cleanText, 'Du hast das Assessment bestanden. Willkommen in der nächsten Phase.');
    assert.equal(actions.setModule, 2);
    assert.deepEqual(actions.setFlags, [{ key: 'assessment_completed', value: true }]);

    let next = { ...profile, current_module_id: actions.setModule ?? profile.current_module_id };
    for (const flag of actions.setFlags) {
      next = { ...next, story_flags: { ...next.story_flags, [flag.key]: flag.value } };
    }

    assert.equal(next.current_module_id, 2);
    assert.equal(next.story_flags.assessment_completed, true);
  });

  it('Test 2: Offline Queue for Emlalock', async () => {
    const profile = createProfile();
    const aiResponse = '[ACTION: PENALTY_MINUTES=60]Du wirst für dein Zögern bestraft.';

    const actions = parseActions(aiResponse);
    assert.equal(actions.cleanText, 'Du wirst für dein Zögern bestraft.');
    assert.deepEqual(actions.penalties, [60]);

    const failingFetch = async () => {
      throw new Error('timeout');
    };

    const result = await queuePenalty(profile, 'user:key', actions.penalties[0], undefined, failingFetch);
    assert.equal(result.success, false);
    assert.equal(result.profile.penalty_queue.length, 1);
    assert.equal(result.profile.penalty_queue[0].minutes, 60);
    assert.equal(result.profile.penalty_queue[0].retries, 0);
  });

  it('Test 3: Negotiation Trap emits correct Emlalock payload', async () => {
    const aiResponse = '[ACTION: PENALTY_MINUTES=360]Wortbruch wird teuer bezahlt.';

    const actions = parseActions(aiResponse);
    assert.equal(actions.cleanText, 'Wortbruch wird teuer bezahlt.');
    assert.deepEqual(actions.penalties, [360]);

    const capturedUrls: string[] = [];
    const mockFetch: Parameters<typeof applyPenalty>[3] = async (url) => {
      capturedUrls.push(url);
      return { ok: true, json: async () => ({}) };
    };

    const success = await applyPenalty(actions.penalties[0], 'tdhml0y4aw8ru8o:3c5ldeqqsh', undefined, mockFetch);
    assert.equal(success, true);
    assert.equal(capturedUrls.length, 2);
    assert.match(capturedUrls[0], /api\.emlalock\.com\/addrandom/);
    assert.match(capturedUrls[0], /from=21600/);
    assert.match(capturedUrls[0], /to=21600/);
    assert.match(capturedUrls[1], /api\.emlalock\.com\/addmaximum/);
    assert.match(capturedUrls[1], /value=21600/);
  });
});
