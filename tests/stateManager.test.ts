import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs/promises';
import path from 'path';
import { readDB, writeDB, initDB, migrateLegacyState } from '../src/lib/stateManager.js';

const TEST_DB_PATH = path.join(process.cwd(), 'test_local_db.json');

async function cleanup() {
  try { await fs.unlink(TEST_DB_PATH); } catch { /* ignore */ }
}

describe('stateManager', () => {
  beforeEach(cleanup);

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
