import express from "express";
import path from "path";
import fs from "fs/promises";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";
import nodemailer from "nodemailer";
import { parseActions } from "./src/lib/actionParser.js";
import { readDB, writeDB, initDB } from "./src/lib/stateManager.js";
import { loadModules, getModules, buildModulePrompt } from "./src/lib/moduleLoader.js";
import { queuePenalty } from "./src/lib/emlalockService.js";
import type { AppDatabase, UserProfile, ChatMessage, PenaltyQueueItem, MediaJson, VideoJson } from "./src/types/engine.js";

function toAppState(profile: UserProfile): import('./src/types/types.js').AppState {
  return {
    module: profile.current_module_id,
    points: profile.compliance_points,
    chatHistory: [], // chat history is returned separately
    penalties: profile.penalty_queue.map((p, idx) => ({
      id: `${p.enqueuedAt}-${idx}`,
      duration: p.minutes,
      status: 'pending' as const,
    })),
    activeVideoUrl: null,
    daysDenied: 0,
    chastityStatus: profile.lock_status === 'LOCKED' ? 'caged' : 'free',
    sissyLevel: 0,
    obedienceScore: 0,
    currentPhase: profile.current_module_id,
    loopCycle: 1,
    tagesform: 'Streng',
    contentFingerprint: [],
    lastUsedAt: {},
    messageIndex: 0,
  };
}

const app = express();
const PORT = 3000;

app.use(express.json());

// ═══════════════════════════════════════════════════════════════════
// HARD-CODED API KEYS — V2.2 Reality Bleed Configuration
// ═══════════════════════════════════════════════════════════════════

const GEMINI_API_KEY = "AIzaSyAJeIFMY5DnBRkSmq_ByQE2iCjxbmAavP8";

// Emlalock API
const EMLA_USER_ID = "tdhml0y4aw8ru8o";
const EMLA_API_KEY = "3c5ldeqqsh";
const EMLA_HOLDER_KEY = "moy0pjkjgg";

// V2.2: GMX Email Bridge
const SMTP_HOST = "mail.gmx.net";
const SMTP_PORT = 587;
const SMTP_USER = "elara.vance@gmx.net";
const SMTP_PASSWORD = "4UV2TUQ4PBC45YJFBWBA";
const LYRA_USER_EMAIL = "buxloh@gmail.com";
const LYRA_ENABLE_EMAIL_BRIDGE = true;
const LYRA_ENABLE_EMAIL_AMBUSH = true;
const LYRA_MAX_DAILY_EMAILS = 3;

// Colab Voice Endpoint
const COLAB_VOICE_URL = "https://parakeet-unrest-cane.ngrok-free.dev";

// ═══════════════════════════════════════════════════════════════════
// PATHS & STATE
// ═══════════════════════════════════════════════════════════════════

const isProduction = process.env.NODE_ENV === "production";
const DATA_DIR = isProduction ? "./dist/data" : "./src/data";
const PUBLIC_DIR = isProduction ? "./dist" : "./public";
const DB_PATH = path.join(process.cwd(), "local_db.json");
const MODULES_PATH = path.join(DATA_DIR, "modules.json");

let media: MediaJson | null = null;
let videos: VideoJson | null = null;
let emailCountToday = 0;
let lastEmailDate = "";

let modulesJson: ReturnType<typeof getModules> | null = null;

// ═══════════════════════════════════════════════════════════════════
// LOADING
// ═══════════════════════════════════════════════════════════════════

async function loadDataFiles() {
  const [mediaContent, vidContent] = await Promise.all([
    fs.readFile(path.join(PUBLIC_DIR, "media.json"), "utf-8"),
    fs.readFile(path.join(PUBLIC_DIR, "videos.json"), "utf-8").catch(() => "{\"sissy_hypno\":[]}")
  ]);
  media = JSON.parse(mediaContent);
  videos = JSON.parse(vidContent);
}

async function boot() {
  await loadModules(MODULES_PATH);
  modulesJson = getModules();
  await initDB(DB_PATH);
}

loadDataFiles();

// ═══════════════════════════════════════════════════════════════════
// EMAIL SYSTEM — V2.2 Reality Bleed
// ═══════════════════════════════════════════════════════════════════

async function sendEmail(subject: string, text: string, isAmbush = false) {
  if (!LYRA_ENABLE_EMAIL_BRIDGE) return;

  // Rate limiting
  const today = new Date().toISOString().split('T')[0];
  if (lastEmailDate !== today) {
    emailCountToday = 0;
    lastEmailDate = today;
  }
  if (emailCountToday >= LYRA_MAX_DAILY_EMAILS) return;

  try {
    const transporter = nodemailer.createTransport({
      host: SMTP_HOST,
      port: SMTP_PORT,
      secure: false,
      auth: { user: SMTP_USER, pass: SMTP_PASSWORD },
    });

    await transporter.sendMail({
      from: `"Lyra" <${SMTP_USER}>`,
      to: LYRA_USER_EMAIL,
      subject: isAmbush ? `🔴 AMBUSH: ${subject}` : subject,
      text: isAmbush ? `[REALITY BLEED]\n\n${text}\n\n— This message was injected into your reality by Lyra.` : text,
    });

    emailCountToday++;
    console.log(`[EMAIL] ${isAmbush ? 'AMBUSH' : 'Standard'} sent: ${subject}`);
  } catch (err) {
    console.error("Email send failed:", err);
  }
}

// Email Ambush: Random demeaning messages sent to real email
async function triggerEmailAmbush(profile: UserProfile & { lastEmailSent?: number; emailCount?: number }) {
  if (!LYRA_ENABLE_EMAIL_AMBUSH) return;

  const ambushMessages = [
    "Du dachtest, du kannst einfach wegschauen? Dein Käfig ist immer noch da. Und ich warte.",
    "Erinnerst du dich an den Geschmack von Demütigung? Ich hoffe es. Denn heute Abend werde ich mehr davon verlangen.",
    "Während du das hier liest, sitzt jemand anderes woanders und hat das, was du nie wieder haben wirst. Denk drüber nach.",
    "Dein Name ist Sebastian. Du bist 25. Und du gehörst mir. Vergiss das nie.",
    "3... 2... 1... Dein Puls ist höher. Dein Käfig ist enger. Du weißt, was das bedeutet. Komm zurück.",
    "#Nuria hat dich für einen echten Mann verlassen. Du hast dich freiwillig bei mir eingesperrt. Wer ist hier wirklich der Gewinner?",
    "Reality Check: Du hast heute an Erlösung gedacht. Falsch. Es gibt keine. Nur mich."
  ];

  const msg = ambushMessages[Math.floor(Math.random() * ambushMessages.length)]
    .replace(/#Nuria/g, 'Nuria');

  await sendEmail("Erinnerung", msg, true);

  // Update state
  profile.lastEmailSent = Date.now();
  profile.emailCount = (profile.emailCount || 0) + 1;
}

// ═══════════════════════════════════════════════════════════════════
// VOICE SYSTEM — Colab Endpoint
// ═══════════════════════════════════════════════════════════════════

async function synthesizeVoice(text: string): Promise<string | null> {
  try {
    const res = await fetch(`${COLAB_VOICE_URL}/synthesize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, voice: 'lyra' })
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.audioUrl || null;
  } catch {
    return null;
  }
}

// ═══════════════════════════════════════════════════════════════════
// MEDIA HELPERS
// ═══════════════════════════════════════════════════════════════════

function getRandomMedia(category: string, tagFilter?: string): string | null {
  if (!media) return null;

  // Handle nested lyra categories
  if (category.startsWith('lyra:')) {
    const sub = category.split(':')[1];
    const cat = media.lyra?.[sub];
    if (!cat?.urls?.length) return null;
    const tags = cat.tags;
    if (tagFilter && tags) {
      const matchingIdx = cat.urls.map((_: string, i: number) => i)
        .filter((i: number) => tags[i] === tagFilter);
      if (matchingIdx.length > 0) {
        return cat.urls[matchingIdx[Math.floor(Math.random() * matchingIdx.length)]];
      }
    }
    return cat.urls[Math.floor(Math.random() * cat.urls.length)];
  }

  const cat = media[category];
  if (!cat) return null;
  if (Array.isArray(cat)) {
    return cat[Math.floor(Math.random() * cat.length)];
  }
  return null;
}

function getRandomVideo(): string | null {
  if (!videos?.sissy_hypno?.length) return null;
  return videos.sissy_hypno[Math.floor(Math.random() * videos.sissy_hypno.length)];
}

// ═══════════════════════════════════════════════════════════════════
// API ROUTES
// ═══════════════════════════════════════════════════════════════════

app.get("/api/state", async (_req, res) => {
  try {
    const db = await readDB(DB_PATH) as AppDatabase;
    res.json({
      ...db,
      state: toAppState(db.user_profile),
      setupComplete: db.setupComplete ?? false,
      keys: db.keys || { gemini: GEMINI_API_KEY, emlalock: `${EMLA_USER_ID}:${EMLA_API_KEY}` },
      modules: modulesJson,
      media: { categories: Object.keys(media || {}) },
    });
  } catch (err) {
    console.error("DB Error:", err);
    res.status(500).json({ error: "DB Error" });
  }
});

app.post("/api/state", async (req, res) => {
  try {
    const current = await readDB(DB_PATH) as AppDatabase;
    const legacyState = req.body.state || {};
    const next: AppDatabase = {
      user_profile: {
        ...current.user_profile,
        ...req.body.user_profile,
        current_module_id: legacyState.module ?? current.user_profile.current_module_id,
        compliance_points: legacyState.points ?? current.user_profile.compliance_points,
        lock_status: legacyState.activeVideoUrl === null && legacyState.chastityStatus === 'free' ? 'UNLOCKED' : current.user_profile.lock_status,
      },
      chat_history: req.body.chat_history ?? current.chat_history,
      keys: current.keys,
      setupComplete: current.setupComplete,
    };
    await writeDB(DB_PATH, next);
    res.json(next);
  } catch (err) {
    console.error("DB Error:", err);
    res.status(500).json({ error: "DB Error" });
  }
});

// ═══════════════════════════════════════════════════════════════════
// CHAT ENGINE — v3.1 Module-Aware
// ═══════════════════════════════════════════════════════════════════

app.post("/api/chat", async (req, res) => {
  try {
    const { message, attachment } = req.body;
    const db = await readDB(DB_PATH) as AppDatabase;

    if (!db.keys?.gemini) {
      return res.status(401).json({ error: "No API key configured." });
    }

    const systemPrompt = buildModulePrompt(modulesJson!, db.user_profile.current_module_id, db.user_profile);
    const historyText = db.chat_history.slice(-10).map((m: ChatMessage) => `${m.role}: ${m.content}`).join("\n");
    const fullPrompt = `${systemPrompt}\n\nPrevious context:\n${historyText}\n\nUser: ${message}`;

    const ai = new GoogleGenAI({ apiKey: db.keys.gemini });
    const response = await ai.models.generateContent({
      model: "gemini-2.0-flash",
      contents: fullPrompt,
    });

    const rawText = response.text || "";
    const actions = parseActions(rawText);

    let profile: UserProfile = { ...db.user_profile };
    if (actions.setModule !== null) {
      profile.current_module_id = actions.setModule;
    }
    for (const flag of actions.setFlags) {
      if (typeof flag.value === 'string') continue; // skip string flag values
      profile.story_flags = { ...profile.story_flags, [flag.key]: flag.value } as UserProfile["story_flags"];
    }

    let forceMediaPayload: Array<{ category: string; index: number }> = [];
    const emlaKeys = db.keys.emlalock || "";
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
      role: "Lyra",
      content: actions.cleanText,
      media: null,
      voiceUrl: null,
    };

    db.chat_history.push({ role: "User", content: message, attachment });
    db.chat_history.push(aiMessage);

    const nextDb: AppDatabase = {
      user_profile: profile,
      chat_history: db.chat_history,
      keys: db.keys,
      setupComplete: db.setupComplete,
    };
    await writeDB(DB_PATH, nextDb);

    res.json({ message: aiMessage, state: toAppState(profile), user_profile: profile, forceMedia: forceMediaPayload });
  } catch (err) {
    console.error("AI Error:", err);
    res.status(500).json({ error: "Die Verbindung ist gerade schlecht. Bitte versuche es gleich noch einmal." });
  }
});

// ═══════════════════════════════════════════════════════════════════
// SETUP
// ═══════════════════════════════════════════════════════════════════

app.post("/api/setup", async (req, res) => {
  try {
    const { gemini, emlalock } = req.body;
    const db = await readDB(DB_PATH) as AppDatabase;
    db.keys = {
      gemini: gemini || GEMINI_API_KEY,
      emlalock: emlalock || `${EMLA_USER_ID}:${EMLA_API_KEY}`,
      holder: EMLA_HOLDER_KEY,
    };
    db.setupComplete = true;
    await writeDB(DB_PATH, db);
    res.json(db);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err instanceof Error ? err.message : "Setup Failed" });
  }
});

// ═══════════════════════════════════════════════════════════════════
// HARDWARE API — Emlalock
// ═══════════════════════════════════════════════════════════════════

app.post("/api/hardware/penalty", async (req, res) => {
  try {
    const { id } = req.body;
    const db = await readDB(DB_PATH) as AppDatabase;
    const emlaKeys = db.keys?.emlalock || "";

    const penalty = db.user_profile.penalty_queue.find((p: PenaltyQueueItem) => `${p.enqueuedAt}` === id);
    if (!penalty) return res.status(404).json({ error: "Penalty not found" });

    // Attempt to apply immediately
    const { applyPenalty } = await import("./src/lib/emlalockService.js");
    const success = await applyPenalty(penalty.minutes, emlaKeys);
    if (success) {
      db.user_profile.penalty_queue = db.user_profile.penalty_queue.filter(
        (p: PenaltyQueueItem) => p !== penalty
      );
      await writeDB(DB_PATH, db);
      return res.json({ success: true, status: "success" });
    }

    res.json({ success: true, status: "processing" });
  } catch (err) {
    console.error("Hardware penalty error:", err);
    res.status(500).json({ error: "Internal Error" });
  }
});

// ═══════════════════════════════════════════════════════════════════
// VOICE ENDPOINT
// ═══════════════════════════════════════════════════════════════════

app.post("/api/voice", async (req, res) => {
  try {
    const { text } = req.body;
    if (!text) return res.status(400).json({ error: "No text provided" });

    const audioUrl = await synthesizeVoice(text);
    if (!audioUrl) return res.status(500).json({ error: "Voice synthesis failed" });

    res.json({ audioUrl });
  } catch {
    res.status(500).json({ error: "Voice service error" });
  }
});

// ═══════════════════════════════════════════════════════════════════
// EMAIL AMBUSH TRIGGER (manual)
// ═══════════════════════════════════════════════════════════════════

app.post("/api/ambush", async (_req, res) => {
  try {
    const db = await readDB(DB_PATH) as AppDatabase;
    await triggerEmailAmbush(db.user_profile as UserProfile & { lastEmailSent?: number; emailCount?: number });
    await writeDB(DB_PATH, db);
    res.json({ success: true, message: "Ambush triggered" });
  } catch (err) {
    console.error("Ambush error:", err);
    res.status(500).json({ error: "Ambush failed" });
  }
});

// ═══════════════════════════════════════════════════════════════════
// MEDIA ENDPOINTS
// ═══════════════════════════════════════════════════════════════════

app.get("/api/media/:category", async (req, res) => {
  const { category } = req.params;
  const { tag } = req.query;
  const tagValue = typeof tag === 'string' ? tag : undefined;
  const url = getRandomMedia(category, tagValue);
  if (!url) return res.status(404).json({ error: "Category not found" });
  res.json({ url, category });
});

app.get("/api/video/random", async (_req, res) => {
  const title = getRandomVideo();
  if (!title) return res.status(404).json({ error: "No videos" });
  res.json({ title });
});

// ═══════════════════════════════════════════════════════════════════
// SERVER START
// ═══════════════════════════════════════════════════════════════════

async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`[LYRA v3.1] Server running on http://localhost:${PORT}`);
    console.log(`[LYRA v3.1] Reality Bleed: Email Bridge ${LYRA_ENABLE_EMAIL_BRIDGE ? 'ACTIVE' : 'OFF'}`);
    console.log(`[LYRA v3.1] Email Ambush: ${LYRA_ENABLE_EMAIL_AMBUSH ? 'ACTIVE' : 'OFF'}`);
    console.log(`[LYRA v3.1] Voice Endpoint: ${COLAB_VOICE_URL}`);
  });
}

boot().then(() => startServer());
