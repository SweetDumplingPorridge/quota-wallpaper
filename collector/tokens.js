import { open, stat, readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import * as zlib from 'node:zlib';
import { DAY, finite } from '../src/core.js';

export function parseTokenRecord(record, state) {
  const stamp = record.timestamp || record.createdAt || record.at || record.time || record.data?.timestamp || record.payload?.timestamp;
  const at = typeof stamp === 'number' ? stamp : Date.parse(stamp);
  if (!Number.isFinite(at)) return null;
  if (record.type === 'event_msg' && record.payload?.type === 'token_count') {
    const total = record.payload.info?.total_token_usage;
    if (!total) return null;
    const input = Number(total.input_tokens || 0), output = Number(total.output_tokens || 0), cached = Number(total.cached_input_tokens || 0);
    const prev = state.cumulative || { input: 0, output: 0, cached: 0 };
    // Rollouts may reset counters after compaction; count new cumulative totals only once.
    const reset = input < prev.input || output < prev.output;
    state.cumulative = { input, output, cached };
    const event = { at, input: Math.max(0, input - (reset ? 0 : prev.input)), output: Math.max(0, output - (reset ? 0 : prev.output)), cached: Math.max(0, cached - (reset ? 0 : prev.cached)) };
    return event.input || event.output ? event : null;
  }
  // DSH providers write assistant/message telemetry; v3 envelopes may wrap that event.
  const event = record.event || record.payload?.event || record;
  const usage = event.data?.usage || event.usage || event.data?.message?.usage || event.node?.usage;
  if (!usage || !/assistant|message|node/.test(event.type || record.type || '')) return null;
  let input = usage.inputTokens ?? usage.input_tokens ?? usage.prompt_tokens;
  const output = usage.outputTokens ?? usage.output_tokens ?? usage.completion_tokens;
  if (!finite(input) && !finite(output)) return null;
  const cached = usage.cacheReadTokens ?? usage.cachedInputTokens ?? usage.cached_input_tokens ?? usage.prompt_cache_hit_tokens ?? 0;
  if (finite(usage.cacheReadTokens)) input = Number(input || 0) + Number(usage.cacheReadTokens) + Number(usage.cacheWriteTokens || 0);
  return { at, input: Math.max(0, Number(input || 0)), output: Math.max(0, Number(output || 0)), cached: Math.max(0, Number(cached || 0)) };
}

export async function scanLog(file, state, accountId, cutoff = Date.now() - 30 * DAY) {
  const info = await stat(file), events = [];
  const compressed = file.endsWith('.zstd');
  if (compressed) {
    if (typeof zlib.zstdDecompressSync !== 'function' || (state.parserVersion === 2 && state.size === info.size)) return [];
    if (info.size > 32 * 1024 * 1024) return [];
    const input = await readFile(file);
    let offset = state.parserVersion === 2 ? state.compressedOffset || 0 : 0;
    if (offset > input.length) { offset = 0; state.seen = []; }
    state.seen ||= [];
    const seen = new Set(state.seen);
    while (offset < input.length) {
      let frame;
      try { frame = zlib.zstdDecompressSync(input.subarray(offset), { info: true, maxOutputLength: 8 * 1024 * 1024 }); } catch { break; }
      if (!frame.engine.bytesWritten) break;
      offset += frame.engine.bytesWritten;
      for (const line of frame.buffer.toString('utf8').split('\n')) {
      try {
        const record = JSON.parse(line), hash = createHash('sha256').update(line).digest('hex').slice(0, 24);
        if (seen.has(hash)) continue;
        seen.add(hash);
        const event = parseTokenRecord(record, state);
        if (event && event.at >= cutoff) events.push({ ...event, accountId });
      } catch { /* Broken trailing frames can be retried after the next file update. */ }
      }
    }
    state.seen = [...seen].slice(-20000); state.size = info.size; state.compressedOffset = offset; state.parserVersion = 2; return events;
  }
  if (info.size < (state.offset || 0)) { state.offset = 0; delete state.cumulative; }
  const handle = await open(file, 'r');
  try {
    let position = state.offset || 0, consumed = 0, carry = Buffer.alloc(0), linesRead = 0;
    // Stream bytes and advance only beyond complete newline-terminated records.
    while (position < info.size) {
      const buffer = Buffer.alloc(Math.min(262144, info.size - position));
      const { bytesRead } = await handle.read(buffer, 0, buffer.length, position);
      if (!bytesRead) break;
      position += bytesRead; carry = Buffer.concat([carry, buffer.subarray(0, bytesRead)]);
      let index;
      while ((index = carry.indexOf(10)) >= 0) {
        const line = carry.subarray(0, index).toString('utf8'); consumed += index + 1; carry = carry.subarray(index + 1); linesRead++;
        try { const event = parseTokenRecord(JSON.parse(line), state); if (event && event.at >= cutoff) events.push({ ...event, accountId }); } catch { /* Skip non-event lines, never retain their conversation contents. */ }
      }
      if (carry.length > 8 * 1024 * 1024) { consumed += carry.length; carry = Buffer.alloc(0); }
      if (linesRead > 250000) break;
    }
    state.offset = (state.offset || 0) + consumed;
  } finally { await handle.close(); }
  return events;
}

export async function logFiles(root, cutoff, depth = 0, output = []) {
  if (depth > 7 || output.length >= 12000) return output;
  let entries;
  try { entries = await readdir(root, { withFileTypes: true }); } catch { return output; }
  for (const item of entries) {
    if (item.isSymbolicLink()) continue;
    const path = join(root, item.name);
    if (item.isDirectory()) await logFiles(path, cutoff, depth + 1, output);
    else if (/\.jsonl(?:\.zstd)?$/.test(item.name)) {
      try { if ((await stat(path)).mtimeMs >= cutoff) output.push(path); } catch { /* Concurrent rotation is normal. */ }
    }
  }
  return output;
}

export async function collectTokens(sources, index, now = Date.now()) {
  const events = [], cutoff = now - 30 * DAY;
  for (const source of sources) {
    for (const file of await logFiles(source.root, cutoff)) {
      const state = index[file] ||= {};
      try { events.push(...(await scanLog(file, state, source.accountId, cutoff)).map(e=>({...e,sourceId:source.sourceId}))); state.lastSeen = now; } catch { /* Inaccessible files do not erase previously collected metrics. */ }
    }
  }
  for (const [file, state] of Object.entries(index)) if (state.lastSeen < cutoff) delete index[file];
  return events;
}
