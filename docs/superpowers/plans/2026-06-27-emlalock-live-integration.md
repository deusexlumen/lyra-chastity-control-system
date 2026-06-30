# Emlalock Live Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire the Lyra V3.1 backend to make real Emlalock API calls for penalties, query session status, process the penalty queue in the background, and keep an audit log.

**Architecture:** Extend the existing `emlalockService.ts` with live fetch helpers and session-info lookup, add `emlalock_log` to the user profile, expose three API endpoints from `server.ts`, and start a background queue processor on server boot.

**Tech Stack:** TypeScript, Node 22 native `fetch`, `tsx`, native `node:test`.

---

## File Map

| File | Responsibility |
|------|----------------|
| `src/types/engine.ts` | Add `EmlalockLogEntry` type and `emlalock_log` field to `UserProfile`. |
| `src/lib/stateManager.ts` | Initialize `emlalock_log: []` and accept it as optional in validation. |
| `src/lib/emlalockService.ts` | Add `getSessionInfo`, `getEmlalockKeys`, limits, live fetch, audit logging. |
| `tests/emlalockService.test.ts` | Unit tests for session info, limits, audit log, queue drop after max retries. |
| `server.ts` | Add `/api/emlalock/*` endpoints, start background interval, wire credentials. |
| `.env.example` | Document new `EMLA_*` variables and limit knobs. |

---

### Task 1: Extend Types

**Files:**
- Modify: `src/types/engine.ts:11-25`

- [ ] **Step 1: Add `EmlalockLogEntry` interface and extend `UserProfile`**

```ts
export interface EmlalockLogEntry {
  timestamp: number;
  minutes: number;
  endpoint: 'addrandom' | 'removesessiontime' | 'sessioninfo';
  success: boolean;
  responseSummary?: string;
}
```

Add `emlalock_log?: EmlalockLogEntry[];` to `UserProfile` after `penalty_queue`.

- [ ] **Step 2: Commit**

```bash
git add src/types/engine.ts
git commit -m "types: add EmlalockLogEntry and emlalock_log field"
```

---

### Task 2: Update State Manager

**Files:**
- Modify: `src/lib/stateManager.ts:4-17`, `src/lib/stateManager.ts:65-90`

- [ ] **Step 1: Initialize `emlalock_log` in DEFAULT_PROFILE**

```ts
export const DEFAULT_PROFILE: UserProfile = {
  compliance_points: 0,
  current_module_id: 1,
  lock_status: 'LOCKED',
  emlalock_session_id: '',
  story_flags: { ... },
  penalty_queue: [],
  emlalock_log: [],
  active_video_url: null,
};
```

- [ ] **Step 2: Make `emlalock_log` optional in validation**

Add after the `penalty_queue` check in `isValidDatabaseState`:

```ts
if (
  'emlalock_log' in parsed.user_profile &&
  parsed.user_profile.emlalock_log !== undefined &&
  (!Array.isArray(parsed.user_profile.emlalock_log) ||
    !parsed.user_profile.emlalock_log.every(isEmlalockLogEntry))
)
  return false;
```

Add helper:

```ts
function isEmlalockLogEntry(value: unknown): value is EmlalockLogEntry {
  if (!isRecord(value)) return false;
  return (
    typeof value.timestamp === 'number' &&
    typeof value.minutes === 'number' &&
    ['addrandom', 'removesessiontime', 'sessioninfo'].includes(value.endpoint as string) &&
    typeof value.success === 'boolean'
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/stateManager.ts
git commit -m "state: accept optional emlalock_log and initialize default"
```

---

### Task 3: Refactor Emlalock Service for Live Calls

**Files:**
- Modify: `src/lib/emlalockService.ts`

- [ ] **Step 1: Add credential helper and types**

```ts
export interface EmlalockKeys {
  userid: string;
  apikey: string;
  holderkey?: string;
}

export function getEmlalockKeys(userid?: string, apikey?: string, holderkey?: string): EmlalockKeys | null {
  if (!userid || !apikey) return null;
  return { userid, apikey, holderkey };
}
```

- [ ] **Step 2: Add `getSessionInfo` helper**

```ts
export async function getSessionInfo(
  keys: EmlalockKeys,
  fetchImpl: EmlalockApiCall = async (url) => {
    const res = await fetch(url);
    return { ok: res.ok, json: () => res.json() as Promise<unknown> };
  }
): Promise<{ success: boolean; data?: unknown }> {
  if (!keys.holderkey) return { success: false };
  const url = `https://api.emlalock.com/session?holderkey=${encodeURIComponent(keys.holderkey)}`;
  try {
    const res = await fetchImpl(url);
    const body = await res.json();
    if (!res.ok || isEmlalockError(body)) return { success: false };
    return { success: true, data: body };
  } catch {
    return { success: false };
  }
}
```

- [ ] **Step 3: Replace `applyPenalty` to accept `EmlalockKeys`**

Change signature from `(minutes: number, keys: string, ...)` to `(minutes: number, keys: EmlalockKeys, ...)`.

Update URL construction:

```ts
const durationSeconds = Math.abs(minutes) * 60;
const operation = minutes >= 0 ? 'addrandom' : 'removesessiontime';
const url = `https://api.emlalock.com/${operation}?userid=${encodeURIComponent(keys.userid)}&apikey=${encodeURIComponent(keys.apikey)}&from=${durationSeconds}&to=${durationSeconds}&text=Lyra_Core_Penalty`;
```

Remove `parseEmlalockKeys` usage inside `applyPenalty`.

- [ ] **Step 4: Add limit checker**

```ts
export function checkPenaltyLimits(
  minutes: number,
  log: EmlalockLogEntry[],
  maxSingle: number,
  maxDaily: number
): { allowed: boolean; reason?: string } {
  const absMinutes = Math.abs(minutes);
  if (absMinutes === 0) return { allowed: false, reason: 'zero' };
  if (absMinutes > maxSingle) return { allowed: false, reason: 'single_limit' };

  const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
  const dailyTotal = log
    .filter((e) => e.timestamp > oneDayAgo && e.success && e.endpoint === 'addrandom')
    .reduce((sum, e) => sum + Math.abs(e.minutes), 0);
  if (dailyTotal + absMinutes > maxDaily) return { allowed: false, reason: 'daily_limit' };

  return { allowed: true };
}
```

- [ ] **Step 5: Update `queuePenalty` and `processQueue` to use `EmlalockKeys`**

```ts
export async function queuePenalty(
  profile: UserProfile,
  keys: EmlalockKeys,
  minutes: number,
  limits: { maxSingle: number; maxDaily: number },
  fetchImpl?: EmlalockApiCall
): Promise<EmlalockResult> {
  const limitCheck = checkPenaltyLimits(minutes, profile.emlalock_log ?? [], limits.maxSingle, limits.maxDaily);
  if (!limitCheck.allowed) {
    const logEntry: EmlalockLogEntry = {
      timestamp: Date.now(),
      minutes,
      endpoint: minutes >= 0 ? 'addrandom' : 'removesessiontime',
      success: false,
      responseSummary: limitCheck.reason,
    };
    return { success: false, profile: { ...profile, emlalock_log: [...(profile.emlalock_log ?? []), logEntry] } };
  }

  const success = await applyPenalty(minutes, keys, fetchImpl);
  const logEntry: EmlalockLogEntry = {
    timestamp: Date.now(),
    minutes,
    endpoint: minutes >= 0 ? 'addrandom' : 'removesessiontime',
    success,
  };
  const updatedLog = [...(profile.emlalock_log ?? []), logEntry];
  if (success) return { success: true, profile: { ...profile, emlalock_log: updatedLog } };

  const item: PenaltyQueueItem = { minutes, enqueuedAt: Date.now(), retries: 0 };
  return { success: false, profile: { ...profile, penalty_queue: [...profile.penalty_queue, item], emlalock_log: updatedLog } };
}
```

```ts
export async function processQueue(
  profile: UserProfile,
  keys: EmlalockKeys,
  limits: { maxSingle: number; maxDaily: number },
  fetchImpl?: EmlalockApiCall,
  maxRetries = 5
): Promise<UserProfile> {
  const remaining: PenaltyQueueItem[] = [];
  let currentProfile = profile;

  for (const item of profile.penalty_queue) {
    if (item.minutes === 0) continue;
    if (item.retries >= maxRetries) {
      const logEntry: EmlalockLogEntry = {
        timestamp: Date.now(),
        minutes: item.minutes,
        endpoint: item.minutes >= 0 ? 'addrandom' : 'removesessiontime',
        success: false,
        responseSummary: 'max_retries_exceeded',
      };
      currentProfile = { ...currentProfile, emlalock_log: [...(currentProfile.emlalock_log ?? []), logEntry] };
      continue;
    }

    const limitCheck = checkPenaltyLimits(item.minutes, currentProfile.emlalock_log ?? [], limits.maxSingle, limits.maxDaily);
    if (!limitCheck.allowed) {
      remaining.push({ ...item, retries: item.retries + 1 });
      continue;
    }

    const success = await applyPenalty(item.minutes, keys, fetchImpl);
    const logEntry: EmlalockLogEntry = {
      timestamp: Date.now(),
      minutes: item.minutes,
      endpoint: item.minutes >= 0 ? 'addrandom' : 'removesessiontime',
      success,
    };
    currentProfile = { ...currentProfile, emlalock_log: [...(currentProfile.emlalock_log ?? []), logEntry] };
    if (!success) {
      remaining.push({ ...item, retries: item.retries + 1 });
    }
  }

  return { ...currentProfile, penalty_queue: remaining };
}
```

- [ ] **Step 6: Update existing tests to use `EmlalockKeys` instead of strings**

In `tests/emlalockService.test.ts`, replace all `'user:pass'` with `{ userid: 'user', apikey: 'pass' }` and update function signatures.

- [ ] **Step 7: Run tests**

```bash
npm test
```

Expected: all existing tests pass after signature updates.

- [ ] **Step 8: Commit**

```bash
git add src/lib/emlalockService.ts tests/emlalockService.test.ts
git commit -m "feat: refactor emlalock service for live keys, limits, and audit log"
```

---

### Task 4: Add Unit Tests for New Behavior

**Files:**
- Modify: `tests/emlalockService.test.ts`

- [ ] **Step 1: Write test for `getSessionInfo` success and failure**

```ts
it('fetches session info with holder key', async () => {
  const result = await getSessionInfo({ userid: 'u', apikey: 'k', holderkey: 'h' }, async () => ({
    ok: true,
    json: async () => ({ remaining: 3600 }),
  }));
  assert.equal(result.success, true);
  assert.deepEqual(result.data, { remaining: 3600 });
});

it('fails session info without holder key', async () => {
  const result = await getSessionInfo({ userid: 'u', apikey: 'k' });
  assert.equal(result.success, false);
});
```

- [ ] **Step 2: Write test for penalty limits**

```ts
it('enforces single penalty limit', () => {
  const result = checkPenaltyLimits(200, [], 180, 1000);
  assert.equal(result.allowed, false);
  assert.equal(result.reason, 'single_limit');
});

it('enforces daily cumulative limit', () => {
  const log: EmlalockLogEntry[] = [
    { timestamp: Date.now(), minutes: 900, endpoint: 'addrandom', success: true },
  ];
  const result = checkPenaltyLimits(150, log, 180, 1000);
  assert.equal(result.allowed, false);
  assert.equal(result.reason, 'daily_limit');
});
```

- [ ] **Step 3: Write test for max retries drop**

```ts
it('drops queue items after max retries and logs failure', async () => {
  const profile = baseProfile([{ minutes: 10, enqueuedAt: Date.now(), retries: 5 }]);
  const result = await processQueue(profile, { userid: 'u', apikey: 'k' }, { maxSingle: 180, maxDaily: 1000 });
  assert.equal(result.penalty_queue.length, 0);
  assert.equal(result.emlalock_log?.length, 1);
  assert.equal(result.emlalock_log![0].responseSummary, 'max_retries_exceeded');
});
```

- [ ] **Step 4: Run tests**

```bash
npm test
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add tests/emlalockService.test.ts
git commit -m "test: emlalock session info, limits, and max retry drop"
```

---

### Task 5: Wire Server Endpoints and Background Queue

**Files:**
- Modify: `server.ts`

- [ ] **Step 1: Load Emlalock credentials from env without hard-coded fallback**

Replace the existing Emlalock constants:

```ts
const EMLA_USER_ID = process.env.EMLA_USER_ID || '';
const EMLA_API_KEY = process.env.EMLA_API_KEY || '';
const EMLA_HOLDER_KEY = process.env.EMLA_HOLDER_KEY || '';
const EMLA_MAX_SINGLE_PENALTY_MINUTES = Number(process.env.EMLA_MAX_SINGLE_PENALTY_MINUTES || 180);
const EMLA_MAX_DAILY_MINUTES = Number(process.env.EMLA_MAX_DAILY_MINUTES || 1000);
```

Add helper:

```ts
function getEmlalockLimits() {
  return { maxSingle: EMLA_MAX_SINGLE_PENALTY_MINUTES, maxDaily: EMLA_MAX_DAILY_MINUTES };
}
```

- [ ] **Step 2: Add `/api/emlalock/status` endpoint**

```ts
app.get('/api/emlalock/status', async (_req, res) => {
  const db = await readDB(DB_PATH);
  const keys = getEmlalockKeys(EMLA_USER_ID, EMLA_API_KEY, EMLA_HOLDER_KEY);
  let session = null;
  if (keys?.holderkey) {
    const info = await getSessionInfo(keys);
    session = info.success ? info.data : { error: 'session_lookup_failed' };
  }
  res.json({
    configured: !!keys,
    pending_minutes: db.user_profile.penalty_queue.reduce((sum, i) => sum + i.minutes, 0),
    queue_length: db.user_profile.penalty_queue.length,
    session,
  });
});
```

- [ ] **Step 3: Add `/api/emlalock/log` endpoint**

```ts
app.get('/api/emlalock/log', async (_req, res) => {
  const db = await readDB(DB_PATH);
  const log = db.user_profile.emlalock_log ?? [];
  res.json(log.slice(-50));
});
```

- [ ] **Step 4: Add `/api/emlalock/apply` endpoint**

```ts
app.post('/api/emlalock/apply', express.json(), async (req, res) => {
  const minutes = Number(req.body?.minutes);
  if (!Number.isFinite(minutes)) {
    res.status(400).json({ error: 'minutes must be a number' });
    return;
  }
  const keys = getEmlalockKeys(EMLA_USER_ID, EMLA_API_KEY, EMLA_HOLDER_KEY);
  if (!keys) {
    res.status(503).json({ error: 'emlalock not configured' });
    return;
  }
  const db = await readDB(DB_PATH);
  const result = await queuePenalty(db.user_profile, keys, minutes, getEmlalockLimits());
  db.user_profile = result.profile;
  await writeDB(DB_PATH, db);
  res.json({ success: result.success, profile: toAppState(db) });
});
```

- [ ] **Step 5: Start background queue processor**

Before `app.listen`:

```ts
setInterval(async () => {
  const keys = getEmlalockKeys(EMLA_USER_ID, EMLA_API_KEY, EMLA_HOLDER_KEY);
  if (!keys) return;
  try {
    const db = await readDB(DB_PATH);
    const updated = await processQueue(db.user_profile, keys, getEmlalockLimits());
    if (updated !== db.user_profile) {
      db.user_profile = updated;
      await writeDB(DB_PATH, db);
    }
  } catch (err) {
    console.error('[LYRA v3.1] Background queue processing failed:', err);
  }
}, 60_000);
```

- [ ] **Step 6: Update chat route to use `EmlalockKeys` and limits**

Find the existing `queuePenalty` call in the chat handler (around `/api/chat`) and update it:

```ts
const keys = getEmlalockKeys(EMLA_USER_ID, EMLA_API_KEY, EMLA_HOLDER_KEY);
if (keys) {
  const result = await queuePenalty(db.user_profile, keys, penalty, getEmlalockLimits());
  db.user_profile = result.profile;
}
```

- [ ] **Step 7: Run tests, lint, and build**

```bash
npm test && npm run lint && npm run build
```

Expected: all pass.

- [ ] **Step 8: Commit**

```bash
git add server.ts
git commit -m "feat: add live Emlalock endpoints and background queue processing"
```

---

### Task 6: Document Environment Variables

**Files:**
- Modify: `.env.example`

- [ ] **Step 1: Add Emlalock variables**

```env
# Emlalock live integration
EMLA_USER_ID=your_emlalock_user_id
EMLA_API_KEY=your_emlalock_api_key
EMLA_HOLDER_KEY=your_emlalock_holder_key
EMLA_MAX_SINGLE_PENALTY_MINUTES=180
EMLA_MAX_DAILY_MINUTES=1000
```

- [ ] **Step 2: Commit**

```bash
git add .env.example
git commit -m "docs: document Emlalock environment variables"
```

---

## Self-Review

### Spec Coverage
- Live `addrandom` / `removesessiontime` calls → Task 3, Task 5.
- Holder key session info → Task 3, Task 5.
- Background queue processing → Task 5.
- Audit log → Task 1, Task 2, Task 3, Task 5.
- API endpoints → Task 5.
- Safety limits → Task 3, Task 4, Task 5.

### Placeholder Scan
- No TBD/TODO placeholders.
- Every step includes concrete code or exact command.
- Type names consistent (`EmlalockKeys`, `EmlalockLogEntry`, `EmlalockResult`).

### Type Consistency
- `applyPenalty`, `queuePenalty`, `processQueue`, and `getSessionInfo` all accept `EmlalockKeys`.
- `emlalock_log` is always treated as optional with `?? []` fallback.
