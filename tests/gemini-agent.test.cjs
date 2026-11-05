'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { runTurn } = require('../electron/gemini-agent.cjs');
const MODEL = 'gemini-2.5-flash-lite';
const params = { model: MODEL, history: [], approve: async () => true, shouldStop: () => false };
const makeAI = replies => ({ models: { async generateContent(input) { this.calls ||= []; this.calls.push(input); return replies.shift(); } } });
const model = parts => ({ candidates: [{ content: { role: 'model', parts } }] });

test('Gemini completes a plain conversation without calling Studio', async () => {
  const ai = makeAI([model([{ text: 'Hello from a real model response' }])]);
  const studio = { listTools: () => { throw Error('should not list'); } };
  const x = await runTurn({ ...params, ai, studio, message: 'Say hi' });
  assert.equal(x.answer, 'Hello from a real model response');
  assert.equal(x.history[0].role, 'user');
  assert.equal(x.history[1].role, 'model');
});

test('Gemini discovers tools, invokes a real Studio tool and feeds results back into the model', async () => {
  const ai = makeAI([
    model([{ functionCall: { name: 'forge_list_studio_tools', args: {} } }]),
    model([{ functionCall: { name: 'forge_execute_studio_tool', args: { name: 'get_studio_state', arguments_json: '{}' } } }]),
    model([{ text: 'The place is open.' }])
  ]);
  const seen = [];
  const studio = {
    listTools: async () => [{ name: 'get_studio_state', inputSchema: { type: 'object', properties: {} } }],
    execute: async (name, args, approve) => { seen.push([name, args, typeof approve]); return { content: [{ type: 'text', text: 'Baseplate' }] }; }
  };
  const events = [];
  const x = await runTurn({ ...params, ai, studio, message: 'Inspect Studio', emit: e => events.push(e) });
  assert.equal(x.answer, 'The place is open.');
  assert.deepEqual(seen, [['get_studio_state', {}, 'function']]);
  assert.equal(ai.models.calls.length, 3);
  const responses = x.history.flatMap(c => c.parts || []).filter(p => p.functionResponse);
  assert.equal(responses.length, 2);
  assert.match(responses[0].functionResponse.response.output, /get_studio_state/);
  assert.equal(events.filter(x => x.type === 'toolResult').length, 2);
});

test('A denied Studio tool call does not produce a false success', async () => {
  const ai = makeAI([
    model([{ functionCall: { name: 'forge_execute_studio_tool', args: { name: 'execute_luau', arguments_json: '{"code":"print(1)"}' } } }]),
    model([{ text: 'The operation was denied.' }])
  ]);
  const studio = { execute: async (name, args, approve) => { if (!(await approve(name, args))) throw Error('Tool execution denied by user'); } };
  const x = await runTurn({ ...params, ai, studio, message: 'Modify my game', approve: async () => false });
  assert.match(x.answer, /denied/);
  assert.match(x.history[2].parts[0].functionResponse.response.output, /Tool execution denied by user/);
});

test('Stops on invalid JSON arguments and returns actionable tool error', async () => {
  const ai = makeAI([
    model([{ functionCall: { name: 'forge_execute_studio_tool', args: { name: 'execute_luau', arguments_json: '{bad}' } } }]),
    model([{ text: 'Invalid arguments, please retry.' }])
  ]);
  const studio = { execute: () => { throw Error('Should not execute'); } };
  const x = await runTurn({ ...params, ai, studio, message: 'Try invalid args' });
  assert.match(x.history[2].parts[0].functionResponse.response.output, /not valid JSON/);
});

test('Cancellation stops before making an AI request', async () => {
  const ai = makeAI([]);
  await assert.rejects(runTurn({ ...params, ai, studio: {}, message: 'Hello', shouldStop: () => true }), /stopped/);
});
