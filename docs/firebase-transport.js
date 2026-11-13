// Shared markets on Firebase's free plan: members sign in with Google through
// Firebase Authentication, and the page reads and writes Firestore directly.
// firestore.rules decides what each write may do, so balances stay honest.
import { CATEGORIES, FEE_BPS, ApiError, createFirestoreEngine } from './firestore-engine.js';
import { SITE_CONFIG } from './site-config.js';

const SDK = 'https://www.gstatic.com/firebasejs/10.12.2';

const ready = (async () => {
  const [{ initializeApp }, auth, firestore] = await Promise.all([
    import(`${SDK}/firebase-app.js`),
    import(`${SDK}/firebase-auth.js`),
    import(`${SDK}/firebase-firestore.js`),
  ]);
  const app = initializeApp(SITE_CONFIG.firebase);
  const session = auth.getAuth(app);
  await session.authStateReady();
  const engine = createFirestoreEngine({ sdk: firestore, db: firestore.getFirestore(app) });
  return { auth, session, engine };
})();
ready.catch(() => {});

async function loaded() {
  try {
    return await ready;
  } catch {
    throw new Error('Crowdline couldn’t load. If you use an ad or tracker blocker, allow gstatic.com and googleapis.com, then reload.');
  }
}

const routes = [];
const route = (method, pattern, handler, auth = true) =>
  routes.push({ method, re: new RegExp(`^${pattern.replace(':id', '([A-Za-z0-9_-]{1,64})')}$`), handler, auth });

route('GET', '/me', async ({ engine, uid, user }) => {
  if (!uid) return { user: null };
  const existing = await engine.me(uid);
  return existing ? { user: existing, isNew: false } : engine.join(uid, { name: user.displayName, email: user.email });
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

export async function request(method, path, body) {
  if (path === '/config') {
    return { feeBps: FEE_BPS, categories: CATEGORIES, signIn: 'firebase', shared: true, firebase: SITE_CONFIG.firebase, ads: SITE_CONFIG.ads };
  }
  const { auth, session, engine } = await loaded();
  if (path === '/firebase-signin') {
    // Errors keep Firebase's `code` (e.g. auth/popup-blocked) for the page to explain.
    await auth.signInWithPopup(session, new auth.GoogleAuthProvider());
    return request('GET', '/me');
  }
  if (path === '/logout') {
    await auth.signOut(session);
    return {};
  }
  const user = session.currentUser;
  const url = new URL(path, 'http://crowdline');
  for (const r of routes) {
    const match = r.method === method && r.re.exec(url.pathname);
    if (!match) continue;
    if (r.auth && !user) throw new Error('Sign in first');
    try {
      return (await r.handler({ engine, uid: user?.uid ?? null, user, body: body ?? {}, query: url.searchParams, id: match[1] })) ?? {};
    } catch (err) {
      if (err instanceof ApiError) throw err;
      console.error(err);
      if (err.code === 'permission-denied') throw new Error('That wasn’t allowed. Refresh the page and try again.');
      if (err.code === 'unavailable') throw new Error('Couldn’t reach Crowdline’s database. Check your connection and try again.');
      throw new Error('Something went wrong. Refresh the page and try again.');
    }
  }
  throw new Error('Not found');
}
