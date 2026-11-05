'use strict';
// Robustly extract connected Studio IDs from MCP structuredContent or text JSON.
// Never invent an ID: return an empty list when Studio is not actually bound.
function studioErrorText(result) {
  return (result?.content || []).map(item => item && typeof item.text === 'string' ? item.text : '').filter(Boolean).join('\n') || 'Unknown Studio MCP error';
}
function parseStudios(result) {
  if (result?.isError) return [];
  const found = new Map();
  const seen = new Set();
  function visit(value, depth = 0) {
    if (depth > 12 || value == null) return;
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
        try { visit(JSON.parse(trimmed), depth + 1); } catch (_) {}
      }
      return;
    }
    if (typeof value !== 'object' || seen.has(value)) return;
    seen.add(value);
    if (Array.isArray(value)) {
      for (const item of value) visit(item, depth + 1);
      return;
    }
    const id = value.studio_id ?? value.studioId;
    if ((typeof id === 'string' && id.trim()) || (typeof id === 'number' && Number.isFinite(id))) {
      const key = String(id).trim();
      found.set(key, { studio_id: key, name: String(value.name ?? value.place_name ?? value.placeName ?? 'Roblox Studio'), place_id: value.place_id ?? value.placeId ?? null });
    }
    for (const [key, child] of Object.entries(value)) {
      if (!['studio_id', 'studioId', 'name', 'place_name', 'placeName', 'place_id', 'placeId'].includes(key)) visit(child, depth + 1);
    }
  }
  visit(result?.structuredContent);
  visit(result?.content);
  return [...found.values()];
}
module.exports = { parseStudios, studioErrorText };
