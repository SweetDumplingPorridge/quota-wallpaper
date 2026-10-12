import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, appendFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as zlib from 'node:zlib';
const tokens = await import('../collector/tokens.js').catch(() => ({}));
const store = await import('../collector/store.js').catch(() => ({}));
const server = await import('../collector/server.js').catch(() => ({}));
const providers = await import('../collector/providers.js').catch(() => ({}));
test('cumulative Codex telemetry counts each increase once, not every notification', () => {
  assert.equal(typeof tokens.parseTokenRecord, 'function');
  const state = {};
  const record = (input, output) => ({ type: 'event_msg', timestamp: '2026-10-12T00:00:00Z', payload: { type: 'token_count', info: { total_token_usage: { input_tokens: input, output_tokens: output, cached_input_tokens: 20 } } } });
  assert.equal(tokens.parseTokenRecord(record(100, 10), state).input, 100);
  assert.equal(tokens.parseTokenRecord(record(100, 10), state), null);
  const next = tokens.parseTokenRecord(record(150, 15), state);
  assert.equal(next.input, 50); assert.equal(next.output, 5);
});
test('incremental file scan preserves UTF-8 and incomplete tail until next append', async () => {
  assert.equal(typeof tokens.scanLog, 'function');
  const dir = await mkdtemp(join(tmpdir(), 'qw-token-')); const file = join(dir, 's.jsonl');
  try {
    const state = {};
    const e = { note:'中文测试', timestamp: '2026-10-12T00:00:00Z', type: 'event_msg', payload: { type: 'token_count', info: { total_token_usage: { input_tokens: 5, output_tokens: 2 } } } };
    const line = JSON.stringify(e);
    const bytes=Buffer.from(line+'\n'), split=bytes.indexOf(Buffer.from('中'))+1;
    await writeFile(file, bytes.subarray(0,split));
    assert.equal((await tokens.scanLog(file, state, 'a')).length, 0);
    await appendFile(file, bytes.subarray(split));
    assert.equal((await tokens.scanLog(file, state, 'a'))[0].input, 5);
    assert.equal((await tokens.scanLog(file, state, 'a')).length, 0);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
test('DSH usage records use provider totals without storing conversation text', () => {
  assert.equal(typeof tokens.parseTokenRecord, 'function');
  const e = { timestamp: '2026-10-12T00:00:00Z', type: 'assistant/message', data: { message: { content: 'private' }, usage: { inputTokens: 12, outputTokens: 4, cachedInputTokens: 3 } } };
  const r = tokens.parseTokenRecord(e, {});
  assert.equal(r.input, 12); assert.equal(r.output, 4); assert.equal(JSON.stringify(r).includes('private'), false);
});
test('DSH cacheReadTokens is added to uncached input, not dropped from totals', () => {
  const e = { type: 'assistant/message', time: 1791763200000, data: { usage: { inputTokens: 20, outputTokens: 40, totalTokens: 8764, cacheReadTokens: 8704 } } };
  const r = tokens.parseTokenRecord(e, {});
  assert.equal(r?.input, 8724); assert.equal(r?.cached, 8704);
});
test('saved public snapshot excludes secrets and private filesystem paths', async () => {
  assert.equal(typeof store.writeSnapshot, 'function');
  const dir = await mkdtemp(join(tmpdir(), 'qw-public-'));
  try {
    await store.writeSnapshot(join(dir, 'live.json'), { accounts: [{ id: 'a', provider: 'deepseek', status: 'ready', apiKey: 'private-key', home: 'C:/private', wallets: [{ currency: 'CNY', total: 8 }] }], history: [], events: [], tokenIndex: { '/private': {} } });
    const text = await readFile(join(dir, 'live.json'), 'utf8');
    assert.equal(text.includes('private'), false); assert.equal(JSON.parse(text).accounts[0].wallets[0].total, 8);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
test('loopback API requires capability and rejects hostile-origin mutations', async () => {
  assert.equal(typeof server.createServer, 'function');
  const svc = server.createServer({ token: 'test-capability', getSnapshot: () => ({ accounts: [] }), getConfig: () => ({ accounts: [] }), setConfig: async () => {}, collect: async () => {} });
  await new Promise(r => svc.listen(0, '127.0.0.1', r));
  const url = `http://127.0.0.1:${svc.address().port}`;
  try {
    assert.equal((await fetch(url + '/api/snapshot')).status, 401);
    assert.equal((await fetch(url + '/api/snapshot', { headers: { 'X-Quota-Token': 'test-capability' } })).status, 200);
    assert.equal((await fetch(url + '/api/config', { method: 'POST', headers: { 'X-Quota-Token': 'test-capability', Origin: 'https://evil.example', 'Content-Type': 'application/json' }, body: '{}' })).status, 403);
  } finally { await new Promise(r => svc.close(r)); }
});
test('DeepSeek adapter refuses a different endpoint before sending credentials', async () => {
  assert.equal(typeof providers.readDeepSeek, 'function');
  await assert.rejects(() => providers.readDeepSeek({ apiKey: 'test', endpoint: 'https://evil.example' }), /official/i);
});
test('invalid DSH platform login falls back to a valid stored API key',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'qw-dsh-'));const original=globalThis.fetch;
 try{
  await writeFile(join(dir,'.credentials.yaml'),'version: 1\nrefs:\n  DEEPSEEK_API_KEY: fixture-key\nrecords:\n  deepseek-account-platform/default:\n    kind: grant\n    payload:\n      token: expired\n      issuer: https://platform.deepseek.com\n');
  globalThis.fetch=async url=>new Response(JSON.stringify(String(url).includes('api.deepseek.com')?{balance_infos:[{currency:'CNY',total_balance:'6'}]}:{code:40003}),{status:200});
  const result=await providers.readDsh({id:'ds',dshHome:dir});assert.equal(result.wallets[0].total,6);
 }finally{globalThis.fetch=original;await rm(dir,{recursive:true,force:true})}
});
test('DSH concatenated zstd frames include later usage instead of stopping at header', { skip: !zlib.zstdCompressSync }, async () => {
  const dir = await mkdtemp(join(tmpdir(), 'qw-zstd-')); const file = join(dir, 's.jsonl.zstd');
  try {
    const header = { type: 'session', createdAt: '2026-10-12T00:00:00Z' };
    const usage = { type: 'assistant/message', time: 1791763200000, seq: 2, data: { usage: { inputTokens: 11, outputTokens: 3 } } };
    await writeFile(file, Buffer.concat([zlib.zstdCompressSync(JSON.stringify(header)+'\n'), zlib.zstdCompressSync(JSON.stringify(usage)+'\n')]));
    const index = {};
    const result = await tokens.scanLog(file, index, 'ds', 0);
    assert.equal(result.length, 1); assert.equal(result[0].input, 11);
    assert.equal((await tokens.scanLog(file, index, 'ds', 0)).length, 0);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
