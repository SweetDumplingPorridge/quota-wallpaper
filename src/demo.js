import { DAY, COLORS } from './core.js';
export function demoData(now = Date.now()) {
  const accountAt = at => {
    const day = (at - (now - 30 * DAY)) / DAY;
    const reset = Math.ceil(at / 18000000) * 18000000;
    return [
      { id: 'demo-plus', name: '个人工作台', provider: 'codex', plan: 'Plus', color: COLORS[0], weight: 1, status: 'ready', updatedAt: now, wallets: [], windows: [{ bucket: 'codex', duration: 300, remaining: 88 - ((at % 18000000) / 18000000) * 30, resetsAt: reset }, { bucket: 'codex', duration: 10080, remaining: 72, resetsAt: now + 3 * DAY }] },
      { id: 'demo-pro', name: '项目工作台', provider: 'codex', plan: 'Pro', color: COLORS[2], weight: 4, status: 'ready', updatedAt: now, wallets: [], windows: [{ bucket: 'codex', duration: 300, remaining: 98 - ((at % 18000000) / 18000000) * 12, resetsAt: reset }, { bucket: 'codex', duration: 10080, remaining: 91, resetsAt: now + 5 * DAY }] },
      { id: 'demo-ds', name: 'DeepSeek 工作室', provider: 'deepseek', plan: 'API', color: COLORS[1], status: 'ready', updatedAt: now, windows: [], wallets: [{ currency: 'CNY', total: 182.4 - day * 2.67, granted: 0, toppedUp: 182.4 - day * 2.67 }] }
    ];
  };
  const times = new Set();
  for (let at = now - 30 * DAY; at <= now; at += 3600000) times.add(at);
  for (let at = now - 18000000; at <= now; at += 300000) times.add(at);
  const history = [...times].sort((a, b) => a - b).map(at => ({ at, accounts: accountAt(at) }));
  const events = [];
  for (let at = now - 30 * DAY; at <= now; at += 900000) {
    const wave = 0.4 + Math.abs(Math.sin(at / 20000000));
    for (const [i, id] of ['demo-plus', 'demo-pro', 'demo-ds'].entries()) events.push({ at, accountId: id, input: Math.round((1800 + i * 2300) * wave), output: Math.round(340 * wave), cached: Math.round(700 * wave) });
  }
  return { version: 1, updatedAt: now, interval: 300, accounts: accountAt(now), history, events, coverage: { tokenSource: 'demo' } };
}
