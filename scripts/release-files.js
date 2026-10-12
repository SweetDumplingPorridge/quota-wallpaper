const top = new Set(['package.json','package-lock.json','README.md','LICENSE','.gitignore']);
const web = new Set(['wallpaper/index.html','wallpaper/styles.css','wallpaper/app.js','wallpaper/project.json','wallpaper/preview.png']);
export function isPublicFile(path) {
  path = path.replace(/\\/g,'/');
  if(path.split('/').some(part=>part==='..'||part==='.'))return false;
  if (/(?:^|\/)(?:live|connection|credentials|auth|state|config)\.json$|\.private\.|(?:^|\/)\.env/.test(path)) return false;
  return top.has(path) || web.has(path) || /^(?:src|collector|tests)\/[\w./-]+\.js$/.test(path) || /^scripts\/[\w/-]+\.(?:js|ps1|cmd)$/.test(path) || /^docs\/[\w/-]+\.md$/.test(path) || /^\.github\/workflows\/[\w-]+\.ya?ml$/.test(path);
}
export function assertNoSecrets(path, content) {
  if (path.endsWith('.png')) return;
  const text = Buffer.isBuffer(content) ? content.toString('utf8') : content;
  if (/\bsk-[A-Za-z0-9_-]{20,}\b/.test(text) || /\beyJ[A-Za-z0-9_-]{15,}\.[A-Za-z0-9_-]{15,}\.[A-Za-z0-9_-]{10,}\b/.test(text) || /[?&#](?:token|access_token)=[A-Za-z0-9_-]{40,}/.test(text)) throw new Error(`Possible credential in public file: ${path}`);
}
export const webFiles = [...web];
