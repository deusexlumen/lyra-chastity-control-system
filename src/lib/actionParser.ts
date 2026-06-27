import type { ParsedActions } from '../types/engine.js';

export function parseActions(rawText: string): ParsedActions {
  const result: ParsedActions = {
    setModule: null,
    setFlags: [],
    penalties: [],
    forceMedia: [],
    cleanText: rawText,
  };

  const setModuleMatch = rawText.match(/\[ACTION: SET_MODULE=(\d+)\]/g);
  if (setModuleMatch) {
    const last = setModuleMatch[setModuleMatch.length - 1];
    const m = last.match(/\[ACTION: SET_MODULE=(\d+)\]/);
    if (m) result.setModule = parseInt(m[1], 10);
  }

  const flagMatches = rawText.matchAll(/\[ACTION: SET_FLAG=([^:\]]+):([^\]]+)\]/g);
  for (const match of flagMatches) {
    const key = match[1].trim();
    const rawValue = match[2].trim();
    let value: boolean | number = false;
    if (rawValue === 'true') value = true;
    else if (rawValue === 'false') value = false;
    else if (/^-?\d+$/.test(rawValue)) value = parseInt(rawValue, 10);
    result.setFlags.push({ key, value });
  }

  const penaltyMatches = rawText.matchAll(/\[ACTION: PENALTY_MINUTES=(-?\d+)\]/g);
  for (const match of penaltyMatches) {
    result.penalties.push(parseInt(match[1], 10));
  }

  const mediaMatches = rawText.matchAll(/\[ACTION: FORCE_MEDIA=([^:\]]+):([^\]]+)\]/g);
  for (const match of mediaMatches) {
    result.forceMedia.push({ category: match[1].trim(), index: parseInt(match[2].trim(), 10) });
  }

  result.cleanText = rawText
    .replace(/\[ACTION: SET_MODULE=\d+\]/g, '')
    .replace(/\[ACTION: SET_FLAG=[^:\]]+:[^\]]+\]/g, '')
    .replace(/\[ACTION: PENALTY_MINUTES=-?\d+\]/g, '')
    .replace(/\[ACTION: FORCE_MEDIA=[^:\]]+:[^\]]+\]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  return result;
}
