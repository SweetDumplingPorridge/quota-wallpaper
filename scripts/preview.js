import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
const root = resolve('wallpaper');
const port = Number(process.env.PORT || 18766);
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png' };
const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://127.0.0.1');
    const path = resolve(root, '.' + decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname));
    if (!path.startsWith(root + sep) || /(?:live|connection)\.json$/.test(path)) { res.writeHead(403); return res.end(); }
    res.setHeader('Content-Type', types[extname(path)] || 'application/octet-stream');
    res.end(await readFile(path));
  } catch { res.writeHead(404); res.end('File not found'); }
});
server.listen(port, '127.0.0.1', () => console.log(`Preview: http://127.0.0.1:${port}`));
