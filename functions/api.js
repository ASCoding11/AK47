// Maps the web app's requests ({ method, path, body }) onto the engine, with
// the same paths and response shapes as the Node server's /api routes.
import { ApiError } from './engine.js';

const routes = [];
const route = (method, pattern, handler, auth = true) =>
  routes.push({ method, re: new RegExp(`^${pattern.replace(':id', '([A-Za-z0-9_-]{1,64})')}$`), handler, auth });

// Signing in creates the member on their first visit, with the welcome bonus.
route('GET', '/me', async ({ engine, uid, profile }) => {
  if (!uid) return { user: null };
  const user = await engine.me(uid);
  return user ? { user, isNew: false } : engine.join(uid, profile);
}, false);
route('GET', '/markets', ({ engine, query }) =>
  engine.listMarkets({ status: query.get('status') ?? 'open', category: query.get('category'), search: query.get('q') }), false);
route('POST', '/markets', ({ engine, uid, body }) => engine.createMarket(uid, body));
route('GET', '/markets/:id', ({ engine, uid, id }) => engine.marketDetail(id, uid), false);
route('POST', '/markets/:id/orders', ({ engine, uid, id, body }) => engine.placeOrder(uid, id, body));
route('POST', '/markets/:id/propose', ({ engine, uid, id, body }) => engine.proposeResolution(uid, id, body.outcome, body.note));
route('POST', '/markets/:id/resolve', ({ engine, uid, id, body }) => engine.resolveMarket(uid, id, body.outcome));
route('POST', '/markets/:id/report', ({ engine, uid, id, body }) => engine.reportMarket(uid, id, body.reason));
route('DELETE', '/orders/:id', ({ engine, uid, id }) => engine.cancelOrder(uid, id));
route('GET', '/portfolio', ({ engine, uid }) => engine.portfolio(uid));
route('GET', '/admin/stats', ({ engine, uid }) => engine.stats(uid));

export async function handle(engine, { uid = null, profile = {} } = {}, { method, path, body } = {}) {
  const url = new URL(String(path ?? ''), 'http://crowdline');
  for (const r of routes) {
    const match = r.method === method && r.re.exec(url.pathname);
    if (!match) continue;
    if (r.auth && !uid) throw new ApiError(401, 'Sign in first');
    const data = body && typeof body === 'object' && !Array.isArray(body) ? body : {};
    return (await r.handler({ engine, uid, profile, body: data, query: url.searchParams, id: match[1] })) ?? {};
  }
  throw new ApiError(404, 'Not found');
}
