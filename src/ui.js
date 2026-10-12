import { aggregate, chartSeries, COLORS, DAY, clamp, publicConfig, trimHistory, windowLabel, mergeAccounts, validateSnapshot } from './core.js';
import { drawChart, compact } from './charts.js';
import { demoData } from './demo.js';
import { installChoices } from './choices.js';

const $ = id => document.getElementById(id);
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = value => Number(value || 0).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const empty = () => ({ version: 1, accounts: [], history: [], events: [], updatedAt: null, interval: 300 });
const defaults = { theme: 'dark', accent: '#78dfcc', background: '', backgroundFit: 'cover', backgroundDim: 15, blur: 16, opacity: 84, scale: 1, positionX: 50, positionY: 50, panelWidth: 1160, font: 'Segoe UI, Microsoft YaHei, sans-serif', fontSize: 14, layout: 'dashboard', showClock: true, showDate: true, showAccounts: true, showTotals: true, showChart: true, showSeconds: false, hour12: false, lowResource: true, refreshSeconds: 300, metric: 'tokens', tokenKind: 'total', horizon: DAY, chartType: 'bar', currency: 'CNY', quotaKey: 'codex:300', selectedAccount: 'all', chartLayer: 'stacked', warningQuota: 15, warningBalance: 10, accounts: [], demo: false, dataMode: 'auto' };
function loadStorage(key, fallback) { try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; } }
let settings = { ...defaults, ...loadStorage('qw-settings-v1', {}) };
let uiOverrides = new Set(loadStorage('qw-ui-overrides-v1', [])), receivedProperties = false;
let data = loadStorage('qw-data-v1', empty()), connection = loadStorage('qw-connection-v1', null), bridgeConfig = null, bridgeActive = false, currentTab = 'appearance', loading = false, pollTimer, clockTimer;
try{data=validateSnapshot(data)}catch{data=empty()}
let secrets = loadStorage('qw-private-keys-v1', {}), rememberKeys = Object.keys(secrets).length > 0;
let keyMap = { ...secrets };
const hash = new URLSearchParams(location.hash.slice(1));
if (hash.has('bridge') && /^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(location.origin)) connection = { endpoint: location.origin, token: hash.get('bridge') };
if (hash.has('demo')) settings.demo = true;

function message(text) { $('settings-message').textContent = text; }
function persist() {
  try { localStorage.setItem('qw-settings-v1', JSON.stringify({ ...publicConfig(settings), demo: settings.demo, dataMode: settings.dataMode })); localStorage.setItem('qw-ui-overrides-v1', JSON.stringify([...uiOverrides])); } catch { message('设置存储空间不足，请导出备份。'); }
}
function saveData() {
  try { localStorage.setItem('qw-data-v1', JSON.stringify(data)); } catch { /* The collector remains the authoritative history store. */ }
}
function xhrJson(url, timeout = 10000) {
  return new Promise((resolve, reject) => {
    const x = new XMLHttpRequest(); x.open('GET', url); x.timeout = timeout;
    x.onload = () => { try { if (x.status !== 0 && (x.status < 200 || x.status >= 300)) throw Error(); resolve(JSON.parse(x.responseText)); } catch { reject(new Error('文件不可用')); } };
    x.onerror = x.ontimeout = () => reject(new Error('本地文件不可用')); x.send();
    // Some CEF request denials never dispatch onerror or timeout.
    setTimeout(() => { if (x.readyState !== 4) { x.abort(); reject(new Error('本地读取超时')); } }, timeout + 100);
  });
}
function validConnection(value) { return value && /^http:\/\/(?:127\.0\.0\.1|localhost):\d+$/.test(value.endpoint) && typeof value.token === 'string' && value.token.length >= 16; }
async function bridgeRequest(path, method = 'GET', body) {
  if (!validConnection(connection)) throw new Error('本地连接尚未配置');
  const r = await fetch(connection.endpoint + path, { method, headers: { 'X-Quota-Token': connection.token, ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(25000) });
  if (!r.ok) throw new Error(r.status === 401 ? '连接令牌无效' : '采集器暂不可用');
  return r.json();
}
function validData(value) {
  return validateSnapshot(value);
}
async function readDirect() {
  const accounts = [];
  for (const [i, account] of settings.accounts.entries()) {
    if (account.enabled === false) continue;
    const key = keyMap[account.id];
    if (!key) { accounts.push({ ...account, status: 'unavailable', error: '请重新填写 key，或启用在本机记住密钥', windows: [], wallets: [] }); continue; }
    try {
      const response = await fetch('https://api.deepseek.com/user/balance', { headers: { Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(20000) });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const raw = await response.json();
      if (!Array.isArray(raw.balance_infos)) throw new Error('余额接口格式不可用');
      const bytes = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(key)));
      const keyFingerprint = [...bytes].map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 20);
      accounts.push({ ...account, color: account.color || COLORS[i % COLORS.length], status: 'ready', updatedAt: Date.now(), keyFingerprint, wallets: raw.balance_infos.map(w => ({ currency: w.currency, total: Number(w.total_balance), granted: Number(w.granted_balance), toppedUp: Number(w.topped_up_balance) })), windows: [] });
    } catch (error) { accounts.push({ ...account, status: 'unavailable', error: error.message, windows: [], wallets: [] }); }
  }
  const now = Date.now(); data = { ...data, accounts: mergeAccounts(accounts), updatedAt: now, interval: settings.refreshSeconds, history: trimHistory([...(data.history || []), { at: now, accounts: mergeAccounts(accounts) }]), events: data.events || [] };
  saveData();
}
async function refresh(manual = false) {
  if (loading) return;
  loading = true; $('refresh').disabled = true;
  try {
    bridgeActive = false;
    if (settings.demo) { data = demoData(); $('source-badge').textContent = '演示'; }
    else if (settings.dataMode === 'direct') { await readDirect(); $('source-badge').textContent = 'Web 直连'; }
    else if (settings.dataMode === 'import') { $('source-badge').textContent = '导入数据'; }
    else {
      if (!validConnection(connection)) {
        try { connection = await xhrJson('connection.json?t=' + Date.now(), 1500); } catch { /* Optional collector discovery. */ }
      }
      let connected = false;
      if (validConnection(connection)) {
        try { data = validData(await bridgeRequest(manual ? '/api/refresh' : '/api/snapshot', manual ? 'POST' : 'GET')); bridgeActive = connected = true; $('source-badge').textContent = '本地采集器'; saveData(); } catch { /* Fall back to last-written snapshot. */ }
      }
      if (!connected) {
        try { data = validData(await xhrJson('live.json?t=' + Date.now(), 2000)); $('source-badge').textContent = '定时快照'; saveData(); }
        catch { $('source-badge').textContent = data.accounts.length ? '离线缓存' : '等待数据'; }
      }
    }
    render();
  } finally { loading = false; $('refresh').disabled = false; schedulePoll(); }
}
function schedulePoll() { clearTimeout(pollTimer); pollTimer = setTimeout(() => { if (!paused) refresh(); else schedulePoll(); }, clamp(Number(settings.refreshSeconds) || 300, 60, 86400) * 1000); }
let paused = false;
function remainingText(at) {
  if (!at) return '重置时间未提供';
  const ms = at - Date.now(); if (ms <= 0) return '已到重置时间 · 等待更新';
  const minutes = Math.ceil(ms / 60000), days = Math.floor(minutes / 1440), hours = Math.floor(minutes % 1440 / 60), mins = minutes % 60;
  return `${days ? days + '天 ' : ''}${hours ? hours + '小时 ' : ''}${mins}分后重置`;
}
function tickClock() {
  clearTimeout(clockTimer); if (paused) return;
  const time = new Date();
  let expiredChanged=false;
  for(const a of data.accounts||[])for(const w of a.windows||[])if(w.resetsAt&&w.resetsAt<=time.getTime()&&!w.expired){w.expired=true;expiredChanged=true}
  if(expiredChanged)queueMicrotask(render);
  $('clock').textContent = new Intl.DateTimeFormat('zh-CN', { hour: '2-digit', minute: '2-digit', ...(settings.showSeconds && !settings.lowResource ? { second: '2-digit' } : {}), hour12: settings.hour12 }).format(time);
  $('date').textContent = new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' }).format(time);
  document.querySelectorAll('[data-reset]').forEach(n => { n.textContent = remainingText(Number(n.dataset.reset)); });
  const tick = settings.showSeconds && !settings.lowResource ? 1000 : 60000;
  clockTimer = setTimeout(tickClock, tick - Date.now() % tick + 5);
}
function placement() {
  const b = $('board');
  const automatic = Math.max(1, Math.min(innerWidth / 1920, innerHeight / 1080));
  const fit = Math.min(clamp(Number(settings.scale) || 1,.5,2) * automatic, (innerHeight - 32) / Math.max(1, b.offsetHeight), (innerWidth - 32) / Math.max(1, b.offsetWidth));
  b.style.setProperty('--fit-scale', String(fit));
  const rect = b.getBoundingClientRect();
  const x = clamp(innerWidth * settings.positionX / 100, rect.width / 2 + 8, Math.max(rect.width / 2 + 8, innerWidth - rect.width / 2 - 8));
  const y = clamp(innerHeight * settings.positionY / 100, rect.height / 2 + 8, Math.max(rect.height / 2 + 8, innerHeight - rect.height / 2 - 8));
  b.style.left = `${x}px`; b.style.top = `${y}px`;
}
function applyAppearance() {
  const style = document.documentElement.style;
  style.setProperty('--accent', settings.accent); style.setProperty('--blur', `${settings.lowResource ? 0 : settings.blur}px`);
  style.setProperty('--scale', 1); style.setProperty('--panel-width', `${clamp(Number(settings.panelWidth), 400, 2000)}px`);
  style.setProperty('--font', settings.font); style.setProperty('--font-size', `${clamp(Number(settings.fontSize), 10, 24)}px`);
  const alpha = clamp(Number(settings.opacity), 10, 100) / 100;
  style.setProperty('--panel', settings.theme === 'light' ? `rgba(242,247,241,${alpha})` : `rgba(14,24,32,${alpha})`);
  document.body.className = `${settings.theme === 'light' ? 'light' : ''} ${settings.layout} ${settings.lowResource ? 'low-resource' : ''}`;
  const bg = $('background');
  if (settings.background) {
    const path = /^(?:data:image\/|file:\/\/\/|https?:\/\/)/i.test(settings.background) ? settings.background : 'file:///' + settings.background.replace(/\\/g, '/');
    bg.style.backgroundImage = `linear-gradient(rgba(0,0,0,${settings.backgroundDim / 100}),rgba(0,0,0,${settings.backgroundDim / 100})),url(${JSON.stringify(path)})`;
  } else bg.style.backgroundImage = '';
  bg.style.backgroundSize = settings.backgroundFit === 'fill' ? '100% 100%' : settings.backgroundFit; bg.style.backgroundRepeat = 'no-repeat';
  for (const [id, shown] of [['clock-block', settings.showClock], ['date', settings.showDate], ['accounts', settings.showAccounts], ['totals', settings.showTotals], ['chart-section', settings.showChart]]) $(id).hidden = !shown;
  tickClock(); requestAnimationFrame(placement);
}
function render() {
  const rows = data.accounts || [];
  $('demo-banner').hidden = !settings.demo; $('empty-state').hidden = rows.length > 0;
  $('accounts').innerHTML = rows.map((a, i) => {
    const color = /^#[\da-f]{6}$/i.test(a.color || '') ? a.color : COLORS[i % COLORS.length];
    const quota = (a.windows || []).map(w => {
      const expired=w.expired||(w.resetsAt&&w.resetsAt<=Date.now());
      return `<div class="quota-row"><div class="quota-label"><span>${esc(windowLabel(w.duration))} · ${esc(w.bucket)}</span><span class="quota-value ${!expired&&w.remaining <= settings.warningQuota ? 'warning' : ''}">${expired?'—':Number(w.remaining).toFixed(0)}${expired?'':'<small>%</small>'}</span></div><div class="progress"><span style="width:${expired?0:clamp(w.remaining, 0, 100)}%"></span></div><div class="reset-label" data-reset="${Number(w.resetsAt || 0)}">${esc(remainingText(w.resetsAt))}</div></div>`;
    }).join('');
    const wallets = (a.wallets || []).map(w => `<div class="wallet-value ${w.total <= settings.warningBalance ? 'warning' : ''}"><small>${esc(w.currency)}</small>${money(w.total)}</div><div class="wallet-detail">充值 ${money(w.toppedUp ?? w.total)} · 赠送 ${money(w.granted || 0)}</div>`).join('');
    return `<article class="account-card ${a.status !== 'ready' ? 'unavailable' : ''}" style="--color:${color}"><div class="card-top"><span class="provider-icon">${a.provider === 'codex' ? 'C' : 'D'}</span><span class="account-name">${esc(a.name || a.id)}</span><span class="plan">${esc(a.plan || (a.provider === 'codex' ? 'Codex' : 'API'))}</span></div>${quota}${wallets}${a.status !== 'ready' ? `<div class="error-text">${esc(a.error || '暂不可用')} · 保留上次数据</div>` : ''}${a.aliases?.length > 1 ? `<p class="wallet-detail">已合并 ${a.aliases.length} 个数据源</p>` : ''}</article>`;
  }).join('');
  const totals = aggregate(rows);
  $('totals').innerHTML = totals.wallets.map(w => `<div class="total-item"><div class="label">${esc(w.currency)} · 账号余额合计</div><strong>${money(w.total)}</strong><small> 同币种 · 已去重</small></div>`).join('') + totals.quotas.map(q => `<div class="total-item"><div class="label">${esc(q.bucket)} ${esc(windowLabel(q.duration))} · 剩余比例合计</div><strong>${q.sum.toFixed(0)} 个百分点</strong><small> 未按订阅容量加权${q.customWeight ? ` · 自定义加权剩余 ${q.weighted.toFixed(1)}%` : ''}</small><div class="stack">${q.accounts.map((a, i) => `<span title="${esc(a.name)}: ${a.remaining.toFixed(0)}%" style="width:${a.remaining / (q.accounts.length * 100) * 100}%;background:${/^#[\da-f]{6}$/i.test(a.color || '') ? a.color : COLORS[i % COLORS.length]}"></span>`).join('')}</div></div>`).join('');
  const selector = $('chart-account'); selector.innerHTML = '<option value="all">全部账号</option>' + rows.map(a => `<option value="${esc(a.id)}">${esc(a.name || a.id)}</option>`).join('');
  if (!rows.some(a => a.id === settings.selectedAccount)) settings.selectedAccount = 'all'; selector.value = settings.selectedAccount;
  renderChart(); applyAppearance(); installChoices();
  const age = data.updatedAt ? Date.now() - data.updatedAt : Infinity;
  $('status').textContent = settings.demo ? '演示模式' : data.accounts.length ? `${rows.filter(a => a.status === 'ready').length}/${rows.length} 账号可用${age > (data.interval || 300) * 2500 ? ' · 数据已过期' : ''}` : '等待数据来源';
  $('updated').textContent = data.updatedAt ? '更新于 ' + new Date(data.updatedAt).toLocaleTimeString('zh-CN', { hour12: false }) : '每 ' + settings.refreshSeconds / 60 + ' 分钟采样';
}
function renderChart() {
  const quotaOptions = aggregate(data.accounts || []).quotas;
  const selected = quotaOptions.find(q => `${q.bucket}:${q.duration}` === settings.quotaKey) || quotaOptions[0];
  const now = Date.now();
  const series = chartSeries(data.history || [], data.events || [], { now, horizon: Number(settings.horizon), bins: settings.horizon <= DAY ? 48 : settings.horizon <= 7 * DAY ? 56 : 60, metric: settings.metric, tokenKind: settings.tokenKind, currency: settings.currency, bucket: selected?.bucket || 'codex', duration: selected?.duration || 300, accountIds: settings.selectedAccount === 'all' ? undefined : [settings.selectedAccount], maxGap: Math.max((data.interval || 300) * 3000, settings.demo ? 7200000 : 900000) });
  const unit = settings.metric === 'tokens' ? 'tokens' : settings.metric === 'spend' ? settings.currency : '百分点';
  $('chart-title').textContent = settings.metric === 'tokens' ? 'Token 消耗' : settings.metric === 'spend' ? '钱包支出估算' : `${windowLabel(selected?.duration || 300)} 额度消耗`;
  $('chart-unit').textContent = `${settings.metric === 'tokens' ? ({ total: '输入 + 输出', input: '输入', output: '输出', cached: '缓存命中（输入子集）' }[settings.tokenKind]) : settings.metric === 'spend' ? '净余额下降 · 估算' : selected?.bucket || 'codex'} / ${unit}`;
  drawChart($('chart'), series, { type: settings.chartType, stacked: settings.chartLayer === 'stacked', horizon: Number(settings.horizon) });
  $('chart-legend').innerHTML = series.series.map(r => `<span class="legend-item"><span class="legend-dot" style="background:${esc(r.color)}"></span>${esc(r.name)}<strong>${settings.metric === 'spend' ? money(r.total) : compact(r.total)}</strong></span>`).join('');
  let note = settings.metric === 'tokens' ? '本地 token 记录仅覆盖可读会话，不等于订阅额度；未记录的账号不补造数据。' : settings.metric === 'spend' ? '费用为净余额下降估算；充值上升已排除，赠款过期、退款及两次采样间充值仍可能影响结果。' : '按同一重置窗口记录百分点变化；不同订阅百分比没有统一绝对容量。';
  if (series.gaps) note += ` ${series.gaps} 段采样间隔过长，已留空。`;
  if (series.firstSample) note += ` 本窗口首个采样：${new Date(series.firstSample).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}。`;
  else if (settings.metric !== 'tokens') note += ' 需要至少两次有效采样。';
  $('chart-note').textContent = note;
  document.querySelectorAll('[data-horizon]').forEach(b => b.classList.toggle('active', Number(b.dataset.horizon) === Number(settings.horizon)));
}

const field = (key, label, type, options) => {
  const id = 'setting-' + key, value = settings[key];
  const input = type === 'select' ? `<qw-choice id="${id}" data-setting="${key}">${options.map(([v, t]) => `<option value="${esc(v)}" ${String(value) === String(v) ? 'selected' : ''}>${esc(t)}</option>`).join('')}</qw-choice>` : type === 'checkbox' ? `<input id="${id}" data-setting="${key}" type="checkbox" ${value ? 'checked' : ''}>` : `<input id="${id}" data-setting="${key}" type="${type}" value="${esc(value)}" ${options ? `min="${options[0]}" max="${options[1]}" step="${options[2] || 1}"` : ''}>`;
  return `<div class="form-row"><label for="${id}">${label}</label>${input}</div>`;
};
const group = text => `<div class="form-group"><h3>${text}</h3></div>`;
function accountForm(a, i, local) {
  const input = (key, label, type = 'text', value = a[key] || '') => `<div class="form-row"><label for="account-${i}-${key}">${label}</label><input id="account-${i}-${key}" data-account="${i}" data-key="${key}" type="${type}" value="${esc(value)}"></div>`;
  return `<div class="account-editor"><h4>${esc(a.provider === 'codex' ? 'Codex 登录配置' : a.provider === 'dsh' ? 'DSH 登录配置' : 'DeepSeek API')}<button data-remove="${i}" aria-label="删除账号">×</button></h4>${input('name','名称')}${input('groupId','账号分组 ID')}${input('plan','订阅标签')}${input('color','账号颜色','color',a.color || COLORS[i % COLORS.length])}${input('weight','自定义容量权重','number',a.weight || 1)}${a.provider === 'codex' ? input('codexHome','独立 CODEX_HOME') : a.provider === 'dsh' ? input('dshHome','DSH_HOME') : input('apiKey',a.apiKeyConfigured ? 'API key（留空保留）' : 'API key','password',local ? '' : keyMap[a.id] || '')}</div>`;
}
function settingsTab() {
  document.querySelectorAll('[data-tab]').forEach(b => b.classList.toggle('active', b.dataset.tab === currentTab));
  let html = '';
  if (currentTab === 'appearance') {
    html = field('theme','主题','select',[['dark','深色'],['light','浅色']]) + field('accent','强调色','color') + field('layout','布局','select',[['dashboard','完整仪表盘'],['compact','紧凑'],['minimal','仅时间与账号']]) + field('panelWidth','面板宽度','range',[400,2000,20]) + field('scale','面板缩放','range',[.5,2,.05]) + field('positionX','水平位置','range',[0,100]) + field('positionY','垂直位置','range',[0,100]) + field('opacity','面板不透明度','range',[10,100]) + field('blur','面板模糊','range',[0,40]) + field('font','字体','text') + field('fontSize','基础字号','range',[10,24]) + group('背景') + '<div class="form-row"><label for="background-file">选择背景图片</label><input id="background-file" type="file" accept="image/*"></div>' + field('background','图片路径或 URL','text') + field('backgroundFit','图片填充','select',[['cover','裁切铺满'],['contain','完整显示'],['fill','拉伸'],['auto','原始尺寸']]) + field('backgroundDim','背景压暗','range',[0,90]) + group('时间与模块') + ['showClock','showDate','showAccounts','showTotals','showChart','showSeconds','hour12'].map((k,i)=>field(k,['显示时间','显示日期','显示账号卡片','显示汇总','显示统计图','显示秒钟','12 小时制'][i],'checkbox')).join('') + group('性能') + field('lowResource','低资源模式','checkbox') + '<p class="form-note">低资源模式关闭模糊与秒钟，没有持续动画。时间按分钟更新，统计图仅在数据或设置变化时重绘。</p>';
  } else if (currentTab === 'statistics') {
    const qs = aggregate(data.accounts || []).quotas.map(q => [`${q.bucket}:${q.duration}`, `${q.bucket} · ${windowLabel(q.duration)}`]);
    html = field('metric','统计指标','select',[['tokens','Token 消耗'],['spend','费用估算'],['quota','额度变化']]) + field('tokenKind','Token 分类','select',[['total','输入 + 输出'],['input','输入'],['output','输出'],['cached','缓存命中']]) + field('horizon','时间范围','select',[[18000000,'过去 5h'],[DAY,'过去 24h'],[7*DAY,'过去 7day'],[30*DAY,'过去 30day']]) + field('chartType','图表样式','select',[['bar','柱状图'],['line','折线图']]) + field('chartLayer','账号分层','select',[['stacked','按账号设色叠加'],['separate','分别绘制']]) + field('currency','费用币种','select',[['CNY','人民币 CNY'],['USD','美元 USD']]) + field('quotaKey','额度窗口','select',qs.length ? qs : [['codex:300','Codex · 5h（等待数据）']]) + field('warningQuota','低额度阈值 %','number',[0,100]) + field('warningBalance','低余额阈值','number',[0,100000]) + '<p class="form-note">不同币种、额度窗口和类别分开汇总。自定义权重只影响加权剩余比例，不代表供应商官方容量。缓存命中已经包含在输入 token 中，不重复加到总量。</p>';
  } else {
    html = `<div class="form-row"><label for="demo-mode">演示数据</label><input id="demo-mode" type="checkbox" ${settings.demo ? 'checked' : ''}></div>` + field('dataMode','数据模式','select',[['auto','自动发现本地采集器 / 快照'],['direct','纯 Web · 手填 DeepSeek key'],['import','离线统计文件']]) + field('refreshSeconds','刷新间隔（秒）','number',[60,86400]) + group('本地连接') + `<div class="form-row"><label for="bridge-endpoint">地址</label><input id="bridge-endpoint" value="${esc(connection?.endpoint || 'http://127.0.0.1:18765')}"></div><div class="form-row"><label for="bridge-token">连接令牌</label><input id="bridge-token" type="password" value="${esc(connection?.token || '')}"></div><button id="connect-bridge">连接并管理本地账号</button><p class="form-note">采集器会自动生成项目内的连接文件；普通浏览器可用启动时输出的管理链接。令牌只保存在本机，导出设置不会包含它。</p>`;
    const local = !!bridgeConfig && bridgeActive;
    const list = local ? bridgeConfig.accounts : settings.accounts;
    html += group(local ? '采集器账号（私有配置）' : '纯 Web 账号') + (local ? `<div class="form-row"><label for="auto-codex">自动读取本机 Codex</label><input id="auto-codex" type="checkbox" ${bridgeConfig.autoCodex ? 'checked' : ''}></div><div class="form-row"><label for="auto-dsh">自动读取本机 DSH</label><input id="auto-dsh" type="checkbox" ${bridgeConfig.autoDsh ? 'checked' : ''}></div><div class="form-row"><label for="scan-tokens">读取本地 token 日志</label><input id="scan-tokens" type="checkbox" ${bridgeConfig.scanTokens ? 'checked' : ''}></div><div class="form-row"><label for="collector-interval">采集间隔（秒）</label><input id="collector-interval" type="number" min="60" value="${bridgeConfig.interval}"></div>` : `<div class="form-row"><label for="remember-keys">在此设备记住 API key</label><input id="remember-keys" type="checkbox" ${rememberKeys ? 'checked' : ''}></div>`) + list.map((a, i) => accountForm(a, i, local)).join('') + `<div class="account-add"><qw-choice id="add-provider"><option value="deepseek">DeepSeek API key</option>${local ? '<option value="codex">Codex 独立登录配置</option><option value="dsh">DSH 独立登录配置</option>' : ''}</qw-choice><button id="add-account">添加账号</button></div><button id="save-accounts" class="primary">保存账号并刷新</button><p class="form-note">同一个账号的不同 key 请填写相同的分组 ID，避免余额重复统计。普通 OpenAI API key 无法读取 Codex Plus / Pro 订阅额度；额外订阅账号请使用单独登录过的 CODEX_HOME。</p>`;
    html += group('历史数据') + '<div class="settings-bottom"><button id="export-data">导出统计数据</button><label class="file-button">导入统计数据<input id="import-data" type="file" accept=".json" hidden></label></div><p class="form-note">统计文件不包含密钥，但会包含账号名称与使用记录。导入后切换到离线模式。缺失历史会显示缺口。</p>';
  }
  $('settings-content').innerHTML = html;
  installChoices();
  $('settings-content').querySelectorAll('[data-setting]').forEach(input => input.addEventListener('change', () => {
    const key = input.dataset.setting;
    settings[key] = input.type === 'checkbox' ? input.checked : ['range','number'].includes(input.type) || ['horizon'].includes(key) ? Number(input.value) : input.value;
    uiOverrides.add(key);
    persist(); render(); if (key === 'dataMode') { bridgeConfig = null; refresh(); } schedulePoll();
  }));
  $('background-file')?.addEventListener('change', async e => {
    const file = e.target.files[0]; if (!file) return;
    if (file.size > 8 * 1024 * 1024) return message('图片超过 8MB，请用 Wallpaper Engine 的背景文件设置选择。');
    const reader = new FileReader(); reader.onload = () => { settings.background = reader.result; uiOverrides.add('background'); persist(); render(); }; reader.readAsDataURL(file);
  });
  $('demo-mode')?.addEventListener('change', e => { settings.demo = e.target.checked; if (!settings.demo) data = loadStorage('qw-data-v1', empty()); persist(); refresh(); });
  $('connect-bridge')?.addEventListener('click', async () => {
    connection = { endpoint: $('bridge-endpoint').value.replace(/\/$/, ''), token: $('bridge-token').value.trim() };
    try { bridgeConfig = await bridgeRequest('/api/config'); settings.demo = false; settings.dataMode = 'auto'; localStorage.setItem('qw-connection-v1', JSON.stringify(connection)); persist(); await refresh(); settingsTab(); message('本地采集器已连接。'); } catch (error) { message(error.message); }
  });
  const local = !!bridgeConfig && bridgeActive, list = local ? bridgeConfig.accounts : settings.accounts;
  $('settings-content').querySelectorAll('[data-account]').forEach(input => input.addEventListener('change', () => {
    const a = list[Number(input.dataset.account)], key = input.dataset.key;
    if (key === 'apiKey' && !local) keyMap[a.id] = input.value.trim();
    else a[key] = key === 'weight' ? Number(input.value) : input.value;
  }));
  $('settings-content').querySelectorAll('[data-remove]').forEach(button => button.addEventListener('click', () => { const [a] = list.splice(Number(button.dataset.remove),1); delete keyMap[a.id]; settingsTab(); }));
  $('add-account')?.addEventListener('click', () => { list.push({ id: crypto.randomUUID(), name: '新账号', provider: $('add-provider').value, color: COLORS[list.length % COLORS.length], weight: 1 }); settingsTab(); });
  $('save-accounts')?.addEventListener('click', async () => {
    try {
      if (local) {
        bridgeConfig = { ...bridgeConfig, autoCodex: $('auto-codex').checked, autoDsh: $('auto-dsh').checked, scanTokens: $('scan-tokens').checked, interval: Number($('collector-interval').value), accounts: list };
        await bridgeRequest('/api/config', 'POST', bridgeConfig); bridgeConfig = await bridgeRequest('/api/config');
      } else {
        rememberKeys = $('remember-keys').checked; secrets = rememberKeys ? { ...keyMap } : {};
        localStorage.setItem('qw-private-keys-v1', JSON.stringify(secrets)); settings.dataMode = 'direct'; settings.demo = false; persist();
      }
      await refresh(local); settingsTab(); message('账号已保存并刷新。');
    } catch (error) { message(error.message); }
  });
  $('export-data')?.addEventListener('click', () => download('quota-history.json', data));
  $('import-data')?.addEventListener('change', async e => { try { const file = e.target.files[0]; if (file.size > 32 * 1024 * 1024) throw Error('文件过大'); data = validData(JSON.parse(await file.text())); settings.dataMode = 'import'; settings.demo = false; persist(); saveData(); render(); message('已导入统计数据。'); } catch(error) { message(error.message); } });
}
function download(filename, value) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' }));
  const a = document.createElement('a'); a.href = url; a.download = filename; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
async function openSettings() {
  $('settings-overlay').hidden = false; settingsTab(); $('settings-close').focus();
  if (bridgeActive && !bridgeConfig) { try { bridgeConfig = await bridgeRequest('/api/config'); if (!$('settings-overlay').hidden) settingsTab(); } catch { /* Direct mode remains available. */ } }
}
$('settings-open').addEventListener('click', openSettings); $('empty-settings').addEventListener('click', openSettings);
$('settings-close').addEventListener('click', () => { $('settings-overlay').hidden = true; $('settings-open').focus(); });
$('settings-overlay').addEventListener('click', e => { if (e.target === $('settings-overlay')) $('settings-close').click(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape') $('settings-close').click(); });
document.querySelectorAll('[data-tab]').forEach(b => b.addEventListener('click', () => { currentTab = b.dataset.tab; settingsTab(); }));
document.querySelectorAll('[data-horizon]').forEach(b => b.addEventListener('click', () => { settings.horizon = Number(b.dataset.horizon); persist(); renderChart(); }));
$('chart-account').addEventListener('change', e => { settings.selectedAccount = e.target.value; persist(); renderChart(); });
$('refresh').addEventListener('click', () => refresh(true));
$('export-config').addEventListener('click', () => { download('quota-wallpaper-settings.json', { version: 1, ...publicConfig({ ...settings, accounts: bridgeActive && bridgeConfig ? bridgeConfig.accounts : settings.accounts }) }); message('设置导出不含密钥、连接令牌和本地账号路径。'); });
$('import-config').addEventListener('change', async e => { try {
  const imported = JSON.parse(await e.target.files[0].text()); if(imported.version!==1)throw Error();
  const safe=publicConfig(imported);
  for(const [key,value]of Object.entries(safe))if(key!=='accounts'&&(typeof value!==typeof defaults[key]||(typeof value==='number'&&!Number.isFinite(value))))delete safe[key];
  for(const [key,allowed]of Object.entries({theme:['dark','light'],layout:['dashboard','compact','minimal'],metric:['tokens','spend','quota'],chartType:['bar','line'],tokenKind:['total','input','output','cached'],currency:['CNY','USD'],horizon:[18000000,DAY,7*DAY,30*DAY]}))if(key in safe&&!allowed.includes(safe[key]))delete safe[key];
  settings = { ...defaults, ...safe, demo: false }; uiOverrides=new Set(Object.keys(safe)); persist(); render(); settingsTab(); message('设置已导入，密钥请在本机重新填写。');
} catch { message('设置文件无法解析。'); } });
$('reset-config').addEventListener('click', () => { const accounts = settings.accounts; settings = { ...defaults, accounts, dataMode: settings.dataMode, demo: settings.demo }; uiOverrides.clear(); persist(); render(); settingsTab(); });
window.addEventListener('resize', placement); new ResizeObserver(placement).observe($('board'));
window.wallpaperPropertyListener = {
  applyUserProperties(properties) {
    const mapping = { theme: 'theme', accent: 'accent', background: 'background', backgroundfit: 'backgroundFit', backgrounddim: 'backgroundDim', opacity: 'opacity', blur: 'blur', scale: 'scale', positionx: 'positionX', positiony: 'positionY', panelwidth: 'panelWidth', fontsize: 'fontSize', lowresource: 'lowResource', showseconds: 'showSeconds', showclock: 'showClock', showaccounts: 'showAccounts', showtotals: 'showTotals', showchart: 'showChart', layout: 'layout', refreshseconds: 'refreshSeconds', metric: 'metric', charttype: 'chartType', horizon: 'horizon' };
    for (const [key, target] of Object.entries(mapping)) if (properties[key]) {
      if (!receivedProperties && uiOverrides.has(target)) continue;
      uiOverrides.delete(target);
      const v = properties[key].value;
      if (key === 'accent') settings.accent = '#' + String(v).split(' ').map(n => clamp(Math.round(Number(n) * 255),0,255).toString(16).padStart(2,'0')).join('');
      else settings[target] = ['horizon'].includes(key) ? Number(v) : v;
    }
    receivedProperties = true;
    persist(); render(); schedulePoll();
  },
  setPaused(value) { paused = value; if (paused) clearTimeout(clockTimer); else { tickClock(); refresh(); } }
};
render(); refresh();
