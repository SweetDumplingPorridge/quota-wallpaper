import { readFile, access } from 'node:fs/promises';
import { join, delimiter, dirname } from 'node:path';
import { homedir } from 'node:os';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { createRequire } from 'node:module';
import YAML from 'yaml';
import { normalizeCodex, finite } from '../src/core.js';

export const fingerprint = value => createHash('sha256').update(String(value)).digest('hex').slice(0, 20);
async function jsonRequest(url, headers) {
  const response = await fetch(url, { headers, redirect: 'error', signal: AbortSignal.timeout(20000) });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  try { return await response.json(); } catch { throw new Error('供应商响应格式不可用'); }
}
export async function readDeepSeek(account) {
  if (account.endpoint && account.endpoint !== 'https://api.deepseek.com') throw new Error('Only the official DeepSeek endpoint is allowed');
  const apiKey = account.apiKey || (account.apiKeyEnv ? process.env[account.apiKeyEnv] : undefined);
  if (!apiKey) throw new Error('缺少 API key');
  const raw = await jsonRequest('https://api.deepseek.com/user/balance', { Authorization: `Bearer ${apiKey}` });
  if (!Array.isArray(raw.balance_infos)) throw new Error('余额格式不可用');
  return { ...account, provider: 'deepseek', status: 'ready', updatedAt: Date.now(), keyFingerprint: fingerprint(apiKey), wallets: raw.balance_infos.filter(w => finite(w.total_balance)).map(w => ({ currency: w.currency, total: Number(w.total_balance), granted: finite(w.granted_balance) ? Number(w.granted_balance) : null, toppedUp: finite(w.topped_up_balance) ? Number(w.topped_up_balance) : null })), windows: [] };
}
export async function readDsh(account = {}) {
  const dshHome = account.dshHome || process.env.DSH_HOME || join(homedir(), '.dsh');
  let doc;
  try { doc = YAML.parse(await readFile(join(dshHome, '.credentials.yaml'), 'utf8')); } catch { throw new Error('DSH 配置无法读取或解析'); }
  const grant = doc?.records?.['deepseek-account-platform/default']?.payload;
  if (grant?.token && new URL(grant.issuer).origin === 'https://platform.deepseek.com') {
    const headers = { 'x-dsh-auth-token': grant.token, 'x-client-platform': 'web', 'x-client-version': '0.1.0', 'x-client-bundle-id': '', 'x-client-locale': 'zh_CN', 'x-client-timezone-offset': '28800' };
    const [walletResult, profileResult] = await Promise.allSettled([
      jsonRequest('https://platform.deepseek.com/api/v0/users/get_user_summary', headers),
      jsonRequest('https://platform.deepseek.com/auth-api/v0/users/current', headers)
    ]);
    if (walletResult.status === 'fulfilled') {
      try {
      const raw = walletResult.value;
      if (raw.code !== 0 || raw.data?.biz_code !== 0) throw new Error('DSH 登录失效或钱包不可用');
      const data = raw.data.biz_data;
      const wallets = new Map();
      for (const [kind, list] of [['toppedUp', data.normal_wallets], ['granted', data.bonus_wallets]]) {
        if (!Array.isArray(list)) throw new Error('DSH 钱包格式不可用');
        for (const w of list) {
          if (!finite(w.balance)) continue;
          const target = wallets.get(w.currency) || { currency: w.currency, total: 0, toppedUp: 0, granted: 0 };
          target[kind] += Number(w.balance); target.total += Number(w.balance); wallets.set(w.currency, target);
        }
      }
      const profile = profileResult.status === 'fulfilled' ? profileResult.value?.data?.biz_data : null;
      return { ...account, id: account.id || 'deepseek-auto', name: account.name || 'DeepSeek · DSH', provider: 'deepseek', source: 'dsh', identity: profile?.id ? fingerprint(profile.id) : undefined, status: 'ready', updatedAt: Date.now(), wallets: [...wallets.values()], windows: [] };
      } catch { /* A rejected or malformed login must not prevent API-key fallback. */ }
    }
  }
  const key = process.env.DEEPSEEK_API_KEY || doc?.refs?.DEEPSEEK_API_KEY;
  if (!key) throw new Error('DSH 中没有可用的登录或 API key');
  return readDeepSeek({ ...account, id: account.id || 'deepseek-auto', name: account.name || 'DeepSeek · DSH key', apiKey: key });
}

async function codexCommand(explicit) {
  if (explicit) return { command: explicit, prefix: [] };
  const paths = (process.env.PATH || '').split(delimiter);
  for (const folder of paths) {
    for (const name of process.platform === 'win32' ? ['codex.exe', 'codex.cmd', 'codex.ps1'] : ['codex']) {
      const file = join(folder, name);
      try {
        await access(file);
        if (name.endsWith('.cmd') || name.endsWith('.ps1')) {
          const cli = join(dirname(file), 'node_modules', '@openai', 'codex', 'bin', 'codex.js');
          await access(cli);
          if (process.platform === 'win32') {
            const arch = process.arch === 'arm64' ? 'arm64' : 'x64';
            const triple = process.arch === 'arm64' ? 'aarch64-pc-windows-msvc' : 'x86_64-pc-windows-msvc';
            const packageFile = createRequire(cli).resolve(`@openai/codex-win32-${arch}/package.json`);
            const native = join(dirname(packageFile), 'vendor', triple, 'bin', 'codex.exe');
            await access(native); return { command: native, prefix: [] };
          }
          return { command: process.execPath, prefix: [cli] };
        }
        return { command: file, prefix: [] };
      } catch { /* Continue resolving supported executable layouts. */ }
    }
  }
  throw new Error('找不到 Codex CLI，请安装或配置 codexCommand');
}

export async function readCodex(account = {}) {
  const home = account.codexHome || process.env.CODEX_HOME || join(homedir(), '.codex');
  const executable = await codexCommand(account.codexCommand);
  const proc = spawn(executable.command, [...executable.prefix, 'app-server', '--stdio'], { env: { ...process.env, CODEX_HOME: home }, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
  const pending = new Map(); let nextId = 0;
  const rejectAll = () => { for (const p of pending.values()) { clearTimeout(p.timer); p.reject(new Error('Codex app-server 已退出')); } pending.clear(); };
  proc.on('error', rejectAll); proc.on('exit', rejectAll); proc.stderr.resume();
  const lines = createInterface({ input: proc.stdout });
  lines.on('line', line => {
    try {
      const msg = JSON.parse(line), p = pending.get(msg.id);
      if (!p) return;
      clearTimeout(p.timer); pending.delete(msg.id);
      if (msg.error) p.reject(new Error('Codex 接口暂不可用')); else p.resolve(msg.result);
    } catch { /* Notifications and malformed unrelated output do not expose raw data. */ }
  });
  const request = (method, params = {}) => new Promise((resolve, reject) => {
    const id = nextId++;
    const timer = setTimeout(() => { pending.delete(id); reject(new Error('Codex 读取超时')); }, 20000);
    pending.set(id, { resolve, reject, timer });
    proc.stdin.write(JSON.stringify({ id, method, params }) + '\n', error => { if (error) { clearTimeout(timer); pending.delete(id); reject(new Error('Codex 管道不可用')); } });
  });
  try {
    await request('initialize', { clientInfo: { name: 'quota_wallpaper', title: 'Quota Wallpaper', version: '0.1.0' }, capabilities: { experimentalApi: true } });
    proc.stdin.write(JSON.stringify({ method: 'initialized', params: {} }) + '\n');
    const acct = await request('account/read', { refreshToken: false });
    if (acct?.account?.type !== 'chatgpt' && acct?.account?.type !== 'chatgptAuthTokens') throw new Error('此 Codex 配置未登录 ChatGPT 订阅账户');
    const limits = await request('account/rateLimits/read');
    let identity;
    try { const auth = JSON.parse(await readFile(join(home, 'auth.json'), 'utf8')); if (auth.tokens?.account_id) identity = fingerprint(auth.tokens.account_id); } catch { /* Keychain-backed homes still work through app-server. */ }
    const result = normalizeCodex(limits, { ...account, id: account.id || 'codex-auto', name: account.name || 'Codex · 本机', plan: acct.account.planType, identity });
    try { const usage = await request('account/usage/read'); result.dailyUsage = (usage.dailyUsageBuckets || []).slice(-31).map(v => ({ startDate: v.startDate, tokens: v.tokens })); } catch { /* Daily analytics are optional, local logs provide detailed bins. */ }
    return result;
  } finally {
    for (const p of pending.values()) clearTimeout(p.timer);
    pending.clear(); lines.close(); proc.stdin.end();
    if (proc.exitCode === null) await new Promise(resolve => {
      const timeout = setTimeout(() => {
        if (process.platform === 'win32' && proc.pid) {
          const cleanup = spawn('taskkill.exe', ['/PID', String(proc.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
          cleanup.on('error', () => { proc.kill(); resolve(); }); cleanup.on('exit', resolve);
        } else { proc.kill(); resolve(); }
      }, 1500);
      proc.once('exit', () => { clearTimeout(timeout); resolve(); });
    });
  }
}
