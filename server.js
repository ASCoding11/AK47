import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { dirname, extname, join, normalize, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ApiError, CATEGORIES, FEE_BPS, createEngine } from './src/engine.js';

const ROOT = dirname(fileURLToPath(import.meta.url));
const PUBLIC = join(ROOT, 'public');
const PORT = Number(process.env.PORT ?? 3000);
const DB_PATH = process.env.DB_PATH ?? join(ROOT, 'data', 'crowdline.db');
const DEMO = process.env.DEMO_MODE !== 'false';
const SECURE_COOKIE = process.env.SECURE_COOKIE === 'true';

await mkdir(dirname(DB_PATH), { recursive: true });
const engine = createEngine(DB_PATH, { demo: DEMO });

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
};

function sessionToken(req) {
  const match = /(?:^|;\s*)sid=([a-f0-9]{64})/.exec(req.headers.cookie ?? '');
  return match?.[1] ?? null;
}

function sessionCookie(token) {
  const base = `sid=${token ?? ''}; HttpOnly; SameSite=Lax; Path=/${SECURE_COOKIE ? '; Secure' : ''}`;
  return token ? `${base}; Max-Age=${30 * 86_400}` : `${base}; Max-Age=0`;
}

async function readJson(req) {
  // Requiring JSON keeps cross-site form posts from reaching any mutation.
  if (!/^application\/json\b/.test(req.headers['content-type'] ?? '')) {
    throw new ApiError(415, 'Send JSON');
  }
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 100_000) throw new ApiError(413, 'Request too large');
    chunks.push(chunk);
  }
  try {
    const body = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
    if (body && typeof body === 'object' && !Array.isArray(body)) return body;
  } catch {}
  throw new ApiError(400, 'Invalid JSON');
}

// [method, path pattern, handler(ctx)]; `auth` handlers require a session.
const routes = [];
const route = (method, pattern, handler, { auth = false } = {}) =>
  routes.push({ method, re: new RegExp(`^${pattern.replace(/:id/g, '(\\d+)')}$`), handler, auth });

route('GET', '/api/config', () => ({ feeBps: FEE_BPS, categories: CATEGORIES, demo: DEMO }));
route('GET', '/api/me', ({ user }) => ({ user }));
route('POST', '/api/register', ({ body, res }) => {
  const { user, token } = engine.register(body.username, body.password);
  res.setHeader('Set-Cookie', sessionCookie(token));
  return { user };
});
route('POST', '/api/login', ({ body, res }) => {
  const { user, token } = engine.login(body.username, body.password);
  res.setHeader('Set-Cookie', sessionCookie(token));
  return { user };
});
route('POST', '/api/logout', ({ req, res }) => {
  engine.logout(sessionToken(req));
  res.setHeader('Set-Cookie', sessionCookie(null));
  return {};
});
route('POST', '/api/faucet', ({ user }) => ({ user: engine.faucet(user.id) }), { auth: true });

route('GET', '/api/markets', ({ query }) => ({
  markets: engine.listMarkets({
    status: query.get('status') ?? 'open',
    category: query.get('category'),
    search: query.get('q'),
  }),
}));
route('POST', '/api/markets', ({ user, body }) => ({ market: engine.createMarket(user.id, body) }), { auth: true });
route('GET', '/api/markets/:id', ({ user, id }) => engine.marketDetail(id, user?.id));
route('POST', '/api/markets/:id/orders', ({ user, id, body }) => engine.placeOrder(user.id, id, body), { auth: true });
route('POST', '/api/markets/:id/resolve', ({ user, id, body }) => engine.resolveMarket(user.id, id, body.outcome), { auth: true });
route('DELETE', '/api/orders/:id', ({ user, id }) => engine.cancelOrder(user.id, id) ?? {}, { auth: true });
route('GET', '/api/portfolio', ({ user }) => engine.portfolio(user.id), { auth: true });
route('GET', '/api/admin/stats', ({ user }) => {
  if (!user.isAdmin) throw new ApiError(403, 'Admins only');
  return engine.stats();
}, { auth: true });

async function handleApi(req, res, url) {
  for (const r of routes) {
    const match = r.method === req.method && r.re.exec(url.pathname);
    if (!match) continue;
    const user = engine.userForToken(sessionToken(req));
    if (r.auth && !user) throw new ApiError(401, 'Log in first');
    const body = req.method === 'POST' ? await readJson(req) : {};
    return r.handler({ req, res, user, body, query: url.searchParams, id: Number(match[1]) });
  }
  throw new ApiError(404, 'Not found');
}

async function serveStatic(res, pathname) {
  const rel = normalize(pathname === '/' ? '/index.html' : pathname);
  const file = join(PUBLIC, rel);
  if (!file.startsWith(PUBLIC + sep)) throw new ApiError(404, 'Not found');
  try {
    const data = await readFile(file);
    res.writeHead(200, { 'Content-Type': MIME[extname(file)] ?? 'application/octet-stream' });
    res.end(data);
  } catch {
    throw new ApiError(404, 'Not found');
  }
}

const server = createServer(async (req, res) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Content-Security-Policy', "default-src 'self'; style-src 'self' 'unsafe-inline'");
  try {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname.startsWith('/api/')) {
      const result = await handleApi(req, res, url);
      res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
      res.end(JSON.stringify(result ?? {}));
    } else if (req.method === 'GET') {
      await serveStatic(res, url.pathname);
    } else {
      throw new ApiError(405, 'Method not allowed');
    }
  } catch (err) {
    const status = err instanceof ApiError ? err.status : 500;
    if (status === 500) console.error(err);
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: status === 500 ? 'Something went wrong' : err.message }));
  }
});

server.listen(PORT, () => {
  console.log(`Crowdline running at http://localhost:${PORT}${DEMO ? ' (demo credits enabled)' : ''}`);
});
