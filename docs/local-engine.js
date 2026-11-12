// Browser-only exchange engine for the static (GitHub Pages) build.
//
// Same rules and messages as src/engine.js, but state lives in one JSON
// object persisted to a Storage (localStorage in the browser), so it needs no
// server. Every visitor gets their own private exchange.
//
// Money model (all amounts are integer cents):
//   * Every contract pays 100 to the winning side, 0 to the other.
//   * A trade only happens when a YES buyer and a NO buyer agree on prices that
//     sum to 100, and both pay up front, so every contract is fully funded.
//     The platform never takes a position.
//   * At settlement the platform keeps FEE_BPS of each user's net profit.

export const FEE_BPS = 1000; // 10% of profit
export const CATEGORIES = ['Politics', 'Sports', 'Economics', 'Tech', 'Culture', 'Science', 'Other'];
const SIGNUP_BONUS = 100_000;
const FAUCET_AMOUNT = 50_000;
const MAX_QTY = 100_000;

export class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export function feeOn(profit) {
  return profit > 0 ? Math.floor((profit * FEE_BPS) / 10_000) : 0;
}

export function memoryStorage() {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
  };
}

const hex = (bytes) => Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
const randomHex = (n) => hex(crypto.getRandomValues(new Uint8Array(n)));

async function pbkdf2(password, saltHex) {
  const salt = new Uint8Array(saltHex.match(/../g).map((h) => parseInt(h, 16)));
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: 100_000 }, key, 256);
  return hex(new Uint8Array(bits));
}

function freshState() {
  return {
    ids: { user: 0, market: 0, order: 0, trade: 0 },
    users: [],
    sessions: {},
    markets: [],
    orders: [],
    trades: [],
    positions: {},
    ledger: [],
  };
}

export function createEngine({ storage = memoryStorage(), key = 'crowdline:state', demo = true, now = () => Date.now() } = {}) {
  let s = load();

  function load() {
    try {
      const raw = storage.getItem(key);
      if (raw) return JSON.parse(raw);
    } catch {}
    return freshState();
  }

  function save() {
    try {
      storage.setItem(key, JSON.stringify(s));
    } catch {}
  }

  // All-or-nothing: on any error the state rolls back to before the call.
  function tx(fn) {
    const backup = JSON.stringify(s);
    try {
      const result = fn();
      save();
      return result;
    } catch (err) {
      s = JSON.parse(backup);
      throw err;
    }
  }

  const nextId = (table) => ++s.ids[table];
  const userRow = (id) => s.users.find((u) => u.id === id);
  const marketRow = (id) => s.markets.find((m) => m.id === id);

  function adjust(userId, amount, type, marketId = null) {
    if (amount === 0) return;
    const u = userRow(userId);
    u.balance += amount;
    if (u.balance < 0) throw new ApiError(400, 'Not enough balance');
    s.ledger.push({ id: s.ledger.length + 1, user_id: userId, market_id: marketId, type, amount, created_at: now() });
  }

  // ---------- accounts ----------

  function publicUser(u) {
    return u && { id: u.id, username: u.username, balance: u.balance, isAdmin: !!u.is_admin };
  }

  function findByName(username) {
    const lower = username.toLowerCase();
    return s.users.find((u) => u.username.toLowerCase() === lower);
  }

  async function register(username, password) {
    username = String(username ?? '').trim();
    password = String(password ?? '');
    if (!/^[A-Za-z0-9_]{3,20}$/.test(username)) {
      throw new ApiError(400, 'Username must be 3-20 letters, numbers or underscores');
    }
    if (password.length < 8 || password.length > 200) {
      throw new ApiError(400, 'Password must be at least 8 characters');
    }
    if (findByName(username)) throw new ApiError(409, 'That username is taken');
    const salt = randomHex(16);
    const hash = await pbkdf2(password, salt);
    return tx(() => {
      if (findByName(username)) throw new ApiError(409, 'That username is taken');
      // The first real (non-example) account becomes the admin.
      const first = !s.users.some((u) => !u.example);
      const u = { id: nextId('user'), username, pw: `${salt}:${hash}`, balance: 0, is_admin: first, example: false, created_at: now() };
      s.users.push(u);
      if (demo) adjust(u.id, SIGNUP_BONUS, 'deposit');
      return { user: publicUser(u), token: newSession(u.id) };
    });
  }

  // Simulated traders that make the demo feel alive. They have no password.
  function createExampleUser(username) {
    return tx(() => {
      const u = { id: nextId('user'), username, pw: null, balance: 0, is_admin: false, example: true, created_at: now() };
      s.users.push(u);
      adjust(u.id, SIGNUP_BONUS * 10, 'deposit');
      return publicUser(u);
    });
  }

  async function login(username, password) {
    const u = findByName(String(username ?? '').trim());
    const [salt, hash] = u?.pw?.split(':') ?? [];
    if (!u || !salt || (await pbkdf2(String(password ?? ''), salt)) !== hash) {
      throw new ApiError(401, 'Wrong username or password');
    }
    return tx(() => ({ user: publicUser(u), token: newSession(u.id) }));
  }

  function newSession(userId) {
    const token = randomHex(32);
    s.sessions[token] = userId;
    return token;
  }

  function logout(token) {
    tx(() => {
      delete s.sessions[token];
    });
  }

  function userForToken(token) {
    return token && s.sessions[token] ? publicUser(userRow(s.sessions[token])) : null;
  }

  function getUser(id) {
    return publicUser(userRow(id));
  }

  function faucet(userId) {
    if (!demo) throw new ApiError(403, 'Demo credits are disabled');
    return tx(() => {
      adjust(userId, FAUCET_AMOUNT, 'deposit');
      return getUser(userId);
    });
  }

  // ---------- markets ----------

  function marketView(m) {
    const closed = m.status === 'open' && m.closes_at <= now();
    return {
      id: m.id,
      question: m.question,
      description: m.description,
      category: m.category,
      creator: userRow(m.creator_id).username,
      closesAt: m.closes_at,
      status: closed ? 'closed' : m.status,
      outcome: m.outcome,
      lastPrice: m.last_price,
      volume: m.volume,
      createdAt: m.created_at,
      resolvedAt: m.resolved_at,
    };
  }

  function createMarket(userId, { question, description, category, closesAt } = {}) {
    question = String(question ?? '').trim();
    description = String(description ?? '').trim();
    closesAt = Number(closesAt);
    if (question.length < 10 || question.length > 200) {
      throw new ApiError(400, 'Question must be 10-200 characters');
    }
    if (description.length < 20 || description.length > 2000) {
      throw new ApiError(400, 'Describe how the market resolves (20-2000 characters)');
    }
    if (!CATEGORIES.includes(category)) throw new ApiError(400, 'Pick a category');
    const t = now();
    if (!Number.isFinite(closesAt) || closesAt < t + 5 * 60_000) {
      throw new ApiError(400, 'Trading must close at least 5 minutes from now');
    }
    if (closesAt > t + 3 * 365 * 86_400_000) {
      throw new ApiError(400, 'Close date is too far in the future');
    }
    return tx(() => {
      const m = {
        id: nextId('market'), creator_id: userId, question, description, category,
        closes_at: closesAt, status: 'open', outcome: null, last_price: null, volume: 0,
        created_at: t, resolved_at: null,
      };
      s.markets.push(m);
      return marketView(m);
    });
  }

  function getMarket(id) {
    const m = marketRow(id);
    if (!m) throw new ApiError(404, 'Market not found');
    return marketView(m);
  }

  const openOrders = (marketId, side) =>
    s.orders.filter((o) => o.market_id === marketId && o.status === 'open' && (!side || o.side === side));
  const bestBid = (marketId, side) => {
    const prices = openOrders(marketId, side).map((o) => o.price);
    return prices.length ? Math.max(...prices) : null;
  };

  function listMarkets({ status = 'open', category, search } = {}) {
    const t = now();
    const needle = search ? String(search).slice(0, 100).toLowerCase() : '';
    return s.markets
      .filter((m) => {
        if (status === 'open' && !(m.status === 'open' && m.closes_at > t)) return false;
        if (status === 'closed' && !(m.status === 'open' && m.closes_at <= t)) return false;
        if (status === 'settled' && m.status === 'open') return false;
        if (category && CATEGORIES.includes(category) && m.category !== category) return false;
        if (needle && !m.question.toLowerCase().includes(needle)) return false;
        return true;
      })
      .sort((a, b) => b.volume - a.volume || b.id - a.id)
      .slice(0, 200)
      .map((m) => {
        const v = marketView(m);
        const noBid = bestBid(m.id, 'no');
        v.yesBid = bestBid(m.id, 'yes');
        v.yesAsk = noBid == null ? null : 100 - noBid;
        return v;
      });
  }

  function positionView(p) {
    return p && { yesQty: p.yes_qty, noQty: p.no_qty, yesCost: p.yes_cost, noCost: p.no_cost, payout: p.payout, fee: p.fee };
  }

  function marketDetail(id, userId) {
    const market = getMarket(id);
    const level = (side) => {
      const byPrice = new Map();
      for (const o of openOrders(id, side)) byPrice.set(o.price, (byPrice.get(o.price) ?? 0) + o.remaining);
      return [...byPrice].map(([price, qty]) => ({ price, qty })).sort((a, b) => b.price - a.price).slice(0, 15);
    };
    const trades = s.trades
      .filter((t) => t.market_id === id)
      .reverse()
      .slice(0, 200)
      .map((t) => ({ yesPrice: t.yes_price, qty: t.qty, at: t.created_at }));
    const detail = { market, book: { yes: level('yes'), no: level('no') }, trades };
    if (userId) {
      detail.position = positionView(s.positions[`${id}:${userId}`]);
      detail.orders = openOrders(id)
        .filter((o) => o.user_id === userId)
        .reverse()
        .map(({ id: oid, side, price, qty, remaining }) => ({ id: oid, side, price, qty, remaining }));
    }
    return detail;
  }

  // ---------- trading ----------

  function addPosition(marketId, userId, side, qty, cost) {
    const k = `${marketId}:${userId}`;
    const p = (s.positions[k] ??= { market_id: marketId, user_id: userId, yes_qty: 0, no_qty: 0, yes_cost: 0, no_cost: 0, payout: null, fee: null });
    p[`${side}_qty`] += qty;
    p[`${side}_cost`] += cost;
  }

  function cancelRow(order) {
    order.status = 'cancelled';
    adjust(order.user_id, order.remaining * order.price, 'order_refund', order.market_id);
  }

  function placeOrder(userId, marketId, { side, price, qty } = {}) {
    price = Number(price);
    qty = Number(qty);
    if (side !== 'yes' && side !== 'no') throw new ApiError(400, 'Side must be yes or no');
    if (!Number.isInteger(price) || price < 1 || price > 99) {
      throw new ApiError(400, 'Price must be a whole number of cents from 1 to 99');
    }
    if (!Number.isInteger(qty) || qty < 1 || qty > MAX_QTY) {
      throw new ApiError(400, `Quantity must be a whole number from 1 to ${MAX_QTY}`);
    }
    return tx(() => {
      const market = getMarket(marketId);
      if (market.status !== 'open') throw new ApiError(400, 'This market is closed for trading');
      if (getUser(userId).balance < price * qty) throw new ApiError(400, 'Not enough balance');
      adjust(userId, -price * qty, 'order_reserve', marketId);

      const opposite = side === 'yes' ? 'no' : 'yes';
      const m = marketRow(marketId);
      let remaining = qty;
      let filled = 0;
      while (remaining > 0) {
        // Best price first, then oldest first.
        const resting = openOrders(marketId, opposite)
          .filter((o) => o.price >= 100 - price)
          .sort((a, b) => b.price - a.price || a.id - b.id)[0];
        if (!resting) break;
        if (resting.user_id === userId) {
          cancelRow(resting); // never match a user against themselves
          continue;
        }
        const fill = Math.min(remaining, resting.remaining);
        const takerPrice = 100 - resting.price;
        adjust(userId, (price - takerPrice) * fill, 'price_improvement', marketId);
        addPosition(marketId, userId, side, fill, takerPrice * fill);
        addPosition(marketId, resting.user_id, opposite, fill, resting.price * fill);
        resting.remaining -= fill;
        if (resting.remaining === 0) resting.status = 'filled';
        const yesPrice = side === 'yes' ? takerPrice : resting.price;
        s.trades.push({
          id: nextId('trade'), market_id: marketId,
          yes_user: side === 'yes' ? userId : resting.user_id,
          no_user: side === 'yes' ? resting.user_id : userId,
          yes_price: yesPrice, qty: fill, created_at: now(),
        });
        m.volume += fill;
        m.last_price = yesPrice;
        remaining -= fill;
        filled += fill;
      }
      const order = {
        id: nextId('order'), market_id: marketId, user_id: userId, side, price, qty, remaining,
        status: remaining ? 'open' : 'filled', created_at: now(),
      };
      s.orders.push(order);
      return { orderId: order.id, filled, resting: remaining };
    });
  }

  function cancelOrder(userId, orderId) {
    return tx(() => {
      const order = s.orders.find((o) => o.id === orderId);
      if (!order || order.user_id !== userId) throw new ApiError(404, 'Order not found');
      if (order.status !== 'open') throw new ApiError(400, 'Order is no longer open');
      cancelRow(order);
    });
  }

  // ---------- settlement ----------

  function resolveMarket(adminId, marketId, outcome) {
    if (!['yes', 'no', 'void'].includes(outcome)) throw new ApiError(400, 'Invalid outcome');
    return tx(() => {
      if (!getUser(adminId)?.isAdmin) throw new ApiError(403, 'Only an admin can resolve markets');
      const m = marketRow(marketId);
      if (!m) throw new ApiError(404, 'Market not found');
      if (m.status !== 'open') throw new ApiError(400, 'Market is already settled');

      for (const order of openOrders(marketId)) cancelRow(order);
      let fees = 0;
      for (const p of Object.values(s.positions).filter((p) => p.market_id === marketId)) {
        const cost = p.yes_cost + p.no_cost;
        const payout = outcome === 'void' ? cost : 100 * (outcome === 'yes' ? p.yes_qty : p.no_qty);
        const fee = feeOn(payout - cost);
        adjust(p.user_id, payout - fee, outcome === 'void' ? 'void_refund' : 'payout', marketId);
        p.payout = payout;
        p.fee = fee;
        fees += fee;
      }
      if (fees > 0) {
        s.ledger.push({ id: s.ledger.length + 1, user_id: null, market_id: marketId, type: 'fee', amount: fees, created_at: now() });
      }
      m.status = outcome === 'void' ? 'voided' : 'resolved';
      m.outcome = outcome === 'void' ? null : outcome;
      m.resolved_at = now();
      return { market: marketView(m), fees };
    });
  }

  // ---------- reporting ----------

  function portfolio(userId) {
    const positions = Object.values(s.positions)
      .filter((p) => p.user_id === userId)
      .sort((a, b) => b.market_id - a.market_id)
      .map((p) => ({ market: marketView(marketRow(p.market_id)), position: positionView(p) }));
    const orders = s.orders
      .filter((o) => o.user_id === userId && o.status === 'open')
      .reverse()
      .map((o) => ({
        id: o.id, marketId: o.market_id, question: marketRow(o.market_id).question,
        side: o.side, price: o.price, qty: o.qty, remaining: o.remaining,
      }));
    const ledger = s.ledger
      .filter((l) => l.user_id === userId)
      .reverse()
      .slice(0, 100)
      .map((l) => ({ type: l.type, amount: l.amount, at: l.created_at, marketId: l.market_id, question: l.market_id ? marketRow(l.market_id).question : null }));
    return { positions, orders, ledger };
  }

  function stats() {
    const sum = (rows, f) => rows.reduce((n, r) => n + f(r), 0);
    const openMarkets = new Set(s.markets.filter((m) => m.status === 'open').map((m) => m.id));
    const st = {
      deposits: sum(s.ledger.filter((l) => l.type === 'deposit'), (l) => l.amount),
      userBalances: sum(s.users, (u) => u.balance),
      orderEscrow: sum(s.orders.filter((o) => o.status === 'open'), (o) => o.remaining * o.price),
      positionEscrow: sum(Object.values(s.positions).filter((p) => openMarkets.has(p.market_id)), (p) => p.yes_cost + p.no_cost),
      feeRevenue: sum(s.ledger.filter((l) => l.type === 'fee'), (l) => l.amount),
      users: s.users.length,
      markets: s.markets.length,
      contractsTraded: sum(s.markets, (m) => m.volume),
    };
    st.balanced = st.deposits === st.userBalances + st.orderEscrow + st.positionEscrow + st.feeRevenue;
    st.awaitingResolution = s.markets
      .filter((m) => m.status === 'open' && m.closes_at <= now())
      .sort((a, b) => a.closes_at - b.closes_at)
      .map(marketView);
    st.feesByMarket = s.ledger
      .filter((l) => l.type === 'fee')
      .reverse()
      .slice(0, 50)
      .map((l) => ({ marketId: l.market_id, question: marketRow(l.market_id).question, amount: l.amount }));
    return st;
  }

  function isEmpty() {
    return s.users.length === 0 && s.markets.length === 0;
  }

  return {
    demo, register, login, logout, userForToken, getUser, faucet, createExampleUser,
    createMarket, getMarket, listMarkets, marketDetail,
    placeOrder, cancelOrder, resolveMarket, portfolio, stats, isEmpty,
  };
}
