import express from "express";
import path from "path";
import fs from "fs/promises";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";
import crypto from "crypto";
import nodemailer from "nodemailer";
import { 
  loadManifest, 
  selectContent, 
  determineIntent, 
  buildSystemPrompt,
  rotateTagesform,
  type UserState,
  type UserIntent
} from "./sessionEngine.js";

const app = express();
const PORT = 3000;

app.use(express.json());

// ═══════════════════════════════════════════════════════════════════
// HARD-CODED API KEYS — V2.2 Reality Bleed Configuration
// ═══════════════════════════════════════════════════════════════════

const GEMINI_API_KEY = "AIzaSyAJeIFMY5DnBRkSmq_ByQE2iCjxbmAavP8";
const GROQ_API_KEY = "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";
const OPENAI_API_KEY = "sk-kimi-Q3QKvb324UFFEQfPvBUCdHRc6seh7UfSXGYcN3FZvNexHhmx1f6vSwCsQDmOSklw";

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

let modules: any = null;
let media: any = null;
let videos: any = null;
let emailCountToday = 0;
let lastEmailDate = "";

// ═══════════════════════════════════════════════════════════════════
// LOADING
// ═══════════════════════════════════════════════════════════════════

async function loadDataFiles() {
  const [modContent, mediaContent, vidContent] = await Promise.all([
    fs.readFile(path.join(DATA_DIR, "modules.json"), "utf-8"),
    fs.readFile(path.join(PUBLIC_DIR, "media.json"), "utf-8"),
    fs.readFile(path.join(PUBLIC_DIR, "videos.json"), "utf-8").catch(() => "{\"sissy_hypno\":[]}")
  ]);
  modules = JSON.parse(modContent);
  media = JSON.parse(mediaContent);
  videos = JSON.parse(vidContent);
}

loadDataFiles();
loadManifest(path.join(DATA_DIR, "content_manifest.json")).catch(err => {
  console.error("Failed to load content manifest:", err);
});

// ═══════════════════════════════════════════════════════════════════
// DATABASE
// ═══════════════════════════════════════════════════════════════════

async function initDB() {
  try {
    await fs.access(DB_PATH);
  } catch {
    const initialDb = {
      setupComplete: true,
      keys: { 
        gemini: GEMINI_API_KEY,
        groq: GROQ_API_KEY,
        openai: OPENAI_API_KEY,
        emlalock: `${EMLA_USER_ID}:${EMLA_API_KEY}`,
        holder: EMLA_HOLDER_KEY
      },
      state: {
        userName: "Sebastian",
        daysDenied: 0,
        chastityStatus: "caged",
        sissyLevel: 0,
        obedienceScore: 0,
        currentPhase: 0,
        loopCycle: 1,
        tagesform: "Streng",
        contentFingerprint: [],
        lastUsedAt: {},
        messageIndex: 0,
        module: 0,
        points: 0,
        chatHistory: [],
        penalties: [],
        lastEmailSent: null,
        emailCount: 0
      },
    };
    await writeDB(initialDb);
  }
}

async function readDB() {
  try {
    const data = await fs.readFile(DB_PATH, "utf-8");
    const db = JSON.parse(data);
    if (db.checksum) {
      const currentHash = crypto.createHash('sha256').update(JSON.stringify(db.state)).digest('hex');
      if (currentHash !== db.checksum) {
        db.state.cheatDetected = true;
      }
    }
    return db;
  } catch (e) {
    console.error("JSON Parsing Error, repairing file");
    return {
      setupComplete: false,
      keys: { gemini: GEMINI_API_KEY, emlalock: `${EMLA_USER_ID}:${EMLA_API_KEY}` },
      state: { 
        module: 0, points: 0, chatHistory: [], penalties: [], 
        fileCorruptionDetected: true, userName: "Sebastian",
        daysDenied: 0, chastityStatus: "caged", sissyLevel: 0,
        obedienceScore: 0, currentPhase: 0, loopCycle: 1,
        tagesform: "Streng", contentFingerprint: [], lastUsedAt: {}, messageIndex: 0
      },
    };
  }
}

async function writeDB(db: any) {
  db.checksum = crypto.createHash('sha256').update(JSON.stringify(db.state)).digest('hex');
  await fs.writeFile(DB_PATH, JSON.stringify(db, null, 2));
}

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
async function triggerEmailAmbush(db: any, state: UserState) {
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
  db.state.lastEmailSent = Date.now();
  db.state.emailCount = (db.state.emailCount || 0) + 1;
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
    if (tagFilter && cat.tags) {
      const matchingIdx = cat.urls.map((_: string, i: number) => i)
        .filter((i: number) => cat.tags[i] === tagFilter);
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

app.get("/api/state", async (req, res) => {
  try {
    const db = await readDB();
    res.json({ ...db, modules, media: { categories: Object.keys(media || {}) } });
  } catch (err) {
    res.status(500).json({ error: "DB Error" });
  }
});

app.post("/api/state", async (req, res) => {
  try {
    const currentState = await readDB();
    const newState = { ...currentState, ...req.body };
    await writeDB(newState);
    res.json(newState);
  } catch (err) {
    res.status(500).json({ error: "DB Error" });
  }
});

// ═══════════════════════════════════════════════════════════════════
// CHAT ENGINE — v2.1 Content-Aware
// ═══════════════════════════════════════════════════════════════════

app.post("/api/chat", async (req, res) => {
  try {
    const { message, attachment } = req.body;
    const db = await readDB();
    
    if (!db.keys.gemini) {
      return res.status(401).json({ error: "No API key configured." });
    }

    // ── Step 1: Determine user intent ─────────────────────────────
    const intent = determineIntent(message, db.state);
    
    // ── Step 2: Select content from manifest ──────────────────────
    const content = selectContent(db.state, message, intent);
    
    // ── Step 3: Build the AI prompt ───────────────────────────────
    const basePrompt = await buildSystemPrompt(path.join(DATA_DIR, 'lyra_system_prompt_v2.md'));
    const systemPrompt = basePrompt
      .replace(/{currentPhase}/g, String(db.state.currentPhase || 0))
      .replace(/{daysDenied}/g, String(db.state.daysDenied || 0))
      .replace(/{sissyLevel}/g, String(db.state.sissyLevel || 0))
      .replace(/{obedienceScore}/g, String(db.state.obedienceScore || 0))
      .replace(/{tagesform}/g, db.state.tagesform || 'Streng')
      .replace(/{contentFingerprint}/g, JSON.stringify(db.state.contentFingerprint || []))
      .replace(/{loopCycle}/g, String(db.state.loopCycle || 1))
      .replace(/{messageIndex}/g, String(db.state.messageIndex || 0));

    // Force the AI to use the selected content template
    const forcedInstruction = `\n\n[SYSTEM_DIRECTIVE: Use the following template as your base. Adapt it naturally. Do NOT deviate from its core message. Inject variables. Keep it 1-2 sentences unless it's an Intake interrogation. Template: "${content.text}"]`;

    // Context from history
    const historyText = (db.state.chatHistory || [])
      .slice(-10) // Last 10 messages for context
      .map((msg: any) => `${msg.role}: ${msg.content}`)
      .join("\n");

    const fullPrompt = systemPrompt + forcedInstruction + 
      `\n\nPrevious context:\n${historyText}\n\nUser: ${message}`;

    // ── Step 4: Call Gemini ───────────────────────────────────────
    const ai = new GoogleGenAI({ apiKey: db.keys.gemini });
    const response = await ai.models.generateContent({
      model: "gemini-3.1-flash-lite",
      contents: fullPrompt,
    });

    const aiText = response.text || "";
    
    // ── Step 5: Parse actions ─────────────────────────────────────
    let replyText = aiText;
    let penaltyMinutes = 0;
    let addPoints = 0;
    let playVideo = false;
    let postedMedia: string | null = null;
    let voiceUrl: string | null = null;

    const penaltyMatch = replyText.match(/\[ACTION: PENALTY_MINUTES=(\d+)\]/);
    const pointsMatch = replyText.match(/\[ACTION: ADD_POINTS=(\d+)\]/);
    const videoMatch = replyText.match(/\[ACTION: PLAY_VIDEO\]/);
    const speakMatch = replyText.match(/\[ACTION: SPEAK=([^\]]+)\]/);
    const mediaMatch = replyText.match(/\[ACTION: POST_MEDIA=([^:]+):(\d+)\]/);

    if (penaltyMatch) {
      penaltyMinutes = parseInt(penaltyMatch[1], 10);
      replyText = replyText.replace(penaltyMatch[0], "").trim();
    }
    if (pointsMatch) {
      addPoints = parseInt(pointsMatch[1], 10);
      replyText = replyText.replace(pointsMatch[0], "").trim();
    }
    if (videoMatch) {
      playVideo = true;
      replyText = replyText.replace(videoMatch[0], "").trim();
    }
    if (speakMatch) {
      // Async voice synthesis — don't block response
      synthesizeVoice(speakMatch[1]).then(url => {
        if (url) voiceUrl = url;
      });
      replyText = replyText.replace(speakMatch[0], "").trim();
    }
    if (mediaMatch) {
      const category = mediaMatch[1];
      const index = parseInt(mediaMatch[2], 10);
      if (media.images?.[category] && media.images[category][index]) {
        postedMedia = media.images[category][index];
      } else {
        // Try new media structure
        postedMedia = getRandomMedia(category);
      }
      replyText = replyText.replace(mediaMatch[0], "").trim();
    }

    const aiMessage = { role: "Lyra", content: replyText, media: postedMedia, voiceUrl };
    
    // ── Step 6: Update DB ─────────────────────────────────────────
    db.state.chatHistory = db.state.chatHistory || [];
    db.state.penalties = db.state.penalties || [];
    
    db.state.chatHistory.push({ role: "User", content: message, attachment });
    db.state.chatHistory.push(aiMessage);
    
    if (addPoints > 0) db.state.points = (db.state.points || 0) + addPoints;
    if (penaltyMinutes > 0) {
      db.state.penalties.push({ 
        duration: penaltyMinutes, 
        status: "pending", 
        id: Date.now().toString() 
      });
    }
    if (playVideo) {
      const randomVid = getRandomVideo();
      db.state.activeVideoUrl = randomVid 
        ? `https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4`
        : "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4";
    }

    // ── Step 7: Phase advancement ─────────────────────────────────
    const currentModuleReq = modules?.modules?.[db.state.currentPhase + 1]?.requirementPoints;
    if (content.phaseAdvance || (currentModuleReq && db.state.points >= currentModuleReq)) {
      db.state.currentPhase = Math.min(db.state.currentPhase + 1, 4);
      db.state.module = db.state.currentPhase;
    }

    // ── Step 8: Loop reset on relock ──────────────────────────────
    if (db.state.currentPhase === 4 && intent === 'relock') {
      db.state.loopCycle += 1;
      db.state.currentPhase = 1;
      db.state.module = 1;
      db.state.points = 0;
      // Rotate Tagesform for new cycle
      db.state.tagesform = rotateTagesform(db.state.loopCycle);
    }

    // ── Step 9: Tagesform rotation (every 5 messages) ─────────────
    if (db.state.messageIndex % 5 === 0) {
      db.state.tagesform = rotateTagesform(db.state.loopCycle);
    }

    // ── Step 10: Random email ambush (5% chance per message) ──────
    if (Math.random() < 0.05) {
      await triggerEmailAmbush(db, db.state);
    }

    // ── Step 11: Obedience score adjustment ───────────────────────
    if (intent === 'rebellion') {
      db.state.obedienceScore = Math.max(0, (db.state.obedienceScore || 0) - 5);
    } else if (intent === 'normal' || intent === 'relock') {
      db.state.obedienceScore = Math.min(100, (db.state.obedienceScore || 0) + 2);
    }

    await writeDB(db);

    res.json({ message: aiMessage, state: db.state });
  } catch (err: any) {
    console.error("AI Error:", err);
    res.status(500).json({ error: "Die Verbindung ist gerade schlecht. Bitte versuche es gleich noch einmal." });
  }
});

// ═══════════════════════════════════════════════════════════════════
// SETUP
// ═══════════════════════════════════════════════════════════════════

app.post("/api/setup", async (req, res) => {
  const { gemini, emlalock } = req.body;
  try {
    const db = await readDB();
    db.keys.gemini = gemini || GEMINI_API_KEY;
    db.keys.emlalock = emlalock || `${EMLA_USER_ID}:${EMLA_API_KEY}`;

    // Generate Initial Assessment using Content Engine
    const intent: UserIntent = "normal";
    const content = selectContent(db.state, "initial_assessment", intent);

    const basePrompt = await buildSystemPrompt(path.join(DATA_DIR, 'lyra_system_prompt_v2.md'));
    const systemPrompt = basePrompt
      .replace(/{currentPhase}/g, String(0))
      .replace(/{daysDenied}/g, String(0))
      .replace(/{tagesform}/g, 'Streng')
      .replace(/{contentFingerprint}/g, '[]')
      .replace(/{loopCycle}/g, String(1))
      .replace(/{messageIndex}/g, String(0));

    const ai = new GoogleGenAI({ apiKey: db.keys.gemini });
    const response = await ai.models.generateContent({
      model: "gemini-3.1-flash-lite",
      contents: systemPrompt + "\n\n[SYSTEM_DIRECTIVE: Generate the initial assessment. You are Lyra. Destroy his ego. Reference his past. Use what you know about Sebastian — his ADHD, his porn addiction, his failed relationship with Nuria, his sissy conditioning. Start with: [SYSTEM: ASSESSMENT_INITIATED]]",
    });
    
    db.state.chatHistory = [{ 
      role: "Lyra", 
      content: `[SYSTEM: ASSESSMENT_INITIATED]\n${response.text}` 
    }];
    db.setupComplete = true;
    
    await writeDB(db);
    res.json(db);
  } catch (err: any) {
    console.error(err);
    res.status(500).json({ error: err.message || "Setup Failed" });
  }
});

// ═══════════════════════════════════════════════════════════════════
// HARDWARE API — Emlalock
// ═══════════════════════════════════════════════════════════════════

app.post("/api/hardware/penalty", async (req, res) => {
  try {
    const { id } = req.body;
    const db = await readDB();
    
    if (!db.keys.emlalock) {
      return res.status(500).json({ error: "Emlalock keys missing" });
    }

    const [userid, apikey] = db.keys.emlalock.split(":");
    if (!userid || !apikey) {
      return res.status(500).json({ error: "Invalid Emlalock keys" });
    }

    const penalty = db.state.penalties.find((p: any) => p.id === id);
    if (!penalty) return res.status(404).json({ error: "Penalty not found" });
    if (penalty.status === 'success') {
      return res.json({ success: true, status: "already_processed" });
    }

    const durationSeconds = penalty.duration * 60;
    const url = `https://api.emlalock.com/addrandom?userid=${userid}&apikey=${apikey}&from=${durationSeconds}&to=${durationSeconds}&text=Lyra_Core_Penalty`;
    
    fetch(url).then(async (response) => {
      const APIRes = await response.json();
      if (response.ok && !APIRes.error) {
        penalty.status = "success";
        await writeDB(db);
      }
    }).catch(err => console.error("Emlalock Fetch Error:", err));
    
    res.json({ success: true, status: "processing" });
  } catch (err) {
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
  } catch (err) {
    res.status(500).json({ error: "Voice service error" });
  }
});

// ═══════════════════════════════════════════════════════════════════
// EMAIL AMBUSH TRIGGER (manual)
// ═══════════════════════════════════════════════════════════════════

app.post("/api/ambush", async (req, res) => {
  try {
    const db = await readDB();
    await triggerEmailAmbush(db, db.state);
    await writeDB(db);
    res.json({ success: true, message: "Ambush triggered" });
  } catch (err) {
    res.status(500).json({ error: "Ambush failed" });
  }
});

// ═══════════════════════════════════════════════════════════════════
// MEDIA ENDPOINTS
// ═══════════════════════════════════════════════════════════════════

app.get("/api/media/:category", async (req, res) => {
  const { category } = req.params;
  const { tag } = req.query;
  const url = getRandomMedia(category, tag as string | undefined);
  if (!url) return res.status(404).json({ error: "Category not found" });
  res.json({ url, category });
});

app.get("/api/video/random", async (req, res) => {
  const title = getRandomVideo();
  if (!title) return res.status(404).json({ error: "No videos" });
  res.json({ title });
});

// ═══════════════════════════════════════════════════════════════════
// SERVER START
// ═══════════════════════════════════════════════════════════════════

async function startServer() {
  await initDB();
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`[LYRA v2.2] Server running on http://localhost:${PORT}`);
    console.log(`[LYRA v2.2] Reality Bleed: Email Bridge ${LYRA_ENABLE_EMAIL_BRIDGE ? 'ACTIVE' : 'OFF'}`);
    console.log(`[LYRA v2.2] Email Ambush: ${LYRA_ENABLE_EMAIL_AMBUSH ? 'ACTIVE' : 'OFF'}`);
    console.log(`[LYRA v2.2] Voice Endpoint: ${COLAB_VOICE_URL}`);
  });
}

startServer();
