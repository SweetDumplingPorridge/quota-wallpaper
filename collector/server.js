import http from 'node:http';
import { timingSafeEqual } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve, join, extname, sep } from 'node:path';

const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png' };
export function createServer({ token, getSnapshot, getConfig, setConfig, collect, root }) {
  const equal = value => { const a = Buffer.from(value || ''), b = Buffer.from(token); return a.length === b.length && timingSafeEqual(a, b); };
  return http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://127.0.0.1');
      const origin = req.headers.origin;
      const allowedOrigin = !origin || origin === 'null' || /^http:\/\/(?:localhost|127\.0\.0\.1):\d+$/.test(origin);
      if (!allowedOrigin) { res.writeHead(403); return res.end('Origin denied'); }
      res.setHeader('Access-Control-Allow-Origin', origin || '*'); res.setHeader('Vary', 'Origin');
      res.setHeader('Cache-Control', 'no-store'); res.setHeader('X-Content-Type-Options', 'nosniff');
      if (req.method === 'OPTIONS') { res.setHeader('Access-Control-Allow-Headers', 'X-Quota-Token, Content-Type'); res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS'); res.writeHead(204); return res.end(); }
      if (url.pathname.startsWith('/api/')) {
        if (!equal(req.headers['x-quota-token'] || url.searchParams.get('token'))) { res.writeHead(401); return res.end('Capability required'); }
        const send = data => { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(data)); };
        if (url.pathname === '/api/snapshot' && req.method === 'GET') return send(getSnapshot());
        if (url.pathname === '/api/config' && req.method === 'GET') return send(getConfig());
        if (req.method === 'POST' && url.pathname === '/api/refresh') { await collect(); return send(getSnapshot()); }
        if (req.method === 'POST' && url.pathname === '/api/config') {
          let body = ''; for await (const chunk of req) { body += chunk; if (body.length > 65536) { res.writeHead(413); return res.end(); } }
          await setConfig(JSON.parse(body)); return send({ ok: true });
        }
        res.writeHead(404); return res.end();
      }
      if (!root) { res.writeHead(404); return res.end(); }
      const path = resolve(root, '.' + decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname));
      const base = resolve(root);
      if (!path.startsWith(base + sep) || /(?:live|connection)\.json$/.test(path)) { res.writeHead(403); return res.end(); }
      // Only an explicit public asset set is available. No arbitrary file reads.
      if (!['index.html', 'styles.css', 'app.js', 'preview.svg', 'project.json'].includes(path.slice(base.length + 1))) { res.writeHead(404); return res.end(); }
      const content = await readFile(path); res.setHeader('Content-Type', types[extname(path)] || 'application/octet-stream'); res.end(content);
    } catch { if (!res.headersSent) res.writeHead(400); res.end('Request unavailable'); }
  });
}
