'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { StudioConnection, isOutdatedProxyResponse } = require('../electron/studio.cjs');

test('detects only Roblox proxy-version tool errors', () => {
  assert.equal(isOutdatedProxyResponse({ isError: true, content: [{ type: 'text', text: 'Client proxy is out of date, restart to update' }] }), true);
  assert.equal(isOutdatedProxyResponse({ isError: false, content: [{ type: 'text', text: 'Client proxy is out of date' }] }), false);
  assert.equal(isOutdatedProxyResponse({ isError: true, content: [{ type: 'text', text: 'Different error' }] }), false);
});

test('reconnects on stale proxy but never automatically repeats an editing tool call', async () => {
  const events = [];
  const connection = new StudioConnection((...args) => events.push(args));
  let calls = 0, reconnects = 0;
  connection.state = 'connected';
  connection.tools = [{ name: 'execute_luau', inputSchema: { type: 'object', properties: {} } }];
  connection.client = { callTool: async () => {
    calls++;
    return { isError: true, content: [{ type: 'text', text: 'Client proxy is out of date, restart to update' }] };
  } };
  connection.reconnect = async () => { reconnects++; connection.state = 'connected'; return connection.status; };
  const result = await connection.execute('execute_luau', { code: 'print(1)' }, async () => true);
  assert.equal(result.isError, true);
  assert.match(result.content[0].text, /no edit was automatically repeated/i);
  assert.equal(calls, 1);
  assert.equal(reconnects, 1);
  assert.equal(connection.busy, false);
});

test('returns a useful warning when proxy reconnection fails', async () => {
  const connection = new StudioConnection(() => {});
  connection.state = 'connected';
  connection.tools = [{ name: 'search_game_tree', inputSchema: { properties: {} } }];
  connection.client = { callTool: async () => ({ isError: true, content: [{ type: 'text', text: 'Client proxy is out of date' }] }) };
  connection.reconnect = async () => { throw new Error('Studio offline'); };
  const result = await connection.execute('search_game_tree', {}, async () => true);
  assert.match(result.content[0].text, /Studio offline/);
  assert.match(result.content[0].text, /reconnect FORGE AI/i);
});

test('ordinary successful Studio tools remain unchanged', async () => {
  const connection = new StudioConnection(() => {});
  connection.state = 'connected';
  connection.tools = [{ name: 'get_studio_state', inputSchema: { properties: {} } }];
  connection.client = { callTool: async () => ({ content: [{ type: 'text', text: 'Ready' }] }) };
  connection.reconnect = async () => { throw new Error('Should not reconnect'); };
  const result = await connection.execute('get_studio_state', {}, async () => false);
  assert.equal(result.content[0].text, 'Ready');
});
