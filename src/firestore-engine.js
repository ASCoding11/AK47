// Crowdline's shared exchange for Firebase's free (Spark) plan: the browser
// reads and writes Firestore directly, and firestore.rules makes sure every
// balance change is justified. Same rules of play as src/engine.js:
//   * Balances are Avenues (play money) in hundredths: 100 units = 1 Avenue.
//   * A contract pays 100 to the winning side. A YES bet and a NO bet match when
//     their prices add up to at least 100; the waiting bet gets its price.
//   * Creators report results; the admin verifies and pays out, keeping
//     FEE_BPS of each member's net winnings.
//
// `sdk` is the Firebase modular Firestore API (from the CDN in the browser,
// from npm in tests), so the same code runs in both.

export const FEE_BPS = 1000; // 10% of winnings
export const WELCOME_BONUS = 100_000; // 1,000 Avenues, once per account
export const CATEGORIES = ['Politics', 'Sports', 'Economics', 'Tech', 'Culture', 'Science', 'Other'];
const MAX_QTY = 100_000;
const OUTCOMES = ['yes', 'no', 'void'];
const BATCH = 120; // members per settlement batch, well under 500 writes

export class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export const feeOn = (profit) => (profit > 0 ? Math.floor((profit * FEE_BPS) / 10_000) : 0);
const ms = (t) => (t == null ? null : typeof t === 'number' ? t : t.toMillis());

export function createFirestoreEngine({ sdk, db, now = () => Date.now() }) {
  const { doc, collection, getDoc, getDocs, query, where, runTransaction, writeBatch, serverTimestamp, increment } = sdk;
  const ref = (path) => doc(db, path);
  // Every query filters on a single field, so Firestore never needs a
  // hand-made composite index.
  const rows = (snap) => snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  const find = (coll, ...wheres) => getDocs(query(collection(db, coll), ...wheres.map((w) => where(...w)))).then(rows);
  const ledger = (w, uid, type, amount, marketId = null, question = null) => {
    if (amount !== 0) w.set(doc(collection(db, `users/${uid}/ledger`)), { type, amount, marketId, question, at: serverTimestamp() });
  };

  async function adminUid() {
    const snap = await getDoc(ref('meta/admin'));
    return snap.exists() ? snap.data().uid : null;
  }

  // ---------- accounts ----------

  async function me(uid) {
    if (!uid) return null;
    const [snap, admin] = await Promise.all([getDoc(ref(`users/${uid}`)), adminUid()]);
    if (!snap.exists()) return null;
    const u = snap.data();
    return { id: uid, username: u.username, balance: u.balance, isAdmin: admin === uid };
  }

  // First sign-in: create the member with the welcome Avenues, exactly once.
  // The first member ever becomes the admin.
  async function join(uid, { name, email } = {}) {
    const isNew = await runTransaction(db, async (tx) => {
      if ((await tx.get(ref(`users/${uid}`))).exists()) return false;
      const admin = await tx.get(ref('meta/admin'));
      let base = String(name || String(email ?? '').split('@')[0]).normalize('NFKD')
        .replace(/[^A-Za-z0-9_]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 16);
      if (base.length < 3) base = `member${base}`.slice(0, 16);
      let username = base;
      for (let i = 2; (await tx.get(ref(`usernames/${username.toLowerCase()}`))).exists(); i++) username = `${base}${i}`;
      tx.set(ref(`usernames/${username.toLowerCase()}`), { uid });
      tx.set(ref(`users/${uid}`), { username, balance: WELCOME_BONUS, lastOp: 'join', lastOpType: 'join', createdAt: serverTimestamp() });
      ledger(tx, uid, 'deposit', WELCOME_BONUS);
      if (!admin.exists()) tx.set(ref('meta/admin'), { uid });
      return true;
    });
    return { user: await me(uid), isNew };
  }

  async function requireMe(uid) {
    const user = uid && (await me(uid));
    if (!user) throw new ApiError(401, 'Sign in first');
    return user;
  }

  // ---------- markets ----------

  function marketView(m) {
    const closesAt = m.closesAt;
    const status = m.status === 'open' && closesAt <= now() ? 'closed' : m.status === 'settling' ? 'proposed' : m.status;
    return {
      id: m.id, question: m.question, description: m.description, category: m.category,
      creator: m.creator, creatorId: m.creatorId, closesAt, status,
      outcome: m.outcome ?? null, lastPrice: m.lastPrice ?? null, volume: m.volume ?? 0,
      createdAt: ms(m.createdAt), resolvedAt: ms(m.resolvedAt),
      proposedOutcome: m.proposedOutcome ?? null, reportedAt: ms(m.reportedAt), reportNote: m.reportNote ?? null,
    };
  }

  async function marketDoc(id) {
    const snap = await getDoc(ref(`markets/${id}`));
    if (!snap.exists()) throw new ApiError(404, 'Market not found');
    return { id: snap.id, ...snap.data() };
  }

  async function createMarket(uid, { question, description, category, closesAt } = {}) {
    const user = await requireMe(uid);
    question = String(question ?? '').trim();
    description = String(description ?? '').trim();
    closesAt = Math.round(Number(closesAt));
    if (question.length < 10 || question.length > 200) throw new ApiError(400, 'Question must be 10-200 characters');
    if (description.length < 20 || description.length > 2000) {
      throw new ApiError(400, 'Describe how the market resolves (20-2000 characters)');
    }
    if (!CATEGORIES.includes(category)) throw new ApiError(400, 'Pick a category');
    if (!Number.isFinite(closesAt) || closesAt < now() + 5 * 60_000) {
      throw new ApiError(400, 'Trading must close at least 5 minutes from now');
    }
    if (closesAt > now() + 3 * 365 * 86_400_000) throw new ApiError(400, 'Close date is too far in the future');
    const mRef = doc(collection(db, 'markets'));
    const batch = writeBatch(db);
    batch.set(mRef, {
      question, description, category, closesAt, creatorId: uid, creator: user.username,
      status: 'open', volume: 0, lastPrice: null, lastFill: null, createdAt: serverTimestamp(),
    });
    await batch.commit();
    return { market: marketView(await marketDoc(mRef.id)) };
  }

  async function listMarkets({ status = 'open', category, search } = {}) {
    const t0 = now();
    const statuses = status === 'settled' ? ['resolved', 'voided'] : status === 'closed' ? ['open', 'proposed', 'settling'] : ['open'];
    const all = await find('markets', ['status', 'in', statuses]);
    const needle = search ? String(search).slice(0, 100).toLowerCase() : '';
    return {
      markets: all
        .filter((m) => (status === 'open' ? m.closesAt > t0 : status === 'closed' ? m.status !== 'open' || m.closesAt <= t0 : true))
        .filter((m) => !(category && CATEGORIES.includes(category)) || m.category === category)
        .filter((m) => !needle || m.question.toLowerCase().includes(needle))
        .sort((a, b) => (b.volume ?? 0) - (a.volume ?? 0) || ms(b.createdAt) - ms(a.createdAt))
        .slice(0, 200)
        .map((m) => ({ ...marketView(m), yesBid: null, yesAsk: null })),
    };
  }

  // Each member's holdings in a market, worked out from its fills.
  function positionsFrom(fills) {
    const by = new Map();
    const add = (uid, side, qty, cost) => {
      const p = by.get(uid) ?? { yesQty: 0, noQty: 0, yesCost: 0, noCost: 0 };
      p[`${side}Qty`] += qty;
      p[`${side}Cost`] += cost;
      by.set(uid, p);
    };
    for (const f of fills) {
      const takerSide = f.makerSide === 'yes' ? 'no' : 'yes';
      add(f.makerUid, f.makerSide, f.qty, f.makerPrice * f.qty);
      add(f.takerUid, takerSide, f.qty, (100 - f.makerPrice) * f.qty);
    }
    return by;
  }

  async function marketDetail(id, uid) {
    const m = await marketDoc(id);
    const [open, fills] = await Promise.all([
      find('orders', ['marketId', '==', m.id]),
      find('fills', ['marketId', '==', m.id]),
    ]);
    const live = open.filter((o) => o.status === 'open' && o.qty > o.filled);
    const level = (side) => {
      const byPrice = new Map();
      for (const o of live) if (o.side === side) byPrice.set(o.price, (byPrice.get(o.price) ?? 0) + o.qty - o.filled);
      return [...byPrice].map(([price, qty]) => ({ price, qty })).sort((a, b) => b.price - a.price).slice(0, 15);
    };
    const detail = {
      market: marketView(m),
      book: { yes: level('yes'), no: level('no') },
      trades: fills
        .sort((a, b) => ms(b.at) - ms(a.at))
        .slice(0, 200)
        .map((f) => ({ yesPrice: f.yesPrice, qty: f.qty, at: ms(f.at) })),
    };
    if (uid) {
      const mine = positionsFrom(fills).get(uid);
      let settled = null;
      if (m.status === 'resolved' || m.status === 'voided') {
        const s = await getDoc(ref(`settlements/${m.id}_${uid}`));
        settled = s.exists() ? s.data() : null;
      }
      detail.position = mine ? { ...mine, payout: settled?.payout ?? null, fee: settled?.fee ?? null } : null;
      detail.orders = live
        .filter((o) => o.uid === uid)
        .sort((a, b) => ms(b.createdAt) - ms(a.createdAt))
        .map((o) => ({ id: o.id, side: o.side, price: o.price, qty: o.qty, remaining: o.qty - o.filled }));
    }
    return detail;
  }

  // ---------- betting ----------

  // Matches my order against older crossing bets, one fill per transaction
  // (the shape firestore.rules can check), best price first.
  async function match(uid, orderId) {
    const mine = (await getDoc(ref(`orders/${orderId}`))).data();
    if (!mine || mine.status !== 'open') return 0;
    const opposite = mine.side === 'yes' ? 'no' : 'yes';
    const candidates = (await find('orders', ['marketId', '==', mine.marketId]))
      .filter((o) => o.side === opposite && o.status === 'open' && o.uid !== uid && o.qty > o.filled && o.price >= 100 - mine.price && ms(o.createdAt) < ms(mine.createdAt))
      .sort((a, b) => b.price - a.price || ms(a.createdAt) - ms(b.createdAt));
    let filled = 0;
    for (const c of candidates) {
      const qty = await runTransaction(db, async (tx) => {
        const makerRef = ref(`orders/${c.id}`);
        const takerRef = ref(`orders/${orderId}`);
        const marketRef = ref(`markets/${mine.marketId}`);
        const userRef = ref(`users/${uid}`);
        const [mk, tk, mkt, usr] = await Promise.all([tx.get(makerRef), tx.get(takerRef), tx.get(marketRef), tx.get(userRef)]);
        const maker = mk.data();
        const taker = tk.data();
        const market = mkt.data();
        if (maker.status !== 'open' || taker.status !== 'open' || market.status !== 'open' || market.closesAt <= now()) return 0;
        const q = Math.min(maker.qty - maker.filled, taker.qty - taker.filled);
        if (q <= 0) return 0;
        const fillRef = doc(collection(db, 'fills'));
        const yesPrice = maker.side === 'yes' ? maker.price : 100 - maker.price;
        const improvement = (taker.price - (100 - maker.price)) * q;
        tx.set(fillRef, {
          marketId: mine.marketId, makerOrder: c.id, takerOrder: orderId, makerUid: maker.uid, takerUid: uid,
          makerSide: maker.side, makerPrice: maker.price, takerPrice: taker.price, yesPrice, qty: q, at: serverTimestamp(),
        });
        tx.update(makerRef, { filled: maker.filled + q, lastFill: fillRef.id });
        tx.update(takerRef, { filled: taker.filled + q, lastFill: fillRef.id });
        tx.update(userRef, { balance: usr.data().balance + improvement, lastOp: fillRef.id, lastOpType: 'fill' });
        tx.update(marketRef, { volume: (market.volume ?? 0) + q, lastPrice: yesPrice, lastFill: fillRef.id });
        ledger(tx, uid, 'price_improvement', improvement, mine.marketId, market.question);
        return q;
      });
      filled += qty;
      if (filled >= mine.qty) break;
    }
    return filled;
  }

  async function placeOrder(uid, marketId, { side, price, qty } = {}) {
    await requireMe(uid);
    price = Number(price);
    qty = Number(qty);
    if (side !== 'yes' && side !== 'no') throw new ApiError(400, 'Side must be yes or no');
    if (!Number.isInteger(price) || price < 1 || price > 99) throw new ApiError(400, 'Price must be a whole number of cents from 1 to 99');
    if (!Number.isInteger(qty) || qty < 1 || qty > MAX_QTY) throw new ApiError(400, `Quantity must be a whole number from 1 to ${MAX_QTY}`);
    const orderRef = doc(collection(db, 'orders'));
    await runTransaction(db, async (tx) => {
      const [mkt, usr] = await Promise.all([tx.get(ref(`markets/${marketId}`)), tx.get(ref(`users/${uid}`))]);
      if (!mkt.exists()) throw new ApiError(404, 'Market not found');
      const market = mkt.data();
      if (market.status !== 'open' || market.closesAt <= now()) throw new ApiError(400, 'This market is closed for trading');
      const balance = usr.data().balance;
      if (balance < price * qty) throw new ApiError(400, 'Not enough balance');
      tx.set(orderRef, {
        marketId: String(marketId), uid, side, price, qty, filled: 0, status: 'open', createdAt: serverTimestamp(), lastFill: null,
      });
      tx.update(ref(`users/${uid}`), { balance: balance - price * qty, lastOp: orderRef.id, lastOpType: 'order' });
      ledger(tx, uid, 'order_reserve', -price * qty, String(marketId), market.question);
    });
    const filled = await match(uid, orderRef.id);
    return { orderId: orderRef.id, filled, resting: qty - filled };
  }

  async function cancelOrder(uid, orderId) {
    await runTransaction(db, async (tx) => {
      const snap = await tx.get(ref(`orders/${orderId}`));
      const o = snap.data();
      if (!o || o.uid !== uid) throw new ApiError(404, 'Order not found');
      if (o.status !== 'open') throw new ApiError(400, 'Order is no longer open');
      const usr = await tx.get(ref(`users/${uid}`));
      const refund = (o.qty - o.filled) * o.price;
      tx.update(ref(`orders/${orderId}`), { status: 'cancelled' });
      tx.update(ref(`users/${uid}`), { balance: usr.data().balance + refund, lastOp: orderId, lastOpType: 'cancel' });
      ledger(tx, uid, 'order_refund', refund, o.marketId, null);
    });
    return {};
  }

  // ---------- results ----------

  async function proposeResolution(uid, marketId, outcome, note) {
    if (!OUTCOMES.includes(outcome)) throw new ApiError(400, 'Invalid outcome');
    note = String(note ?? '').trim();
    if (note.length < 5 || note.length > 1000) throw new ApiError(400, 'Add the source for the result (5-1000 characters)');
    const m = await marketDoc(marketId);
    if (m.creatorId !== uid) throw new ApiError(403, 'Only the market’s creator can report the result');
    if (m.status !== 'open') throw new ApiError(400, 'A result has already been reported');
    const batch = writeBatch(db);
    batch.update(ref(`markets/${m.id}`), { status: 'proposed', proposedOutcome: outcome, reportNote: note, reportedAt: serverTimestamp() });
    await batch.commit();
    return { market: marketView(await marketDoc(m.id)) };
  }

  // The admin verifies a result and pays everyone, from the admin's browser.
  // Marks the market as settling first; a member's settlement record is
  // written with their payout, so running it again never pays twice.
  async function resolveMarket(uid, marketId, outcome) {
    if (!OUTCOMES.includes(outcome)) throw new ApiError(400, 'Invalid outcome');
    if ((await adminUid()) !== uid) throw new ApiError(403, 'Only an admin can resolve markets');
    const m = await marketDoc(marketId);
    if (m.status === 'resolved' || m.status === 'voided') throw new ApiError(400, 'Market is already settled');
    const final = m.status === 'settling' ? m.settlingOutcome : outcome;
    if (m.status !== 'settling') {
      const b = writeBatch(db);
      b.update(ref(`markets/${m.id}`), { status: 'settling', settlingOutcome: final });
      await b.commit();
    }
    const chunks = async (items, fn) => {
      for (let i = 0; i < items.length; i += BATCH) {
        const b = writeBatch(db);
        items.slice(i, i + BATCH).forEach((item) => fn(b, item));
        await b.commit();
      }
    };
    // Refund bets that were never matched.
    const open = (await find('orders', ['marketId', '==', m.id])).filter((o) => o.status === 'open');
    await chunks(open, (b, o) => {
      const refund = (o.qty - o.filled) * o.price;
      b.update(ref(`orders/${o.id}`), { status: 'cancelled' });
      b.update(ref(`users/${o.uid}`), { balance: increment(refund) });
      ledger(b, o.uid, 'order_refund', refund, m.id, m.question);
    });
    // Pay every position.
    const [fills, done] = await Promise.all([
      find('fills', ['marketId', '==', m.id]),
      find('settlements', ['marketId', '==', m.id]),
    ]);
    const paid = new Set(done.map((s) => s.uid));
    const toPay = [...positionsFrom(fills)].filter(([member]) => !paid.has(member));
    let fees = 0;
    await chunks(toPay, (b, [member, p]) => {
      const cost = p.yesCost + p.noCost;
      const payout = final === 'void' ? cost : 100 * (final === 'yes' ? p.yesQty : p.noQty);
      const fee = feeOn(payout - cost);
      fees += fee;
      b.update(ref(`users/${member}`), { balance: increment(payout - fee) });
      b.set(ref(`settlements/${m.id}_${member}`), { marketId: m.id, uid: member, ...p, cost, payout, fee });
      ledger(b, member, final === 'void' ? 'void_refund' : 'payout', payout - fee, m.id, m.question);
    });
    const b = writeBatch(db);
    b.set(ref('meta/stats'), { fees: increment(fees) }, { merge: true });
    b.update(ref(`markets/${m.id}`), {
      status: final === 'void' ? 'voided' : 'resolved', outcome: final === 'void' ? null : final,
      resolvedAt: serverTimestamp(), feesCollected: increment(fees),
    });
    await b.commit();
    return { market: marketView(await marketDoc(m.id)), fees };
  }

  async function reportMarket(uid, marketId, reason) {
    const user = await requireMe(uid);
    reason = String(reason ?? '').trim();
    if (reason.length < 5 || reason.length > 1000) throw new ApiError(400, 'Say what is wrong in 5-1000 characters');
    const m = await marketDoc(marketId);
    const b = writeBatch(db);
    b.set(ref(`reports/${m.id}_${uid}`), { marketId: m.id, uid, reporter: user.username, reason, at: serverTimestamp() });
    await b.commit();
    return {};
  }

  // ---------- reporting ----------

  async function portfolio(uid) {
    await requireMe(uid);
    const [asMaker, asTaker, orders, settlements, ledgerRows] = await Promise.all([
      find('fills', ['makerUid', '==', uid]),
      find('fills', ['takerUid', '==', uid]),
      find('orders', ['uid', '==', uid]).then((os) => os.filter((o) => o.status === 'open')),
      find('settlements', ['uid', '==', uid]),
      getDocs(query(collection(db, `users/${uid}/ledger`), sdk.orderBy('at', 'desc'), sdk.limit(100))).then(rows),
    ]);
    const positions = new Map();
    const byMarket = new Map();
    for (const f of [...asMaker, ...asTaker]) byMarket.set(f.marketId, [...(byMarket.get(f.marketId) ?? []), f]);
    for (const [marketId, fs] of byMarket) positions.set(marketId, positionsFrom(fs).get(uid));
    const ids = [...new Set([...positions.keys(), ...orders.map((o) => o.marketId)])];
    const markets = new Map((await Promise.all(ids.map((id) => marketDoc(id).catch(() => null)))).filter(Boolean).map((m) => [m.id, m]));
    const settledBy = new Map(settlements.map((s) => [s.marketId, s]));
    return {
      positions: [...positions]
        .filter(([id]) => markets.has(id))
        .sort((a, b) => ms(markets.get(b[0]).createdAt) - ms(markets.get(a[0]).createdAt))
        .map(([id, p]) => ({ market: marketView(markets.get(id)), position: { ...p, payout: settledBy.get(id)?.payout ?? null, fee: settledBy.get(id)?.fee ?? null } })),
      orders: orders
        .filter((o) => o.qty > o.filled)
        .sort((a, b) => ms(b.createdAt) - ms(a.createdAt))
        .map((o) => ({ id: o.id, marketId: o.marketId, question: markets.get(o.marketId)?.question ?? '', side: o.side, price: o.price, qty: o.qty, remaining: o.qty - o.filled })),
      ledger: ledgerRows.map((l) => ({ type: l.type, amount: l.amount, at: ms(l.at), marketId: l.marketId, question: l.question })),
    };
  }

  async function stats(uid) {
    if ((await adminUid()) !== uid) throw new ApiError(403, 'Admins only');
    const [users, open, markets, reports, meta] = await Promise.all([
      getDocs(collection(db, 'users')).then(rows),
      find('orders', ['status', '==', 'open']),
      getDocs(collection(db, 'markets')).then(rows),
      getDocs(collection(db, 'reports')).then(rows),
      getDoc(ref('meta/stats')),
    ]);
    const unsettled = markets.filter((m) => m.status !== 'resolved' && m.status !== 'voided');
    const fills = (await Promise.all(unsettled.map((m) => find('fills', ['marketId', '==', m.id])))).flat();
    const settledIds = new Set((await Promise.all(unsettled.filter((m) => m.status === 'settling').map((m) => find('settlements', ['marketId', '==', m.id])))).flat().map((s) => `${s.marketId}_${s.uid}`));
    const sum = (xs, f) => xs.reduce((n, x) => n + f(x), 0);
    let positionEscrow = 0;
    for (const f of fills) {
      if (!settledIds.has(`${f.marketId}_${f.makerUid}`)) positionEscrow += f.makerPrice * f.qty;
      if (!settledIds.has(`${f.marketId}_${f.takerUid}`)) positionEscrow += (100 - f.makerPrice) * f.qty;
    }
    const byId = new Map(markets.map((m) => [m.id, m]));
    const t0 = now();
    const s = {
      deposits: users.length * WELCOME_BONUS,
      userBalances: sum(users, (u) => u.balance ?? 0),
      orderEscrow: sum(open, (o) => (o.qty - o.filled) * o.price),
      positionEscrow,
      feeRevenue: meta.exists() ? meta.data().fees ?? 0 : 0,
      users: users.length,
      markets: markets.length,
      contractsTraded: sum(markets, (m) => m.volume ?? 0),
    };
    s.balanced = s.deposits === s.userBalances + s.orderEscrow + s.positionEscrow + s.feeRevenue;
    s.awaitingResolution = markets.filter((m) => m.status === 'open' && m.closesAt <= t0).sort((a, b) => a.closesAt - b.closesAt).map(marketView);
    s.proposed = markets.filter((m) => m.status === 'proposed' || m.status === 'settling').sort((a, b) => ms(a.reportedAt) - ms(b.reportedAt)).map(marketView);
    s.reports = reports
      .filter((r) => !['resolved', 'voided'].includes(byId.get(r.marketId)?.status))
      .sort((a, b) => ms(b.at) - ms(a.at))
      .slice(0, 100)
      .map((r) => ({ marketId: r.marketId, question: byId.get(r.marketId)?.question ?? '', reason: r.reason, at: ms(r.at), reporter: r.reporter }));
    s.feesByMarket = markets
      .filter((m) => m.feesCollected > 0)
      .sort((a, b) => ms(b.resolvedAt) - ms(a.resolvedAt))
      .slice(0, 50)
      .map((m) => ({ marketId: m.id, question: m.question, amount: m.feesCollected }));
    return s;
  }

  return {
    me, join, createMarket, listMarkets, marketDetail, placeOrder, cancelOrder, match,
    proposeResolution, resolveMarket, reportMarket, portfolio, stats,
  };
}
