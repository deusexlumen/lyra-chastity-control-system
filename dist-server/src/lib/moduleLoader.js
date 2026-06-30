import fs from 'fs/promises';
let cachedModules = null;
function isObject(value) {
    return typeof value === 'object' && value !== null;
}
function isModule(value) {
    if (!isObject(value))
        return false;
    return (typeof value.id === 'number' &&
        typeof value.title === 'string' &&
        typeof value.requirementPoints === 'number' &&
        typeof value.ai_prompt === 'string');
}
function isModulesJson(value) {
    if (!isObject(value))
        return false;
    if (!Array.isArray(value.modules))
        return false;
    if (!value.modules.every(isModule))
        return false;
    if (value.global_directives !== undefined) {
        if (!isObject(value.global_directives))
            return false;
        if (value.global_directives.tone !== undefined &&
            typeof value.global_directives.tone !== 'string') {
            return false;
        }
    }
    return true;
}
export async function loadModules(modulesPath) {
    const raw = await fs.readFile(modulesPath, 'utf-8');
    const parsed = JSON.parse(raw);
    if (!isModulesJson(parsed)) {
        throw new Error(`Invalid modules.json at ${modulesPath}: expected an object with a "modules" array of Module objects`);
    }
    cachedModules = parsed;
    return cachedModules;
}
export function getModules() {
    if (!cachedModules)
        throw new Error('Modules not loaded');
    return cachedModules;
}
export function getModuleById(modules, id) {
    return modules.modules.find((m) => m.id === id);
}
export function checkModuleProgression(modules, profile) {
    const current = getModuleById(modules, profile.current_module_id);
    const next = getModuleById(modules, profile.current_module_id + 1);
    if (!current || !next)
        return { advanced: false };
    const requiredFlags = current.completion_flags || [];
    const flagsMet = requiredFlags.every((flag) => !!profile.story_flags[flag]);
    const pointsMet = profile.compliance_points >= next.requirementPoints;
    if (!flagsMet || !pointsMet)
        return { advanced: false };
    return { advanced: true, oldModuleId: current.id, newModuleId: next.id };
}
export function buildModulePrompt(modules, moduleId, profile) {
    const mod = getModuleById(modules, moduleId);
    if (!mod)
        throw new Error(`Module ${moduleId} not found`);
    const base = modules.global_directives?.tone || '';
    const prompt = mod.ai_prompt;
    const nextMod = modules.modules.find((m) => m.id === mod.id + 1);
    const moduleContext = `Du befindest dich im Modul "${mod.title}" (ID ${mod.id}, Anforderung: ${mod.requirementPoints} Punkte).${nextMod
        ? ` Das nächste Modul ist "${nextMod.title}" (ab ${nextMod.requirementPoints} Punkten).`
        : ' Dies ist das letzte Modul.'}`;
    return `${base}\n\n${moduleContext}\n\n${prompt}`
        .replace(/\{compliance_points\}/g, String(profile.compliance_points))
        .replace(/\{current_module_id\}/g, String(profile.current_module_id))
        .replace(/\{lock_status\}/g, profile.lock_status)
        .replace(/\{flag:([^}]+)\}/g, (_match, key) => {
        const value = profile.story_flags[key];
        return value !== undefined ? String(value) : '';
    });
}
