import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import {
  loadModules,
  getModules,
  getModuleById,
  buildModulePrompt,
} from '../src/lib/moduleLoader.js';
import type { ModulesJson, UserProfile, MilestonesJson } from '../src/types/engine.js';

const sample: ModulesJson = {
  global_directives: { tone: 'You are Lyra.' },
  modules: [
    { id: 1, title: 'Intake', requirementPoints: 0, ai_prompt: 'Beginne... {compliance_points}' },
    { id: 2, title: 'Nuria', requirementPoints: 50, ai_prompt: 'Nutze Nuria... {flag:nuria_trauma_score}' },
  ],
};

const baseProfile: UserProfile = {
  compliance_points: 10,
  current_module_id: 1,
  lock_status: 'LOCKED',
  emlalock_session_id: '',
  story_flags: {},
  penalty_queue: [],
};

const emptyMilestones: MilestonesJson = { milestones: [] };

describe('moduleLoader', () => {
  it('throws when getModules is called before loadModules', () => {
    assert.throws(() => getModules(), /Modules not loaded/);
  });

  it('loads modules from a temporary file', async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'lyra-modules-'));
    const tempFile = path.join(tempDir, `modules-${crypto.randomUUID()}.json`);
    await fs.writeFile(tempFile, JSON.stringify(sample), 'utf-8');

    try {
      const loaded = await loadModules(tempFile);
      assert.deepEqual(loaded, sample);
      assert.strictEqual(getModules(), loaded);
    } finally {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  });

  it('returns cached modules via getModules after loading', () => {
    const cached = getModules();
    assert.deepEqual(cached, sample);
  });

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
      ...baseProfile,
      story_flags: { nuria_trauma_score: 5 },
    };
    const prompt = buildModulePrompt(sample, emptyMilestones, 1, profile);
    assert.ok(prompt.includes('You are Lyra.'));
    assert.ok(prompt.includes('Beginne...'));
    assert.ok(prompt.includes('10'));
  });

  it('injects flag variables', () => {
    const profile: UserProfile = {
      ...baseProfile,
      current_module_id: 2,
      story_flags: { nuria_trauma_score: 5 },
    };
    const prompt = buildModulePrompt(sample, emptyMilestones, 2, profile);
    assert.ok(prompt.includes('5'));
  });

  it('throws when module id is not found for prompt building', () => {
    const profile: UserProfile = { ...baseProfile };
    assert.throws(() => buildModulePrompt(sample, emptyMilestones, 99, profile), /Module 99 not found/);
  });

  it('builds a prompt without tone when global_directives.tone is absent', () => {
    const modulesWithoutTone: ModulesJson = {
      global_directives: {},
      modules: [
        { id: 1, title: 'Intake', requirementPoints: 0, ai_prompt: 'Prompt text.' },
      ],
    };
    const prompt = buildModulePrompt(modulesWithoutTone, emptyMilestones, 1, baseProfile);
    assert.ok(!prompt.includes('You are Lyra.'));
    assert.ok(prompt.includes('Prompt text.'));
    assert.equal(prompt.startsWith('\n\n'), true);
  });

  it('replaces missing flag keys with an empty string', () => {
    const modulesWithMissingFlag: ModulesJson = {
      modules: [
        {
          id: 1,
          title: 'Intake',
          requirementPoints: 0,
          ai_prompt: 'Value: [{flag:missing}]',
        },
      ],
    };
    const prompt = buildModulePrompt(modulesWithMissingFlag, emptyMilestones, 1, baseProfile);
    assert.ok(prompt.includes('Value: []'));
    assert.ok(!prompt.includes('flag:missing'));
  });

  it('throws when modules.json does not contain a modules array', async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'lyra-modules-'));
    const tempFile = path.join(tempDir, `invalid-${crypto.randomUUID()}.json`);
    await fs.writeFile(tempFile, JSON.stringify({ notModules: true }), 'utf-8');

    try {
      await assert.rejects(loadModules(tempFile), /Invalid modules\.json/);
    } finally {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  });
});
