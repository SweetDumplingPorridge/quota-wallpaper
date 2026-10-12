import { homedir } from 'node:os';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';
import { open, unlink, mkdir } from 'node:fs/promises';
import { readCodex, readDeepSeek, readDsh, fingerprint } from './providers.js';
import { previousAccount, remapEvents } from './ownership.js';
import { collectTokens } from './tokens.js';
import { readJson, atomicJson, snapshot, writeSnapshot, sanitizeAccount } from './store.js';
import { createServer } from './server.js';
import { mergeAccounts, trimHistory, DAY, COLORS, clamp } from '../src/core.js';

const project = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const arg = (name, fallback) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : fallback; };
const dataDir = resolve(arg('--data-dir', join(homedir(), '.quota-wallpaper')));
const output = resolve(arg('--output', join(project, 'wallpaper', 'live.json')));
const root = dirname(output);
const defaults = { version: 1, interval: 300, autoCodex: true, autoDsh: true, scanTokens: true, accounts: [] };
await mkdir(dataDir, { recursive: true });
const lockFile = join(dataDir, 'collector.lock');
let lock;
try { lock = await open(lockFile, 'wx'); await lock.writeFile(String(process.pid)); }
catch {
  let alive = true;
  try { const pid = Number(await (await import('node:fs/promises')).readFile(lockFile, 'utf8')); process.kill(pid, 0); } catch { alive = false; }
  if (alive) { console.error('采集器已运行；请停止已有实例或使用不同 --data-dir。'); process.exit(1); }
  await unlink(lockFile).catch(() => {}); lock = await open(lockFile, 'wx'); await lock.writeFile(String(process.pid));
}
const release = async () => { await lock?.close(); await unlink(lockFile).catch(() => {}); };
let state, config, busy;
try {
  config = { ...defaults, ...await readJson(join(dataDir, 'config.json'), {}) };
  state = await readJson(join(dataDir, 'state.json'), { accounts: [], history: [], events: [], tokenIndex: {}, coverage: {} });
  if (args.includes('--no-auto')) config = { ...config, autoCodex: false, autoDsh: false };
} catch (error) { await release(); console.error(error.message); process.exit(1); }

function validateConfig(input) {
  if (!input || typeof input !== 'object' || !Array.isArray(input.accounts) || input.accounts.length > 30) throw new Error('账号设置无效');
  const old = new Map(config.accounts.map(a => [a.id, a]));
  const ids = new Set();
  const accounts = input.accounts.map(a => {
    if (typeof a.id !== 'string' || !/^[\w-]{1,80}$/.test(a.id) || ids.has(a.id) || !['deepseek', 'codex', 'dsh'].includes(a.provider)) throw new Error('账号 ID 或供应商无效');
    ids.add(a.id);
    const row = { id: a.id, provider: a.provider, enabled: a.enabled !== false };
    for (const key of ['name', 'plan', 'groupId', 'codexHome', 'dshHome', 'apiKeyEnv']) if (typeof a[key] === 'string') row[key] = a[key].slice(0, 2048);
    if (/^#[0-9a-f]{6}$/i.test(a.color || '')) row.color = a.color;
    if (Number.isFinite(Number(a.weight)) && Number(a.weight) > 0) row.weight = clamp(Number(a.weight), 0.01, 10000);
    const key = typeof a.apiKey === 'string' && a.apiKey.trim() ? a.apiKey.trim() : old.get(a.id)?.apiKey;
    if (key && !a.clearKey) row.apiKey = key;
    return row;
  });
  return { version: 1, interval: clamp(Number(input.interval) || 300, 60, 86400), autoCodex: input.autoCodex !== false, autoDsh: input.autoDsh !== false, scanTokens: input.scanTokens !== false, accounts };
}
function safeConfig() {
  return { ...config, accounts: config.accounts.map(a => { const { apiKey, ...rest } = a; return { ...rest, apiKeyConfigured: !!apiKey }; }) };
}
async function runCollection() {
  if (busy) return busy;
  busy = (async () => {
    const now = Date.now(), requested = config.accounts.filter(a => a.enabled !== false).map(a => ({ ...a }));
    if (config.autoCodex) requested.unshift({ id: 'codex-auto', name: 'Codex · 本机', provider: 'codex', color: COLORS[0] });
    if (config.autoDsh) requested.push({ id: 'deepseek-auto', name: 'DeepSeek · DSH', provider: 'dsh', color: COLORS[1] });
    const previous=state.accounts||[];
    const sources = [];
    const results = await Promise.all(requested.map(async (account, i) => {
      const meta = { ...account, color: account.color || COLORS[i % COLORS.length] };
      const old=previousAccount(previous,account.id);
      let result;
      try {
        result = account.provider === 'codex' ? await readCodex(meta) : account.provider === 'dsh' ? await readDsh(meta) : await readDeepSeek(meta);
      } catch (error) {
        result = { ...old, ...meta, id: account.id, name: account.name || account.id, provider: account.provider === 'dsh' ? 'deepseek' : account.provider, color: meta.color, status: 'unavailable', error: error.message, windows: old?.windows || [], wallets: old?.wallets || [] };
      }
      result.sourceIds=[account.id];
      if (account.provider === 'codex') sources.push({ root: join(account.codexHome || process.env.CODEX_HOME || join(homedir(), '.codex'), 'sessions'), accountId: result.id });
      if (account.provider === 'dsh') sources.push({ root: join(account.dshHome || process.env.DSH_HOME || join(homedir(), '.dsh'), 'sessions'), accountId: result.id });
      return result;
    }));
    state.accounts = mergeAccounts(results).map(sanitizeAccount);
    state.tokenIndex ||= {};
    if (config.scanTokens) {
      const canonical = new Map(state.accounts.flatMap(a => (a.sourceIds || [a.id]).map(id => [id, a.id])));
      const unique = [...new Map(sources.map(s => [s.root, { ...s, sourceId:fingerprint(process.platform==='win32'?resolve(s.root).toLowerCase():resolve(s.root)), accountId: canonical.get(s.accountId) || s.accountId }])).values()];
      state.logOwners={...(state.logOwners||{}),...Object.fromEntries(unique.map(s=>[s.sourceId,s.accountId]))};
      const legacy={};for(const a of previous){const match=state.accounts.find(n=>n.sourceIds?.some(id=>a.sourceIds?.includes(id)||id===a.id));if(match)legacy[a.id]=match.id}
      const events = await collectTokens(unique, state.tokenIndex, now);
      state.events = remapEvents([...(state.events || []), ...events],state.logOwners,legacy).filter(e => e.at >= now - 30 * DAY && e.at <= now).sort((a,b) => a.at-b.at).slice(-100000);
      state.coverage = { tokenSource: 'local-logs', compressedDshSupported: typeof (await import('node:zlib')).zstdDecompressSync === 'function', indexedFiles: Object.keys(state.tokenIndex).length, truncated: state.events.length >= 100000 };
    }
    state.updatedAt = Date.now(); state.interval = config.interval;
    state.history = trimHistory([...(state.history || []).map(h => ({ at: h.at, accounts: h.accounts.map(sanitizeAccount) })), { at: state.updatedAt, accounts: state.accounts }], state.updatedAt);
    await atomicJson(join(dataDir, 'state.json'), state);
    await writeSnapshot(output, state);
    console.log(`已更新 ${state.accounts.length} 个账号，${state.accounts.filter(a => a.status === 'ready').length} 个可用；本地 token 事件 ${(state.events || []).length} 条。`);
  })().finally(() => { busy = null; });
  return busy;
}

if (args.includes('--serve')) {
  let token = await readJson(join(dataDir, 'capability.json'), null);
  if (!token?.value) { token = { value: randomBytes(32).toString('hex') }; await atomicJson(join(dataDir, 'capability.json'), token); }
  const port = Number(arg('--port', '18765'));
  if (!Number.isInteger(port) || port < 1024 || port > 65535) { await release(); throw new Error('端口无效'); }
  const svc = createServer({ token: token.value, root, getSnapshot: () => snapshot(state), getConfig: safeConfig, setConfig: async input => { config = validateConfig(input); await atomicJson(join(dataDir, 'config.json'), config); }, collect: runCollection });
  try { await new Promise((resolve, reject) => { svc.once('error', reject); svc.listen(port, '127.0.0.1', resolve); }); }
  catch { await release(); console.error('本地端口不可用，请更换 --port。'); process.exit(1); }
  await atomicJson(join(root, 'connection.json'), { endpoint: `http://127.0.0.1:${port}`, token: token.value });
  console.log(`管理界面：http://127.0.0.1:${port}/#bridge=${token.value}`);
  let timer;
  const schedule = () => { timer = setTimeout(async () => { try { await runCollection(); } catch { console.error('采集失败；保留上次数据。'); } schedule(); }, config.interval * 1000); };
  try { await runCollection(); } catch { console.error('首次采集失败；可在管理界面检查设置。'); }
  schedule();
  const stop = async () => { clearTimeout(timer); await busy?.catch(() => {}); await new Promise(r => svc.close(r)); await release(); process.exit(0); };
  process.once('SIGINT', stop); process.once('SIGTERM', stop);
} else {
  try { await runCollection(); } finally { await release(); }
}
