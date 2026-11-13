// Crowdline's shared exchange, stored in Firestore and run inside Cloud
// Functions so nobody can edit their own balance.
//
// Same rules as src/engine.js (the Node server) and src/local-engine.js (the
// browser-only build):
//   * Balances are Avenues, play money, in hundredths: 100 units = 1 Avenue.
//   * Every contract pays 100 units to the winning side. A YES bet and a NO bet
//     are matched when their prices add up to at least 100; both pay up front,
//     so every contract is fully funded. Crowdline never takes a side.
//   * Creators report results with a source; an admin verifies before payout.
//   * At settlement Crowdline keeps FEE_BPS of each member's net winnings.
//
// Storage goes through a small `db` interface (see store-firestore.js) so the
// engine can be tested against an in-memory copy. Firestore transactions must
// do every read before any write; the code below is ordered accordingly.
//
// Firestore layout:
//   users/{uid}                     username, balance, isAdmin, createdAt
//   users/{uid}/ledger/{id}         type, amount, marketId, question, at
//   usernames/{lowercase}           uid (keeps usernames unique)
//   meta/stats                      deposits, fees, users, nextMarketId
//   markets/{id}                    the market, plus bestYes/bestNo for listings
//   markets/{id}/trades/{id}        yesPrice, qty, at
//   orders/{id}                     marketId, uid, side, price, qty, remaining, status
//   positions/{marketId}_{uid}      yesQty, noQty, yesCost, noCost, settled, payout, fee
//   reports/{marketId}_{uid}        reporter, reason, at

export const FEE_BPS = 1000; // 10% of winnings
export const WELCOME_BONUS = 100_000; // 1,000 Avenues, once per account
export const CATEGORIES = ['Politics', 'Sports', 'Economics', 'Tech', 'Culture', 'Science', 'Other'];
const MAX_QTY = 100_000;
const MAX_FILLS = 120; // keeps one bet inside Firestore's 500-writes-per-transaction limit
const BATCH = 120; // documents per settlement batch (3 writes each)
const OUTCOMES = ['yes', 'no', 'void'];

export class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export function feeOn(profit) {
  return profit > 0 ? Math.floor((profit * FEE_BPS) / 10_000) : 0;
}

const byPriceThenAge = (a, b) => b.price - a.price || a.createdAt - b.createdAt || (a.id < b.id ? -1 : 1);

export function createEngine(db, { now = () => Date.now() } = {}) {
  const ledger = (w, uid, type, amount, marketId = null, question = null) => {
    if (amount === 0) return;
    w.set(`users/${uid}/ledger/${db.newId(`users/${uid}/ledger`)}`, { type, amount, marketId, question, at: now() });
  };

  // ---------- accounts ----------

  const publicUser = (uid, u) => u && { id: uid, username: u.username, balance: u.balance, isAdmin: !!u.isAdmin };

  async function me(uid) {
    return publicUser(uid, await db.get(`users/${uid}`));
  }

  // First visit after signing in: create the member with WELCOME_BONUS, once.
  async function join(uid, { name, email } = {}) {
    return db.tx(async (t) => {
      const existing = await t.get(`users/${uid}`);
      if (existing) return { user: publicUser(uid, existing), isNew: false };
      const stats = (await t.get('meta/stats')) ?? {};
      let base = String(name || String(email ?? '').split('@')[0]).normalize('NFKD')
        .replace(/[^A-Za-z0-9_]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 16);
      if (base.length < 3) base = `member${base}`;
      let username = base;
      for (let i = 2; await t.get(`usernames/${username.toLowerCase()}`); i++) username = `${base}${i}`;
      const user = { username, balance: WELCOME_BONUS, isAdmin: !(stats.users > 0), createdAt: now() };
      t.set(`users/${uid}`, user);
      t.set(`usernames/${username.toLowerCase()}`, { uid });
      ledger(t, uid, 'deposit', WELCOME_BONUS);
      t.set('meta/stats', { users: db.inc(1), deposits: db.inc(WELCOME_BONUS) }, { merge: true });
      return { user: publicUser(uid, user), isNew: true };
    });
  }

  async function requireUser(t, uid) {
    const u = await t.get(`users/${uid}`);
    if (!u) throw new ApiError(401, 'Sign in first');
    return u;
  }

  // ---------- markets ----------

  function marketView(m) {
    const status = m.status === 'open' && m.closesAt <= now() ? 'closed'
      : m.status === 'settling' ? 'proposed' : m.status;
    return {
      id: m.id,
      question: m.question,
      description: m.description,
      category: m.category,
      creator: m.creator,
      creatorId: m.creatorId,
      closesAt: m.closesAt,
      status,
      outcome: m.outcome ?? null,
      lastPrice: m.lastPrice ?? null,
      volume: m.volume ?? 0,
      createdAt: m.createdAt,
      resolvedAt: m.resolvedAt ?? null,
      proposedOutcome: m.proposedOutcome ?? null,
      reportedAt: m.reportedAt ?? null,
      reportNote: m.reportNote ?? null,
    };
  }

  async function createMarket(uid, { question, description, category, closesAt } = {}) {
    question = String(question ?? '').trim();
    description = String(description ?? '').trim();
    closesAt = Number(closesAt);
    if (question.length < 10 || question.length > 200) throw new ApiError(400, 'Question must be 10-200 characters');
    if (description.length < 20 || description.length > 2000) {
      throw new ApiError(400, 'Describe how the market resolves (20-2000 characters)');
    }
    if (!CATEGORIES.includes(category)) throw new ApiError(400, 'Pick a category');
    const t0 = now();
    if (!Number.isFinite(closesAt) || closesAt < t0 + 5 * 60_000) {
      throw new ApiError(400, 'Trading must close at least 5 minutes from now');
    }
    if (closesAt > t0 + 3 * 365 * 86_400_000) throw new ApiError(400, 'Close date is too far in the future');
    return db.tx(async (t) => {
      const user = await requireUser(t, uid);
      const stats = (await t.get('meta/stats')) ?? {};
      const id = (stats.nextMarketId ?? 0) + 1;
      const m = {
        id, creatorId: uid, creator: user.username, question, description, category, closesAt,
        status: 'open', outcome: null, lastPrice: null, volume: 0, bestYes: null, bestNo: null,
        createdAt: t0, resolvedAt: null, feesCollected: 0,
      };
      t.set(`markets/${id}`, m);
      t.set('meta/stats', { nextMarketId: id }, { merge: true });
      return { market: marketView(m) };
    });
  }

  async function getMarketDoc(id) {
    const m = await db.get(`markets/${Number(id)}`);
    if (!m) throw new ApiError(404, 'Market not found');
    return m;
  }

  async function listMarkets({ status = 'open', category, search } = {}) {
    const t0 = now();
    let rows;
    if (status === 'settled') rows = await db.query('markets', [['status', 'in', ['resolved', 'voided']]]);
    else if (status === 'closed') rows = await db.query('markets', [['status', 'in', ['open', 'proposed', 'settling']]]);
    else rows = await db.query('markets', [['status', '==', 'open']]);
    const needle = search ? String(search).slice(0, 100).toLowerCase() : '';
    return {
      markets: rows
        .map((r) => r.data)
        .filter((m) => (status === 'open' ? m.closesAt > t0 : status === 'closed' ? m.status !== 'open' || m.closesAt <= t0 : true))
        .filter((m) => !(category && CATEGORIES.includes(category)) || m.category === category)
        .filter((m) => !needle || m.question.toLowerCase().includes(needle))
        .sort((a, b) => b.volume - a.volume || b.id - a.id)
        .slice(0, 200)
        .map((m) => ({ ...marketView(m), yesBid: m.bestYes ?? null, yesAsk: m.bestNo == null ? null : 100 - m.bestNo })),
    };
  }

  const positionView = (p) => p && {
    yesQty: p.yesQty ?? 0, noQty: p.noQty ?? 0, yesCost: p.yesCost ?? 0, noCost: p.noCost ?? 0,
    payout: p.settled ? p.payout : null, fee: p.settled ? p.fee : null,
  };

  async function marketDetail(id, uid) {
    const m = await getMarketDoc(id);
    const [orders, trades] = await Promise.all([
      db.query('orders', [['marketId', '==', m.id], ['status', '==', 'open']]),
      db.query(`markets/${m.id}/trades`, [], { orderBy: ['at', 'desc'], limit: 200 }),
    ]);
    const level = (side) => {
      const byPrice = new Map();
      for (const { data: o } of orders) if (o.side === side) byPrice.set(o.price, (byPrice.get(o.price) ?? 0) + o.remaining);
      return [...byPrice].map(([price, qty]) => ({ price, qty })).sort((a, b) => b.price - a.price).slice(0, 15);
    };
    const detail = {
      market: marketView(m),
      book: { yes: level('yes'), no: level('no') },
      trades: trades.map(({ data: t }) => ({ yesPrice: t.yesPrice, qty: t.qty, at: t.at })),
    };
    if (uid) {
      detail.position = positionView(await db.get(`positions/${m.id}_${uid}`));
      detail.orders = orders
        .filter(({ data: o }) => o.uid === uid)
        .sort((a, b) => b.data.createdAt - a.data.createdAt)
        .map(({ id: oid, data: o }) => ({ id: oid, side: o.side, price: o.price, qty: o.qty, remaining: o.remaining }));
    }
    return detail;
  }

  // ---------- betting ----------

  // Buy `qty` contracts of `side` at up to `price` (1-99) each. The full cost
  // leaves the balance now; whatever can't be matched waits for a match.
  async function placeOrder(uid, marketId, { side, price, qty } = {}) {
    price = Number(price);
    qty = Number(qty);
    if (side !== 'yes' && side !== 'no') throw new ApiError(400, 'Side must be yes or no');
    if (!Number.isInteger(price) || price < 1 || price > 99) {
      throw new ApiError(400, 'Price must be a whole number of cents from 1 to 99');
    }
    if (!Number.isInteger(qty) || qty < 1 || qty > MAX_QTY) {
      throw new ApiError(400, `Quantity must be a whole number from 1 to ${MAX_QTY}`);
    }
    const id = Number(marketId);
    const opposite = side === 'yes' ? 'no' : 'yes';
    return db.tx(async (t) => {
      // Reads
      const m = await t.get(`markets/${id}`);
      if (!m) throw new ApiError(404, 'Market not found');
      if (m.status !== 'open' || m.closesAt <= now()) throw new ApiError(400, 'This market is closed for trading');
      const user = await requireUser(t, uid);
      const cost = price * qty;
      if (user.balance < cost) throw new ApiError(400, 'Not enough balance');
      const book = (await t.query('orders', [['marketId', '==', id], ['side', '==', opposite], ['status', '==', 'open']]))
        .map(({ id: oid, data }) => ({ id: oid, ...data }))
        .sort(byPriceThenAge);

      // Plan the matches in memory
      let balance = user.balance - cost;
      let refund = 0;
      let improvement = 0;
      let remaining = qty;
      let filled = 0;
      let takerCost = 0;
      let lastYesPrice = m.lastPrice ?? null;
      const touched = [];
      const fills = [];
      for (const o of book) {
        if (remaining === 0 || fills.length >= MAX_FILLS || o.price < 100 - price) break;
        if (o.uid === uid) {
          // Never match a member against themselves: pull their older bet.
          refund += o.remaining * o.price;
          o.remaining = 0;
          o.status = 'cancelled';
          touched.push(o);
          continue;
        }
        const fill = Math.min(remaining, o.remaining);
        const takerPrice = 100 - o.price; // the waiting bet gets its price
        improvement += (price - takerPrice) * fill;
        takerCost += takerPrice * fill;
        o.remaining -= fill;
        o.status = o.remaining === 0 ? 'filled' : 'open';
        touched.push(o);
        lastYesPrice = side === 'yes' ? takerPrice : o.price;
        fills.push({ maker: o, fill, yesPrice: lastYesPrice });
        remaining -= fill;
        filled += fill;
      }
      balance += refund + improvement;
      const stillOpen = book.filter((o) => o.status === 'open' && o.remaining > 0);
      const bestOpposite = stillOpen.length ? Math.max(...stillOpen.map((o) => o.price)) : null;
      const bestSame = remaining > 0 ? Math.max(m[side === 'yes' ? 'bestYes' : 'bestNo'] ?? 0, price) : m[side === 'yes' ? 'bestYes' : 'bestNo'] ?? null;

      // Writes
      t.update(`users/${uid}`, { balance });
      ledger(t, uid, 'order_reserve', -cost, id, m.question);
      ledger(t, uid, 'order_refund', refund, id, m.question);
      ledger(t, uid, 'price_improvement', improvement, id, m.question);
      for (const o of touched) t.update(`orders/${o.id}`, { remaining: o.remaining, status: o.status });
      for (const { maker, fill, yesPrice } of fills) {
        t.set(`positions/${id}_${maker.uid}`, {
          marketId: id, uid: maker.uid, settled: false,
          [`${opposite}Qty`]: db.inc(fill), [`${opposite}Cost`]: db.inc(maker.price * fill),
        }, { merge: true });
        t.set(`markets/${id}/trades/${db.newId(`markets/${id}/trades`)}`, { yesPrice, qty: fill, at: now() });
      }
      if (filled > 0) {
        t.set(`positions/${id}_${uid}`, {
          marketId: id, uid, settled: false, [`${side}Qty`]: db.inc(filled), [`${side}Cost`]: db.inc(takerCost),
        }, { merge: true });
      }
      const orderId = db.newId('orders');
      t.set(`orders/${orderId}`, {
        marketId: id, uid, side, price, qty, remaining, status: remaining ? 'open' : 'filled', createdAt: now(),
      });
      t.update(`markets/${id}`, {
        volume: db.inc(filled),
        lastPrice: lastYesPrice,
        [side === 'yes' ? 'bestYes' : 'bestNo']: bestSame,
        [side === 'yes' ? 'bestNo' : 'bestYes']: bestOpposite,
      });
      return { orderId, filled, resting: remaining };
    });
  }

  async function cancelOrder(uid, orderId) {
    return db.tx(async (t) => {
      const o = await t.get(`orders/${orderId}`);
      if (!o || o.uid !== uid) throw new ApiError(404, 'Order not found');
      if (o.status !== 'open') throw new ApiError(400, 'Order is no longer open');
      const m = await t.get(`markets/${o.marketId}`);
      const sameSide = await t.query('orders', [['marketId', '==', o.marketId], ['side', '==', o.side], ['status', '==', 'open']]);
      const others = sameSide.filter((r) => r.id !== orderId).map((r) => r.data.price);
      t.update(`orders/${orderId}`, { status: 'cancelled', remaining: 0 });
      t.update(`users/${uid}`, { balance: db.inc(o.remaining * o.price) });
      ledger(t, uid, 'order_refund', o.remaining * o.price, o.marketId, m?.question ?? null);
      if (m?.status === 'open') {
        t.update(`markets/${o.marketId}`, { [o.side === 'yes' ? 'bestYes' : 'bestNo']: others.length ? Math.max(...others) : null });
      }
      return {};
    });
  }

  // Refunds every open bet in a market, in batches. Safe to repeat.
  async function refundOpenOrders(marketId, question) {
    for (;;) {
      const open = await db.query('orders', [['marketId', '==', marketId], ['status', '==', 'open']], { limit: BATCH });
      if (!open.length) return;
      await db.batch(async (w) => {
        for (const { id: oid, data: o } of open) {
          w.update(`orders/${oid}`, { status: 'cancelled', remaining: 0 });
          w.update(`users/${o.uid}`, { balance: db.inc(o.remaining * o.price) });
          ledger(w, o.uid, 'order_refund', o.remaining * o.price, marketId, question);
        }
      });
    }
  }

  // ---------- results ----------

  // The creator reports what happened, with a source. Trading stops and bets
  // waiting for a match are refunded; nothing pays out until an admin verifies.
  async function proposeResolution(uid, marketId, outcome, note) {
    if (!OUTCOMES.includes(outcome)) throw new ApiError(400, 'Invalid outcome');
    note = String(note ?? '').trim();
    if (note.length < 5 || note.length > 1000) throw new ApiError(400, 'Add the source for the result (5-1000 characters)');
    const id = Number(marketId);
    const m = await db.tx(async (t) => {
      const doc = await t.get(`markets/${id}`);
      if (!doc) throw new ApiError(404, 'Market not found');
      if (doc.creatorId !== uid) throw new ApiError(403, 'Only the market’s creator can report the result');
      if (doc.status !== 'open') throw new ApiError(400, 'A result has already been reported');
      const update = { status: 'proposed', proposedOutcome: outcome, reportedAt: now(), reportNote: note, bestYes: null, bestNo: null };
      t.update(`markets/${id}`, update);
      return { ...doc, ...update };
    });
    await refundOpenOrders(id, m.question);
    return { market: marketView(m) };
  }

  // Admin verification: the only way a market pays out. Marks the market as
  // settling first, then pays positions in batches, so a retry after a crash
  // finishes the job without paying anyone twice.
  async function resolveMarket(adminUid, marketId, outcome) {
    if (!OUTCOMES.includes(outcome)) throw new ApiError(400, 'Invalid outcome');
    const id = Number(marketId);
    const m = await db.tx(async (t) => {
      const admin = await t.get(`users/${adminUid}`);
      if (!admin?.isAdmin) throw new ApiError(403, 'Only an admin can resolve markets');
      const doc = await t.get(`markets/${id}`);
      if (!doc) throw new ApiError(404, 'Market not found');
      if (doc.status === 'resolved' || doc.status === 'voided') throw new ApiError(400, 'Market is already settled');
      const settlingOutcome = doc.status === 'settling' ? doc.settlingOutcome : outcome;
      t.update(`markets/${id}`, { status: 'settling', settlingOutcome, bestYes: null, bestNo: null });
      return { ...doc, settlingOutcome };
    });
    const final = m.settlingOutcome;
    await refundOpenOrders(id, m.question);
    let fees = 0;
    for (;;) {
      const unpaid = await db.query('positions', [['marketId', '==', id], ['settled', '==', false]], { limit: BATCH });
      if (!unpaid.length) break;
      let batchFees = 0;
      await db.batch(async (w) => {
        for (const { id: pid, data: p } of unpaid) {
          const cost = (p.yesCost ?? 0) + (p.noCost ?? 0);
          const payout = final === 'void' ? cost : 100 * ((final === 'yes' ? p.yesQty : p.noQty) ?? 0);
          const fee = feeOn(payout - cost);
          w.update(`users/${p.uid}`, { balance: db.inc(payout - fee) });
          ledger(w, p.uid, final === 'void' ? 'void_refund' : 'payout', payout - fee, id, m.question);
          w.update(`positions/${pid}`, { settled: true, payout, fee });
          batchFees += fee;
        }
        if (batchFees) {
          w.set('meta/stats', { fees: db.inc(batchFees) }, { merge: true });
          w.update(`markets/${id}`, { feesCollected: db.inc(batchFees) });
        }
      });
      fees += batchFees;
    }
    const done = { status: final === 'void' ? 'voided' : 'resolved', outcome: final === 'void' ? null : final, resolvedAt: now() };
    await db.batch(async (w) => w.update(`markets/${id}`, done));
    return { market: marketView({ ...m, ...done }), fees };
  }

  async function reportMarket(uid, marketId, reason) {
    reason = String(reason ?? '').trim();
    if (reason.length < 5 || reason.length > 1000) throw new ApiError(400, 'Say what is wrong in 5-1000 characters');
    const m = await getMarketDoc(marketId);
    const user = await db.get(`users/${uid}`);
    if (!user) throw new ApiError(401, 'Sign in first');
    await db.batch(async (w) => {
      w.set(`reports/${m.id}_${uid}`, { marketId: m.id, uid, reporter: user.username, reason, at: now() });
    });
    return {};
  }

  // ---------- reporting ----------

  async function portfolio(uid) {
    const [positions, orders, ledgerRows] = await Promise.all([
      db.query('positions', [['uid', '==', uid]]),
      db.query('orders', [['uid', '==', uid], ['status', '==', 'open']]),
      db.query(`users/${uid}/ledger`, [], { orderBy: ['at', 'desc'], limit: 100 }),
    ]);
    const ids = [...new Set([...positions.map((p) => p.data.marketId), ...orders.map((o) => o.data.marketId)])];
    const markets = new Map((await Promise.all(ids.map((id) => db.get(`markets/${id}`)))).filter(Boolean).map((m) => [m.id, m]));
    return {
      positions: positions
        .filter((p) => markets.has(p.data.marketId))
        .sort((a, b) => b.data.marketId - a.data.marketId)
        .map((p) => ({ market: marketView(markets.get(p.data.marketId)), position: positionView(p.data) })),
      orders: orders
        .sort((a, b) => b.data.createdAt - a.data.createdAt)
        .map(({ id: oid, data: o }) => ({
          id: oid, marketId: o.marketId, question: markets.get(o.marketId)?.question ?? '',
          side: o.side, price: o.price, qty: o.qty, remaining: o.remaining,
        })),
      ledger: ledgerRows.map(({ data: l }) => ({ type: l.type, amount: l.amount, at: l.at, marketId: l.marketId, question: l.question })),
    };
  }

  async function stats(uid) {
    const admin = await db.get(`users/${uid}`);
    if (!admin?.isAdmin) throw new ApiError(403, 'Admins only');
    const [users, open, unsettled, meta, markets, reports] = await Promise.all([
      db.query('users', []),
      db.query('orders', [['status', '==', 'open']]),
      db.query('positions', [['settled', '==', false]]),
      db.get('meta/stats'),
      db.query('markets', []),
      db.query('reports', []),
    ]);
    const sum = (rows, f) => rows.reduce((n, r) => n + f(r.data), 0);
    const byId = new Map(markets.map((r) => [r.data.id, r.data]));
    const t0 = now();
    const s = {
      deposits: meta?.deposits ?? 0,
      userBalances: sum(users, (u) => u.balance ?? 0),
      orderEscrow: sum(open, (o) => o.remaining * o.price),
      positionEscrow: sum(unsettled, (p) => (p.yesCost ?? 0) + (p.noCost ?? 0)),
      feeRevenue: meta?.fees ?? 0,
      users: users.length,
      markets: markets.length,
      contractsTraded: sum(markets, (m) => m.volume ?? 0),
    };
    s.balanced = s.deposits === s.userBalances + s.orderEscrow + s.positionEscrow + s.feeRevenue;
    const all = markets.map((r) => r.data);
    s.awaitingResolution = all.filter((m) => m.status === 'open' && m.closesAt <= t0).sort((a, b) => a.closesAt - b.closesAt).map(marketView);
    s.proposed = all.filter((m) => m.status === 'proposed' || m.status === 'settling').sort((a, b) => a.reportedAt - b.reportedAt).map(marketView);
    s.reports = reports
      .map((r) => r.data)
      .filter((r) => !['resolved', 'voided'].includes(byId.get(r.marketId)?.status))
      .sort((a, b) => b.at - a.at)
      .slice(0, 100)
      .map((r) => ({ marketId: r.marketId, question: byId.get(r.marketId)?.question ?? '', reason: r.reason, at: r.at, reporter: r.reporter }));
    s.feesByMarket = all
      .filter((m) => m.feesCollected > 0)
      .sort((a, b) => (b.resolvedAt ?? 0) - (a.resolvedAt ?? 0))
      .slice(0, 50)
      .map((m) => ({ marketId: m.id, question: m.question, amount: m.feesCollected }));
    return s;
  }

  return {
    me, join, createMarket, listMarkets, marketDetail, placeOrder, cancelOrder,
    proposeResolution, resolveMarket, reportMarket, portfolio, stats,
  };
}
