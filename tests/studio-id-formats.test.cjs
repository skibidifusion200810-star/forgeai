'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { parseStudios } = require('../electron/studio-sessions.cjs');

test('parses Roblox MCP studios array using id (actual recent Studio response shape)', () => {
  const result = { content: [{ type: 'text', text: '{"studios":[{"id":"ea5b179b-6ee8-4472-935a-34adf7e0f598","name":null}]}' }] };
  assert.deepEqual(parseStudios(result), [{ studio_id: 'ea5b179b-6ee8-4472-935a-34adf7e0f598', name: 'Roblox Studio', place_id: null }]);
});
test('parses Roblox MCP studios array with name and placeId', () => {
  const result = { content: [{ type: 'text', text: '{"studios":[{"id":"studio-x","name":"Baseplate","placeId":123}]}' }] };
  assert.deepEqual(parseStudios(result), [{ studio_id: 'studio-x', name: 'Baseplate', place_id: 123 }]);
});
test('parses typed studio_id and studioId from MCP structured content', () => {
  const result = { structuredContent: { sessions: [{ studio_id: 'a', name: 'A' }, { studioId: 'b', place_name: 'B' }] } };
  assert.deepEqual(parseStudios(result).map(s => s.studio_id), ['a', 'b']);
});
test('parses direct JSON array of Studio results', () => {
  const result = { content: [{ type: 'text', text: '[{"id":"a","name":"A"}]' }] };
  assert.equal(parseStudios(result)[0].studio_id, 'a');
});
test('does not confuse other nested object ids with Studio session ids', () => {
  const result = { structuredContent: { metadata: { id: 'not-a-studio', name: 'Other' }, studios: [] } };
  assert.deepEqual(parseStudios(result), []);
});
test('does not fabricate a session from a proxy error or empty list', () => {
  assert.deepEqual(parseStudios({ content: [{ type: 'text', text: '{"studios":[]}' }] }), []);
  assert.deepEqual(parseStudios({ isError: true, content: [{ type: 'text', text: '{"studios":[{"id":"fake"}]}' }] }), []);
});
