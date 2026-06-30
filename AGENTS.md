# Agent Guide — Lyra Chastity Control System

> This file is written for AI coding agents. It assumes no prior knowledge of the project and describes the actual structure, commands, conventions, and risks found in the repository.

## Project Overview

This is a single-user, AI-driven realism-simulation web application called **Lyra Chastity Control System**. It combines a React/TypeScript frontend with a Node.js/Express backend to run an interactive private-messenger session where a dominant persona ("Lyra") responds to user messages, tracks persistent state, and can trigger external integrations such as chastity-device timers (Emlalock), email messages, and media playback.

The project content and generated text are adult/NSFW in nature (femdom, chastity, sissification, and related themes). All content logic is data-driven via JSON manifest files and Markdown prompt templates.

## Technology Stack

| Layer | Technology |
|-------|-------------|
| Package manager | pnpm 9.6.0 |
| Frontend framework | React 19 + TypeScript 5.9 |
| Build tool / dev server | Vite 7.2.4 |
| Routing | `react-router` 7 (installed; only a placeholder page exists) |
| Styling | Tailwind CSS 3.4.19 + `tailwindcss-animate` |
| UI components | shadcn/ui (New York style, non-RSC), ~50 components in `src/components/ui` |
| Icons | `lucide-react` |
| Forms/validation | `react-hook-form` + `@hookform/resolvers` + `zod` |
| Backend runtime | Node.js 20+ with `tsx` for TypeScript execution |
| Backend framework | Express 5 |
| AI client | `@google/genai` (Gemini API) |
| Email | `nodemailer` over GMX SMTP |
| Chastity hardware API | Emlalock (`https://api.emlalock.com`) |
| Voice synthesis | External Colab/NG endpoint (`COLAB_VOICE_URL`) |

## Repository Layout

```text
.
├── public/                     # Static assets (avatar, media.json, videos.json)
├── src/                        # Frontend source
│   ├── components/             # Application components (Chat, Onboarding, ForcedMediaOverlay; PenaltyDispatcher exists but is no longer used in the main UI)
│   ├── components/ui/          # shadcn/ui primitive components
│   ├── data/                   # Runtime data/prompts copied into the build
│   │   ├── config.json
│   │   └── modules.json
│   ├── hooks/                  # Custom React hooks (use-mobile)
│   ├── lib/                    # Utility helpers (cn() Tailwind helper, action parser, state manager, module loader, Emlalock service)
│   ├── pages/                  # Page components (Home.tsx is a Vite placeholder, unused)
│   ├── types/                  # Shared TypeScript interfaces
│   ├── App.css                 # Component-specific styles
│   ├── App.tsx                 # Root React component
│   ├── index.css               # Global styles + Tailwind directives
│   └── main.tsx                # React entry point
├── dist-server/                # Pre-compiled JS output of server.ts and server-side libs
├── server.ts                   # Express server and API routes (source of truth)
├── local_db.json               # Flat-file JSON database (created at runtime)
├── package.json                # pnpm scripts and dependencies
├── tsconfig*.json              # TypeScript project references
├── vite.config.ts              # Vite configuration
├── tailwind.config.js          # Tailwind theme configuration
├── postcss.config.js           # PostCSS plugins
├── eslint.config.js            # ESLint flat config
├── components.json             # shadcn/ui configuration
└── tests/                      # Node test-runner unit/integration tests
```

## Build and Run Commands

All commands are defined in `package.json`:

```bash
# Install dependencies (pnpm is the configured package manager)
pnpm install

# Start the Vite dev server (frontend only, port 5173)
pnpm run dev

# Type-check and build the production frontend into ./dist
pnpm run build

# Start the full Express backend in development mode (serves API + Vite SPA)
pnpm run server

# Lint the project
pnpm run lint

# Preview the production build
pnpm run preview

# Run the Node test suite
pnpm test

# Regenerate public/media.json from external asset lists
pnpm run regen:media
```

The canonical local development flow is:

```bash
pnpm install
pnpm run server
```

This starts the Express backend on `http://localhost:3000`. In development, the Express app mounts Vite in middleware mode, so both the API and the SPA are served from the same origin. The standalone Vite dev server (`pnpm run dev`) runs on port `5173` and proxies `/api` and `/videos` to `http://localhost:3000`.

## Runtime Architecture

### Development mode (`pnpm run server`)

1. `server.ts` loads data files from `./src/data` and `./public`.
2. It creates a Vite dev server in `middlewareMode: true` and mounts it on the Express app.
3. Express serves API routes under `/api/*` and static videos under `/videos`.
4. Vite handles all non-API requests and serves `index.html` → `/src/main.tsx`.

### Production mode (`NODE_ENV=production pnpm run server`)

1. `server.ts` loads data files from `./dist/data` and `./dist`.
2. Express serves static files from `./dist`.
3. `app.get("*")` serves `./dist/index.html` for all non-API routes (SPA fallback).

### Frontend flow

- `main.tsx` renders `<App />` inside a custom `ErrorBoundary` and `React.StrictMode`.
- `App.tsx` fetches `/api/state` on mount.
- If `setupComplete` is false, it shows `<Onboarding />` which calls `/api/setup`.
- After setup, if `user_profile.first_contact_at` is not set, it shows a waiting screen while the server simulates Lyra reviewing the contract/key proof.
- Once first contact exists, it shows a messenger-style UI: a Lyra contact header, a minimal sidebar with only lock status/pending time, and a main area that displays either `<Chat />` or `<ForcedMediaOverlay />`.
- `<ForcedMediaOverlay />` handles both video and image URLs: it detects the media type from the category (`sissy_hypno` = video) or file extension and renders either a video player with pause-on-blur behavior or a fullscreen image with a confirm button. Completing a forced video can automatically satisfy a milestone defined in `milestones.json`.
- The sidebar shows pending lock status, pending penalties, a language switch, and a list of `pendingMilestones` (open proof requirements) so the User sees what Lyra currently demands.
- `Chat.tsx` sends messages (with optional base64 attachments) to `/api/chat`, shows timestamps/read receipts, and supports per-Lyra-message actions (edit/delete/regenerate) and voice playback.

### Backend flow for chat

- `POST /api/chat` reads the persisted DB, validates that a Gemini key is configured, loads the module prompt via `src/lib/moduleLoader.ts` (including milestone context, action-tag grammar, style constraints, memory context, and a language directive), calls the Gemini API with a configured `temperature`/`maxOutputTokens` (model name read from `src/data/config.json` with `models/` prefix stripped), parses `[ACTION: ...]` tags via `src/lib/actionParser.ts`, updates state, and persists it to `local_db.json`. Empty responses are replaced by a language-aware fallback. After the response, the server runs a hybrid progression check: if the User has reached the next module's `requirementPoints`, all `completion_flags` of the current module are set, and all milestones for the current module are completed, it auto-advances `current_module_id`, adds progression points, and appends a generated transition line to Lyra's answer.
- `GET /api/state` may automatically generate Lyra's first-contact message once the configured intro delay (`LYRA_INTRO_DELAY_MS`, default 30 s) has passed after `setup_completed_at`.
- Each chat exchange is also fed through a lightweight memory-extraction prompt that appends 0–2 new highlights to `user_profile.memory_highlights` (capped at 15), so Lyra can recall details that come up during conversation.

## Configuration Files

- `vite.config.ts`: sets `base: './'`, dev port `5173`, React plugin, `@` alias to `./src`, the `kimi-plugin-inspect-react` plugin, and proxies `/api` and `/videos` to `http://localhost:3000`.
- `tsconfig.json`: project references to `tsconfig.app.json`, `tsconfig.node.json`, and `tsconfig.server.json`; defines the `@/*` path alias.
- `tsconfig.app.json`: frontend TypeScript config (`target: ES2022`, `jsx: react-jsx`, `strict: true`, includes `src`; excludes legacy `src/lib/stateManager.ts` and `src/lib/moduleLoader.ts`).
- `tsconfig.node.json`: config for the Vite config file (`target: ES2023`, includes `vite.config.ts`).
- `tsconfig.server.json`: separate config for the server sources (`server.ts`, `src/lib/stateManager.ts`, `src/lib/moduleLoader.ts`, `src/types/engine.ts`), outputting to `dist-server`.
- `tailwind.config.js`: Tailwind v3 config with shadcn CSS-variable based theme, custom colors, border radius, keyframes, and `tailwindcss-animate` plugin.
- `postcss.config.js`: applies `tailwindcss` and `autoprefixer`.
- `eslint.config.js`: flat ESLint config for `**/*.{ts,tsx}`, using `@eslint/js`, `typescript-eslint`, `react-hooks`, and `react-refresh`. `dist`, `src/components/ui/**`, and `.worktrees/**` are ignored.
- `components.json`: shadcn/ui project config (New York style, `rsc: false`, `tsx: true`, icon library `lucide`).

## Data and Content Model

- `src/data/modules.json`: Defines 15 sequential modules (e.g. `Das Intake`, `Das Erwachen`, `Die Nuria-Wunde`, ..., `Der offene Loop`). Each module has `id`, `title`, `requirementPoints`, `ai_prompt`, optional `media_triggers`, and optional `completion_flags`. The flags mark which story beats der User abschließen muss, bevor der Server ihn automatisch ins nächste Modul befördert. Loaded and cached by `src/lib/moduleLoader.ts`.
- `src/data/milestones.json`: Defines photo, media, and combo milestones that block module progression until their flag is set. Each milestone has `id`, `title`, `description`, `type` (`photo` | `media` | `combo`), `module_id`, `flag`, `points_bonus`, optional `media_trigger` (e.g. `sissy_hypno:1`), and optional `required_flags` for combos. Loaded and cached by `src/lib/moduleLoader.ts`.
- `src/data/config.json`: Static app metadata (name, model names for Gemini, Emlalock base URL).
- `public/media.json`: Image URLs organized by category (`lyra:charlie1..5`, `nuria`, `sissy_captions`, `misc_gifs`).
- `public/videos.json`: List of hypno video titles under `sissy_hypno`.

State is persisted in `local_db.json` at the project root. The V3 schema is centered on `user_profile` (see `src/types/engine.ts`) and `chat_history`. `user_profile` includes realism anchors (`real_name`, `ex_name`, `setup_friend`, `trapper`), contract/key timeline fields (`contract_signed_at`, `cage_locked_at`, `key_sent_at`, `key_received_at`, `first_contact_at`), activity/email counters, `memory_highlights`, and a `language` field (`de`, `en`, `es`, `fr`, `it`, etc.) that controls the language Lyra replies in. `ChatMessage` includes optional `id` and `createdAt`. Legacy V2 states are migrated on load by `src/lib/stateManager.ts`.

## API Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/state` | Return DB state + loaded modules/media metadata |
| POST | `/api/state` | Overwrite DB state |
| GET | `/api/defaults` | Return resolved default API keys (Gemini + Emlalock) so the onboarding form can pre-fill them |
| POST | `/api/chat` | Main chat endpoint |
| POST | `/api/setup` | Initialize API keys, personal realism anchors, contract/key dates, and proof attachment |
| POST | `/api/chat/delete` | Delete a chat message by `id` |
| POST | `/api/chat/edit` | Edit the content of a chat message by `id` |
| POST | `/api/chat/regenerate` | Regenerate a Lyra message by `id` using the preceding context |
| POST | `/api/hardware/penalty` | Apply a queued Emlalock penalty |
| POST | `/api/hardware/sync` | Retry all queued Emlalock penalties |
| POST | `/api/media/complete` | Clear active forced media URL |
| POST | `/api/voice` | Synthesize voice via external endpoint |
| POST | `/api/ambush` | Manually trigger an email ambush; optional `sender` body field forces a specific persona (`lyra`, `laura`, `nuria`, `jonathan`) |
| GET | `/api/media/:category` | Return a random media URL |
| GET | `/api/video/random` | Return a random video title |

## Code Organization

### Frontend

- `src/App.tsx`: Root component. Fetches state, renders onboarding, waiting screen, or messenger UI, handles optimistic chat updates, penalty dispatch, forced media completion, and chat-message management callbacks.
- `src/components/Chat.tsx`: Messenger-style chat history with timestamps, read receipts, file attachments (base64), inline media, per-Lyra-message edit/delete/regenerate actions, and on-demand voice synthesis.
- `src/components/Onboarding.tsx`: Narrative multi-step setup collecting personal anchors (names, contract/key dates), a cage proof photo, and API keys (Gemini, Emlalock token, Emlalock holder key). The API-key fields are pre-filled from `/api/defaults` based on environment variables.
- `src/components/PenaltyDispatcher.tsx`: Lists pending/success/error Emlalock penalties (currently unused in the main UI but kept for reuse).
- `src/components/ForcedMediaOverlay.tsx`: Full-screen media overlay for forced videos and images.


### Backend / shared libraries

- `server.ts`: Express app, route handlers, email/voice/media helpers, environment loading, memory-context injection, automatic first-contact generation, a language directive builder for Lyra, and a multi-sender email ambush system (Lyra, Laura, the ex, and the ex's new partner).
- `src/lib/actionParser.ts`: Parses `[ACTION: SET_MODULE=...]`, `[ACTION: SET_FLAG=...]`, `[ACTION: PENALTY_MINUTES=...]`, `[ACTION: ADD_POINTS=...]`, and `[ACTION: FORCE_MEDIA=category:index]` tags from AI responses.
- `src/lib/stateManager.ts`: Reads/writes `local_db.json`, validates schema, initializes defaults, and migrates legacy states.
- `src/lib/moduleLoader.ts`: Loads `modules.json` and `milestones.json`, validates both schemas, caches them, builds per-module system prompts with variable substitution (`{compliance_points}`, `{flag:...}`), injects milestone context, and provides `checkModuleProgression()` for hybrid progression.
- `src/lib/emlalockService.ts`: Communicates with the Emlalock API (`/addrandom` + `/addmaximum` for positive penalties, `/sub` for negative penalties), queues failed penalties, and retries queued penalties.
- `src/types/engine.ts` and `src/types/types.ts`: Shared TypeScript interfaces. `engine.ts` is the canonical V3 DB/model shape; `types.ts` adds the legacy `AppState`/`SetupState` shapes still used by the frontend.

## Code Style Guidelines

- TypeScript is used everywhere; `strict: true` is enabled in all tsconfigs.
- Imports use absolute `@/` aliases for `src` paths (e.g., `@/components/ui/button`).
- UI components are generated shadcn/ui components in `src/components/ui`.
- Tailwind utility classes are used inline; custom shared utilities live in `src/index.css` under `@layer utilities` (e.g., `.glass-panel`, `.nuria-glow`, `.custom-scrollbar`).
- Components are functional and default-exported.
- React state hooks use explicit TypeScript generics.
- Server code uses `async/await` with `try/catch` blocks around DB and network calls.
- Action tags parsed from AI responses are uppercase bracketed tokens such as `[ACTION: PENALTY_MINUTES=5]`, `[ACTION: ADD_POINTS=10]`, and `[ACTION: FORCE_MEDIA=category:index]`.
- Keep UI text in German where the existing UI uses German; English is acceptable for new technical labels.

## Testing Instructions

The project uses Node's built-in test runner. Tests live in `tests/` and are executed via:

```bash
pnpm test
```

This runs `tsx --test "tests/**/*.test.ts"`, which executes:

- `tests/actionParser.test.ts` — parsing of AI action tags.
- `tests/emlalockService.test.ts` — Emlalock API calls, credential parsing, queue handling.
- `tests/integration.test.ts` — end-to-end module transition and penalty scenarios.
- `tests/moduleLoader.test.ts` — module loading, prompt building, and variable injection.
- `tests/stateManager.test.ts` — DB initialization, validation, persistence, and legacy migration.

Additionally, run these verification steps before claiming a change is complete:

1. `pnpm run lint` — check for ESLint errors.
2. `pnpm run build` — verify TypeScript compilation and Vite bundling.
3. `pnpm run server` — interact with the UI at `http://localhost:3000`.

If you add new tests, place them in `tests/` or `src/__tests__/` and wire them through `package.json` scripts if needed.

## Security Considerations

> **Critical:** `server.ts` no longer contains hard-coded API keys or credentials. All secrets must be supplied via environment variables (`.env` file or `ENV_PATH`).

- `.env` and `local_db.json` are listed in `.gitignore` and must never be committed.
- `dist-server/` is excluded from version control; build it locally from `server.ts` when needed.
- The `/api/defaults` endpoint reads secrets from environment variables and pre-fills the onboarding UI for local single-user convenience. It never returns hard-coded values.
- `local_db.json` stores keys and state locally without encryption.
- The application calls third-party services (Gemini, Emlalock, GMX SMTP, an external voice endpoint) with credentials from environment variables or user input.
- No input sanitization beyond JSON parsing is performed on user messages; the prompt is sent directly to the Gemini API.
- No authentication or session isolation is implemented; any caller with access to the local server can read or mutate state.

**Before any production deployment, you should:**

1. Keep secrets in `.env` and verify `.env` / `local_db.json` / `dist-server/` are in `.gitignore`.
2. Rotate any credentials that were previously hard-coded or committed.
3. Consider adding request validation, rate limiting, and authentication.

## Deployment Notes

- Build the frontend first with `pnpm run build` (outputs to `./dist`).
- Ensure `src/data` is present in `./dist/data` after the build.
- Start the server with `NODE_ENV=production pnpm run server`.
- The server listens on `0.0.0.0:3000` by default.
- `dist-server/` contains pre-compiled JavaScript that mirrors `server.ts` and the server-side libraries; the source files in the root are the current source of truth and should be edited, not the `dist-server` files (unless you explicitly intend to maintain the compiled output).

## Useful Conventions for Agents

- When adding new AI-driven behavior, prefer updating `src/data/modules.json` over hard-coding strings in `server.ts`.
- New shadcn/ui components can be added with the shadcn CLI; aliases are configured in `components.json`.
- If you change server-side interfaces, update `src/types/engine.ts` and keep `src/types/types.ts` and `src/lib/moduleLoader.ts` in sync.
- Do not commit `local_db.json`, `node_modules`, or `dist` (they are already in `.gitignore`).
- If you regenerate `public/media.json` or `public/videos.json`, remember that the production server reads them from `./dist`.
- The UI is intentionally designed as a realistic private-messenger experience. Avoid introducing visible game mechanics (points, levels, phases, cycles) into the UI; keep such logic in the backend or expose it only through Lyra's natural language.
