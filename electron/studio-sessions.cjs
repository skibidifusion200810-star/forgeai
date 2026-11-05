'use strict';
// Extract Studio instance IDs from the official MCP list_roblox_studios tool.
// Roblox versions return either "studio_id" or "id" in the studios[] entries.
// Never treat an arbitrary nested object ID as a Studio ID.
function studioErrorText(result) {
  return (result?.content || []).map(item => item && typeof item.text === 'string' ? item.text : '').filter(Boolean).join('\n') || 'Unknown Studio MCP error';
}
function parseStudios(result) {
  if (result?.isError) return [];
  const found = new Map();
  const seen = new Set();
  const studioCollections = new Set(['studios', 'instances', 'sessions', 'connected_studios', 'connectedStudios']);

  function visit(value, depth = 0, inStudioList = false) {
    if (depth > 12 || value == null) return;
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
        try {
          const parsed = JSON.parse(trimmed);
          visit(parsed, depth + 1, inStudioList || Array.isArray(parsed));
        } catch (_) { /* Some MCP tools return plain text, not JSON. */ }
      }
      return;
    }
    if (typeof value !== 'object' || seen.has(value)) return;
    seen.add(value);
    if (Array.isArray(value)) {
      for (const entry of value) visit(entry, depth + 1, inStudioList);
      return;
    }
    const id = value.studio_id ?? value.studioId ?? (inStudioList ? value.id : null);
    if ((typeof id === 'string' && id.trim()) || (typeof id === 'number' && Number.isFinite(id))) {
      const studio_id = String(id).trim();
      found.set(studio_id, {
        studio_id,
        name: String(value.name ?? value.place_name ?? value.placeName ?? 'Roblox Studio'),
        place_id: value.place_id ?? value.placeId ?? null
      });
    }
    for (const [key, child] of Object.entries(value)) {
      if (['studio_id','studioId','id','name','place_name','placeName','place_id','placeId'].includes(key)) continue;
      visit(child, depth + 1, studioCollections.has(key));
    }
  }
  visit(result?.structuredContent);
  for (const block of result?.content || []) {
    if (block?.type === 'text' && typeof block.text === 'string') visit(block.text);
  }
  return [...found.values()];
}
module.exports = { parseStudios, studioErrorText };
