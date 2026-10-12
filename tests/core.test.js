import test from 'node:test';
import assert from 'node:assert/strict';
const core = await import('../src/core.js').catch(() => ({}));
const now = Date.parse('2026-10-12T00:00:00Z');
const wallet = (id, currency, amount, extra = {}) => ({ id, provider: 'deepseek', status: 'ready', wallets: [{ currency, total: amount }], ...extra });
test('missing quota stays absent, and expired quota is not reset to 100%', () => {
  assert.equal(typeof core.normalizeCodex, 'function');
  const a = core.normalizeCodex({ rateLimits: { primary: { usedPercent: 30, windowDurationMins: 300, resetsAt: now / 1000 - 1 } } }, { id: 'a' }, now);
  assert.equal(a.windows.length, 1);
  assert.equal(a.windows[0].remaining, 70);
  assert.equal(a.windows[0].expired, true);
  assert.equal(core.normalizeCodex({}, { id: 'a' }, now).windows.length, 0);
});
test('same account group deduplicates API keys without dropping unique wallets', () => {
  assert.equal(typeof core.mergeAccounts, 'function');
  const accounts = core.mergeAccounts([wallet('k1', 'CNY', 10, { groupId: 'same' }), wallet('k2', 'CNY', 10, { groupId: 'same' }), wallet('k3', 'CNY', 20)]);
  assert.equal(accounts.length, 2);
  assert.deepEqual(core.aggregate(accounts).wallets, [{ currency: 'CNY', total: 30 }]);
});
test('currency and quota duration do not silently merge', () => {
  assert.equal(typeof core.aggregate, 'function');
  const a = wallet('a', 'CNY', 8); a.windows = [{ bucket: 'codex', duration: 300, remaining: 80, expired: false }];
  const b = wallet('b', 'USD', 3); b.windows = [{ bucket: 'codex', duration: 10080, remaining: 50, expired: false }];
  const result = core.aggregate([a, b]);
  assert.deepEqual(result.wallets, [{ currency: 'CNY', total: 8 }, { currency: 'USD', total: 3 }]);
  assert.equal(result.quotas.length, 2);
  assert.equal(result.quotas[0].sum, 80);
});
test('custom capacities weight mixed subscriptions while unweighted sum stays explicit', () => {
  assert.equal(typeof core.aggregate, 'function');
  const rows = [{ id: 'a', status: 'ready', weight: 1, windows: [{ bucket: 'codex', duration: 300, remaining: 100 }] }, { id: 'b', status: 'ready', weight: 4, windows: [{ bucket: 'codex', duration: 300, remaining: 50 }] }];
  const q = core.aggregate(rows).quotas[0];
  assert.equal(q.sum, 150); assert.equal(q.weighted, 60);
});
test('recharge and quota reset do not manufacture spending', () => {
  assert.equal(typeof core.chartSeries, 'function');
  const snapshots = [{ at: now - 600000, accounts: [wallet('a', 'CNY', 10)] }, { at: now - 300000, accounts: [wallet('a', 'CNY', 20)] }, { at: now, accounts: [wallet('a', 'CNY', 18)] }];
  const s = core.chartSeries(snapshots, [], { now, horizon: 3600000, metric: 'spend', currency: 'CNY', bins: 12, maxGap: 600000 });
  assert.equal(s.series[0].total, 2); assert.equal(s.annotations.length, 1);
});
test('long collection gaps are marked, not inferred as continuous spending', () => {
  assert.equal(typeof core.chartSeries, 'function');
  const s = core.chartSeries([{ at: now - 3600000, accounts: [wallet('a', 'CNY', 10)] }, { at: now, accounts: [wallet('a', 'CNY', 5)] }], [], { now, horizon: 7200000, metric: 'spend', currency: 'CNY', maxGap: 600000 });
  assert.equal(s.series[0]?.total ?? 0, 0); assert.equal(s.gaps, 1);
});
test('quota usage crossing reset boundaries is excluded, not counted twice', () => {
  assert.equal(typeof core.chartSeries, 'function');
  const a = (remaining, reset) => ({ id: 'a', status: 'ready', windows: [{ bucket: 'codex', duration: 300, remaining, resetsAt: reset }] });
  const s = core.chartSeries([{at:now-600000,accounts:[a(30,100)]},{at:now-300000,accounts:[a(100,200)]},{at:now,accounts:[a(90,200)]}], [], {now,horizon:3600000,metric:'quota',duration:300,bucket:'codex',maxGap:600000});
  assert.equal(s.series[0].total,10);
});
test('tokens fall into rolling windows without including future records', () => {
  assert.equal(typeof core.chartSeries, 'function');
  const s = core.chartSeries([], [{ at: now - 1000, accountId: 'a', input: 10, output: 2, cached: 5 }, { at: now + 1000, accountId: 'a', input: 999 }], { now, horizon: 18000000, metric: 'tokens', tokenKind: 'total' });
  assert.equal(s.series[0].total, 12);
});
test('exported config drops keys, auth homes and connection capabilities', () => {
  assert.equal(typeof core.publicConfig, 'function');
  const exported = core.publicConfig({ accounts: [{ id: 'a', name: 'A', provider: 'deepseek', apiKey: 'secret', codexHome: 'private' }], bridgeToken: 'secret', background: 'x' });
  assert.equal(JSON.stringify(exported).includes('secret'), false);
  assert.equal(JSON.stringify(exported).includes('private'), false);
  assert.equal(exported.accounts[0].name, 'A');
});
test('same credential deduplicates even across conflicting group labels', () => {
  const merged=core.mergeAccounts([wallet('a','CNY',10,{keyFingerprint:'same'}),wallet('b','CNY',10,{keyFingerprint:'same',groupId:'group'}),wallet('c','CNY',10,{groupId:'group'})]);
  assert.equal(merged.length,1);assert.equal(core.aggregate(merged).wallets[0].total,10);
});
test('cached window becomes unavailable when reset time elapses without collection',()=>{
  const q={id:'a',status:'ready',windows:[{bucket:'codex',duration:300,remaining:70,resetsAt:now-1000,expired:false}]};
  assert.equal(core.aggregate([q],now).quotas.length,0);
});
test('malformed nested import cannot enter valid data',()=>{
  assert.equal(typeof core.validateSnapshot,'function');
  assert.throws(()=>core.validateSnapshot({version:1,accounts:[null],history:[],events:[]}),/数据/);
  assert.throws(()=>core.validateSnapshot({version:1,accounts:[],history:[{at:now,accounts:'invalid'}],events:[]}),/数据/);
  assert.throws(()=>core.validateSnapshot({version:1,accounts:[],history:[],events:[{at:now,accountId:'a',input:-1}]}),/数据/);
  assert.throws(()=>core.validateSnapshot({version:1,accounts:[{id:'a',provider:'codex',status:'ready',windows:[{bucket:'codex',duration:300,remaining:'70'}]}],history:[],events:[]}),/数据/);
  assert.throws(()=>core.validateSnapshot({version:1,accounts:[{id:'a',provider:'codex',status:'ready',sourceIds:123}],history:[],events:[]}),/数据/);
});
