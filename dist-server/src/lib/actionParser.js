export function parseActions(rawText) {
    const result = {
        setModule: null,
        setFlags: [],
        penalties: [],
        addPoints: 0,
        forceMedia: [],
        cleanText: rawText,
    };
    const setModuleMatch = rawText.match(/\[ACTION: SET_MODULE=(\d+)\]/g);
    if (setModuleMatch) {
        const last = setModuleMatch[setModuleMatch.length - 1];
        const m = last.match(/\[ACTION: SET_MODULE=(\d+)\]/);
        if (m)
            result.setModule = parseInt(m[1], 10);
    }
    const flagMatches = rawText.matchAll(/\[ACTION: SET_FLAG=([^:\]]+):([^\]]+)\]/g);
    for (const match of flagMatches) {
        const key = match[1].trim();
        const rawValue = match[2].trim();
        if (!key)
            continue;
        let value = rawValue;
        if (rawValue === 'true')
            value = true;
        else if (rawValue === 'false')
            value = false;
        else if (/^-?\d+$/.test(rawValue))
            value = parseInt(rawValue, 10);
        result.setFlags.push({ key, value });
    }
    const penaltyMatches = rawText.matchAll(/\[ACTION: PENALTY_MINUTES=(-?\d+)\]/g);
    for (const match of penaltyMatches) {
        result.penalties.push(parseInt(match[1], 10));
    }
    const addPointsMatches = rawText.matchAll(/\[ACTION: ADD_POINTS=(-?\d+)\]/g);
    for (const match of addPointsMatches) {
        result.addPoints += parseInt(match[1], 10);
    }
    const mediaMatches = rawText.matchAll(/\[ACTION: FORCE_MEDIA=([^:\]]+):(\d+)\]/g);
    for (const match of mediaMatches) {
        const category = match[1].trim();
        if (!category)
            continue;
        result.forceMedia.push({ category, index: parseInt(match[2].trim(), 10) });
    }
    result.cleanText = rawText
        .replace(/\[ACTION: SET_MODULE=\d+\]/g, '')
        .replace(/\[ACTION: SET_FLAG=[^:\]]+:[^\]]+\]/g, '')
        .replace(/\[ACTION: PENALTY_MINUTES=-?\d+\]/g, '')
        .replace(/\[ACTION: ADD_POINTS=-?\d+\]/g, '')
        .replace(/\[ACTION: FORCE_MEDIA=[^:\]]+:\d+\]/g, '')
        .replace(/\[(ACTION|ACTIONS?):[^\]]*\]/g, '')
        .trim();
    return result;
}
