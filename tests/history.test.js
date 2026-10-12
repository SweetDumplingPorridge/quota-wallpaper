import test from 'node:test';import assert from 'node:assert/strict';
const h=await import('../collector/ownership.js').catch(()=>({}));
test('last-good grouped account resolves through original source ID',()=>{
 assert.equal(typeof h.previousAccount,'function');
 assert.equal(h.previousAccount([{id:'group-a',sourceIds:['key-a','key-b'],wallets:[{currency:'CNY',total:4}]}],'key-b').wallets[0].total,4);
});
test('stable log-source ownership survives account rename and grouping changes',()=>{
 assert.equal(typeof h.remapEvents,'function');
 const events=[{at:1,sourceId:'log-root',accountId:'old',input:3}];
 assert.equal(h.remapEvents(events,{ 'log-root':'new' },{})[0].accountId,'new');
});
