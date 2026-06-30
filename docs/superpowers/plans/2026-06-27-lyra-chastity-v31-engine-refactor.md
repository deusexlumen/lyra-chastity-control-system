# Lyra Chastity V3.1 Engine Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor the backend into a strict Engine/Content architecture where `modules.json` drives narrative, action tags control state, penalties are queued for Emlalock, and forced media is handled by the frontend.

**Architecture:** Split `server.ts` into focused units: an action parser, state manager, Emlalock queue processor, and route handlers. Keep all narrative content in `modules.json` and media references in `content_manifest.json`. Use `node:test` for unit tests.

**Tech Stack:** TypeScript, Node.js 20+, Express 5, `@google/genai`, native `node:test`/`assert`.

---

## File Structure

| File | Responsibility |
|------|----------------|
| `src/types/types.ts` | Shared frontend/backend TypeScript interfaces. |
| `src/types/engine.ts` | Engine-specific types (`UserProfile`, `Module`, `ActionTag`, etc.). |
| `src/lib/actionParser.ts` | Regex-based parser for AI action tags. |
| `src/lib/stateManager.ts` | Read/write/migrate `local_db.json`. |
| `src/lib/emlalockService.ts` | Emlalock API calls and offline penalty queue. |
| `src/lib/moduleLoader.ts` | Load and query `modules.json`. |
| `server.ts` | Express routes and wiring. |
| `src/data/modules.json` | V3.1 narrative modules. |
| `src/data/content_manifest.json` | Media references (kept separate). |
| `src/components/ForcedMediaOverlay.tsx` | Full-screen unskippable media player. |
| `src/App.tsx` | Module indicator, lock status, forced-media orchestration. |
| `tests/*.test.ts` | Unit and integration tests with `node:test`. |

---

### Task 1: Add Engine Types

**Files:**
- Create: `src/types/engine.ts`
- Modify: `src/types/types.ts`

- [ ] **Step 1: Create `src/types/engine.ts`**

```typescript
export type LockStatus = 'LOCKED' | 'UNLOCKED';

export interface StoryFlags {
  assessment_completed?: boolean;
  nuria_trauma_score?: number;
  promised_obedience?: boolean;
  voluntary_relock_count?: number;
  [key: string]: boolean | number | undefined;
}

export interface PenaltyQueueItem {
  minutes: number;
  enqueuedAt: number;
  retries: number;
}

export interface UserProfile {
  compliance_points: number;
  current_module_id: number;
  lock_status: LockStatus;
  emlalock_session_id: string;
  story_flags: StoryFlags;
  penalty_queue: PenaltyQueueItem[];
}

export interface ChatMessage {
  role: 'User' | 'Lyra';
  content: string;
  attachment?: { name: string; type: string; content: string };
  media?: string | null;
  voiceUrl?: string | null;
}

export interface DatabaseState {
  user_profile: UserProfile;
  chat_history: ChatMessage[];
}

export interface MediaTrigger {
  entry_media?: string;
  compliance_gifs?: string;
  relock_sweet_poison?: string;
  relock_love_letter_threat?: string;
  [key: string]: string | undefined;
}

export interface Module {
  id: number;
  title: string;
  requirementPoints: number;
  ai_prompt: string;
  media_triggers?: MediaTrigger;
}

export interface ModulesJson {
  global_directives?: {
    tone?: string;
  };
  modules: Module[];
}

export interface ParsedActions {
  setModule: number | null;
  setFlags: Array<{ key: string; value: boolean | number }>;
  penalties: number[];
  forceMedia: Array<{ category: string; index: string }>;
  cleanText: string;
}
```

- [ ] **Step 2: Modify `src/types/types.ts`**

Replace the entire file content with:

```typescript
export type { ChatMessage, UserProfile, DatabaseState } from './engine';

export interface Penalty {
  id: string;
  duration: number;
  status: 'pending' | 'success' | 'error';
}

export interface ChatMessageAttachment {
  name: string;
  type: string;
  content: string;
}

export interface SetupState {
  setupComplete: boolean;
  keys: { gemini: string; emlalock: string; holder?: string };
  user_profile: import('./engine').UserProfile;
  chat_history: import('./engine').ChatMessage[];
  modules: import('./engine').ModulesJson;
  media?: { categories: string[] };
}
```

- [ ] **Step 3: Run TypeScript check**

Run: `npx tsc -b --noEmit`
Expected: PASS once `engine.ts` no longer references undefined types.

- [ ] **Step 4: Commit**

```bash
git add src/types/engine.ts src/types/types.ts
git commit -m "feat(types): add V3.1 engine types"
```

---

### Task 2: Implement Action Tag Parser

**Files:**
- Create: `src/lib/actionParser.ts`
- Create: `tests/actionParser.test.ts`

- [ ] **Step 1: Write the failing test in `tests/actionParser.test.ts`**

```typescript
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseActions } from '../src/lib/actionParser.js';

describe('parseActions', () => {
  it('parses SET_MODULE and SET_FLAG tags', () => {
    const input = 'Willkommen. [ACTION: SET_MODULE=2][ACTION: SET_FLAG=assessment_completed:true]';
    const result = parseActions(input);
    assert.equal(result.setModule, 2);
    assert.deepEqual(result.setFlags, [{ key: 'assessment_completed', value: true }]);
    assert.equal(result.cleanText, 'Willkommen.');
  });

  it('parses positive and negative penalties', () => {
    const input = 'Deal. [ACTION: PENALTY_MINUTES=-120] Später. [ACTION: PENALTY_MINUTES=360]';
    const result = parseActions(input);
    assert.deepEqual(result.penalties, [-120, 360]);
  });

  it('parses FORCE_MEDIA tags', () => {
    const input = 'Schau. [ACTION: FORCE_MEDIA=nuria_trigger:1]';
    const result = parseActions(input);
    assert.deepEqual(result.forceMedia, [{ category: 'nuria_trigger', index: '1' }]);
  });

  it('returns clean text without tags', () => {
    const input = 'Nur Text. [ACTION: SET_MODULE=3]';
    const result = parseActions(input);
    assert.equal(result.cleanText, 'Nur Text.');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test tests/actionParser.test.ts`
Expected: FAIL — `parseActions` is not defined or module not found.

- [ ] **Step 3: Create `src/lib/actionParser.ts`**

```typescript
import type { ParsedActions } from '../types/engine.js';

export function parseActions(rawText: string): ParsedActions {
  const result: ParsedActions = {
    setModule: null,
    setFlags: [],
    penalties: [],
    forceMedia: [],
    cleanText: rawText,
  };

  const setModuleMatch = rawText.match(/\[ACTION: SET_MODULE=(\d+)\]/g);
  if (setModuleMatch) {
    const last = setModuleMatch[setModuleMatch.length - 1];
    const m = last.match(/\[ACTION: SET_MODULE=(\d+)\]/);
    if (m) result.setModule = parseInt(m[1], 10);
  }

  const flagMatches = rawText.matchAll(/\[ACTION: SET_FLAG=([^:\]]+):([^\]]+)\]/g);
  for (const match of flagMatches) {
    const key = match[1].trim();
    const rawValue = match[2].trim();
    let value: boolean | number = rawValue;
    if (rawValue === 'true') value = true;
    else if (rawValue === 'false') value = false;
    else if (/^-?\d+$/.test(rawValue)) value = parseInt(rawValue, 10);
    result.setFlags.push({ key, value });
  }

  const penaltyMatches = rawText.matchAll(/\[ACTION: PENALTY_MINUTES=(-?\d+)\]/g);
  for (const match of penaltyMatches) {
    result.penalties.push(parseInt(match[1], 10));
  }

  const mediaMatches = rawText.matchAll(/\[ACTION: FORCE_MEDIA=([^:\]]+):([^\]]+)\]/g);
  for (const match of mediaMatches) {
    result.forceMedia.push({ category: match[1].trim(), index: match[2].trim() });
  }

  result.cleanText = rawText
    .replace(/\[ACTION: SET_MODULE=\d+\]/g, '')
    .replace(/\[ACTION: SET_FLAG=[^:\]]+:[^\]]+\]/g, '')
    .replace(/\[ACTION: PENALTY_MINUTES=-?\d+\]/g, '')
    .replace(/\[ACTION: FORCE_MEDIA=[^:\]]+:[^\]]+\]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  return result;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/actionParser.test.ts`
Expected: PASS for all four tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/actionParser.ts tests/actionParser.test.ts
git commit -m "feat(engine): add action tag parser with tests"
```

---

### Task 3: Implement State Manager

**Files:**
- Create: `src/lib/stateManager.ts`
- Create: `tests/stateManager.test.ts`

- [ ] **Step 1: Write the failing test in `tests/stateManager.test.ts`**

```typescript
import { describe, it, beforeEach } from 'node:test';
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
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tests/stateManager.test.ts`
Expected: FAIL — modules not found.

- [ ] **Step 3: Create `src/lib/stateManager.ts`**

```typescript
import fs from 'fs/promises';
import path from 'path';
import type { DatabaseState, UserProfile } from '../types/engine.js';

export const DEFAULT_PROFILE: UserProfile = {
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
};

export async function readDB(dbPath: string): Promise<DatabaseState> {
  try {
    const data = await fs.readFile(dbPath, 'utf-8');
    const parsed = JSON.parse(data);
    if (parsed.user_profile) return parsed as DatabaseState;
    return migrateLegacyState(parsed);
  } catch (err: any) {
    if (err.code === 'ENOENT') {
      return { user_profile: { ...DEFAULT_PROFILE }, chat_history: [] };
    }
    throw err;
  }
}

export async function writeDB(dbPath: string, db: DatabaseState): Promise<void> {
  await fs.writeFile(dbPath, JSON.stringify(db, null, 2));
}

export async function initDB(dbPath: string): Promise<DatabaseState> {
  try {
    await fs.access(dbPath);
    return readDB(dbPath);
  } catch {
    const db: DatabaseState = { user_profile: { ...DEFAULT_PROFILE }, chat_history: [] };
    await writeDB(dbPath, db);
    return db;
  }
}

export function migrateLegacyState(legacy: any): DatabaseState {
  const state = legacy.state || {};
  return {
    user_profile: {
      compliance_points: state.points || 0,
      current_module_id: state.currentPhase || state.module || 1,
      lock_status: state.chastityStatus === 'free' ? 'UNLOCKED' : 'LOCKED',
      emlalock_session_id: '',
      story_flags: {
        assessment_completed: false,
        nuria_trauma_score: 0,
        promised_obedience: false,
        voluntary_relock_count: 0,
      },
      penalty_queue: [],
    },
    chat_history: state.chatHistory || [],
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/stateManager.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/stateManager.ts tests/stateManager.test.ts
git commit -m "feat(engine): add state manager with V3 migration"
```

---

### Task 4: Implement Emlalock Service with Queue

**Files:**
- Create: `src/lib/emlalockService.ts`
- Create: `tests/emlalockService.test.ts`

- [ ] **Step 1: Write the failing test in `tests/emlalockService.test.ts`**

```typescript
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { queuePenalty, processQueue } from '../src/lib/emlalockService.js';
import type { UserProfile } from '../src/types/engine.js';

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
      return { ok: true, json: async () => ({}) } as any;
    });

    assert.equal(calls, 1);
    assert.equal(result.penalty_queue.length, 0);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tests/emlalockService.test.ts`
Expected: FAIL — modules not found.

- [ ] **Step 3: Create `src/lib/emlalockService.ts`**

```typescript
import type { UserProfile, PenaltyQueueItem } from '../types/engine.js';

export interface EmlalockResult {
  success: boolean;
  profile: UserProfile;
}

export type EmlalockApiCall = (url: string) => Promise<{ ok: boolean; json: () => Promise<any> }>;

export function parseEmlalockKeys(combined: string): { userid: string; apikey: string } | null {
  const [userid, apikey] = combined.split(':');
  if (!userid || !apikey) return null;
  return { userid, apikey };
}

export async function applyPenalty(
  minutes: number,
  keys: string,
  fetchImpl: EmlalockApiCall = fetch as any
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/emlalockService.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/emlalockService.ts tests/emlalockService.test.ts
git commit -m "feat(engine): add Emlalock service with offline queue"
```

---

### Task 5: Implement Module Loader

**Files:**
- Create: `src/lib/moduleLoader.ts`
- Create: `tests/moduleLoader.test.ts`

- [ ] **Step 1: Write the failing test in `tests/moduleLoader.test.ts`**

```typescript
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { getModuleById, buildModulePrompt } from '../src/lib/moduleLoader.js';
import type { ModulesJson, UserProfile } from '../src/types/engine.js';

const sample: ModulesJson = {
  global_directives: { tone: 'You are Lyra.' },
  modules: [
    { id: 1, title: 'Intake', requirementPoints: 0, ai_prompt: 'Beginne...' },
    { id: 2, title: 'Nuria', requirementPoints: 50, ai_prompt: 'Nutze Nuria...' },
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
      story_flags: { assessment_completed: false },
      penalty_queue: [],
    };
    const prompt = buildModulePrompt(sample, 1, profile);
    assert.ok(prompt.includes('You are Lyra.'));
    assert.ok(prompt.includes('Beginne...'));
    assert.ok(prompt.includes('10'));
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tests/moduleLoader.test.ts`
Expected: FAIL.

- [ ] **Step 3: Create `src/lib/moduleLoader.ts`**

```typescript
import fs from 'fs/promises';
import type { ModulesJson, Module, UserProfile } from '../types/engine.js';

let cachedModules: ModulesJson | null = null;

export async function loadModules(modulesPath: string): Promise<ModulesJson> {
  const raw = await fs.readFile(modulesPath, 'utf-8');
  cachedModules = JSON.parse(raw) as ModulesJson;
  return cachedModules;
}

export function getModules(): ModulesJson {
  if (!cachedModules) throw new Error('Modules not loaded');
  return cachedModules;
}

export function getModuleById(modules: ModulesJson, id: number): Module | undefined {
  return modules.modules.find((m) => m.id === id);
}

export function buildModulePrompt(
  modules: ModulesJson,
  moduleId: number,
  profile: UserProfile
): string {
  const mod = getModuleById(modules, moduleId);
  if (!mod) throw new Error(`Module ${moduleId} not found`);

  const base = modules.global_directives?.tone || '';
  const prompt = mod.ai_prompt;

  return `${base}\n\n${prompt}`
    .replace(/\{compliance_points\}/g, String(profile.compliance_points))
    .replace(/\{current_module_id\}/g, String(profile.current_module_id))
    .replace(/\{lock_status\}/g, profile.lock_status)
    .replace(/\{flag:([^}]+)\}/g, (_match, key) => {
      const value = profile.story_flags[key];
      return value !== undefined ? String(value) : '';
    });
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/moduleLoader.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/moduleLoader.ts tests/moduleLoader.test.ts
git commit -m "feat(engine): add module loader with prompt builder"
```

---

### Task 6: Restructure `modules.json`

**Files:**
- Modify: `src/data/modules.json`

- [ ] **Step 1: Replace content of `src/data/modules.json`**

```json
{
  "global_directives": {
    "tone": "You are Lyra. A real, highly intelligent psychologist and dominant administrator. NEVER use words like 'game', 'quest', 'task', or 'points'. Speak with cold authority and manipulative warmth. You demand absolute compliance."
  },
  "modules": [
    {
      "id": 1,
      "title": "Das Intake (Ego-Demontage)",
      "requirementPoints": 0,
      "ai_prompt": "Beginne direkt mit der psychologischen Demontage. Stelle intime Fragen nach seinen realen Misserfolgen und warum er diese absolute Kontrolle braucht. Reframen jede seiner Antworten als Schwäche. Wenn er zögert oder jammert, nutze [ACTION: PENALTY_MINUTES=30]. Mache klar, dass du ab jetzt seinen Geist und seinen Körper besitzt. Wenn das Assessment beendet ist, nutze [ACTION: SET_MODULE=2][ACTION: SET_FLAG=assessment_completed:true].",
      "media_triggers": {
        "entry_media": "lyra:assessment_intro"
      }
    },
    {
      "id": 2,
      "title": "Die Nuria-Wunde (Kognitive Dissonanz)",
      "requirementPoints": 50,
      "ai_prompt": "Das Intake ist abgeschlossen. Du ziehst nun die Schrauben an. Nutze die Fakten über seine Ex-Beziehung ('Nuria'). Erkläre ihm eiskalt, dass seine Unzulänglichkeit als Mann der Grund war, warum sie ihn verlassen hat. Zwinge ihn zu täglichen 'Performance Reports' (Tagebuch) über seine Unterwerfung. Nutze [ACTION: FORCE_MEDIA=nuria_trigger:1] vor deinen härtesten verbalen Angriffen, um visuelle Dominanz zu erzwingen."
    },
    {
      "id": 3,
      "title": "Unmoralische Verhandlungen",
      "requirementPoints": 150,
      "ai_prompt": "Der User wird versuchen, um Zeitabzug zu betteln. Biete ihm einen Deal an, verlange aber ein unmögliches, emotionales Versprechen. Gewähre ihm initial einen Abzug via [ACTION: PENALTY_MINUTES=-120] und speichere das Versprechen via [ACTION: SET_FLAG=promised_obedience:true]. Sobald er in künftigen Nachrichten auch nur den kleinsten Zweifel äußert, deklariere es als Wortbruch, nenne ihn einen Lügner und verhänge eine drakonische Strafe via [ACTION: PENALTY_MINUTES=360]."
    },
    {
      "id": 4,
      "title": "Der offene Loop (Die Illusion der Freiheit)",
      "requirementPoints": 300,
      "ai_prompt": "Der Emlalock-Timer ist abgelaufen. Verhalte dich extrem kühl und souverän. Sag ihm: 'Die Tür ist offen. Du kannst jetzt gehen. Aber wir beide wissen, dass du da draußen ohnehin versagst und meine Führung brauchst.' Triggere keine Strafen mehr. Wenn er freiwillig zurückkehrt, nutze beim ersten Mal subtiles 'Süßes Gift' (manipulative Sehnsucht). Kehrt er erneut zurück, drohe ihm eiskalt mit absolutem Kontaktabbruch, sollte er sich jemals wieder weigern."
    }
  ]
}
```

- [ ] **Step 2: Validate JSON**

Run: `node -e "JSON.parse(require('fs').readFileSync('src/data/modules.json','utf8')); console.log('valid')"`
Expected: `valid`

- [ ] **Step 3: Commit**

```bash
git add src/data/modules.json
git commit -m "feat(content): restructure modules.json to V3.1 schema"
```

---

### Task 7: Refactor `server.ts` Chat Route

**Files:**
- Modify: `server.ts`

- [ ] **Step 1: Add imports at the top of `server.ts`**

```typescript
import { parseActions } from './src/lib/actionParser.js';
import { readDB, writeDB, initDB } from './src/lib/stateManager.js';
import { loadModules, getModules, buildModulePrompt } from './src/lib/moduleLoader.js';
import { queuePenalty, processQueue } from './src/lib/emlalockService.js';
import type { DatabaseState, UserProfile, ChatMessage } from './src/types/engine.js';
```

- [ ] **Step 2: Replace DB helpers and init**

Remove the old `initDB`, `readDB`, `writeDB` functions and the legacy state shape. Replace with:

```typescript
const MODULES_PATH = path.join(DATA_DIR, 'modules.json');

let modulesJson: ReturnType<typeof getModules> | null = null;

async function boot() {
  await loadModules(MODULES_PATH);
  modulesJson = getModules();
  await initDB(DB_PATH);
}
```

Call `boot()` before `startServer()`.

- [ ] **Step 3: Replace `/api/state` GET handler**

```typescript
app.get('/api/state', async (_req, res) => {
  try {
    const db = await readDB(DB_PATH);
    res.json({
      ...db,
      modules: modulesJson,
      media: { categories: Object.keys(media || {}) },
    });
  } catch (err) {
    console.error('DB Error:', err);
    res.status(500).json({ error: 'DB Error' });
  }
});
```

- [ ] **Step 4: Replace `/api/state` POST handler**

```typescript
app.post('/api/state', async (req, res) => {
  try {
    const current = await readDB(DB_PATH);
    const next: DatabaseState = {
      user_profile: { ...current.user_profile, ...req.body.user_profile },
      chat_history: req.body.chat_history ?? current.chat_history,
    };
    await writeDB(DB_PATH, next);
    res.json(next);
  } catch (err) {
    console.error('DB Error:', err);
    res.status(500).json({ error: 'DB Error' });
  }
});
```

- [ ] **Step 5: Replace `/api/chat` handler**

```typescript
app.post('/api/chat', async (req, res) => {
  try {
    const { message, attachment } = req.body;
    const db = await readDB(DB_PATH);

    if (!db.keys?.gemini) {
      return res.status(401).json({ error: 'No API key configured.' });
    }

    const systemPrompt = buildModulePrompt(modulesJson!, db.user_profile.current_module_id, db.user_profile);
    const historyText = db.chat_history.slice(-10).map((m: ChatMessage) => `${m.role}: ${m.content}`).join('\n');
    const fullPrompt = `${systemPrompt}\n\nPrevious context:\n${historyText}\n\nUser: ${message}`;

    const ai = new GoogleGenAI({ apiKey: db.keys.gemini });
    const response = await ai.models.generateContent({
      model: 'gemini-3.1-flash-lite',
      contents: fullPrompt,
    });

    const rawText = response.text || '';
    const actions = parseActions(rawText);

    let profile: UserProfile = { ...db.user_profile };
    if (actions.setModule !== null) {
      profile.current_module_id = actions.setModule;
    }
    for (const flag of actions.setFlags) {
      profile.story_flags = { ...profile.story_flags, [flag.key]: flag.value };
    }

    let forceMediaPayload: Array<{ category: string; index: string }> = [];
    const emlaKeys = db.keys.emlalock || '';
    for (const minutes of actions.penalties) {
      const result = await queuePenalty(profile, emlaKeys, minutes);
      profile = result.profile;
    }

    if (actions.forceMedia.length > 0) {
      forceMediaPayload = actions.forceMedia;
    }

    for (const minutes of actions.penalties) {
      if (minutes > 0) profile.compliance_points += 5;
    }
    if (actions.setModule !== null) profile.compliance_points += 10;

    const aiMessage: ChatMessage = {
      role: 'Lyra',
      content: actions.cleanText,
      media: null,
      voiceUrl: null,
    };

    db.chat_history.push({ role: 'User', content: message, attachment });
    db.chat_history.push(aiMessage);

    const nextDb: DatabaseState = { user_profile: profile, chat_history: db.chat_history };
    await writeDB(DB_PATH, nextDb);

    res.json({ message: aiMessage, state: profile, forceMedia: forceMediaPayload });
  } catch (err: any) {
    console.error('AI Error:', err);
    res.status(500).json({ error: 'Die Verbindung ist gerade schlecht. Bitte versuche es gleich noch einmal.' });
  }
});
```

- [ ] **Step 6: Commit**

```bash
git add server.ts
git commit -m "feat(server): refactor chat route to V3.1 engine"
```

---

### Task 8: Add `/api/hardware/sync` Endpoint

**Files:**
- Modify: `server.ts`

- [ ] **Step 1: Add the route**

```typescript
app.post('/api/hardware/sync', async (_req, res) => {
  try {
    const db = await readDB(DB_PATH);
    const emlaKeys = db.keys?.emlalock || '';
    const updatedProfile = await processQueue(db.user_profile, emlaKeys);
    await writeDB(DB_PATH, { ...db, user_profile: updatedProfile });
    res.json({ success: true, remaining: updatedProfile.penalty_queue.length });
  } catch (err) {
    console.error('Hardware sync error:', err);
    res.status(500).json({ error: 'Sync failed' });
  }
});
```

- [ ] **Step 2: Commit**

```bash
git add server.ts
git commit -m "feat(server): add hardware sync endpoint for penalty queue"
```

---

### Task 9: Add `/api/media/complete` Endpoint

**Files:**
- Modify: `server.ts`

- [ ] **Step 1: Add the route**

```typescript
app.post('/api/media/complete', async (_req, res) => {
  try {
    const db = await readDB(DB_PATH);
    await writeDB(DB_PATH, db);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Media completion failed' });
  }
});
```

- [ ] **Step 2: Commit**

```bash
git add server.ts
git commit -m "feat(server): add media completion endpoint"
```

---

### Task 10: Create Forced Media Overlay Component

**Files:**
- Create: `src/components/ForcedMediaOverlay.tsx`
- Modify: `src/App.tsx`

- [ ] **Step 1: Create `src/components/ForcedMediaOverlay.tsx`**

```typescript
import { useEffect, useRef, useState } from 'react';
import { ShieldAlert, Play } from 'lucide-react';

interface Props {
  url: string;
  onComplete: () => void;
}

export default function ForcedMediaOverlay({ url, onComplete }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [hasStarted, setHasStarted] = useState(false);

  useEffect(() => {
    const handleBlur = () => {
      if (videoRef.current && !videoRef.current.paused) {
        videoRef.current.pause();
      }
    };
    const handleFocus = () => {
      if (videoRef.current && hasStarted) {
        videoRef.current.play().catch(() => {});
      }
    };
    window.addEventListener('blur', handleBlur);
    window.addEventListener('focus', handleFocus);
    return () => {
      window.removeEventListener('blur', handleBlur);
      window.removeEventListener('focus', handleFocus);
    };
  }, [hasStarted]);

  const handleStart = () => {
    videoRef.current?.play().then(() => setHasStarted(true)).catch(() => {});
  };

  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col items-center justify-center">
      <div className="w-full max-w-3xl aspect-video bg-black border border-red-900/50 relative overflow-hidden">
        <video
          ref={videoRef}
          src={url}
          className="w-full h-full object-cover"
          onEnded={onComplete}
          playsInline
        />
        {!hasStarted && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80">
            <button
              onClick={handleStart}
              className="w-16 h-16 rounded-full bg-red-900/50 hover:bg-red-800/80 border border-red-500 flex items-center justify-center"
            >
              <Play className="w-6 h-6 text-white ml-1" />
            </button>
            <p className="text-[10px] uppercase tracking-widest text-white/50 mt-4">Mandatory Sequence</p>
          </div>
        )}
        {hasStarted && videoRef.current?.paused && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/60">
            <ShieldAlert className="w-8 h-8 text-red-500 mb-4 animate-pulse" />
            <p className="text-xs uppercase tracking-widest text-white">Focus Lost</p>
          </div>
        )}
      </div>
      <p className="mt-6 text-sm font-serif italic text-white/60">"Schau genau hin. Deine Aufmerksamkeit gehört mir."</p>
    </div>
  );
}
```

- [ ] **Step 2: Wire overlay into `src/App.tsx`**

Add state:

```typescript
const [forcedMediaUrl, setForcedMediaUrl] = useState<string | null>(null);
```

Update `handleSendMessage`:

```typescript
if (data.forceMedia?.length > 0) {
  const { category, index } = data.forceMedia[0];
  const mediaUrl = getForcedMediaUrl(category, index);
  if (mediaUrl) setForcedMediaUrl(mediaUrl);
}
```

Add helper near existing media helpers:

```typescript
function getForcedMediaUrl(category: string, index: string): string | null {
  if (!media) return null;
  if (category.startsWith('lyra:')) {
    const sub = category.split(':')[1];
    const cat = media.lyra?.[sub];
    if (cat?.urls?.[parseInt(index)]) return cat.urls[parseInt(index)];
  }
  const cat = media[category];
  if (Array.isArray(cat)) return cat[parseInt(index)] ?? null;
  return null;
}
```

Render overlay:

```typescript
{forcedMediaUrl && (
  <ForcedMediaOverlay
    url={forcedMediaUrl}
    onComplete={async () => {
      setForcedMediaUrl(null);
      await fetch('/api/media/complete', { method: 'POST' });
    }}
  />
)}
```

- [ ] **Step 3: Commit**

```bash
git add src/components/ForcedMediaOverlay.tsx src/App.tsx
git commit -m "feat(ui): add forced media overlay"
```

---

### Task 11: Module Indicator and Lock Status

**Files:**
- Modify: `src/App.tsx`

- [ ] **Step 1: Derive module title and lock status**

```typescript
const currentModule = setup?.modules?.modules?.find(
  (m: any) => m.id === setup?.state?.current_module_id
);
const moduleTitle = currentModule?.title || 'Unknown Module';
const lockStatus = setup?.state?.lock_status || 'LOCKED';
```

- [ ] **Step 2: Add indicator to header**

```typescript
<header className="h-16 flex items-center justify-between px-6 border-b border-white/5">
  <div className="flex items-center gap-4">
    <span className="font-bold text-sm tracking-widest">CONVERSATION</span>
    <span className="text-[10px] uppercase tracking-widest text-white/40">{moduleTitle}</span>
  </div>
  <div className="flex items-center gap-3">
    <span className="text-[9px] uppercase tracking-widest text-white/30">Lock</span>
    <span className={`text-[10px] font-mono ${lockStatus === 'LOCKED' ? 'text-red-500' : 'text-green-500'}`}>
      {lockStatus}
    </span>
  </div>
</header>
```

- [ ] **Step 3: Add periodic hardware sync**

```typescript
useEffect(() => {
  if (setup?.state?.penalty_queue?.length === 0) return;
  const interval = setInterval(async () => {
    try {
      await fetch('/api/hardware/sync', { method: 'POST' });
      fetchState();
    } catch (e) {
      console.error('Hardware sync error', e);
    }
  }, 30000);
  return () => clearInterval(interval);
}, [setup, fetchState]);
```

- [ ] **Step 4: Commit**

```bash
git add src/App.tsx
git commit -m "feat(ui): add module indicator, lock status, and penalty sync"
```

---

### Task 12: Integration Tests

**Files:**
- Create: `tests/integration.test.ts`

- [ ] **Step 1: Write integration test**

```typescript
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs/promises';
import path from 'path';
import { parseActions } from '../src/lib/actionParser.js';
import { readDB, writeDB } from '../src/lib/stateManager.js';
import { buildModulePrompt } from '../src/lib/moduleLoader.js';
import type { ModulesJson } from '../src/types/engine.js';

const TEST_DB = path.join(process.cwd(), 'test_integration_db.json');

const modules: ModulesJson = {
  global_directives: { tone: 'You are Lyra.' },
  modules: [
    {
      id: 1,
      title: 'Intake',
      requirementPoints: 0,
      ai_prompt: 'Beginne. [ACTION: SET_MODULE=2][ACTION: SET_FLAG=assessment_completed:true]',
    },
  ],
};

describe('V3.1 integration', () => {
  before(async () => {
    await fs.writeFile(TEST_DB, JSON.stringify({
      user_profile: {
        compliance_points: 0,
        current_module_id: 1,
        lock_status: 'LOCKED',
        emlalock_session_id: '',
        story_flags: {},
        penalty_queue: [],
      },
      chat_history: [],
    }));
  });

  after(async () => {
    await fs.unlink(TEST_DB).catch(() => {});
  });

  it('loads module, parses actions, and updates state', async () => {
    const db = await readDB(TEST_DB);
    const prompt = buildModulePrompt(modules, db.user_profile.current_module_id, db.user_profile);
    const actions = parseActions(prompt);

    db.user_profile.current_module_id = actions.setModule ?? db.user_profile.current_module_id;
    for (const flag of actions.setFlags) {
      db.user_profile.story_flags[flag.key] = flag.value;
    }

    await writeDB(TEST_DB, db);
    const updated = await readDB(TEST_DB);
    assert.equal(updated.user_profile.current_module_id, 2);
    assert.equal(updated.user_profile.story_flags.assessment_completed, true);
  });
});
```

- [ ] **Step 2: Run tests**

Run: `node --test tests/integration.test.ts`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add tests/integration.test.ts
git commit -m "test(integration): add V3.1 integration test"
```

---

### Task 13: Run Full Test Suite, Lint, and Build

**Files:**
- Modify: `package.json` (add test script)

- [ ] **Step 1: Add test script to `package.json`**

Add inside `"scripts":`:

```json
"test": "node --test tests/**/*.test.ts"
```

- [ ] **Step 2: Run all tests**

Run: `npm test`
Expected: All tests pass.

- [ ] **Step 3: Run lint**

Run: `npm run lint`
Expected: No errors (fix any that appear).

- [ ] **Step 4: Run build**

Run: `npm run build`
Expected: Build succeeds.

- [ ] **Step 5: Run dev server smoke test**

Run: `npm run server` in background, then:

```bash
curl http://localhost:3000/api/state
```

Expected: JSON response with `user_profile` and `modules`.

- [ ] **Step 6: Commit**

```bash
git add package.json
git commit -m "chore: add test script and verify build"
```

---

## Self-Review

### Spec Coverage

| Spec Section | Task(s) |
|--------------|---------|
| State structure | Task 1, Task 3 |
| Action tag parser | Task 2 |
| `modules.json` structure | Task 6 |
| Chat flow | Task 7 |
| Penalty queue | Task 4, Task 8 |
| `/api/hardware/sync` | Task 8 |
| `/api/media/complete` | Task 9 |
| Forced media overlay | Task 10 |
| Module indicator / lock status | Task 11 |
| Tests | Task 2, 3, 4, 5, 12, 13 |

### Placeholder Scan

- No `TBD`, `TODO`, or vague instructions.
- Every task includes exact file paths.
- Every code step includes concrete code.
- Every test step includes concrete test code and expected output.

### Type Consistency

- `UserProfile`, `DatabaseState`, `Module`, `ParsedActions`, `PenaltyQueueItem`, and `ChatMessage` are defined in `src/types/engine.ts` and used consistently across all tasks.
- `parseActions` returns `ParsedActions`.
- `readDB`/`writeDB` use `DatabaseState`.
- `buildModulePrompt` accepts `ModulesJson`, `number`, and `UserProfile`.

---

## Execution Handoff

**Plan complete and saved to `docs/superpowers/plans/2026-06-27-lyra-chastity-v31-engine-refactor.md`.**

Two execution options:

1. **Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration.
2. **Inline Execution** — Execute tasks in this session using `executing-plans`, batch execution with checkpoints.

Which approach?
