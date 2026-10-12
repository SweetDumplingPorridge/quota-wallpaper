const NS = 'http://www.w3.org/2000/svg';
export function compact(value) {
  return new Intl.NumberFormat('zh-CN', { notation: 'compact', maximumFractionDigits: 1 }).format(value || 0);
}
export function drawChart(container, data, { type = 'line', stacked = true, horizon = 86400000 } = {}) {
  container.replaceChildren();
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 900 230'); svg.setAttribute('role', 'img'); svg.setAttribute('aria-label', '按账号设色的消耗统计图');
  const el = (name, attrs, text) => { const node = document.createElementNS(NS, name); for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v); if (text !== undefined) node.textContent = text; svg.append(node); return node; };
  const left = 45, top = 12, width = 840, height = 177;
  const bins = data.series[0]?.values.length || 48;
  const totals = Array.from({ length: bins }, (_, i) => data.series.reduce((sum, row) => sum + (row.values[i] || 0), 0));
  const peak = Math.max(1, ...(stacked ? totals : data.series.flatMap(row => row.values.filter(v => v !== null))));
  const max = peak * 1.12;
  for (let i = 0; i <= 3; i++) {
    const y = top + height * i / 3;
    el('line', { x1: left, x2: left + width, y1: y, y2: y, stroke: 'currentColor', opacity: '.09' });
    el('text', { x: left - 10, y: y + 4, 'text-anchor': 'end', fill: 'currentColor', opacity: '.48', 'font-size': 10 }, compact(max * (1 - i / 3)));
  }
  const cumulative = Array(bins).fill(0), x = i => left + width * (i + .5) / bins;
  for (const row of data.series) {
    const previous = [...cumulative];
    if (type === 'bar') {
      const barWidth = Math.max(1, width / bins * .65 / (stacked ? 1 : Math.max(1, data.series.length)));
      row.values.forEach((v, i) => {
        if (v === null) return;
        const base = stacked ? cumulative[i] : 0, offset = stacked ? 0 : (data.series.indexOf(row) - (data.series.length - 1) / 2) * barWidth;
        el('rect', { x: x(i) - barWidth / 2 + offset, y: top + height - height * (v + base) / max, width: barWidth, height: Math.max(v > 0 ? 1 : 0, height * v / max), rx: 2, fill: row.color, opacity: '.8' });
        if (stacked) cumulative[i] += v;
      });
    } else {
      let points = [];
      const flush = () => {
        if (!points.length) return;
        const path = points.map(([i, v], k) => `${k ? 'L' : 'M'}${x(i)},${top + height - height * (v + (stacked ? previous[i] : 0)) / max}`).join(' ');
        el('path', { d: path, fill: 'none', stroke: row.color, 'stroke-width': 2, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' });
        if (points.length === 1) el('circle', { cx: x(points[0][0]), cy: top + height - height * (points[0][1] + (stacked ? previous[points[0][0]] : 0)) / max, r: 2, fill: row.color });
        points = [];
      };
      row.values.forEach((v, i) => { if (v === null) flush(); else { points.push([i, v]); if (stacked) cumulative[i] += v; } }); flush();
    }
  }
  for (let i = 0; i <= 4; i++) {
    const at = data.start + (data.end - data.start) * i / 4;
    const text = new Intl.DateTimeFormat('zh-CN', horizon <= 86400000 ? { hour: '2-digit', minute: '2-digit', hour12: false } : { month: 'numeric', day: 'numeric' }).format(at);
    el('text', { x: left + width * i / 4, y: 218, 'text-anchor': i === 0 ? 'start' : i === 4 ? 'end' : 'middle', fill: 'currentColor', opacity: '.48', 'font-size': 11 }, text);
  }
  if (!data.series.some(row => row.values.some(v => v !== null))) el('text', { x: 470, y: 100, 'text-anchor': 'middle', fill: 'currentColor', opacity: '.5', 'font-size': 14 }, '暂无可用记录 · 数据采集后显示');
  container.append(svg);
}
