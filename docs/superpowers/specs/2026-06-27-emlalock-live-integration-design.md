# Emlalock Live Integration Design

## Overview
Enable the Lyra V3.1 engine to make real Emlalock API calls for chastity time penalties and reductions, with audit logging, background queue processing, and basic safety limits.

## Goals
- Execute live `addrandom` and `removesessiontime` calls against `https://api.emlalock.com`.
- Use holder key to query session status.
- Process the penalty queue reliably in the background.
- Record every API call in an audit log stored in `local_db.json`.
- Expose status/log endpoints for the frontend.

## Non-Goals
- No dry-run mode. Every successful call affects real lock time.
- No manual override UI in this phase.
- No email or notification logic tied to Emlalock events.

## Architecture

### Credentials
Loaded exclusively from `.env`:
- `EMLA_USER_ID`
- `EMLA_API_KEY`
- `EMLA_HOLDER_KEY`

Hard-coded fallbacks in `server.ts` are removed for Emlalock credentials.

### Service Layer (`src/lib/emlalockService.ts`)
- `applyPenalty(minutes, keys)` – performs the live API call.
- `getSessionInfo(keys)` – queries session status via holder key.
- `queuePenalty(profile, keys, minutes)` – tries live call, falls back to queue.
- `processQueue(profile, keys)` – retries queued items with exponential backoff and max 5 retries.

### Safety Limits
- Single penalty max: 180 minutes.
- Daily cumulative max: 1,000 minutes (rolling 24h window).
- Negative penalties (time reduction) allowed but capped at the same single-penalty limit.
- Invalid or missing credentials silently disable Emlalock calls.

### Audit Trail
New `emlalock_log` array in `UserProfile`. Each entry:
```ts
{
  timestamp: number;
  minutes: number;
  endpoint: 'addrandom' | 'removesessiontime' | 'sessioninfo';
  success: boolean;
  responseSummary?: string;
}
```

### Background Queue
- `server.ts` starts a `setInterval` every 60 seconds.
- Calls `processQueue` only when credentials are present.
- Failed items are retried up to 5 times, then dropped from the queue and logged.

### API Endpoints
- `POST /api/emlalock/apply` – accepts `{ minutes: number }`, applies immediately.
- `GET /api/emlalock/status` – returns current session info and pending queue.
- `GET /api/emlalock/log` – returns the last 50 audit entries.

### Frontend
- Minimal indicator in the header showing lock status and pending penalty minutes.
- No full UI panel in this phase.

## Testing
- Unit tests for service functions using mocked fetch.
- Integration test that verifies endpoint wiring without making real calls.
- No live API tests in the automated suite.

## Risks
- Real lock time will be added/removed.
- Emlalock API rate limits or downtime will queue penalties.
- Credential misconfiguration will fail silently unless logs are checked.

## Open Decisions
- Max single penalty set to 180 minutes; can be adjusted via `.env` (`EMLA_MAX_SINGLE_PENALTY_MINUTES`).
- Daily cap set to 1,000 minutes; can be adjusted via `.env` (`EMLA_MAX_DAILY_MINUTES`).
