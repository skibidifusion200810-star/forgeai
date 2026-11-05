'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { parseStudios } = require('../electron/studio-sessions.cjs');
const { StudioConnection } = require('../electron/studio.cjs');

test('extracts sessions from Studio JSON result content', () => {
  const sessions = parseStudios({ content: [{ type: 'text', text: JSON.stringify({ studios: [{ studio_id: 'studio-abc', name: 'Baseplate', place_id: 100 }] }) }] });
  assert.deepEqual(sessions, [{ studio_id: 'studio-abc', name: 'Baseplate', place_id: 100 }]);
});
test('does not invent a Studio session when the proxy has no attached place', () => {
  assert.deepEqual(parseStudios({ content: [{ type: 'text', text: 'No studio available for proxy' }] }), []);
  assert.deepEqual(parseStudios({ isError: true, content: [{ type: 'text', text: '{"studio_id":"fake"}' }] }), []);
});
test('extracts sessions from structured MCP results', () => {
  assert.deepEqual(parseStudios({ structuredContent: { instances: [{ studioId: 'one', placeName: 'Test' }] } })[0].studio_id, 'one');
});
test('blocks calls needing studio_id if none has been selected', async () => {
  const s = new StudioConnection(() => {});
  s.state = 'connected';
  s.client = { callTool: async () => { throw Error('Should not execute'); } };
  s.tools = [{ name: 'get_studio_state', inputSchema: { properties: { studio_id: { type: 'string' } } } }];
  await assert.rejects(() => s.execute('get_studio_state', {}, async () => true), /No Studio instance selected/);
});
test('supplies the discovered active studio_id automatically', async () => {
  const s = new StudioConnection(() => {});
  s.state = 'connected';
  s.studioId = 'studio-abc';
  s.sessions = [{ studio_id: 'studio-abc' }];
  s.tools = [{ name: 'get_studio_state', inputSchema: { properties: { studio_id: { type: 'string' } } } }];
  let seen;
  s.client = { callTool: async args => { seen = args; return { content: [{ type: 'text', text: 'ready' }] }; } };
  await s.execute('get_studio_state', {}, async () => true);
  assert.equal(seen.arguments.studio_id, 'studio-abc');
});
test('reconnects when outdated proxy throws MCP -32603 without repeating an edit', async () => {
  const s = new StudioConnection(() => {});
  s.state = 'connected';
  s.studioId = 'studio-abc';
  s.sessions = [{ studio_id: 'studio-abc' }];
  s.tools = [{ name: 'execute_luau', inputSchema: { properties: { studio_id: { type: 'string' } } } }];
  let calls = 0, reconnects = 0;
  s.client = { callTool: async () => { calls++; throw new Error('MCP error -32603: Client proxy is out of date, restart to update'); } };
  s.reconnect = async () => { reconnects++; return s.status; };
  const result = await s.execute('execute_luau', { studio_id: 'studio-abc' }, async () => true);
  assert.equal(calls, 1);
  assert.equal(reconnects, 1);
  assert.equal(result.isError, true);
  assert.match(result.content[0].text, /was NOT repeated/);
});
