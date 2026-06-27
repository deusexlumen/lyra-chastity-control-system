import fs from 'fs/promises';
import type { ModulesJson, Module, UserProfile } from '../types/engine.js';

let cachedModules: ModulesJson | null = null;

export async function loadModules(modulesPath: string): Promise<ModulesJson> {
  const raw = await fs.readFile(modulesPath, 'utf-8');
  cachedModules = JSON.parse(raw) as ModulesJson;
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
