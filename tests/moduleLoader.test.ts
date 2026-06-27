import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { getModuleById, buildModulePrompt } from '../src/lib/moduleLoader.js';
import type { ModulesJson, UserProfile } from '../src/types/engine.js';

const sample: ModulesJson = {
  global_directives: { tone: 'You are Lyra.' },
  modules: [
    { id: 1, title: 'Intake', requirementPoints: 0, ai_prompt: 'Beginne... {compliance_points}' },
    { id: 2, title: 'Nuria', requirementPoints: 50, ai_prompt: 'Nutze Nuria... {flag:nuria_trauma_score}' },
  ],
};

describe('moduleLoader', () => {
  it('returns a module by id', () => {
    const mod = getModuleById(sample, 2);
    assert.equal(mod?.title, 'Nuria');
  });

  it('returns undefined for unknown id', () => {
    const mod = getModuleById(sample, 99);
    assert.equal(mod, undefined);
  });

  it('builds a prompt with state variables', () => {
    const profile: UserProfile = {
      compliance_points: 10,
      current_module_id: 1,
      lock_status: 'LOCKED',
      emlalock_session_id: 'x',
      story_flags: { nuria_trauma_score: 5 },
      penalty_queue: [],
    };
    const prompt = buildModulePrompt(sample, 1, profile);
    assert.ok(prompt.includes('You are Lyra.'));
    assert.ok(prompt.includes('Beginne...'));
    assert.ok(prompt.includes('10'));
  });

  it('injects flag variables', () => {
    const profile: UserProfile = {
      compliance_points: 0,
      current_module_id: 2,
      lock_status: 'LOCKED',
      emlalock_session_id: '',
      story_flags: { nuria_trauma_score: 5 },
      penalty_queue: [],
    };
    const prompt = buildModulePrompt(sample, 2, profile);
    assert.ok(prompt.includes('5'));
  });
});
