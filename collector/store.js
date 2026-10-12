import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import { dirname } from 'node:path';
import { DAY, trimHistory } from '../src/core.js';

export async function readJson(file, fallback) {
  try { return JSON.parse(await readFile(file, 'utf8')); } catch (error) { if (error.code === 'ENOENT') return fallback; throw new Error('本地 JSON 无法解析，请检查文件编码和格式'); }
}
export async function atomicJson(file, data) {
  await mkdir(dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.tmp`;
  await writeFile(temporary, JSON.stringify(data), { mode: 0o600 });
  await rename(temporary, file);
}
const fields = ['id', 'name', 'provider', 'source', 'plan', 'color', 'groupId', 'weight', 'status', 'updatedAt', 'error', 'windows', 'wallets', 'dailyUsage', 'aliases', 'sourceIds'];
export function sanitizeAccount(account) {
  return Object.fromEntries(fields.filter(k => k in account).map(k => [k, account[k]]));
}
export function snapshot(state, now = Date.now()) {
  return { version: 1, updatedAt: state.updatedAt || null, interval: state.interval || 300, accounts: (state.accounts || []).map(sanitizeAccount), history: trimHistory(state.history || [], now).map(h => ({ at: h.at, accounts: (h.accounts || []).map(sanitizeAccount) })), events: (state.events || []).filter(e => e.at >= now - 30 * DAY && e.at <= now).slice(-100000).map(e => ({ at: e.at, accountId: e.accountId, input: e.input, output: e.output, cached: e.cached })), coverage: state.coverage || {}, notes: ['钱包支出为净余额下降估算；本地 token 统计仅覆盖可读日志。'] };
}
export async function writeSnapshot(file, state) { await atomicJson(file, snapshot(state)); }
