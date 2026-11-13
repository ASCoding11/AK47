// The server's HTTP API, answered in the browser by src/local-engine.js.
// Used by the static GitHub Pages build, where there is no server.
import { ApiError, CATEGORIES, createEngine } from './local-engine.js';
import { SITE_CONFIG, signInMode } from './site-config.js';

const STATE_KEY = 'crowdline:state';
const SESSION_KEY = 'crowdline:session';

// Reads the claims from a Google ID token without checking its signature:
// the static site has no server to do that. It still checks the token was
// issued for this site and hasn't expired.
function decodeGoogleToken(token, audience, issuer, nowMs) {
  try {
    const part = String(token).split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    const json = new TextDecoder().decode(Uint8Array.from(atob(part), (c) => c.charCodeAt(0)));
    const claims = JSON.parse(json);
    if (claims.aud === audience && (!issuer || claims.iss === issuer) && claims.exp * 1000 > nowMs && claims.sub) return claims;
  } catch {}
  throw new ApiError(401, 'Invalid Google sign-in');
}

export function createLocalApi({ storage = globalThis.localStorage, now, config = SITE_CONFIG } = {}) {
  let engine = createEngine({ storage, key: STATE_KEY, now });

  const token = () => {
    try {
      return storage.getItem(SESSION_KEY);
    } catch {
      return null;
    }
  };
  const setToken = (t) => {
    try {
      t ? storage.setItem(SESSION_KEY, t) : storage.removeItem(SESSION_KEY);
    } catch {}
  };

  const routes = [];
  const route = (method, pattern, handler, auth = false) =>
    routes.push({ method, re: new RegExp(`^${pattern.replace(/:id/g, '(\\d+)')}$`), handler, auth });

  const mode = signInMode(config);
  route('GET', '/config', () => ({
    categories: CATEGORIES, local: true, signIn: mode, googleClientId: config.googleClientId, firebase: config.firebase, ads: config.ads,
  }));
  route('POST', '/google', ({ body }) => {
    if (mode === 'password') throw new ApiError(400, 'Google sign-in is not set up on this site');
    const [audience, issuer] = mode === 'firebase'
      ? [config.firebase.projectId, `https://securetoken.google.com/${config.firebase.projectId}`]
      : [config.googleClientId, null];
    const claims = decodeGoogleToken(body.credential, audience, issuer, now ? now() : Date.now());
    const { user, token: t, isNew } = engine.googleSignIn(claims);
    setToken(t);
    return { user, isNew };
  });
  route('GET', '/me', ({ user }) => ({ user }));
  route('POST', '/register', async ({ body }) => {
    if (mode !== 'password') throw new ApiError(403, 'Sign in with Google to create an account');
    const { user, token: t } = await engine.register(body.username, body.password);
    setToken(t);
    return { user };
  });
  route('POST', '/login', async ({ body }) => {
    const { user, token: t } = await engine.login(body.username, body.password);
    setToken(t);
    return { user };
  });
  route('POST', '/logout', () => {
    engine.logout(token());
    setToken(null);
    return {};
  });
  route('POST', '/reset-demo', () => {
    try {
      storage.removeItem(STATE_KEY);
    } catch {}
    setToken(null);
    engine = createEngine({ storage, key: STATE_KEY, now });
    return {};
  });
  route('GET', '/markets', ({ query }) => ({
    markets: engine.listMarkets({ status: query.get('status') ?? 'open', category: query.get('category'), search: query.get('q') }),
  }));
  route('POST', '/markets', ({ user, body }) => ({ market: engine.createMarket(user.id, body) }), true);
  route('GET', '/markets/:id', ({ user, id }) => engine.marketDetail(id, user?.id));
  route('POST', '/markets/:id/orders', ({ user, id, body }) => engine.placeOrder(user.id, id, body), true);
  route('POST', '/markets/:id/propose', ({ user, id, body }) => engine.proposeResolution(user.id, id, body.outcome, body.note), true);
  route('POST', '/markets/:id/report', ({ user, id, body }) => engine.reportMarket(user.id, id, body.reason) ?? {}, true);
  route('POST', '/markets/:id/resolve', ({ user, id, body }) => engine.resolveMarket(user.id, id, body.outcome), true);
  route('DELETE', '/orders/:id', ({ user, id }) => engine.cancelOrder(user.id, id) ?? {}, true);
  route('GET', '/portfolio', ({ user }) => engine.portfolio(user.id), true);
  route('GET', '/admin/stats', ({ user }) => {
    if (!user.isAdmin) throw new ApiError(403, 'Admins only');
    return engine.stats();
  }, true);

  // Same contract as fetching /api<path>: resolves the JSON body, or rejects
  // with an Error carrying the message the server would have sent.
  async function request(method, path, body) {
    const url = new URL(path, 'http://local');
    for (const r of routes) {
      const match = r.method === method && r.re.exec(url.pathname);
      if (!match) continue;
      const user = engine.userForToken(token());
      if (r.auth && !user) throw new ApiError(401, 'Log in first');
      return (await r.handler({ user, body: body ?? {}, query: url.searchParams, id: Number(match[1]) })) ?? {};
    }
    throw new ApiError(404, 'Not found');
  }

  return { request };
}
