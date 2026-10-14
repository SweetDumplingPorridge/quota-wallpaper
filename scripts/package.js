import { readFile, writeFile, readdir, mkdir, copyFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { zipSync } from 'fflate';
import { isPublicFile, assertNoSecrets, webFiles } from './release-files.js';

async function sourceFiles(dir = '', files = []) {
  for (const entry of await readdir(dir || '.', { withFileTypes: true })) {
    const path = (dir ? dir + '/' : '') + entry.name;
    if (entry.isSymbolicLink()) continue;
    if (entry.isDirectory()) {
      if (['src','collector','tests','scripts','wallpaper','docs','.github'].includes(path) || /^(?:src|collector|tests|scripts|docs|\.github)\//.test(path)) await sourceFiles(path, files);
    } else if (isPublicFile(path)) files.push(path);
  }
  return files.sort();
}
const manifest = {}, source = {}, web = {};
for (const file of await sourceFiles()) {
  const content = await readFile(file); assertNoSecrets(file, content);
  source['quota-wallpaper/' + file] = new Uint8Array(content);
  manifest[file] = { bytes: content.length, sha256: createHash('sha256').update(content).digest('hex') };
}
for (const file of webFiles) {
  const content = await readFile(file); assertNoSecrets(file, content);
  web[file.slice('wallpaper/'.length)] = new Uint8Array(content);
}
web['LICENSE'] = new Uint8Array(await readFile('LICENSE'));
web['README.txt'] = new TextEncoder().encode('Quota Wallpaper\nImport index.html in Wallpaper Engine.\nOpen Settings > Data to add DeepSeek API keys.\nOptional Codex/DSH collector requires the source release and Node.js 20+ (24+ recommended).\nDo not publish personal live.json or connection.json files.\nMIT license; source and publishing guide are included in the source archive.\n');
await mkdir('dist', { recursive: true });
await writeFile('dist/quota-wallpaper-web.zip', zipSync(web, { level: 6 }));
await writeFile('dist/quota-wallpaper-source.zip', zipSync(source, { level: 6 }));
const { version } = JSON.parse(await readFile('package.json', 'utf8'));
await writeFile('dist/release-manifest.json', JSON.stringify({ version, generatedAt: new Date().toISOString(), source: manifest, web: Object.keys(web) }, null, 2));
console.log(`Release archives ready: ${Object.keys(source).length} source files, ${Object.keys(web).length} Web files; private data excluded.`);
