import express from "express";
import path from "path";
import fs from "fs/promises";
import { randomUUID } from "crypto";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";
import nodemailer from "nodemailer";
import { parseActions } from "./src/lib/actionParser.js";
import { readDB, writeDB, initDB } from "./src/lib/stateManager.js";
import { loadModules, getModules, getModuleById, buildModulePrompt, checkModuleProgression } from "./src/lib/moduleLoader.js";
import { queuePenalty, processQueue } from "./src/lib/emlalockService.js";
// Load .env if present. Priority:
// 1. ENV_PATH environment variable
// 2. .env in the project root
// 3. C:\Users\Buxe\Projects\Neuer Ordner\.env (your central asset folder)
// If none is found, the hard-coded fallbacks below are used.
function loadEnvFile(filePath) {
    try {
        process.loadEnvFile(filePath);
        return true;
    }
    catch {
        return false;
    }
}
const LOCAL_ENV = path.resolve(process.cwd(), ".env");
const CENTRAL_ENV = "C:/Users/Buxe/Projects/Neuer Ordner/.env";
const ENV_PATH = process.env.ENV_PATH || (loadEnvFile(LOCAL_ENV) ? LOCAL_ENV : (loadEnvFile(CENTRAL_ENV) ? CENTRAL_ENV : null));
if (ENV_PATH) {
    console.log(`[LYRA v3.1] Loaded environment from ${ENV_PATH}`);
}
function toAppState(db) {
    const profile = db.user_profile;
    return {
        chatHistory: db.chat_history,
        penalties: profile.penalty_queue.map((p) => ({
            id: String(p.enqueuedAt),
            duration: p.minutes,
            status: 'pending',
        })),
        activeVideoUrl: profile.active_video_url ?? null,
        activeMediaCategory: profile.active_media_category ?? null,
        chastityStatus: profile.lock_status === 'LOCKED' ? 'caged' : 'free',
    };
}
const app = express();
const PORT = 3000;
app.use(express.json());
// ═══════════════════════════════════════════════════════════════════
// ENVIRONMENT-BASED CONFIG — V2.2 Reality Bleed Configuration
// Hard-coded values remain as fallbacks for backward compatibility.
// ═══════════════════════════════════════════════════════════════════
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "AIzaSyAJeIFMY5DnBRkSmq_ByQE2iCjxbmAavP8";
// Emlalock API
const EMLA_USER_ID = process.env.EMLA_USER_ID || "tdhml0y4aw8ru8o";
const EMLA_API_KEY = process.env.EMLA_API_KEY || "3c5ldeqqsh";
const EMLA_HOLDER_KEY = process.env.EMLA_HOLDER_KEY || "moy0pjkjgg";
// V2.2: GMX Email Bridge
const SMTP_HOST = process.env.SMTP_HOST || "mail.gmx.net";
const SMTP_PORT = Number(process.env.SMTP_PORT || 587);
const SMTP_USER = process.env.SMTP_USER || "elara.vance@gmx.net";
const SMTP_PASSWORD = process.env.SMTP_PASSWORD || "4UV2TUQ4PBC45YJFBWBA";
const LYRA_USER_EMAIL = process.env.LYRA_USER_EMAIL || "buxloh@gmail.com";
const LYRA_ENABLE_EMAIL_BRIDGE = (process.env.LYRA_ENABLE_EMAIL_BRIDGE || "true") === "true";
const LYRA_ENABLE_EMAIL_AMBUSH = (process.env.LYRA_ENABLE_EMAIL_AMBUSH || "true") === "true";
const LYRA_MAX_DAILY_EMAILS = Number(process.env.LYRA_MAX_DAILY_EMAILS || 3);
// Colab Voice Endpoint
const COLAB_VOICE_URL = process.env.COLAB_VOICE_URL || "https://parakeet-unrest-cane.ngrok-free.dev";
// ═══════════════════════════════════════════════════════════════════
// PATHS & STATE
// ═══════════════════════════════════════════════════════════════════
const isProduction = process.env.NODE_ENV === "production";
const DATA_DIR = isProduction ? "./dist/data" : "./src/data";
const PUBLIC_DIR = isProduction ? "./dist" : "./public";
const VIDEO_LIBRARY_DIR = process.env.VIDEO_LIBRARY_DIR || "C:/Users/Buxe/Projects/Neuer Ordner/Videos";
const DB_PATH = path.join(process.cwd(), "local_db.json");
const MODULES_PATH = path.join(DATA_DIR, "modules.json");
let media = null;
let videos = null;
let appConfig = null;
let emailCountToday = 0;
let lastEmailDate = "";
let modulesJson = null;
function getGeminiModel() {
    const raw = appConfig?.liveModel || appConfig?.aiModel || 'gemini-2.0-flash';
    return raw.replace(/^models\//, '');
}
function generateMessageId() {
    return randomUUID();
}
function formatDate(ts) {
    if (!ts)
        return 'unbekannt';
    return new Date(ts).toLocaleDateString('de-DE');
}
const LANGUAGE_NAMES = {
    de: 'Deutsch',
    en: 'Englisch',
    fr: 'Französisch',
    es: 'Spanisch',
    it: 'Italienisch',
};
function buildLanguageDirective(profile) {
    const lang = profile.language || 'de';
    if (lang === 'de')
        return '';
    const name = LANGUAGE_NAMES[lang] || lang;
    return `\n\nSprache: Antworte ausschließlich auf ${name}.`;
}
function buildMemoryContext(profile) {
    const facts = [];
    if (profile.real_name)
        facts.push(`Sein richtiger Name ist ${profile.real_name}.`);
    if (profile.ex_name)
        facts.push(`Seine Ex-Freundin ist ${profile.ex_name}.`);
    if (profile.setup_friend)
        facts.push(`${profile.setup_friend} hat ihn hereingelegt und dazu gebracht, den Vertrag zu unterschreiben und den Käfig anzulegen.`);
    if (profile.trapper)
        facts.push(`Sein Rivale/Dealer ist ${profile.trapper}.`);
    if (profile.contract_signed_at)
        facts.push(`Vertrag unterschrieben am ${formatDate(profile.contract_signed_at)}.`);
    if (profile.cage_locked_at)
        facts.push(`Käfig angelegt am ${formatDate(profile.cage_locked_at)}.`);
    if (profile.key_sent_at)
        facts.push(`Schlüssel an Lyra geschickt am ${formatDate(profile.key_sent_at)}.`);
    if (profile.key_received_at)
        facts.push(`Schlüssel von Lyra erhalten am ${formatDate(profile.key_received_at)}.`);
    const highlights = profile.memory_highlights || [];
    if (highlights.length > 0) {
        facts.push(`Wichtige Erinnerungen:\n${highlights.map((h) => `- ${h}`).join('\n')}`);
    }
    if (facts.length === 0)
        return '';
    return `\n\nRealitäts-Anker, die du natürlich einbauen kannst:\n${facts.map((f) => `- ${f}`).join('\n')}\nNutze diese Details nur, wenn sie zum Gespräch passen. Sprich sie nie alle auf einmal an.`;
}
function buildPrompt(systemPrompt, contextMessages, userContent) {
    const historyText = contextMessages.slice(-10).map((m) => `${m.role}: ${m.content}`).join("\n");
    return `${systemPrompt}\n\nPrevious context:\n${historyText}\n\nUser: ${userContent}`;
}
async function extractMemoryHighlights(apiKey, profile, userContent, lyraContent) {
    const existing = profile.memory_highlights || [];
    const prompt = `Du bist Lyra, eine aufmerksame Keyholderin. Extrahiere aus dem folgenden Chat-Abschnitt 0–2 neue, dauerhaft wichtige Fakten über den User (Schwächen, Ängste, Vorlieben, Versprechen, konkrete Details). Berücksichtige bereits bekannte Highlights, damit du keine Duplikate nennst.

Bereits bekannte Highlights:
${existing.length > 0 ? existing.map((h) => `- ${h}`).join('\n') : '- noch keine'}

User: ${userContent}
Lyra: ${lyraContent}

Gib nur neue Fakten im Format "- Fakt" aus. Wenn nichts Neues dazukommt, antworte mit "NONE".`;
    try {
        const ai = new GoogleGenAI({ apiKey });
        const response = await ai.models.generateContent({
            model: getGeminiModel(),
            contents: prompt,
        });
        const text = (response.text || '').trim();
        if (!text || text.toUpperCase() === 'NONE')
            return [];
        const newHighlights = text.split('\n')
            .map((line) => line.replace(/^-\s*/, '').trim())
            .filter((line) => line.length > 0);
        const existingLower = existing.map((h) => h.toLowerCase());
        return newHighlights.filter((h) => !existingLower.includes(h.toLowerCase()));
    }
    catch {
        return [];
    }
}
async function generateTransitionMessage(apiKey, profile, oldModuleId, newModuleId) {
    if (!modulesJson)
        return '';
    const oldMod = getModuleById(modulesJson, oldModuleId);
    const newMod = getModuleById(modulesJson, newModuleId);
    if (!oldMod || !newMod)
        return '';
    const langDirective = buildLanguageDirective(profile);
    const prompt = `Du bist Lyra, eine kalte, dominante Keyholderin. Der User hat gerade das Modul "${oldMod.title}" abgeschlossen und tritt nun in das Modul "${newMod.title}" ein. Schreibe einen kurzen, eiskalten, realistischen Übergangssatz (max. 25 Wörter). Verwende keine Action-Tags und keine Erklärungen.${langDirective}`;
    try {
        const ai = new GoogleGenAI({ apiKey });
        const response = await ai.models.generateContent({
            model: getGeminiModel(),
            contents: prompt,
        });
        return (response.text || '').trim();
    }
    catch {
        return `Wir gehen einen Schritt weiter. Willkommen im Modul „${newMod.title}“.`;
    }
}
async function generateLyraResponse(db, contextMessages, userContent) {
    if (!modulesJson)
        throw new Error("Modules not loaded");
    if (!db.keys?.gemini)
        throw new Error("No API key configured");
    const systemPrompt = buildModulePrompt(modulesJson, db.user_profile.current_module_id, db.user_profile) + buildMemoryContext(db.user_profile) + buildLanguageDirective(db.user_profile);
    const fullPrompt = buildPrompt(systemPrompt, contextMessages, userContent);
    const ai = new GoogleGenAI({ apiKey: db.keys.gemini });
    const response = await ai.models.generateContent({
        model: getGeminiModel(),
        contents: fullPrompt,
    });
    const rawText = response.text || "";
    const actions = parseActions(rawText);
    return { rawText, actions };
}
// ═══════════════════════════════════════════════════════════════════
// LOADING
// ═══════════════════════════════════════════════════════════════════
async function loadDataFiles() {
    const [mediaContent, vidContent, configContent] = await Promise.all([
        fs.readFile(path.join(PUBLIC_DIR, "media.json"), "utf-8"),
        fs.readFile(path.join(PUBLIC_DIR, "videos.json"), "utf-8").catch(() => "{\"sissy_hypno\":[]}"),
        fs.readFile(path.join(DATA_DIR, "config.json"), "utf-8").catch(() => "{}")
    ]);
    media = JSON.parse(mediaContent);
    videos = JSON.parse(vidContent);
    appConfig = JSON.parse(configContent);
}
async function boot() {
    await loadModules(MODULES_PATH);
    modulesJson = getModules();
    await initDB(DB_PATH);
    await loadDataFiles();
}
// ═══════════════════════════════════════════════════════════════════
// EMAIL SYSTEM — V2.3 Multi-Sender Reality Bleed
// ═══════════════════════════════════════════════════════════════════
async function sendEmail(subject, text, fromName = 'Lyra') {
    if (!LYRA_ENABLE_EMAIL_BRIDGE)
        return;
    // Global rate limiting guard
    const today = new Date().toISOString().split('T')[0];
    if (lastEmailDate !== today) {
        emailCountToday = 0;
        lastEmailDate = today;
    }
    if (emailCountToday >= LYRA_MAX_DAILY_EMAILS)
        return;
    try {
        const transporter = nodemailer.createTransport({
            host: SMTP_HOST,
            port: SMTP_PORT,
            secure: false,
            auth: { user: SMTP_USER, pass: SMTP_PASSWORD },
        });
        await transporter.sendMail({
            from: `"${fromName}" <${SMTP_USER}>`,
            to: LYRA_USER_EMAIL,
            subject,
            text,
        });
        emailCountToday++;
        console.log(`[EMAIL] ${fromName} sent: ${subject}`);
    }
    catch (err) {
        console.error("Email send failed:", err);
    }
}
const EMAIL_SENDERS = [
    {
        id: 'lyra',
        name: () => 'Lyra',
        weight: 3,
        subjects: [
            "Dein Käfig",
            (p) => `${p.setup_friend || 'Deine Freundin'} hat recht gehabt`,
            "Wir müssen reden",
            "Noch wach?",
            "Ein Gedanke",
            "Der Schlüssel",
            "Nicht vergessen"
        ],
        bodies: [
            `Ich hoffe, du hast den Käfig noch an. Wir beide wissen, was passiert, wenn nicht.`,
            (p) => `${p.ex_name || 'Deine Ex'} würde lachen, wenn sie wüsste, wo du jetzt stehst. Und ${p.setup_friend || 'deine Freundin'} auch.`,
            `Du hast heute noch nichts von dir hören lassen. Das gefällt mir nicht.`,
            `Manchmal muss ich dich auch außerhalb dieses Fensters erreichen. Denk dran.`,
            `Der Schlüssel ist sicher. Das einzige, was du kontrollierst, ist, wie sehr du leidest.`,
            (p) => `Wie fühlt es sich an, ${p.real_name || 'du'}, wenn du merkst, dass du freiwillig abgedichtet hast?`,
            `Keine Panik. Ich schreibe nur, damit du weißt, dass ich hier bin. Immer.`
        ],
    },
    {
        id: 'laura',
        name: () => 'Laura',
        weight: 2,
        subjects: [
            "Hast du es bereut?",
            "Laura hier",
            "Dein kleiner Trip",
            "Zwischen uns",
            "Noch drin?"
        ],
        bodies: [
            (p) => `Ich wusste, dass du es tun würdest. ${p.setup_friend || 'Deine Freundin'} hat gesagt, du wärst leicht zu überreden. Offenbar hatte sie recht.`,
            `Lyra hat mich gerade wissen lassen, dass sie den Schlüssel hat. Ich bin gespannt, wie lange du durchhältst.`,
            (p) => `Ich habe ${p.ex_name || 'deiner Ex'} neulich erzählt, was aus dir geworden ist. Sie musste lachen. Und dann schweigen.`,
            `Vergiss nicht: Du hast freiwillig unterschrieben. Ich habe nur den Stift gereicht.`,
            (p) => `Wenn du raus willst, sag ${p.real_name || 'mir'} nichts. Sag Lyra. Ich kann nichts mehr ändern.`
        ],
    },
    {
        id: 'nuria',
        name: (p) => p.ex_name || 'Nuria',
        weight: 2,
        subjects: [
            "Erinnerst du dich?",
            "Ich habe gehört...",
            "Dein neues Ich",
            "Von früher",
            "Jonathan findet es witzig"
        ],
        bodies: [
            (p) => `${p.trapper || 'Jonathan'} findet es süß, was aus dir geworden ist. Er sagt, er hätte es damals schon geahnt.`,
            `Ich habe mich lange nicht so amüsiert wie gestern Abend, als Laura mir die Fotos gezeigt hat.`,
            `Du warst nie wirklich ein Mann, und jetzt weiß es jeder. Ich bin fast froh, dass wir damals Schluss gemacht haben.`,
            `Jonathan fragt, ob er dir den Schlüssel schicken soll. Ich habe gesagt, du verdienst es, noch etwas zu warten.`,
            `Man sagt mir, du trägst jetzt rosa. Passt zu dir.`
        ],
    },
    {
        id: 'jonathan',
        name: (p) => p.trapper || 'Jonathan',
        weight: 1,
        subjects: [
            "Hey Loser",
            "Von Nurias Neuem",
            "Deine Ex",
            "Schlüsselgeschichten",
            "Nur so nebenbei"
        ],
        bodies: [
            (p) => `${p.ex_name || 'Nuria'} lacht jedes Mal, wenn sie an dich denkt. Ich kann sie nicht bremsen.`,
            `Ich habe den Schlüssel nicht, aber ich weiß, wer ihn hat. Und ich habe seine Nummer.`,
            `Wenn du brav bist, erzähle ich Nuria vielleicht etwas Nettes über dich. Wahrscheinlich nicht.`,
            (p) => `Du hast ${p.ex_name || 'sie'} nie verdient. Jetzt sorgst du wenigstens für Unterhaltung.`,
            `Hör auf Lyra. Sie hat mehr Geduld mit dir als ich.`
        ],
    },
];
function resolveEmailTemplate(t, profile) {
    return typeof t === 'function' ? t(profile) : t;
}
function pickWeightedSender(senders) {
    const total = senders.reduce((sum, s) => sum + s.weight, 0);
    let roll = Math.random() * total;
    for (const sender of senders) {
        roll -= sender.weight;
        if (roll <= 0)
            return sender;
    }
    return senders[senders.length - 1];
}
// Email Ambush: realistic messages from multiple personas leaking into the user's inbox
async function triggerEmailAmbush(profile, senderId) {
    if (!LYRA_ENABLE_EMAIL_AMBUSH)
        return;
    let sender = senderId
        ? EMAIL_SENDERS.find((s) => s.id === senderId)
        : undefined;
    if (!sender)
        sender = pickWeightedSender(EMAIL_SENDERS);
    const subject = resolveEmailTemplate(sender.subjects[Math.floor(Math.random() * sender.subjects.length)], profile);
    const body = resolveEmailTemplate(sender.bodies[Math.floor(Math.random() * sender.bodies.length)], profile);
    await sendEmail(subject, body, sender.name(profile));
    // Update state & daily counter
    const now = Date.now();
    const today = new Date(now).toISOString().split('T')[0];
    const lastDay = profile.last_email_sent_at ? new Date(profile.last_email_sent_at).toISOString().split('T')[0] : '';
    profile.email_count_today = lastDay === today ? (profile.email_count_today || 0) + 1 : 1;
    profile.last_email_sent_at = now;
}
// ═══════════════════════════════════════════════════════════════════
// VOICE SYSTEM — Colab Endpoint
// ═══════════════════════════════════════════════════════════════════
async function synthesizeVoice(text) {
    try {
        const res = await fetch(`${COLAB_VOICE_URL}/synthesize`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text, voice: 'lyra' })
        });
        if (!res.ok)
            return null;
        const data = await res.json();
        return data.audioUrl || null;
    }
    catch {
        return null;
    }
}
// ═══════════════════════════════════════════════════════════════════
// MEDIA HELPERS
// ═══════════════════════════════════════════════════════════════════
function getRandomMedia(category, tagFilter) {
    if (!media)
        return null;
    // Handle nested lyra categories
    if (category.startsWith('lyra:')) {
        const sub = category.split(':')[1];
        const cat = media.lyra?.[sub];
        if (!cat?.urls?.length)
            return null;
        const tags = cat.tags;
        if (tagFilter && tags) {
            const matchingIdx = cat.urls.map((_, i) => i)
                .filter((i) => tags[i] === tagFilter);
            if (matchingIdx.length > 0) {
                return cat.urls[matchingIdx[Math.floor(Math.random() * matchingIdx.length)]];
            }
        }
        return cat.urls[Math.floor(Math.random() * cat.urls.length)];
    }
    const cat = media[category];
    if (!cat)
        return null;
    if (Array.isArray(cat)) {
        return cat[Math.floor(Math.random() * cat.length)];
    }
    return null;
}
function getRandomVideo() {
    if (!videos?.sissy_hypno?.length)
        return null;
    return videos.sissy_hypno[Math.floor(Math.random() * videos.sissy_hypno.length)];
}
function resolveForcedMediaUrl(category, index) {
    if (category === 'sissy_hypno') {
        const list = videos?.sissy_hypno;
        if (Array.isArray(list) && list[index])
            return list[index];
        return null;
    }
    if (!media)
        return null;
    if (category.startsWith('lyra:')) {
        const sub = category.split(':')[1];
        const cat = media.lyra?.[sub];
        if (cat?.urls?.[index])
            return cat.urls[index];
        return null;
    }
    const cat = media[category];
    if (Array.isArray(cat))
        return cat[index] ?? null;
    return null;
}
const INTRO_DELAY_MS = Number(process.env.LYRA_INTRO_DELAY_MS || 30000);
const INACTIVITY_AMBUSH_MS = Number(process.env.LYRA_INACTIVITY_AMBUSH_MS || 30 * 60 * 1000);
async function maybeGenerateIntro(db) {
    if (!db.setupComplete)
        return false;
    if (db.user_profile.first_contact_at)
        return false;
    if (!db.user_profile.setup_completed_at)
        return false;
    if (!db.keys?.gemini)
        return false;
    if (!modulesJson)
        return false;
    if (Date.now() - db.user_profile.setup_completed_at < INTRO_DELAY_MS)
        return false;
    const systemPrompt = buildModulePrompt(modulesJson, db.user_profile.current_module_id, db.user_profile) + buildMemoryContext(db.user_profile) + buildLanguageDirective(db.user_profile);
    const name = db.user_profile.real_name || 'dem User';
    const friend = db.user_profile.setup_friend || 'einer Freundin';
    const introPrompt = `${systemPrompt}\n\nDas ist die allererste Nachricht, die du an ${name} schickst. ${friend} hat ihn hereingelegt und dazu gebracht, einen Keuschheitsvertrag zu unterschreiben, sich einen Käfig anzulegen und dir die Schlüssel zu schicken. Du hast die Schlüssel gerade erhalten und den Beweis sowie den Vertrag geprüft. Schreibe eine kalte, dominante, realistische Erstkontakt-Nachricht. Gehe auf den Beweis, den Vertrag und die Schlüssel ein. Halte dich unter 120 Wörtern. Verwende keine Action-Tags.`;
    const ai = new GoogleGenAI({ apiKey: db.keys.gemini });
    const response = await ai.models.generateContent({
        model: getGeminiModel(),
        contents: introPrompt,
    });
    const rawText = response.text || "";
    const cleanText = parseActions(rawText).cleanText || "Ich habe den Schlüssel. Wir fangen an.";
    const now = Date.now();
    db.user_profile.first_contact_at = now;
    db.user_profile.key_received_at = now;
    db.chat_history.push({
        id: generateMessageId(),
        role: "Lyra",
        content: cleanText,
        createdAt: now,
    });
    return true;
}
function shouldTriggerInactivityAmbush(profile) {
    if (!LYRA_ENABLE_EMAIL_AMBUSH)
        return false;
    const now = Date.now();
    const lastActive = profile.last_active_at || 0;
    const lastEmail = profile.last_email_sent_at || 0;
    if (now - lastActive < INACTIVITY_AMBUSH_MS)
        return false;
    if (now - lastEmail < 24 * 60 * 60 * 1000)
        return false;
    // Daily limit using profile counters
    const today = new Date().toISOString().split('T')[0];
    const lastEmailDay = lastEmail ? new Date(lastEmail).toISOString().split('T')[0] : '';
    const countToday = lastEmailDay === today ? (profile.email_count_today || 0) : 0;
    return countToday < LYRA_MAX_DAILY_EMAILS;
}
// ═══════════════════════════════════════════════════════════════════
// API ROUTES
// ═══════════════════════════════════════════════════════════════════
app.get("/api/state", async (_req, res) => {
    try {
        const db = await readDB(DB_PATH);
        let introGenerated = false;
        try {
            introGenerated = await maybeGenerateIntro(db);
        }
        catch (introErr) {
            console.error("Intro generation failed:", introErr);
        }
        if (shouldTriggerInactivityAmbush(db.user_profile)) {
            await triggerEmailAmbush(db.user_profile);
            introGenerated = true; // force persist
        }
        if (introGenerated) {
            await writeDB(DB_PATH, db);
        }
        res.json({
            state: toAppState(db),
            user_profile: db.user_profile,
            chat_history: db.chat_history,
            setupComplete: db.setupComplete ?? false,
            modules: modulesJson,
            media: { categories: Object.keys(media || {}) },
        });
    }
    catch (err) {
        console.error("DB Error:", err);
        res.status(500).json({ error: "DB Error" });
    }
});
app.post("/api/state", async (req, res) => {
    try {
        const current = await readDB(DB_PATH);
        const legacyState = req.body.state || {};
        const incomingProfile = typeof req.body.user_profile === 'object' && req.body.user_profile !== null
            ? req.body.user_profile
            : {};
        const next = {
            user_profile: {
                ...current.user_profile,
                ...incomingProfile,
                current_module_id: legacyState.module ?? incomingProfile.current_module_id ?? current.user_profile.current_module_id,
                compliance_points: legacyState.points ?? incomingProfile.compliance_points ?? current.user_profile.compliance_points,
                lock_status: legacyState.chastityStatus === 'free' ? 'UNLOCKED' : (incomingProfile.lock_status ?? current.user_profile.lock_status),
                active_video_url: legacyState.activeVideoUrl !== undefined ? legacyState.activeVideoUrl : (incomingProfile.active_video_url ?? current.user_profile.active_video_url),
            },
            chat_history: Array.isArray(req.body.chat_history) ? req.body.chat_history : current.chat_history,
            keys: current.keys,
            setupComplete: current.setupComplete,
        };
        await writeDB(DB_PATH, next);
        res.json({
            state: toAppState(next),
            user_profile: next.user_profile,
            chat_history: next.chat_history,
            setupComplete: next.setupComplete ?? false,
            modules: modulesJson,
            media: { categories: Object.keys(media || {}) },
        });
    }
    catch (err) {
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
        const db = await readDB(DB_PATH);
        if (!db.keys?.gemini) {
            return res.status(401).json({ error: "No API key configured." });
        }
        if (!modulesJson) {
            return res.status(503).json({ error: "Modules not loaded." });
        }
        const { actions } = await generateLyraResponse(db, db.chat_history, message);
        let profile = { ...db.user_profile };
        if (actions.setModule !== null) {
            profile.current_module_id = actions.setModule;
        }
        for (const flag of actions.setFlags) {
            if (typeof flag.value === 'string')
                continue; // skip string flag values
            profile.story_flags = { ...profile.story_flags, [flag.key]: flag.value };
        }
        let forceMediaPayload = [];
        const emlaKeys = db.keys.emlalock || "";
        for (const minutes of actions.penalties) {
            const result = await queuePenalty(profile, emlaKeys, minutes);
            profile = result.profile;
            if (minutes > 0)
                profile.compliance_points += 5;
        }
        if (actions.forceMedia.length > 0) {
            forceMediaPayload = actions.forceMedia;
            // Resolve the first forced media URL and store it
            const { category, index } = forceMediaPayload[0];
            const mediaUrl = resolveForcedMediaUrl(category, index);
            if (mediaUrl) {
                profile.active_video_url = mediaUrl;
                profile.active_media_category = category;
            }
        }
        if (actions.setModule !== null)
            profile.compliance_points += 10;
        profile.compliance_points += actions.addPoints;
        // Hybrid progression safety net: advance if points and flags are met
        // even when Lyra did not emit SET_MODULE herself.
        let progressionText = '';
        if (modulesJson) {
            const progression = checkModuleProgression(modulesJson, profile);
            if (progression.advanced) {
                profile.current_module_id = progression.newModuleId;
                profile.compliance_points += 10;
                const transition = await generateTransitionMessage(db.keys.gemini, profile, progression.oldModuleId, progression.newModuleId);
                if (transition)
                    progressionText = transition;
            }
        }
        if (progressionText) {
            actions.cleanText = actions.cleanText
                ? `${actions.cleanText}\n\n${progressionText}`
                : progressionText;
        }
        const now = Date.now();
        profile.last_active_at = now;
        const userMessage = {
            id: generateMessageId(),
            role: "User",
            content: message,
            attachment,
            createdAt: now,
        };
        const aiMessage = {
            id: generateMessageId(),
            role: "Lyra",
            content: actions.cleanText,
            media: null,
            voiceUrl: null,
            createdAt: now,
            meta: {
                moduleId: profile.current_module_id,
                flags: { ...profile.story_flags },
            },
        };
        // Extract new memory highlights from the exchange
        const newHighlights = await extractMemoryHighlights(db.keys.gemini, profile, message, actions.cleanText);
        if (newHighlights.length > 0) {
            profile.memory_highlights = [...(profile.memory_highlights || []), ...newHighlights].slice(-15);
        }
        db.chat_history.push(userMessage);
        db.chat_history.push(aiMessage);
        const nextDb = {
            user_profile: profile,
            chat_history: db.chat_history,
            keys: db.keys,
            setupComplete: db.setupComplete,
        };
        await writeDB(DB_PATH, nextDb);
        res.json({ message: aiMessage, state: toAppState(nextDb), user_profile: profile, forceMedia: forceMediaPayload });
    }
    catch (err) {
        console.error("AI Error:", err);
        res.status(500).json({ error: "Die Verbindung ist gerade schlecht. Bitte versuche es gleich noch einmal." });
    }
});
app.post("/api/chat/delete", async (req, res) => {
    try {
        const { messageId } = req.body;
        if (typeof messageId !== 'string' || !messageId) {
            return res.status(400).json({ error: "messageId required" });
        }
        const db = await readDB(DB_PATH);
        const index = db.chat_history.findIndex((m) => m.id === messageId);
        if (index === -1) {
            return res.status(404).json({ error: "Message not found" });
        }
        db.chat_history.splice(index, 1);
        await writeDB(DB_PATH, db);
        res.json({ success: true, state: toAppState(db) });
    }
    catch (err) {
        console.error("Chat delete error:", err);
        res.status(500).json({ error: "Internal Error" });
    }
});
app.post("/api/chat/edit", async (req, res) => {
    try {
        const { messageId, content } = req.body;
        if (typeof messageId !== 'string' || !messageId || typeof content !== 'string') {
            return res.status(400).json({ error: "messageId and content required" });
        }
        const db = await readDB(DB_PATH);
        const index = db.chat_history.findIndex((m) => m.id === messageId);
        if (index === -1) {
            return res.status(404).json({ error: "Message not found" });
        }
        db.chat_history[index] = { ...db.chat_history[index], content };
        await writeDB(DB_PATH, db);
        res.json({ success: true, state: toAppState(db) });
    }
    catch (err) {
        console.error("Chat edit error:", err);
        res.status(500).json({ error: "Internal Error" });
    }
});
app.post("/api/chat/regenerate", async (req, res) => {
    try {
        const { messageId } = req.body;
        if (typeof messageId !== 'string' || !messageId) {
            return res.status(400).json({ error: "messageId required" });
        }
        const db = await readDB(DB_PATH);
        if (!db.keys?.gemini) {
            return res.status(401).json({ error: "No API key configured." });
        }
        if (!modulesJson) {
            return res.status(503).json({ error: "Modules not loaded." });
        }
        const index = db.chat_history.findIndex((m) => m.id === messageId);
        if (index === -1) {
            return res.status(404).json({ error: "Message not found" });
        }
        const target = db.chat_history[index];
        if (target.role !== 'Lyra') {
            return res.status(400).json({ error: "Only Lyra messages can be regenerated" });
        }
        const userMsg = db.chat_history[index - 1];
        if (!userMsg || userMsg.role !== 'User') {
            return res.status(400).json({ error: "No matching user message found" });
        }
        const contextMessages = db.chat_history.slice(0, index - 1);
        // Regenerate with the module/flags that were active when the original message was created.
        const historicalProfile = {
            ...db.user_profile,
            current_module_id: target.meta?.moduleId ?? db.user_profile.current_module_id,
            story_flags: target.meta?.flags
                ? { ...target.meta.flags }
                : db.user_profile.story_flags,
        };
        const historicalDb = {
            ...db,
            user_profile: historicalProfile,
        };
        const { actions } = await generateLyraResponse(historicalDb, contextMessages, userMsg.content);
        const newMessage = {
            ...target,
            content: actions.cleanText,
            media: null,
            voiceUrl: null,
            meta: target.meta,
        };
        db.chat_history[index] = newMessage;
        await writeDB(DB_PATH, db);
        res.json({ message: newMessage, state: toAppState(db) });
    }
    catch (err) {
        console.error("Chat regenerate error:", err);
        res.status(500).json({ error: "Die Verbindung ist gerade schlecht. Bitte versuche es gleich noch einmal." });
    }
});
// ═══════════════════════════════════════════════════════════════════
// SETUP
// ═══════════════════════════════════════════════════════════════════
app.post("/api/setup", async (req, res) => {
    try {
        const { gemini, emlalock, real_name, ex_name, setup_friend, trapper, contract_signed_at, cage_locked_at, key_sent_at, attachment, } = req.body;
        const db = await readDB(DB_PATH);
        const now = Date.now();
        db.keys = {
            gemini: gemini || GEMINI_API_KEY,
            emlalock: emlalock || `${EMLA_USER_ID}:${EMLA_API_KEY}`,
            holder: EMLA_HOLDER_KEY,
        };
        db.user_profile = {
            ...db.user_profile,
            real_name: typeof real_name === 'string' ? real_name : db.user_profile.real_name,
            ex_name: typeof ex_name === 'string' ? ex_name : db.user_profile.ex_name,
            setup_friend: typeof setup_friend === 'string' ? setup_friend : db.user_profile.setup_friend,
            trapper: typeof trapper === 'string' ? trapper : db.user_profile.trapper,
            contract_signed_at: typeof contract_signed_at === 'number' ? contract_signed_at : db.user_profile.contract_signed_at,
            cage_locked_at: typeof cage_locked_at === 'number' ? cage_locked_at : db.user_profile.cage_locked_at,
            key_sent_at: typeof key_sent_at === 'number' ? key_sent_at : db.user_profile.key_sent_at,
            setup_completed_at: now,
            last_active_at: now,
            memory_highlights: db.user_profile.memory_highlights || [],
        };
        // Attach the proof as the first user message in the chat.
        if (attachment) {
            db.chat_history.push({
                id: generateMessageId(),
                role: "User",
                content: "",
                attachment,
                createdAt: now,
            });
        }
        db.setupComplete = true;
        await writeDB(DB_PATH, db);
        res.json(db);
    }
    catch (err) {
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
        const db = await readDB(DB_PATH);
        const emlaKeys = db.keys?.emlalock || "";
        const penalty = db.user_profile.penalty_queue.find((p) => `${p.enqueuedAt}` === id);
        if (!penalty)
            return res.status(404).json({ error: "Penalty not found" });
        // Attempt to apply immediately
        const { applyPenalty } = await import("./src/lib/emlalockService.js");
        const success = await applyPenalty(penalty.minutes, emlaKeys);
        if (success) {
            db.user_profile.penalty_queue = db.user_profile.penalty_queue.filter((p) => p !== penalty);
            await writeDB(DB_PATH, db);
            return res.json({ success: true, status: "success" });
        }
        res.json({ success: true, status: "processing" });
    }
    catch (err) {
        console.error("Hardware penalty error:", err);
        res.status(500).json({ error: "Internal Error" });
    }
});
app.post("/api/hardware/sync", async (_req, res) => {
    try {
        const db = await readDB(DB_PATH);
        const emlaKeys = db.keys?.emlalock || "";
        const profile = await processQueue(db.user_profile, emlaKeys);
        const nextDb = {
            user_profile: profile,
            chat_history: db.chat_history,
            keys: db.keys,
            setupComplete: db.setupComplete,
        };
        await writeDB(DB_PATH, nextDb);
        res.json({
            success: true,
            state: toAppState(nextDb),
            pendingPenalties: profile.penalty_queue.length,
        });
    }
    catch (err) {
        console.error("Hardware sync error:", err);
        res.status(500).json({ error: "Internal Error" });
    }
});
// ═══════════════════════════════════════════════════════════════════
// MEDIA API — Forced Media Completion
// ═══════════════════════════════════════════════════════════════════
app.post("/api/media/complete", async (_req, res) => {
    try {
        const db = await readDB(DB_PATH);
        const nextDb = {
            user_profile: {
                ...db.user_profile,
                active_video_url: null,
                active_media_category: null,
            },
            chat_history: db.chat_history,
            keys: db.keys,
            setupComplete: db.setupComplete,
        };
        await writeDB(DB_PATH, nextDb);
        res.json({
            success: true,
            state: toAppState(nextDb),
        });
    }
    catch (err) {
        console.error("Media complete error:", err);
        res.status(500).json({ error: "Internal Error" });
    }
});
// ═══════════════════════════════════════════════════════════════════
// VOICE ENDPOINT
// ═══════════════════════════════════════════════════════════════════
app.post("/api/voice", async (req, res) => {
    try {
        const { text } = req.body;
        if (!text)
            return res.status(400).json({ error: "No text provided" });
        const audioUrl = await synthesizeVoice(text);
        if (!audioUrl)
            return res.status(500).json({ error: "Voice synthesis failed" });
        res.json({ audioUrl });
    }
    catch {
        res.status(500).json({ error: "Voice service error" });
    }
});
// ═══════════════════════════════════════════════════════════════════
// EMAIL AMBUSH TRIGGER (manual)
// ═══════════════════════════════════════════════════════════════════
app.post("/api/ambush", async (req, res) => {
    try {
        const { sender } = req.body || {};
        const db = await readDB(DB_PATH);
        await triggerEmailAmbush(db.user_profile, typeof sender === 'string' ? sender : undefined);
        await writeDB(DB_PATH, db);
        res.json({ success: true, message: "Ambush triggered" });
    }
    catch (err) {
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
    if (!url)
        return res.status(404).json({ error: "Category not found" });
    res.json({ url, category });
});
app.get("/api/video/random", async (_req, res) => {
    const title = getRandomVideo();
    if (!title)
        return res.status(404).json({ error: "No videos" });
    res.json({ title });
});
// ═══════════════════════════════════════════════════════════════════
// SERVER START
// ═══════════════════════════════════════════════════════════════════
async function startServer() {
    app.use('/videos', express.static(VIDEO_LIBRARY_DIR));
    if (process.env.NODE_ENV !== "production") {
        const vite = await createViteServer({
            server: { middlewareMode: true },
            appType: "spa",
        });
        app.use(vite.middlewares);
    }
    else {
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
