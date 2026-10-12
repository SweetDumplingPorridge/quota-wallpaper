import test from 'node:test';
import assert from 'node:assert/strict';
const pack = await import('../scripts/release-files.js').catch(() => ({}));
test('release allowlist rejects private snapshots, connections and runtime data', () => {
  assert.equal(typeof pack.isPublicFile, 'function');
  for (const file of ['wallpaper/live.json','wallpaper/connection.json','artifacts/live.json','node_modules/a.js','.env','credentials.json']) assert.equal(pack.isPublicFile(file), false, file);
  for (const file of ['wallpaper/index.html','src/core.js','collector/providers.js','package-lock.json','docs/DATA.md']) assert.equal(pack.isPublicFile(file), true, file);
});
test('release secret scanner rejects literal credentials but permits source references', () => {
  assert.equal(typeof pack.assertNoSecrets, 'function');
  assert.throws(() => pack.assertNoSecrets('leak.txt', 'sk-'+'a'.repeat(32)), /credential/);
  assert.doesNotThrow(() => pack.assertNoSecrets('source.js', 'Authorization: `Bearer ${apiKey}`'));
});
