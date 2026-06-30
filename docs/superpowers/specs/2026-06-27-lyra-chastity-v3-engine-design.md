# Lyra Chastity V3.1 — Final Engine & Content Architecture Design

**Date:** 2026-06-27  
**Status:** Final / Approved for Implementation  
**Scope:** Strict separation of Engine (mechanics) and Content (psychology/narrative). Conditioning starts directly through "Lyra" from second one. No Laura prologue.

---

## 1. Summary & Core Directives

The backend is refactored into a deterministic **Engine**. The engine reads story modules, parses AI action tags, and controls hardware/state.

- **No backstory:** The system starts directly with Lyra's "Initial Assessment". The persona Laura does not exist.
- **Strict separation (Decision 1):** Narrative content lives in `modules.json`. Media references (images/videos) remain strictly separated in a separate `content_manifest.json`.
- **Hardware Queue (Decision 2):** Time penalties (`PENALTY_MINUTES`) are placed into an offline queue. If the Emlalock API connection drops, no penalty is lost; it is retried automatically once the API is reachable again.
- **Lightweight Testing (Decision 3):** All automated tests are implemented using only the native Node.js test runner (`node:test` + `assert`).

---

## 2. State Structure (`local_db.json`)

The backend manages a typed, persistent state. Legacy fields are migrated.

```json
{
  "user_profile": {
    "compliance_points": 0,
    "current_module_id": 1,
    "lock_status": "LOCKED",
    "emlalock_session_id": "12345_abc",
    "story_flags": {
      "assessment_completed": false,
      "nuria_trauma_score": 0,
      "promised_obedience": false,
      "voluntary_relock_count": 0
    },
    "penalty_queue": []
  },
  "chat_history": []
}
```

The `penalty_queue` array stores failed Emlalock API calls for later automatic retry.

---

## 3. Action Tag Parser (Engine Logic)

The AI controls the system exclusively through regex-parsed tags. Tags are removed from the frontend-visible output.

| Tag | Regex / Format | Effect (Backend Execution) |
|-----|-------|--------|
| `SET_MODULE` | `\[ACTION: SET_MODULE=(\d+)\]` | Overwrites `current_module_id` and loads the next psychological chapter. |
| `SET_FLAG` | `\[ACTION: SET_FLAG=([^:]+):([^\]]+)\]` | Sets progression flags in the database (e.g. for broken promises). |
| `PENALTY_MINUTES` | `\[ACTION: PENALTY_MINUTES=(-?\d+)\]` | Adds/subtracts minutes. Pushes the value to the Emlalock API or into `penalty_queue`. |
| `FORCE_MEDIA` | `\[ACTION: FORCE_MEDIA=([^:]+):([^\]]+)\]` | Forces the frontend to display an unskippable media overlay from `content_manifest.json`. |

---

## 4. Module Structure (`modules.json`)

This is the psychological "flesh". The modules define the "Slow Burn" and replace any game metaphors with pure psychological dominance.

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

---

## 5. API Endpoints & State Updates

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/api/chat` | Main endpoint. Loads the current module (via `current_module_id`), injects state, calls Gemini, parses action tags, and saves the updated `local_db.json`. |
| POST | `/api/hardware/sync` | Processes the `penalty_queue`. Attempts to send pending penalties to Emlalock. On `5xx/4xx`/network error the penalties remain in the queue. |
| POST | `/api/media/complete` | Called by the frontend once a `FORCE_MEDIA` video has been fully viewed (unskipped), to unlock the chat again. |

---

## 6. Chat Flow

```
User sends message
        │
        ▼
Engine loads current module by user_profile.current_module_id
        │
        ▼
Engine builds full prompt:
  - modules.json global_directives
  - current module.ai_prompt
  - chat_history (last N messages)
  - injected state variables
        │
        ▼
Gemini generates response
        │
        ▼
Action parser extracts and executes tags
        │
        ▼
Engine persists updated state to local_db.json
        │
        ▼
Engine returns clean text + state to frontend
```

### Injected State Variables

| Placeholder | Value |
|-------------|-------|
| `{compliance_points}` | `user_profile.compliance_points` |
| `{current_module_id}` | `user_profile.current_module_id` |
| `{lock_status}` | `user_profile.lock_status` |
| `{flag:NAME}` | `user_profile.story_flags.NAME` |

---

## 7. Frontend Changes

### 7.1 Forced Media Overlay

When the backend returns a `forceMedia` payload, the frontend opens a full-screen overlay:

- Displays the requested video/GIF from `content_manifest.json`.
- Disables skip/close controls.
- Calls `/api/media/complete` once the media has finished, unlocking the chat.

### 7.2 Module Indicator

The header shows the title of the current module (`current_module_id` → `modules.json`).

### 7.3 Lock Status Badge

A small badge displays `LOCKED` / `UNLOCKED` based on `user_profile.lock_status`.

---

## 8. Automated Tests (Node `node:test`)

These core mechanics **must** be validated with unit tests to guarantee logical stability of the engine.

### Test 1: Module Transition

- **Given:** `current_module_id` is `1`.
- **When:** AI generates `"[ACTION: SET_MODULE=2][ACTION: SET_FLAG=assessment_completed:true]"`
- **Then:** Engine removes tags from output, changes `current_module_id` to `2`, and sets the flag to `true`.

### Test 2: Offline Queue for Emlalock

- **Given:** Emlalock API throws a timeout error.
- **When:** AI generates `"[ACTION: PENALTY_MINUTES=60]"`
- **Then:** Engine does not crash. `60` is appended to `user_profile.penalty_queue`.

### Test 3: Negotiation Trap (Penalty Calculation)

- **Given:** User receives a penalty for a broken promise.
- **When:** AI generates `"[ACTION: PENALTY_MINUTES=360]"`
- **Then:** Engine adds 360 to the active lock time and emits the modified Emlalock payload.

---

## 9. Migration Plan

1. **Update types** in `src/types/types.ts` for `UserProfile`, `StoryFlags`, `Module`, `ActionTag`, `PenaltyQueueItem`.
2. **Refactor state helpers** in `server.ts` to read/write the new `user_profile` shape.
3. **Implement the action parser** as a standalone, tested function.
4. **Restructure `modules.json`** to the V3.1 module schema.
5. **Keep `content_manifest.json`** as the separate media reference layer.
6. **Update `/api/chat`** to load the current module prompt, call Gemini, parse actions, and persist state.
7. **Add `/api/hardware/sync`** for penalty queue processing.
8. **Add `/api/media/complete`** for forced-media confirmation.
9. **Add forced-media overlay** in the frontend.
10. **Add module indicator** and lock status badge.
11. **Write and run the three Node test scenarios**.
12. **Remove or deprecate** legacy state fields once the new flow is verified.

---

## 10. Decision Log

| Decision | Rationale |
|----------|-----------|
| Engine/Content split | Required by user spec; enables later module additions without code changes. |
| Start with Lyra assessment | User direction: no Laura prologue, conditioning starts immediately. |
| Separate `content_manifest.json` | Media references must remain independent from narrative modules. |
| Penalty queue (`penalty_queue`) | Guarantees no penalties are lost during Emlalock outages. |
| Native Node test runner | Lightweight, no new dependency, matches user direction. |
| Module IDs start at 1 | Aligns with the final module specification. |
