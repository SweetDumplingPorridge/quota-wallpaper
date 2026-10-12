export const DAY = 86400000;
export const COLORS = ['#78dfcc', '#95baff', '#f1c787', '#c3a4fa', '#f19faa', '#a5d59b'];
export const finite = value => value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value));
export const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

export function normalizeCodex(raw, metadata = {}, now = Date.now()) {
  const buckets = raw?.rateLimitsByLimitId ?? (raw?.rateLimits ? { [raw.rateLimits.limitId ?? 'codex']: raw.rateLimits } : {});
  const windows = [];
  let plan = metadata.plan || '';
  for (const [bucket, limits] of Object.entries(buckets)) {
    if (!limits) continue;
    plan ||= limits.planType || '';
    for (const slot of ['primary', 'secondary']) {
      const w = limits[slot];
      if (!w || !finite(w.usedPercent) || !finite(w.windowDurationMins)) continue;
      const resetsAt = finite(w.resetsAt) ? Number(w.resetsAt) * 1000 : null;
      windows.push({ bucket, label: limits.limitName || bucket, slot, duration: Number(w.windowDurationMins), remaining: clamp(100 - Number(w.usedPercent), 0, 100), resetsAt, expired: resetsAt !== null && resetsAt <= now });
    }
  }
  return { ...metadata, provider: 'codex', plan, status: windows.length ? 'ready' : 'unavailable', updatedAt: now, windows, wallets: [] };
}

export function mergeAccounts(accounts) {
  const parent=accounts.map((_,i)=>i), tags=new Map();
  const find=i=>{while(parent[i]!==i){parent[i]=parent[parent[i]];i=parent[i]}return i};
  accounts.forEach((a,i)=>{
    for(const tag of [`id:${a.id}`,a.groupId&&`group:${a.groupId}`,a.identity&&`identity:${a.identity}`,a.keyFingerprint&&`key:${a.keyFingerprint}`].filter(Boolean)){
      const key=`${a.provider}:${tag}`;
      if(tags.has(key))parent[find(i)]=find(tags.get(key));else tags.set(key,i);
    }
  });
  const groups = new Map();
  for (const [i,a] of accounts.entries()) {
    const logical=find(i),old=groups.get(logical);
    if (!old) groups.set(logical, { ...a, sourceIds: [...new Set([a.id,...(a.sourceIds||[])])], aliases: [a.name || a.id] });
    else {
      const preferNew = (a.status === 'ready' && old.status !== 'ready') || (a.status === old.status && (a.updatedAt || 0) > (old.updatedAt || 0));
      const next = preferNew ? { ...a } : { ...old };
      next.id = old.id;
      next.sourceIds = [...new Set([...old.sourceIds, a.id,...(a.sourceIds||[])])];
      next.aliases = [...new Set([...old.aliases, a.name || a.id])];
      groups.set(logical, next);
    }
  }
  return [...groups.values()];
}

export function aggregate(accounts, now = Date.now()) {
  const money = new Map(), quotas = new Map();
  for (const a of mergeAccounts(accounts)) {
    if (a.status !== 'ready') continue;
    for (const w of a.wallets || []) {
      if (finite(w.total)) money.set(w.currency, (money.get(w.currency) || 0) + Number(w.total));
    }
    for (const w of a.windows || []) {
      if (w.expired || (finite(w.resetsAt)&&Number(w.resetsAt)<=now) || !finite(w.remaining)) continue;
      const key = `${w.bucket}:${w.duration}`;
      const q = quotas.get(key) || { bucket: w.bucket, duration: w.duration, sum: 0, accounts: [], weightTotal: 0, weightedSum: 0, customWeight: false };
      const weight = finite(a.weight) && Number(a.weight) > 0 ? Number(a.weight) : 1;
      q.sum += w.remaining; q.weightTotal += weight; q.weightedSum += weight * w.remaining;
      q.customWeight ||= finite(a.weight) && Number(a.weight) !== 1;
      q.accounts.push({ id: a.id, name: a.name || a.id, color: a.color, remaining: w.remaining, weight, resetsAt: w.resetsAt });
      quotas.set(key, q);
    }
  }
  return { wallets: [...money].map(([currency, total]) => ({ currency, total })), quotas: [...quotas.values()].map(q => ({ ...q, weighted: q.weightedSum / q.weightTotal })) };
}

export function chartSeries(history = [], events = [], options = {}) {
  const { now = Date.now(), horizon = DAY, bins = 48, metric = 'tokens', currency = 'CNY', duration = 300, bucket = 'codex', accountIds, tokenKind = 'total', maxGap = 900000 } = options;
  const start = now - horizon, step = horizon / bins, rows = new Map(), annotations = [];
  let gaps = 0;
  const wanted = id => !accountIds || accountIds.includes(id);
  const row = (id, account = {}) => {
    if (!rows.has(id)) rows.set(id, { id, name: account.name || id, color: account.color || COLORS[rows.size % COLORS.length], values: Array(bins).fill(null), total: 0 });
    return rows.get(id);
  };
  const add = (id, at, value, account) => {
    if (!wanted(id) || at < start || at > now || !finite(value) || value < 0) return;
    const r = row(id, account), index = Math.min(bins - 1, Math.floor((at - start) / step));
    r.values[index] = (r.values[index] ?? 0) + value; r.total += value;
  };
  const sorted = history.filter(h => finite(h.at) && h.at <= now).sort((a, b) => a.at - b.at);
  if (metric === 'tokens') {
    const meta = new Map(sorted.flatMap(h => (h.accounts || []).map(a => [a.id, a])));
    for (const e of events) {
      const value = tokenKind === 'input' ? e.input : tokenKind === 'output' ? e.output : tokenKind === 'cached' ? e.cached : Number(e.input || 0) + Number(e.output || 0);
      add(e.accountId, e.at, value, meta.get(e.accountId));
    }
  } else {
    for (let i = 1; i < sorted.length; i++) {
      const before = sorted[i - 1], after = sorted[i];
      if (after.at < start) continue;
      const old = new Map((before.accounts || []).map(a => [a.id, a]));
      for (const a of after.accounts || []) {
        if (!wanted(a.id)) continue;
        row(a.id, a);
        const prev = old.get(a.id);
        if (!prev || a.status !== 'ready' || prev.status !== 'ready') continue;
        if (before.at < start || after.at - before.at > maxGap) { gaps++; continue; }
        if (metric === 'spend') {
          const w = a.wallets?.find(w => w.currency === currency), p = prev.wallets?.find(w => w.currency === currency);
          if (!w || !p || !finite(w.total) || !finite(p.total)) continue;
          const delta = Number(p.total) - Number(w.total);
          if (delta < 0) annotations.push({ at: after.at, accountId: a.id, kind: 'credit', amount: -delta });
          else add(a.id, after.at, delta, a);
        } else if (metric === 'quota') {
          const match = w => w.duration === duration && w.bucket === bucket;
          const w = a.windows?.find(match), p = prev.windows?.find(match);
          if (!w || !p || w.expired || p.expired || w.resetsAt !== p.resetsAt) continue;
          const delta = p.remaining - w.remaining;
          if (delta < 0) annotations.push({ at: after.at, accountId: a.id, kind: 'quota-adjustment' });
          else add(a.id, after.at, delta, a);
        }
      }
    }
  }
  return { start, end: now, step, series: [...rows.values()], annotations, gaps, firstSample: sorted.find(h => h.at >= start)?.at ?? null, samples: sorted.filter(h => h.at >= start).length };
}

const accountFields = ['id', 'name', 'provider', 'plan', 'color', 'groupId', 'weight', 'enabled'];
const configFields = ['theme', 'accent', 'background', 'backgroundFit', 'backgroundDim', 'blur', 'opacity', 'scale', 'positionX', 'positionY', 'font', 'fontSize', 'layout', 'showClock', 'showDate', 'showAccounts', 'showTotals', 'showChart', 'showSeconds', 'hour12', 'lowResource', 'refreshSeconds', 'metric', 'tokenKind', 'horizon', 'chartType', 'currency', 'quotaKey', 'selectedAccount', 'chartLayer', 'warningQuota', 'warningBalance', 'panelWidth'];
export function publicConfig(config = {}) {
  const result = Object.fromEntries(configFields.filter(k => k in config).map(k => [k, config[k]]));
  result.accounts = (config.accounts || []).map(a => Object.fromEntries(accountFields.filter(k => k in a).map(k => [k, a[k]])));
  return result;
}

export function trimHistory(history, now = Date.now(), max = 10000) {
  return history.filter(h => h.at >= now - 30 * DAY && h.at <= now).slice(-max);
}
export function windowLabel(minutes) {
  return minutes % 1440 === 0 ? `${minutes / 1440}天` : minutes % 60 === 0 ? `${minutes / 60}h` : `${minutes}分钟`;
}

export function validateSnapshot(value) {
  const fail=()=>{throw new Error('统计数据格式无效或超出容量')};
  const number=v=>typeof v==='number'&&Number.isFinite(v);
  const time=v=>number(v)&&v>=0&&v<8640000000000000;
  if(!value||value.version!==1||!Array.isArray(value.accounts)||!Array.isArray(value.history)||!Array.isArray(value.events)||value.accounts.length>100||value.history.length>12000||value.events.length>100000)fail();
  const account=a=>{
    if(!a||typeof a!=='object'||typeof a.id!=='string'||typeof a.provider!=='string'||!['codex','deepseek'].includes(a.provider)||!['ready','unavailable'].includes(a.status))fail();
    for(const k of ['sourceIds','aliases'])if(a[k]!==undefined&&(!Array.isArray(a[k])||!a[k].every(v=>typeof v==='string')))fail();
    for(const k of ['name','plan','color','groupId','error','identity','keyFingerprint'])if(a[k]!==undefined&&typeof a[k]!=='string')fail();
    if(a.windows!==undefined&&!Array.isArray(a.windows))fail();if(a.wallets!==undefined&&!Array.isArray(a.wallets))fail();
    for(const w of a.windows||[])if(!w||typeof w.bucket!=='string'||!number(w.duration)||w.duration<=0||!number(w.remaining)||w.remaining<0||w.remaining>100||(w.resetsAt!=null&&!time(w.resetsAt)))fail();
    for(const w of a.wallets||[])if(!w||typeof w.currency!=='string'||!number(w.total))fail();
    return a;
  };
  value.accounts.forEach(account);
  for(const h of value.history){if(!h||!time(h.at)||!Array.isArray(h.accounts))fail();h.accounts.forEach(account)}
  for(const e of value.events){if(!e||!time(e.at)||typeof e.accountId!=='string')fail();for(const k of ['input','output','cached'])if(e[k]!=null&&(!number(e[k])||e[k]<0))fail()}
  if(value.updatedAt!=null&&!time(value.updatedAt))fail();
  return value;
}
