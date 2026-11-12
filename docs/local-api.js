// The server's HTTP API, answered in the browser by src/local-engine.js.
// Used by the static GitHub Pages build, where there is no server.
import { ApiError, CATEGORIES, FEE_BPS, createEngine } from './local-engine.js';

const STATE_KEY = 'crowdline:state';
const SESSION_KEY = 'crowdline:session';
const DAY = 86_400_000;

// Example markets with simulated traders, so a first visit has something to
// trade against. Each gets a short price history and resting bids both ways.
const EXAMPLES = [
  {
    question: 'Will the Fed cut interest rates at its next meeting?',
    description: 'Resolves YES if the Federal Reserve announces a cut to the federal funds target range at its next scheduled meeting. Resolves NO if it holds or raises. Source: the official FOMC statement.',
    category: 'Economics', days: 35, path: [38, 41, 44, 43, 47, 52, 55, 57],
  },
  {
    question: 'Will a crewed spacecraft land on the Moon before 2028?',
    description: 'Resolves YES if any crewed spacecraft lands on the lunar surface before January 1, 2028 (UTC), as confirmed by the operating space agency. Otherwise resolves NO.',
    category: 'Science', days: 400, path: [30, 28, 26, 27, 24, 22, 23, 21],
  },
  {
    question: 'Will Bitcoin trade above $150,000 on December 31?',
    description: 'Resolves YES if the BTC/USD price on Coinbase is above $150,000.00 at 23:59 UTC on December 31 of this year. Otherwise resolves NO.',
    category: 'Economics', days: 49, path: [22, 25, 31, 28, 33, 36, 34, 35],
  },
  {
    question: 'Will the top movie this weekend gross over $100M domestically?',
    description: 'Resolves YES if the number one film at the domestic (US and Canada) box office this weekend reports a Friday-to-Sunday gross above $100 million, per Box Office Mojo on Monday. Otherwise NO.',
    category: 'Culture', days: 4, path: [60, 58, 55, 51, 49, 46, 48, 45],
  },
  {
    question: 'Will the home team win Sunday’s league final?',
    description: 'Resolves YES if the home team wins the league final, including overtime, according to the league’s official results page. Resolves NO on a loss. A postponement past next week voids the market.',
    category: 'Sports', days: 3, path: [50, 54, 57, 61, 59, 63, 66, 64],
  },
  {
    question: 'Will a major phone maker ship a tri-fold phone this year?',
    description: 'Resolves YES if Apple, Samsung, Google or Huawei makes a phone that folds in two places available for retail purchase before December 31 of this year. Announcements without retail availability do not count.',
    category: 'Tech', days: 49, path: [70, 72, 75, 74, 78, 81, 80, 82],
  },
];
const TRADERS = ['maya_trades', 'ken_quant', 'pri_sharpe', 'dev_odds'];

export function seedExamples(engine, now = Date.now()) {
  const bots = TRADERS.map((name) => engine.createExampleUser(name));
  EXAMPLES.forEach((ex, i) => {
    const m = engine.createMarket(bots[i % bots.length].id, {
      question: ex.question, description: ex.description, category: ex.category,
      closesAt: now + ex.days * DAY,
    });
    ex.path.forEach((p, j) => {
      const qty = 20 + ((i * 7 + j * 13) % 60);
      engine.placeOrder(bots[j % 4].id, m.id, { side: 'yes', price: p, qty });
      engine.placeOrder(bots[(j + 1) % 4].id, m.id, { side: 'no', price: 100 - p, qty });
    });
    const last = ex.path.at(-1);
    engine.placeOrder(bots[0].id, m.id, { side: 'yes', price: last - 1, qty: 40 });
    engine.placeOrder(bots[1].id, m.id, { side: 'yes', price: last - 3, qty: 120 });
    engine.placeOrder(bots[2].id, m.id, { side: 'no', price: 100 - last - 1, qty: 35 });
    engine.placeOrder(bots[3].id, m.id, { side: 'no', price: 100 - last - 4, qty: 90 });
  });
}

export function createLocalApi({ storage = globalThis.localStorage, now } = {}) {
  let engine = createEngine({ storage, key: STATE_KEY, now });
  if (engine.isEmpty()) seedExamples(engine, now ? now() : Date.now());

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

  route('GET', '/config', () => ({ feeBps: FEE_BPS, categories: CATEGORIES, demo: true, local: true }));
  route('GET', '/me', ({ user }) => ({ user }));
  route('POST', '/register', async ({ body }) => {
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
    seedExamples(engine, now ? now() : Date.now());
    return {};
  });
  route('POST', '/faucet', ({ user }) => ({ user: engine.faucet(user.id) }), true);
  route('GET', '/markets', ({ query }) => ({
    markets: engine.listMarkets({ status: query.get('status') ?? 'open', category: query.get('category'), search: query.get('q') }),
  }));
  route('POST', '/markets', ({ user, body }) => ({ market: engine.createMarket(user.id, body) }), true);
  route('GET', '/markets/:id', ({ user, id }) => engine.marketDetail(id, user?.id));
  route('POST', '/markets/:id/orders', ({ user, id, body }) => engine.placeOrder(user.id, id, body), true);
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
