// Minimal static file server (no dependencies) for the legacy diorama and test tooling.
// Usage: node tools/serve.mjs [port] [root]
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
};

export function startServer({ port = 8765, root = process.cwd() } = {}) {
  const base = resolve(root);
  const server = createServer(async (req, res) => {
    try {
      let path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
      if (path.endsWith('/')) path += 'index.html';
      const file = normalize(join(base, path));
      if (!file.startsWith(base)) throw Object.assign(new Error('forbidden'), { code: 'EACCES' });
      if (!(await stat(file)).isFile()) throw Object.assign(new Error('not file'), { code: 'ENOENT' });
      res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream', 'cache-control': 'no-store' });
      res.end(await readFile(file));
    } catch (e) {
      res.writeHead(e.code === 'EACCES' ? 403 : 404).end();
    }
  });
  return new Promise((ok, fail) => {
    server.once('error', fail);
    server.listen(port, '127.0.0.1', () => ok(server));
  });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = Number(process.argv[2] ?? 8765);
  const root = process.argv[3] ?? process.cwd();
  await startServer({ port, root });
  console.log(`Serving ${resolve(root)} at http://127.0.0.1:${port}/`);
  console.log(`Legacy diorama: http://127.0.0.1:${port}/legacy/gazprom_arena_diorama.html`);
}
