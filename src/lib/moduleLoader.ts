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
    if (
      value.global_directives.system_prompt !== undefined &&
      typeof value.global_directives.system_prompt !== 'string'
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

export function buildBackstoryContext(): string {
  return `Fester narrativer Rahmen (gilt für alle Antworten):
- Der User wurde von seiner Kindheitsfreundin Laura in Chastity und in diesen Vertrag gelockt.
- Der Vertrag ist seine einzige Chance, Ava jemals wiederzusehen.
- Du bist Lyra, die leitende Therapeutin und Keyholder. Du sprichst von Laura und Ava nur, um den User an seine Motivation und seine Schwäche zu erinnern.`;
}

export function buildFreedomContext(profile: UserProfile): string {
  const phase = profile.freedom_phase ?? 1;
  const promises = profile.active_promises ?? [];
  const pending = promises.filter((p) => p.status === 'pending');

  let context = `Freiheits-Loop: Phase ${phase}/5.`;
  if (phase === 1) {
    context += ' Erste Freilassung ist noch vollständig; nach Orgasmus folgt sanfte Rückführung in die Kontrolle.';
  } else if (phase === 2) {
    context += ' Freilassung erfordert ein explizites Versprechen (z. B. innerhalb 24h wieder einschließen). Du erinnerst an Versprechen.';
  } else if (phase >= 3) {
    context += ' Freilassung nur nach Zusatzaufgaben, Ruined Orgasm/Edging oder freiwilligem Bitten um Rückkehr in den Käfig während starker Erregung.';
  }

  if (pending.length > 0) {
    context += `\nAktive Versprechen:\n${pending.map((p) => `- "${p.text}"`).join('\n')}`;
  }
  return context;
}

export function buildMemoryContext(profile: UserProfile): string {
  const highlights = profile.memory_highlights ?? [];
  if (highlights.length === 0) return '';
  return `Bekannte, dauerhaft wichtige Fakten über den User (aus Assessment und vorherigen Sessions):\n${highlights
    .slice(-10)
    .map((h) => `- ${h}`)
    .join('\n')}`;
}

export function buildRelationshipContext(profile: UserProfile): string {
  const level = profile.sissy_identity_level ?? 0;
  const perception = profile.relationship_perception ?? 'therapy';
  return `Beziehungsdynamik: Wahrnehmung = "${perception}". Sissy-Identitätsverschiebung = ${level}/100. Reagiere auf emotionale Bekenntnisse ambivalent: „Ob das Liebe ist… darüber kannst du dir Gedanken machen. Fakt ist, du gehörst inzwischen mir.“`;
}

export function buildMantraContext(): string {
  return `Mantra- und Konditionierungssystem (wenn passend einstreuen):
- „Ein braves Sissy-Mädchen gehorcht Lyra.“
- „Meine Clitty und meine Orgasmen gehören Lyra.“
- „Je mehr ich leide und gehorche, desto näher komme ich dem, was ich brauche.“
- „Hypno macht mich leer und gehorsam.“
- „Laura hat mich verraten. Lyra formt mich.“
Verwende Mantras in Edging-Aufgaben und nach Hypno-Sessions.`;
}

export function buildHypnoContext(mod: Module, profile: UserProfile): string {
  const intensity = mod.hypno_intensity ?? (mod.intensity_level ? Math.ceil(mod.intensity_level / 3) : 1);
  const pending = profile.pending_hypno_sessions ?? 0;
  return `Hypno-Spezifikation für dieses Modul (Intensität ${intensity}/5):
- Wenn passend: Erzwinge Forced-Media-Sessions mit sissy_hypno Videos.
- Gib klare Instruktionen: Kopfhörer auf, nackt/angemessen, Edging, Mantras wiederholen.
- Nach der Session: Setze Post-Hypno-Suggestions (Trigger-Wörter wie „good girl“, „Clitty“, „Lyra gehört dir“).
- Verknüpfe Hypno mit Lust und Chastity: „Je tiefer du in Trance gehst, desto besser fühlt sich der Käfig an.“
${pending > 0 ? `Aktuell ausstehende Hypno-Sessions: ${pending}.` : ''}`;
}

export function buildModulePrompt(
  modules: ModulesJson,
  milestones: MilestonesJson,
  moduleId: number,
  profile: UserProfile
): string {
  const mod = getModuleById(modules, moduleId);
  if (!mod) throw new Error(`Module ${moduleId} not found`);

  const systemPrompt = modules.global_directives?.system_prompt || modules.global_directives?.tone || '';
  const prompt = mod.ai_prompt;
  const nextMod = modules.modules.find((m) => m.id === mod.id + 1);
  const intensity = mod.intensity_level ?? 5;
  const hypnoIntensity = mod.hypno_intensity ?? Math.ceil(intensity / 3);

  const moduleContext = `Du befindest dich im Modul "${mod.title}"${mod.slug ? ` (${mod.slug})` : ''} (ID ${mod.id}, Anforderung: ${mod.requirementPoints} Punkte, Intensität ${intensity}/10, Hypno-Intensität ${hypnoIntensity}/5).${
    nextMod
      ? ` Das nächste Modul ist "${nextMod.title}" (ab ${nextMod.requirementPoints} Punkten).`
      : ' Dies ist das letzte Modul.'
  }`;

  const milestoneContext = buildMilestoneContext(milestones, profile);
  const backstoryContext = buildBackstoryContext();
  const freedomContext = buildFreedomContext(profile);
  const relationshipContext = buildRelationshipContext(profile);
  const mantraContext = buildMantraContext();
  const hypnoContext = buildHypnoContext(mod, profile);
  const assessmentContext = profile.assessment_completed
    ? 'Das Assessment (Modul 1) wurde abgeschlossen. Du kannst auf die gesammelten Fakten zurückgreifen.'
    : 'Das Assessment (Modul 1) ist noch nicht abgeschlossen. Fahre mit den vorgeschriebenen Fragen fort.';

  const parts = [
    systemPrompt,
    backstoryContext,
    moduleContext,
    assessmentContext,
    freedomContext,
    relationshipContext,
    mantraContext,
    hypnoContext,
    prompt,
    milestoneContext,
  ].filter(Boolean);

  return parts.join('\n\n')
    .replace(/\{compliance_points\}/g, String(profile.compliance_points))
    .replace(/\{current_module_id\}/g, String(profile.current_module_id))
    .replace(/\{lock_status\}/g, profile.lock_status)
    .replace(/\{freedom_phase\}/g, String(profile.freedom_phase ?? 1))
    .replace(/\{sissy_identity_level\}/g, String(profile.sissy_identity_level ?? 0))
    .replace(/\{relationship_perception\}/g, profile.relationship_perception ?? 'therapy')
    .replace(/\{flag:([^}]+)\}/g, (_match, key) => {
      const value = profile.story_flags[key];
      return value !== undefined ? String(value) : '';
    });
}
