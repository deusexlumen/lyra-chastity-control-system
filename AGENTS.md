# Agent Guide — Lyra Chastity Control System

> This file is written for AI coding agents. It assumes no prior knowledge of the project and describes the actual structure, commands, conventions, and risks found in the repository.

## Project Overview

This is a single-user, AI-driven roleplay/control web application called **Lyra Chastity Control System**. It combines a React/TypeScript frontend with a Node.js/Express backend to run an interactive chat session where a dominant persona ("Lyra") responds to user messages, tracks persistent state, and can trigger external integrations such as chastity-device timers (Emlalock), email messages, and media playback.

The project content and generated text are adult/NSFW in nature (femdom, chastity, sissification, and related themes). All content logic is data-driven via JSON manifest files and Markdown prompt templates.

## Technology Stack

| Layer | Technology |
|-------|-------------|
| Frontend framework | React 19 + TypeScript 5.9 |
| Build tool / dev server | Vite 7.2.4 |
| Routing | `react-router` 7 (installed; currently only one page is used) |
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
│   ├── components/             # Application components (Chat, Onboarding, PenaltyDispatcher, VideoHandler)
│   ├── components/ui/          # shadcn/ui primitive components
│   ├── data/                   # Runtime data/prompts copied into the build
│   │   ├── config.json
│   │   ├── content_manifest.json
│   │   ├── lyra_system_prompt_v2.md
│   │   ├── modules.json
│   │   └── persona.json
│   ├── hooks/                  # Custom React hooks (useLyraEngine, use-mobile)
│   ├── lib/                    # Utility helpers (cn() Tailwind helper)
│   ├── pages/                  # Page components (Home.tsx is present but unused)
│   ├── types/                  # Shared TypeScript interfaces
│   ├── App.css                 # Component-specific styles
│   ├── App.tsx                 # Root React component
│   ├── index.css               # Global styles + Tailwind directives
│   └── main.tsx                # React entry point
├── dist-server/                # Pre-compiled JS output of server.ts + sessionEngine.ts
├── server.ts                   # Express server and API routes (source of truth)
├── sessionEngine.ts            # Content selection, intent detection, state helpers
├── local_db.json               # Flat-file JSON database (created at runtime)
├── package.json                # npm scripts and dependencies
├── tsconfig*.json              # TypeScript project references
├── vite.config.ts              # Vite configuration
├── tailwind.config.js          # Tailwind theme configuration
├── postcss.config.js           # PostCSS plugins
├── eslint.config.js            # ESLint flat config
└── components.json             # shadcn/ui configuration
```

## Build and Run Commands

All commands are defined in `package.json`:

```bash
# Install dependencies
npm install

# Start the Vite dev server (frontend only, port 3000)
npm run dev

# Type-check and build the production frontend into ./dist
npm run build

# Start the full Express backend in development mode (serves API + Vite SPA)
npm run server

# Lint the project
npm run lint

# Preview the production build
npm run preview
```

The canonical local development flow is:

```bash
npm install
npm run server
```

This starts the Express backend on `http://localhost:3000`. In development, the Express app mounts Vite in middleware mode, so both the API and the SPA are served from the same origin.

## Runtime Architecture

### Development mode (`npm run server`)

1. `server.ts` loads data files from `./src/data` and `./public`.
2. It creates a Vite dev server in `middlewareMode: true` and mounts it on the Express app.
3. Express serves API routes under `/api/*`.
4. Vite handles all non-API requests and serves `index.html` → `/src/main.tsx`.

### Production mode (`NODE_ENV=production npm run server`)

1. `server.ts` loads data files from `./dist/data` and `./dist`.
2. Express serves static files from `./dist`.
3. `app.get("*")` serves `./dist/index.html` for all non-API routes (SPA fallback).

### Frontend flow

- `main.tsx` renders `<App />` inside a custom `ErrorBoundary` and `React.StrictMode`.
- `App.tsx` fetches `/api/state` on mount.
- If `setupComplete` is false, it shows `<Onboarding />` which calls `/api/setup`.
- Once set up, it shows a sidebar (stats, penalties, manual ambush button) and a main area that displays either `<Chat />` or `<VideoHandler />`.
- `Chat.tsx` sends messages (with optional base64 attachments) to `/api/chat`.

### Backend flow for chat

- `POST /api/chat` reads the persisted DB, determines user intent, selects content from the manifest via `sessionEngine.ts`, builds a system prompt from `src/data/lyra_system_prompt_v2.md`, injects state variables, calls the Gemini API, parses `[ACTION: ...]` tags, updates state, and persists it to `local_db.json`.

## Configuration Files

- `vite.config.ts`: sets `base: './'`, dev port `3000`, React plugin, `@` alias to `./src`, and the `kimi-plugin-inspect-react` plugin.
- `tsconfig.json`: project references to `tsconfig.app.json` and `tsconfig.node.json`; defines the `@/*` path alias.
- `tsconfig.app.json`: frontend TypeScript config (`target: ES2022`, `jsx: react-jsx`, `strict: true`, includes `src`).
- `tsconfig.node.json`: config for Vite config file (`target: ES2023`, includes `vite.config.ts`).
- `tsconfig.server.json`: separate config for the server sources (`server.ts`, `sessionEngine.ts`), outputting to `dist-server`.
- `tailwind.config.js`: Tailwind v3 config with shadcn CSS-variable based theme, custom colors, border radius, keyframes, and `tailwindcss-animate` plugin.
- `postcss.config.js`: applies `tailwindcss` and `autoprefixer`.
- `eslint.config.js`: flat ESLint config for `**/*.{ts,tsx}`, using `@eslint/js`, `typescript-eslint`, `react-hooks`, and `react-refresh`.
- `components.json`: shadcn/ui project config (New York style, `rsc: false`, `tsx: true`, icon library `lucide`).

## Data and Content Model

- `src/data/modules.json`: Defines 5 phases (`Das Intake` → `Das Endgame`) and their required points/content pools.
- `src/data/content_manifest.json`: Content pools, items, weights, cooldowns, trigger conditions, variable substitutions (`#PetName`, `#DaysDenied`, `#Nuria`, etc.), and intensity descriptors.
- `src/data/lyra_system_prompt_v2.md`: Base system prompt for Gemini.
- `src/data/config.json`: Static app metadata (name, model names, Emlalock base URL).
- `src/data/persona.json`: Persona rules and action-tag regex patterns.
- `public/media.json`: Image URLs organized by category (`lyra:charlie1..5`, `nuria`, `sissy_captions`, `misc_gifs`).
- `public/videos.json`: List of hypno video titles under `sissy_hypno`.

State is persisted in `local_db.json` at the project root. A SHA-256 checksum over the `state` object is stored to detect tampering.

## API Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/state` | Return DB state + loaded modules/media metadata |
| POST | `/api/state` | Overwrite DB state |
| POST | `/api/chat` | Main chat endpoint |
| POST | `/api/setup` | Initialize API keys and run initial assessment |
| POST | `/api/hardware/penalty` | Push a pending penalty to Emlalock |
| POST | `/api/voice` | Synthesize voice via external endpoint |
| POST | `/api/ambush` | Manually trigger an email ambush |
| GET | `/api/media/:category` | Return a random media URL |
| GET | `/api/video/random` | Return a random video title |

## Code Style Guidelines

- TypeScript is used everywhere; `strict: true` is enabled in all tsconfigs.
- Imports use absolute `@/` aliases for `src` paths (e.g., `@/components/ui/button`).
- UI components are generated shadcn/ui components in `src/components/ui`.
- Tailwind utility classes are used inline; custom shared utilities live in `src/index.css` under `@layer utilities` (e.g., `.glass-panel`, `.nuria-glow`, `.custom-scrollbar`).
- Components are functional and default-exported.
- React state hooks use explicit TypeScript generics.
- Server code uses `async/await` with `try/catch` blocks around DB and network calls.
- Action tags parsed from AI responses are uppercase bracketed tokens such as `[ACTION: PENALTY_MINUTES=5]` and `[ACTION: ADD_POINTS=10]`.

## Testing Instructions

**The project currently has no automated tests.** No `*.test.*` or `*.spec.*` files exist. The verification workflow is manual:

1. Run `npm run lint` to check for ESLint errors.
2. Run `npm run build` to verify TypeScript compilation and Vite bundling.
3. Run `npm run server` and interact with the UI at `http://localhost:3000`.

If you add tests, place them in a `tests/` or `src/__tests__/` directory and wire a test runner through `package.json` scripts.

## Security Considerations

> **Critical:** This codebase contains hard-coded API keys and credentials in `server.ts` (Gemini, Groq, OpenAI, Emlalock, SMTP). These are committed to the repository and must be rotated immediately if the repository is shared or made public.

- The `dist-server/server.js` counterpart uses `process.env.*` fallbacks but still has the same defaults baked in.
- `local_db.json` stores keys and state locally without encryption.
- The application calls third-party services (Gemini, Emlalock, GMX SMTP, an external NGrok voice endpoint) with user-provided or hard-coded credentials.
- No input sanitization beyond JSON parsing is performed on user messages; the prompt is sent directly to the Gemini API.
- No authentication or session isolation is implemented; any caller with access to the local server can read or mutate state.

**Before any production deployment, you should:**

1. Remove all hard-coded secrets from `server.ts` and rely solely on environment variables.
2. Add an `.env` file (and add it to `.gitignore`) for `GEMINI_API_KEY`, `EMLA_USER_ID`, `EMLA_API_KEY`, `SMTP_USER`, `SMTP_PASSWORD`, etc.
3. Rotate all exposed credentials.
4. Consider adding request validation, rate limiting, and authentication.

## Deployment Notes

- Build the frontend first with `npm run build` (outputs to `./dist`).
- Copy `src/data` into `./dist/data` if it is not already included by the build.
- Start the server with `NODE_ENV=production npm run server`.
- The server listens on `0.0.0.0:3000` by default.
- `dist-server/` contains pre-compiled JavaScript that mirrors `server.ts`/`sessionEngine.ts`; the source files in the root are the current source of truth and should be edited, not the `dist-server` files (unless you explicitly intend to maintain the compiled output).

## Useful Conventions for Agents

- Keep UI text in German where the existing UI uses German; English is acceptable for new technical labels.
- When adding new AI-driven behavior, update `src/data/content_manifest.json` and `src/data/modules.json` rather than hard-coding strings in `server.ts`.
- New shadcn/ui components can be added with the shadcn CLI; aliases are configured in `components.json`.
- If you change server-side interfaces, update `src/types/types.ts` and keep `sessionEngine.ts` exports in sync.
- Do not commit `local_db.json`, `node_modules`, or `dist` (they are already in `.gitignore`).
