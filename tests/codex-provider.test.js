import test from 'node:test';
import assert from 'node:assert/strict';
import { readCodexSession } from '../collector/providers.js';

test('workspace routing account discovery cannot block authenticated quota reads', async () => {
  const methods = [];
  const request = async method => {
    methods.push(method);
    if (method === 'account/read') throw Error('workspace routing discovery timed out');
    if (method === 'account/rateLimits/read') return { rateLimits: { planType: 'plus', primary: { usedPercent: 31, windowDurationMins: 300, resetsAt: Math.floor(Date.now()/1000)+3600 } } };
    throw Error('Unexpected request');
  };
  const result = await readCodexSession(request, { id: 'fixture-codex' });
  assert.equal(result.status, 'ready');
  assert.equal(result.plan, 'plus');
  assert.equal(result.windows[0].remaining, 69);
  assert.deepEqual(methods, ['account/rateLimits/read']);
});

test('quota authentication errors remain errors instead of invented availability', async () => {
  await assert.rejects(readCodexSession(async () => { throw Error('ChatGPT authentication required'); }), /authentication required/);
});
