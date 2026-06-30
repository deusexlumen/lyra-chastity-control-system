import fs from 'fs/promises';
import type { ModulesJson, Module, UserProfile, MilestonesJson, Milestone } from '../types/engine.js';

let cachedModules: ModulesJson | null = null;
let cachedMilestones: MilestonesJson | null = null;

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isModule(value: unknown): value is Module {
  if (!isObject(value)) return false;
  return (
    typeof value.id === 'number' &&
    typeof value.title === 'string' &&
    typeof value.requirementPoints === 'number' &&
    typeof value.ai_prompt === 'string'
  );
}

function isModulesJson(value: unknown): value is ModulesJson {
  if (!isObject(value)) return false;
  if (!Array.isArray(value.modules)) return false;
  if (!value.modules.every(isModule)) return false;
  if (value.global_directives !== undefined) {
    if (!isObject(value.global_directives)) return false;
    if (
      value.global_directives.tone !== undefined &&
      typeof value.global_directives.tone !== 'string'
    ) {
      return false;
    }
  }
  return true;
}

function isMilestone(value: unknown): value is Milestone {
  if (!isObject(value)) return false;
  if (typeof value.id !== 'string') return false;
  if (typeof value.title !== 'string') return false;
  if (typeof value.description !== 'string') return false;
  if (!['photo', 'media', 'combo'].includes(value.type as string)) return false;
  if (typeof value.module_id !== 'number') return false;
  if (typeof value.flag !== 'string') return false;
  if (typeof value.points_bonus !== 'number') return false;
  if (value.media_trigger !== undefined && typeof value.media_trigger !== 'string') return false;
  if (value.required_flags !== undefined && !Array.isArray(value.required_flags)) return false;
  return true;
}

function isMilestonesJson(value: unknown): value is MilestonesJson {
  if (!isObject(value)) return false;
  if (!Array.isArray(value.milestones)) return false;
  return value.milestones.every(isMilestone);
}

export async function loadModules(modulesPath: string): Promise<ModulesJson> {
  const raw = await fs.readFile(modulesPath, 'utf-8');
  const parsed: unknown = JSON.parse(raw);
  if (!isModulesJson(parsed)) {
    throw new Error(
      `Invalid modules.json at ${modulesPath}: expected an object with a "modules" array of Module objects`
    );
  }
  cachedModules = parsed;
  return cachedModules;
}

export function getModules(): ModulesJson {
  if (!cachedModules) throw new Error('Modules not loaded');
  return cachedModules;
}

export async function loadMilestones(milestonesPath: string): Promise<MilestonesJson> {
  const raw = await fs.readFile(milestonesPath, 'utf-8');
  const parsed: unknown = JSON.parse(raw);
  if (!isMilestonesJson(parsed)) {
    throw new Error(
      `Invalid milestones.json at ${milestonesPath}: expected an object with a "milestones" array`
    );
  }
  cachedMilestones = parsed;
  return cachedMilestones;
}

export function getMilestones(): MilestonesJson {
  if (!cachedMilestones) throw new Error('Milestones not loaded');
  return cachedMilestones;
}

export function getModuleById(modules: ModulesJson, id: number): Module | undefined {
  return modules.modules.find((m) => m.id === id);
}

export function getMilestonesForModule(milestones: MilestonesJson, moduleId: number): Milestone[] {
  return milestones.milestones.filter((m) => m.module_id === moduleId);
}

function isMilestoneCompleted(milestone: Milestone, profile: UserProfile): boolean {
  if (milestone.type === 'combo') {
    const required = milestone.required_flags || [];
    if (required.length === 0) return !!profile.story_flags[milestone.flag];
    return required.every((flag) => !!profile.story_flags[flag]);
  }
  return !!profile.story_flags[milestone.flag];
}

export function getPendingMilestones(
  milestones: MilestonesJson,
  profile: UserProfile
): Milestone[] {
  return getMilestonesForModule(milestones, profile.current_module_id).filter(
    (m) => !isMilestoneCompleted(m, profile)
  );
}

export function buildMilestoneContext(
  milestones: MilestonesJson,
  profile: UserProfile
): string {
  const moduleMilestones = getMilestonesForModule(milestones, profile.current_module_id);
  if (moduleMilestones.length === 0) return '';

  const pending = moduleMilestones.filter((m) => !isMilestoneCompleted(m, profile));
  const completed = moduleMilestones.filter((m) => isMilestoneCompleted(m, profile));

  const lines: string[] = [];
  lines.push('Meilensteine für dieses Modul:');

  for (const m of moduleMilestones) {
    const status = isMilestoneCompleted(m, profile) ? '[ERLEDIGT]' : '[OFFEN]';
    lines.push(`- ${status} ${m.title}: ${m.description}`);
  }

  if (pending.length > 0) {
    lines.push(`\nDer User darf erst ins nächste Modul, wenn alle [OFFEN]-Meilensteine erfüllt sind.`);
    lines.push(`Verlange die offenen Beweise konkret, aber ohne sie als 'Spiel-Mechanik' zu benennen.`);
  }

  if (completed.length > 0) {
    lines.push(`\nBereits erledigt: ${completed.map((m) => m.title).join(', ')}.`);
  }

  return `\n\n${lines.join('\n')}`;
}

export function checkModuleProgression(
  modules: ModulesJson,
  milestones: MilestonesJson,
  profile: UserProfile
): { advanced: false } | { advanced: true; oldModuleId: number; newModuleId: number } {
  const current = getModuleById(modules, profile.current_module_id);
  const next = getModuleById(modules, profile.current_module_id + 1);
  if (!current || !next) return { advanced: false };

  const requiredFlags = current.completion_flags || [];
  const flagsMet = requiredFlags.every((flag) => !!profile.story_flags[flag]);
  const pointsMet = profile.compliance_points >= next.requirementPoints;

  if (!flagsMet || !pointsMet) return { advanced: false };

  // Meilensteine müssen ebenfalls erfüllt sein
  const moduleMilestones = getMilestonesForModule(milestones, profile.current_module_id);
  const milestonesMet = moduleMilestones.every((m) => isMilestoneCompleted(m, profile));
  if (!milestonesMet) return { advanced: false };

  return { advanced: true, oldModuleId: current.id, newModuleId: next.id };
}

export function buildModulePrompt(
  modules: ModulesJson,
  milestones: MilestonesJson,
  moduleId: number,
  profile: UserProfile
): string {
  const mod = getModuleById(modules, moduleId);
  if (!mod) throw new Error(`Module ${moduleId} not found`);

  const base = modules.global_directives?.tone || '';
  const prompt = mod.ai_prompt;
  const nextMod = modules.modules.find((m) => m.id === mod.id + 1);

  const moduleContext = `Du befindest dich im Modul "${mod.title}" (ID ${mod.id}, Anforderung: ${mod.requirementPoints} Punkte).${
    nextMod
      ? ` Das nächste Modul ist "${nextMod.title}" (ab ${nextMod.requirementPoints} Punkten).`
      : ' Dies ist das letzte Modul.'
  }`;

  const milestoneContext = buildMilestoneContext(milestones, profile);

  return `${base}\n\n${moduleContext}\n\n${prompt}${milestoneContext}`
    .replace(/\{compliance_points\}/g, String(profile.compliance_points))
    .replace(/\{current_module_id\}/g, String(profile.current_module_id))
    .replace(/\{lock_status\}/g, profile.lock_status)
    .replace(/\{flag:([^}]+)\}/g, (_match, key) => {
      const value = profile.story_flags[key];
      return value !== undefined ? String(value) : '';
    });
}
