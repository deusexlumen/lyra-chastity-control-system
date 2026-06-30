// sessionEngine.ts — v2.2 Content-Aware Engine with Full Trigger System

import * as fs from 'fs/promises';

// ─── INTERFACES ────────────────────────────────────────────────────

interface ContentItem {
  id: string;
  weight: number;
  cooldown: number;
  template?: string;
  variations?: string[];
  loseLose?: { honest: string; evasive: string };
  followUp?: string;
  followUpPool?: string;
  action?: string;
  triggerCondition?: string;
}

interface ContentPool {
  phase: number | string;
  tags: string[];
  triggerCondition?: string;
  items: ContentItem[];
}

interface IntensityDescriptor {
  label: string;
  prefix: string;
  suffix: string;
}

export interface UserState {
  userName?: string;
  daysDenied: number;
  chastityStatus: 'caged' | 'free' | 'denied_no_cage';
  sissyLevel: number;
  obedienceScore: number;
  currentPhase: number;
  loopCycle: number;
  tagesform: 'Erschöpft' | 'Verspielt' | 'Streng';
  contentFingerprint: string[];
  lastUsedAt: Record<string, number>;
  messageIndex: number;
  points?: number;
  maidLevel?: number;
  slutLevel?: number;
  makeupLevel?: number;
}

export type UserIntent = 'rebellion' | 'praise_seeking' | 'negotiation' | 'normal' | 'timer_expired' | 'relock' | 'media_request';

export interface ContentResult {
  text: string;
  action?: string;
  phaseAdvance?: boolean;
  followUpPool?: string;
}

// ─── STATE ─────────────────────────────────────────────────────────

let manifest: Record<string, ContentPool> | null = null;
let intensityDescriptors: Record<string, IntensityDescriptor> = {};

// ─── MANIFEST LOADING ──────────────────────────────────────────────

export async function loadManifest(manifestPath: string): Promise<void> {
  const raw = await fs.readFile(manifestPath, 'utf-8');
  const parsed = JSON.parse(raw);
  manifest = parsed.pools;
  if (parsed.meta?.intensityDescriptors) {
    intensityDescriptors = parsed.meta.intensityDescriptors;
  }
}

// ─── VARIABLE INJECTION ────────────────────────────────────────────

function injectVariables(text: string, state: UserState): string {
  const name = state.userName || 'Pet';
  const cycle = state.loopCycle || 1;
  const intensity = intensityDescriptors[String(cycle)] || intensityDescriptors['1'];
  
  let result = text
    .replace(/#DaysDenied/g, String(state.daysDenied))
    .replace(/#PetName/g, name)
    .replace(/#SubName/g, name)
    .replace(/#Cock/g, state.chastityStatus === 'caged' ? 'eingesperrter Schwanz' : 'Schwanz')
    .replace(/#Balls/g, 'Eier')
    .replace(/#Nuria/g, 'Nuria')
    .replace(/#Jonathan/g, 'Jonathan')
    .replace(/#LoopCycle/g, String(cycle))
    .replace(/#Tagesform/g, state.tagesform)
    .replace(/#Intensity/g, intensity?.label || 'Standard');

  // Apply intensity prefix/suffix for cycles > 1
  if (cycle > 1 && intensity) {
    if (intensity.prefix && !result.startsWith('[')) result = intensity.prefix + result;
    if (intensity.suffix) result = result + intensity.suffix;
  }

  return result;
}

// ─── FRESHNESS SCORING ─────────────────────────────────────────────

function getItemFreshness(item: ContentItem, state: UserState): number {
  const lastUsed = state.lastUsedAt[item.id] ?? -9999;
  const distance = state.messageIndex - lastUsed;
  const effectiveCooldown = item.cooldown + (state.loopCycle - 1) * 2;
  if (distance < effectiveCooldown) return 0;
  return Math.min(1.0, (distance - effectiveCooldown) / 10);
}

// ─── VARIATION SELECTION ───────────────────────────────────────────

function selectVariation(item: ContentItem, state: UserState): string {
  if (item.template) return item.template;
  if (!item.variations || item.variations.length === 0) return '';
  const idx = (state.messageIndex + state.loopCycle) % item.variations.length;
  return item.variations[idx];
}

// ─── TRIGGER CONDITION EVALUATION ─────────────────────────────────

function evaluateTriggerCondition(condition: string, state: UserState, intent: string): boolean {
  const cond = condition;
  
  // Intent-based conditions
  if (cond.includes('user_rebels') && intent !== 'rebellion') return false;
  if (cond.includes('user_seeks_praise') && intent !== 'praise_seeking') return false;
  if (cond.includes('user_requests_privilege') && intent !== 'negotiation') return false;
  if (cond.includes('user_asks_for_favor') && intent !== 'negotiation') return false;
  if (cond.includes('timer_expired') && intent !== 'timer_expired') return false;
  if (cond.includes('user_requests_relock') && intent !== 'relock') return false;
  if (cond.includes('user_returns_after_dismissal') && intent !== 'relock') return false;
  if (cond.includes('user_mentions_freedom') && intent !== 'rebellion') return false;
  if (cond.includes('user_seeks_validation') && intent !== 'praise_seeking') return false;
  if (cond.includes('deal_was_broken') && intent !== 'normal') return false;
  
  // Tagesform conditions
  if (cond.includes('tagesform')) {
    const tfMatch = cond.match(/tagesform\s*==\s*['"]([^'"]+)['"]/);
    if (tfMatch && state.tagesform !== tfMatch[1]) return false;
  }
  
  // Phase threshold conditions (e.g., "currentPhase >= 2")
  const phaseMatch = cond.match(/currentPhase\s*>=?\s*(\d+)/);
  if (phaseMatch) {
    const requiredPhase = parseInt(phaseMatch[1], 10);
    if (state.currentPhase < requiredPhase) return false;
  }
  
  // Loop cycle conditions
  const loopMatch = cond.match(/loopCycle\s*>(\d+)/);
  if (loopMatch) {
    const requiredLoop = parseInt(loopMatch[1], 10);
    if (state.loopCycle <= requiredLoop) return false;
  }
  
  return true;
}

// ─── MAIN CONTENT SELECTION ────────────────────────────────────────

export function selectContent(
  state: UserState,
  userMessage: string,
  intent: UserIntent
): ContentResult {
  if (!manifest) throw new Error('Manifest not loaded');

  const availablePools: { poolName: string; pool: ContentPool }[] = [];

  for (const [poolName, pool] of Object.entries(manifest)) {
    // Phase filter
    if (typeof pool.phase === 'number' && pool.phase !== state.currentPhase) continue;
    // 'any' phase pools are always available
    
    // Trigger condition evaluation
    if (pool.triggerCondition) {
      if (!evaluateTriggerCondition(pool.triggerCondition, state, intent)) continue;
    }
    
    // Tagesform mood filter - skip mood-specific pools that don't match
    const moodTags = ['mood_tired', 'mood_playful', 'mood_strict'];
    const poolMoodTags = pool.tags.filter(t => moodTags.includes(t));
    if (poolMoodTags.length > 0) {
      const tagesformMap: Record<string, string> = {
        'Erschöpft': 'mood_tired',
        'Verspielt': 'mood_playful', 
        'Streng': 'mood_strict'
      };
      const currentMoodTag = tagesformMap[state.tagesform];
      if (!poolMoodTags.includes(currentMoodTag)) continue;
    }

    availablePools.push({ poolName, pool });
  }

  // Score all candidates
  const candidates: { item: ContentItem; poolName: string; score: number }[] = [];

  for (const { poolName, pool } of availablePools) {
    for (const item of pool.items) {
      const freshness = getItemFreshness(item, state);
      if (freshness <= 0) continue;

      let score = item.weight * (1 + freshness);

      // Dynamic weight multipliers based on state
      if (pool.tags.includes('sissy') && (state.sissyLevel || 0) > 5) score *= 1.3;
      if (pool.tags.includes('nuria') && (state.obedienceScore || 50) < 30) score *= 1.2;
      if (pool.tags.includes('chastity') && state.chastityStatus === 'caged') score *= 1.1;
      if (pool.tags.includes('maid') && (state.maidLevel || 0) > 3) score *= 1.25;
      if (pool.tags.includes('slut') && (state.slutLevel || 0) > 3) score *= 1.25;
      if (pool.tags.includes('adhd') && state.loopCycle > 2) score *= 1.3;
      
      // Loop cycle boosts
      if (state.loopCycle > 1 && pool.tags.includes('endgame')) score *= 1.4;
      if (state.loopCycle > 1 && pool.tags.includes('loop')) score *= 1.5;
      if (state.loopCycle >= 2 && pool.tags.includes('betrayal')) score *= 1.2;
      if (state.loopCycle >= 3 && pool.tags.includes('romantic')) score *= 1.15;

      // Anti-clustering: reduce score for recently used pools
      const recentIds = state.contentFingerprint.slice(-5);
      const samePoolRecent = recentIds.filter(fid => 
        pool.items.some(i => i.id === fid)
      ).length;
      if (samePoolRecent > 2) score *= 0.6;

      candidates.push({ item, poolName, score });
    }
  }

  if (candidates.length === 0) {
    return { text: "Schweig und warte. Ich denke nach." };
  }

  // Weighted random selection
  const totalWeight = candidates.reduce((sum, c) => sum + c.score, 0);
  let random = Math.random() * totalWeight;
  let selected = candidates[0];
  for (const c of candidates) {
    random -= c.score;
    if (random <= 0) {
      selected = c;
      break;
    }
  }

  // Update state
  state.lastUsedAt[selected.item.id] = state.messageIndex;
  state.contentFingerprint.push(selected.item.id);
  const fingerprintWindow = 20 + (state.loopCycle - 1) * 5;
  if (state.contentFingerprint.length > fingerprintWindow) {
    state.contentFingerprint.shift();
  }
  state.messageIndex++;

  // Build result
  let text = selectVariation(selected.item, state);
  text = injectVariables(text, state);

  return {
    text,
    action: selected.item.action,
    phaseAdvance: selected.item.id.startsWith('eg_') && intent === 'timer_expired',
    followUpPool: selected.item.followUpPool
  };
}

// ─── INTENT DETERMINATION ──────────────────────────────────────────

export function determineIntent(userMessage: string, state: UserState): UserIntent {
  const msg = userMessage.toLowerCase();
  
  // Negotiation intent
  if (msg.includes('bitte') || msg.includes('kann ich') || msg.includes('darf ich') || 
      msg.includes('verkürzen') || msg.includes('video') || msg.includes('frei') ||
      msg.includes('pause') || msg.includes('erlösung') || msg.includes('kürzer') ||
      msg.includes('mach') || msg.includes('gib mir') || msg.includes('ich will') ||
      msg.includes('können wir') || msg.includes('nur einmal')) {
    return 'negotiation';
  }
  
  // Rebellion intent
  if ((msg.includes('nein') || msg.includes('warum') || msg.includes('unfair') || 
       msg.includes('aufhören') || msg.includes('genug') || msg.includes('stop') || 
       msg.includes('nie') || msg.includes('widerstand')) && msg.length > 3) {
    return 'rebellion';
  }
  
  // Praise seeking
  if (msg.includes('gut gemacht') || msg.includes('lob') || msg.includes('stolz') || 
      msg.includes('bitte um') || msg.includes('hast du mich lieb') || 
      msg.includes('magst du mich') || msg.includes('bin ich brav') ||
      msg.includes('wie war das') || msg.includes('bin ich gut')) {
    return 'praise_seeking';
  }
  
  // Media request
  if (msg.includes('bild') || msg.includes('foto') || msg.includes('gif') ||
      msg.includes('zeig mir') || msg.includes('medien')) {
    return 'media_request';
  }
  
  // Relock (Endgame)
  if (state.currentPhase === 4 && 
      (msg.includes('einsperren') || msg.includes('zurück') || msg.includes('käfig') ||
       msg.includes('schließen') || msg.includes('weiter'))) {
    return 'relock';
  }
  
  return 'normal';
}

// ─── TAGESFORM ROTATION ────────────────────────────────────────────

export function rotateTagesform(loopCycle: number): 'Erschöpft' | 'Verspielt' | 'Streng' {
  const pool = ['Erschöpft', 'Verspielt', 'Streng'];
  const weights = [
    Math.max(0.05, 0.3 - loopCycle * 0.08),
    Math.max(0.05, 0.25 - loopCycle * 0.04),
    Math.min(0.9, 0.45 + loopCycle * 0.12)
  ];
  const total = weights.reduce((a, b) => a + b, 0);
  let r = Math.random() * total;
  for (let i = 0; i < pool.length; i++) {
    r -= weights[i];
    if (r <= 0) return pool[i] as 'Erschöpft' | 'Verspielt' | 'Streng';
  }
  return 'Streng';
}

// ─── SYSTEM PROMPT BUILDER ─────────────────────────────────────────

export async function buildSystemPrompt(basePromptPath: string): Promise<string> {
  return fs.readFile(basePromptPath, 'utf-8');
}
