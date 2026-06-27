import fs from 'fs/promises';
import type { ModulesJson, Module, UserProfile } from '../types/engine.js';

let cachedModules: ModulesJson | null = null;

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

export function getModuleById(modules: ModulesJson, id: number): Module | undefined {
  return modules.modules.find((m) => m.id === id);
}

export function buildModulePrompt(
  modules: ModulesJson,
  moduleId: number,
  profile: UserProfile
): string {
  const mod = getModuleById(modules, moduleId);
  if (!mod) throw new Error(`Module ${moduleId} not found`);

  const base = modules.global_directives?.tone || '';
  const prompt = mod.ai_prompt;

  return `${base}\n\n${prompt}`
    .replace(/\{compliance_points\}/g, String(profile.compliance_points))
    .replace(/\{current_module_id\}/g, String(profile.current_module_id))
    .replace(/\{lock_status\}/g, profile.lock_status)
    .replace(/\{flag:([^}]+)\}/g, (_match, key) => {
      const value = profile.story_flags[key];
      return value !== undefined ? String(value) : '';
    });
}
