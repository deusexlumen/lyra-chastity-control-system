import { describe, it, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs/promises';
import path from 'path';
import { readDB, writeDB, initDB, migrateLegacyState } from '../src/lib/stateManager.js';
import type { DatabaseState } from '../src/types/engine.js';

const TEST_DB_PATH = path.join(process.cwd(), 'test_local_db.json');

async function cleanup() {
  try { await fs.unlink(TEST_DB_PATH); } catch { /* ignore */ }
}

describe('stateManager', () => {
  beforeEach(cleanup);
  after(cleanup);

  it('initDB creates a default V3 profile', async () => {
    await initDB(TEST_DB_PATH);
    const db = await readDB(TEST_DB_PATH);
    assert.equal(db.user_profile.current_module_id, 1);
    assert.equal(db.user_profile.lock_status, 'LOCKED');
    assert.equal(db.user_profile.story_flags.assessment_completed, false);
    assert.ok(Array.isArray(db.user_profile.penalty_queue));
  });

  it('migrates legacy state to V3 profile', () => {
    const legacy = {
      setupComplete: true,
      state: {
        points: 75,
        currentPhase: 2,
        loopCycle: 1,
        chatHistory: [],
        penalties: []
      }
    };
    const migrated = migrateLegacyState(legacy);
    assert.equal(migrated.user_profile.compliance_points, 75);
    assert.equal(migrated.user_profile.current_module_id, 2);
    assert.equal(migrated.chat_history.length, 0);
  });

  it('falls back to state.module when state.currentPhase is missing', () => {
    const legacy = {
      state: {
        module: 4,
        chatHistory: []
      }
    };
    const migrated = migrateLegacyState(legacy);
    assert.equal(migrated.user_profile.current_module_id, 4);
  });

  it('maps chastityStatus free to UNLOCKED', () => {
    const legacy = {
      state: {
        chastityStatus: 'free',
        chatHistory: []
      }
    };
    const migrated = migrateLegacyState(legacy);
    assert.equal(migrated.user_profile.lock_status, 'UNLOCKED');
  });

  it('migrates only pending legacy penalties to penalty_queue', () => {
    const legacy = {
      state: {
        chatHistory: [],
        penalties: [
          { duration: 10, status: 'pending' },
          { duration: 20 },
          { duration: 0, status: 'applied' },
          { duration: 30, status: 'success' },
          { duration: 40, status: 'error' }
        ]
      }
    };
    const migrated = migrateLegacyState(legacy);
    assert.equal(migrated.user_profile.penalty_queue.length, 2);
    assert.equal(migrated.user_profile.penalty_queue[0].minutes, 10);
    assert.equal(migrated.user_profile.penalty_queue[1].minutes, 20);
    assert.equal(migrated.user_profile.penalty_queue[0].retries, 0);
    assert.ok(typeof migrated.user_profile.penalty_queue[0].enqueuedAt === 'number');
  });

  it('empty object falls into legacy migration', () => {
    const migrated = migrateLegacyState({});
    assert.equal(migrated.user_profile.current_module_id, 1);
    assert.equal(migrated.user_profile.lock_status, 'LOCKED');
    assert.equal(migrated.user_profile.compliance_points, 0);
    assert.deepEqual(migrated.chat_history, []);
  });

  it('initDB does not overwrite existing file', async () => {
    const existing: DatabaseState = {
      user_profile: {
        compliance_points: 99,
        current_module_id: 3,
        lock_status: 'LOCKED',
        emlalock_session_id: '',
        story_flags: {
          assessment_completed: true,
          nuria_trauma_score: 0,
          promised_obedience: false,
          voluntary_relock_count: 0
        },
        penalty_queue: []
      },
      chat_history: []
    };
    await writeDB(TEST_DB_PATH, existing);
    const db = await initDB(TEST_DB_PATH);
    assert.equal(db.user_profile.compliance_points, 99);
    assert.equal(db.user_profile.current_module_id, 3);
  });

  it('readDB throws on invalid JSON', async () => {
    await fs.writeFile(TEST_DB_PATH, '{ invalid json');
    await assert.rejects(() => readDB(TEST_DB_PATH), /JSON/);
  });

  it('readDB throws on null JSON content', async () => {
    await fs.writeFile(TEST_DB_PATH, 'null');
    await assert.rejects(() => readDB(TEST_DB_PATH), /Invalid database state/);
  });

  it('readDB throws on string JSON content', async () => {
    await fs.writeFile(TEST_DB_PATH, JSON.stringify('foo'));
    await assert.rejects(() => readDB(TEST_DB_PATH), /Invalid database state/);
  });

  it('readDB throws on array JSON content', async () => {
    await fs.writeFile(TEST_DB_PATH, JSON.stringify([]));
    await assert.rejects(() => readDB(TEST_DB_PATH), /Invalid database state/);
  });

  it('readDB throws on corrupted V3 state missing required fields', async () => {
    const corrupted = {
      user_profile: {
        compliance_points: 0
        // missing current_module_id, lock_status, etc.
      },
      chat_history: []
    };
    await fs.writeFile(TEST_DB_PATH, JSON.stringify(corrupted));
    await assert.rejects(() => readDB(TEST_DB_PATH), /Invalid database state/);
  });

  it('readDB throws on invalid lock_status', async () => {
    const corrupted: DatabaseState = {
      user_profile: {
        compliance_points: 0,
        current_module_id: 1,
        lock_status: 'INVALID' as 'LOCKED',
        emlalock_session_id: '',
        story_flags: {
          assessment_completed: false,
          nuria_trauma_score: 0,
          promised_obedience: false,
          voluntary_relock_count: 0
        },
        penalty_queue: []
      },
      chat_history: []
    };
    await fs.writeFile(TEST_DB_PATH, JSON.stringify(corrupted));
    await assert.rejects(() => readDB(TEST_DB_PATH), /Invalid database state/);
  });

  it('readDB throws on malformed nested penalty_queue', async () => {
    const corrupted = {
      user_profile: {
        compliance_points: 0,
        current_module_id: 1,
        lock_status: 'LOCKED',
        emlalock_session_id: '',
        story_flags: {
          assessment_completed: false,
          nuria_trauma_score: 0,
          promised_obedience: false,
          voluntary_relock_count: 0
        },
        penalty_queue: [{ minutes: 'ten', enqueuedAt: Date.now(), retries: 0 }]
      },
      chat_history: []
    };
    await fs.writeFile(TEST_DB_PATH, JSON.stringify(corrupted));
    await assert.rejects(() => readDB(TEST_DB_PATH), /Invalid database state/);
  });

  it('readDB returns default state when file does not exist', async () => {
    await cleanup();
    const db = await readDB(TEST_DB_PATH);
    assert.equal(db.user_profile.current_module_id, 1);
  });

  it('writeDB persists state', async () => {
    const db = await initDB(TEST_DB_PATH);
    db.user_profile.compliance_points = 42;
    await writeDB(TEST_DB_PATH, db);
    const loaded = await readDB(TEST_DB_PATH);
    assert.equal(loaded.user_profile.compliance_points, 42);
  });
});
