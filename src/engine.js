// Exchange engine: accounts, markets, order matching and settlement.
//
// Money model (all amounts are integer cents):
//   * Every contract pays 100 to the holder of the winning side, 0 to the other.
//   * A trade only happens when a YES buyer and a NO buyer agree on prices that
//     sum to 100. Both sides pay up front, so every contract is backed by
//     exactly 100 held in escrow. The platform never takes a position.
//   * At settlement each winning contract pays its holder in full; there is no fee.
import { DatabaseSync } from 'node:sqlite';
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

export const CATEGORIES = ['Politics', 'Sports', 'Economics', 'Tech', 'Culture', 'Science', 'Other'];
// Balances are play money ("Avenues") in hundredths: 100 units = 1 Avenue,
// and every contract pays 1 Avenue to the winning side.
export const WELCOME_BONUS = 100_000; // 1,000 Avenues, once per account
const MAX_QTY = 100_000;

export class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY,
  username TEXT NOT NULL UNIQUE COLLATE NOCASE,
  pw_hash TEXT NOT NULL,
  balance INTEGER NOT NULL DEFAULT 0 CHECK (balance >= 0),
  is_admin INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS markets (
  id INTEGER PRIMARY KEY,
  creator_id INTEGER NOT NULL REFERENCES users(id),
  question TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL,
  closes_at INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',   -- open | proposed (result reported, awaiting verification) | resolved | voided
  outcome TEXT,                          -- yes | no
  last_price INTEGER,                    -- last traded YES price
  volume INTEGER NOT NULL DEFAULT 0,     -- contracts traded
  created_at INTEGER NOT NULL,
  resolved_at INTEGER
);
CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY,
  market_id INTEGER NOT NULL REFERENCES markets(id),
  user_id INTEGER NOT NULL REFERENCES users(id),
  side TEXT NOT NULL CHECK (side IN ('yes','no')),
  price INTEGER NOT NULL CHECK (price BETWEEN 1 AND 99),
  qty INTEGER NOT NULL,
  remaining INTEGER NOT NULL,
  status TEXT NOT NULL,                  -- open | filled | cancelled
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS orders_book ON orders(market_id, side, status, price);
CREATE TABLE IF NOT EXISTS trades (
  id INTEGER PRIMARY KEY,
  market_id INTEGER NOT NULL REFERENCES markets(id),
  yes_user INTEGER NOT NULL,
  no_user INTEGER NOT NULL,
  yes_price INTEGER NOT NULL,
  qty INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS trades_market ON trades(market_id, id);
CREATE TABLE IF NOT EXISTS positions (
  market_id INTEGER NOT NULL REFERENCES markets(id),
  user_id INTEGER NOT NULL REFERENCES users(id),
  yes_qty INTEGER NOT NULL DEFAULT 0,
  no_qty INTEGER NOT NULL DEFAULT 0,
  yes_cost INTEGER NOT NULL DEFAULT 0,
  no_cost INTEGER NOT NULL DEFAULT 0,
  payout INTEGER,                        -- set at settlement (gross)
  fee INTEGER,                           -- set at settlement
  PRIMARY KEY (market_id, user_id)
);
-- user_id NULL = platform revenue
CREATE TABLE IF NOT EXISTS ledger (
  id INTEGER PRIMARY KEY,
  user_id INTEGER,
  market_id INTEGER,
  type TEXT NOT NULL,
  amount INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS ledger_user ON ledger(user_id, id);
CREATE TABLE IF NOT EXISTS reports (
  market_id INTEGER NOT NULL REFERENCES markets(id),
  user_id INTEGER NOT NULL REFERENCES users(id),
  reason TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (market_id, user_id)
);
`;

// Columns added after the first release; ALTER fails harmlessly if present.
const MIGRATIONS = [
  'ALTER TABLE markets ADD COLUMN proposed_outcome TEXT',
  'ALTER TABLE markets ADD COLUMN proposed_at INTEGER',
  'ALTER TABLE markets ADD COLUMN dispute_reason TEXT',
  'ALTER TABLE markets ADD COLUMN disputed_by INTEGER',
  'ALTER TABLE users ADD COLUMN google_sub TEXT',
  'ALTER TABLE markets ADD COLUMN proposed_note TEXT',
];

function hashPassword(password) {
  const salt = randomBytes(16);
  return `${salt.toString('hex')}:${scryptSync(password, salt, 32).toString('hex')}`;
}

function checkPassword(password, stored) {
  const [salt, hash] = stored.split(':');
  const expected = Buffer.from(hash, 'hex');
  const actual = scryptSync(password, Buffer.from(salt, 'hex'), 32);
  return timingSafeEqual(expected, actual);
}

export function createEngine(path = ':memory:', { demo = true, now = () => Date.now() } = {}) {
  const db = new DatabaseSync(path);
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
  db.exec(SCHEMA);
  for (const sql of MIGRATIONS) {
    try {
      db.exec(sql);
    } catch {}
  }
  db.exec('CREATE UNIQUE INDEX IF NOT EXISTS users_google ON users(google_sub)');

  const q = (sql) => db.prepare(sql);

  function tx(fn) {
    db.exec('BEGIN IMMEDIATE');
    try {
      const result = fn();
      db.exec('COMMIT');
      return result;
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }
  }

  // Move money in or out of a user's available balance and record it.
  function adjust(userId, amount, type, marketId = null) {
    if (amount === 0) return;
    q('UPDATE users SET balance = balance + ? WHERE id = ?').run(amount, userId);
    q('INSERT INTO ledger (user_id, market_id, type, amount, created_at) VALUES (?,?,?,?,?)')
      .run(userId, marketId, type, amount, now());
  }

  // ---------- accounts ----------

  function publicUser(u) {
    return u && { id: u.id, username: u.username, balance: u.balance, isAdmin: !!u.is_admin };
  }

  function register(username, password) {
    username = String(username ?? '').trim();
    password = String(password ?? '');
    if (!/^[A-Za-z0-9_]{3,20}$/.test(username)) {
      throw new ApiError(400, 'Username must be 3-20 letters, numbers or underscores');
    }
    if (password.length < 8 || password.length > 200) {
      throw new ApiError(400, 'Password must be at least 8 characters');
    }
    return tx(() => {
      if (q('SELECT 1 FROM users WHERE username = ?').get(username)) {
        throw new ApiError(409, 'That username is taken');
      }
      // The first account becomes the platform admin (resolves markets).
      const first = q('SELECT COUNT(*) AS n FROM users').get().n === 0;
      const { lastInsertRowid } = q(
        'INSERT INTO users (username, pw_hash, is_admin, created_at) VALUES (?,?,?,?)',
      ).run(username, hashPassword(password), first ? 1 : 0, now());
      const id = Number(lastInsertRowid);
      if (demo) adjust(id, WELCOME_BONUS, 'deposit');
      return { user: getUser(id), token: newSession(id) };
    });
  }

  // Signs in with a verified Google identity. A Google account's first
  // sign-in creates the member and grants WELCOME_BONUS, exactly once.
  function googleSignIn({ sub, name, email }) {
    sub = String(sub ?? '');
    if (!sub) throw new ApiError(401, 'Invalid Google sign-in');
    return tx(() => {
      const existing = q('SELECT * FROM users WHERE google_sub = ?').get(sub);
      if (existing) return { user: publicUser(existing), token: newSession(existing.id), isNew: false };
      const username = uniqueUsername(name || String(email ?? '').split('@')[0]);
      const first = q('SELECT COUNT(*) AS n FROM users').get().n === 0;
      const { lastInsertRowid } = q(
        'INSERT INTO users (username, pw_hash, is_admin, google_sub, created_at) VALUES (?,?,?,?,?)',
      ).run(username, '', first ? 1 : 0, sub, now());
      const id = Number(lastInsertRowid);
      adjust(id, WELCOME_BONUS, 'deposit');
      return { user: getUser(id), token: newSession(id), isNew: true };
    });
  }

  function uniqueUsername(raw) {
    let base = String(raw ?? '').normalize('NFKD').replace(/[^A-Za-z0-9_]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 16);
    if (base.length < 3) base = `member${base}`;
    let name = base;
    for (let i = 2; q('SELECT 1 FROM users WHERE username = ?').get(name); i++) name = `${base}${i}`;
    return name;
  }

  function login(username, password) {
    const u = q('SELECT * FROM users WHERE username = ?').get(String(username ?? '').trim());
    if (!u || !u.pw_hash || !checkPassword(String(password ?? ''), u.pw_hash)) {
      throw new ApiError(401, 'Wrong username or password');
    }
    return { user: publicUser(u), token: newSession(u.id) };
  }

  function newSession(userId) {
    const token = randomBytes(32).toString('hex');
    q('INSERT INTO sessions (token, user_id, created_at) VALUES (?,?,?)').run(token, userId, now());
    return token;
  }

  function logout(token) {
    q('DELETE FROM sessions WHERE token = ?').run(token);
  }

  function userForToken(token) {
    if (!token) return null;
    return publicUser(
      q('SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token = ?').get(token),
    );
  }

  function getUser(id) {
    return publicUser(q('SELECT * FROM users WHERE id = ?').get(id));
  }

  // ---------- markets ----------

  function marketView(m) {
    const closed = m.status === 'open' && m.closes_at <= now();
    return {
      id: m.id,
      question: m.question,
      description: m.description,
      category: m.category,
      creator: m.creator,
      creatorId: m.creator_id,
      closesAt: m.closes_at,
      status: closed ? 'closed' : m.status,
      outcome: m.outcome,
      lastPrice: m.last_price,
      volume: m.volume,
      createdAt: m.created_at,
      resolvedAt: m.resolved_at,
      proposedOutcome: m.proposed_outcome ?? null,
      reportedAt: m.proposed_at ?? null,
      reportNote: m.proposed_note ?? null,
    };
  }

  const MARKET_SELECT =
    'SELECT m.*, u.username AS creator FROM markets m JOIN users u ON u.id = m.creator_id';

  function createMarket(userId, { question, description, category, closesAt }) {
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
    const { lastInsertRowid } = q(
      'INSERT INTO markets (creator_id, question, description, category, closes_at, created_at) VALUES (?,?,?,?,?,?)',
    ).run(userId, question, description, category, closesAt, t);
    return getMarket(Number(lastInsertRowid));
  }

  function getMarket(id) {
    const m = q(`${MARKET_SELECT} WHERE m.id = ?`).get(id);
    if (!m) throw new ApiError(404, 'Market not found');
    return marketView(m);
  }

  function listMarkets({ status = 'open', category, search } = {}) {
    const where = [];
    const params = [];
    const t = now();
    if (status === 'open') {
      where.push("m.status = 'open' AND m.closes_at > ?");
      params.push(t);
    } else if (status === 'closed') {
      where.push("((m.status = 'open' AND m.closes_at <= ?) OR m.status IN ('proposed','disputed'))");
      params.push(t);
    } else if (status === 'settled') {
      where.push("m.status IN ('resolved','voided')");
    }
    if (category && CATEGORIES.includes(category)) {
      where.push('m.category = ?');
      params.push(category);
    }
    if (search) {
      where.push("m.question LIKE ? ESCAPE '\\'");
      params.push(`%${String(search).slice(0, 100).replace(/[\\%_]/g, '\\$&')}%`);
    }
    const sql = `${MARKET_SELECT} ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
      ORDER BY m.volume DESC, m.id DESC LIMIT 200`;
    return q(sql).all(...params).map((m) => {
      const v = marketView(m);
      const bid = q(
        "SELECT MAX(price) AS p FROM orders WHERE market_id = ? AND side = 'yes' AND status = 'open'",
      ).get(m.id).p;
      const noBid = q(
        "SELECT MAX(price) AS p FROM orders WHERE market_id = ? AND side = 'no' AND status = 'open'",
      ).get(m.id).p;
      v.yesBid = bid;
      v.yesAsk = noBid == null ? null : 100 - noBid;
      return v;
    });
  }

  function marketDetail(id, userId) {
    const market = getMarket(id);
    const level = (side) =>
      q(
        `SELECT price, SUM(remaining) AS qty FROM orders
         WHERE market_id = ? AND side = ? AND status = 'open'
         GROUP BY price ORDER BY price DESC LIMIT 15`,
      ).all(id, side);
    const trades = q(
      'SELECT yes_price AS yesPrice, qty, created_at AS at FROM trades WHERE market_id = ? ORDER BY id DESC LIMIT 200',
    ).all(id);
    const detail = { market, book: { yes: level('yes'), no: level('no') }, trades };
    if (userId) {
      detail.position = positionView(
        q('SELECT * FROM positions WHERE market_id = ? AND user_id = ?').get(id, userId),
      );
      detail.orders = q(
        "SELECT id, side, price, qty, remaining FROM orders WHERE market_id = ? AND user_id = ? AND status = 'open' ORDER BY id DESC",
      ).all(id, userId);
    }
    return detail;
  }

  function positionView(p) {
    return (
      p && {
        yesQty: p.yes_qty,
        noQty: p.no_qty,
        yesCost: p.yes_cost,
        noCost: p.no_cost,
        payout: p.payout,
      }
    );
  }

  // ---------- trading ----------

  function addPosition(marketId, userId, side, qty, cost) {
    q(
      `INSERT INTO positions (market_id, user_id, ${side}_qty, ${side}_cost) VALUES (?,?,?,?)
       ON CONFLICT (market_id, user_id) DO UPDATE SET
         ${side}_qty = ${side}_qty + excluded.${side}_qty,
         ${side}_cost = ${side}_cost + excluded.${side}_cost`,
    ).run(marketId, userId, qty, cost);
  }

  function cancelRow(order) {
    q("UPDATE orders SET status = 'cancelled' WHERE id = ?").run(order.id);
    adjust(order.user_id, order.remaining * order.price, 'order_refund', order.market_id);
  }

  // Buy `qty` contracts of `side` at up to `price` cents each. The full cost
  // is taken from the buyer's balance immediately; whatever cannot be matched
  // against the opposite side rests in the book.
  function placeOrder(userId, marketId, { side, price, qty }) {
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
      const cost = price * qty;
      if (getUser(userId).balance < cost) throw new ApiError(400, 'Not enough balance');
      adjust(userId, -cost, 'order_reserve', marketId);

      const opposite = side === 'yes' ? 'no' : 'yes';
      let remaining = qty;
      let filled = 0;
      while (remaining > 0) {
        const resting = q(
          `SELECT * FROM orders WHERE market_id = ? AND side = ? AND status = 'open' AND price >= ?
           ORDER BY price DESC, id ASC LIMIT 1`,
        ).get(marketId, opposite, 100 - price);
        if (!resting) break;
        if (resting.user_id === userId) {
          // Never match a user against themselves: pull their older order.
          cancelRow(resting);
          continue;
        }
        const fill = Math.min(remaining, resting.remaining);
        // The resting order gets its price; the taker pays the complement,
        // which is never more than the limit they asked for.
        const takerPrice = 100 - resting.price;
        adjust(userId, (price - takerPrice) * fill, 'price_improvement', marketId);
        addPosition(marketId, userId, side, fill, takerPrice * fill);
        addPosition(marketId, resting.user_id, opposite, fill, resting.price * fill);
        const left = resting.remaining - fill;
        q('UPDATE orders SET remaining = ?, status = ? WHERE id = ?')
          .run(left, left === 0 ? 'filled' : 'open', resting.id);
        const yesPrice = side === 'yes' ? takerPrice : resting.price;
        q('INSERT INTO trades (market_id, yes_user, no_user, yes_price, qty, created_at) VALUES (?,?,?,?,?,?)')
          .run(
            marketId,
            side === 'yes' ? userId : resting.user_id,
            side === 'yes' ? resting.user_id : userId,
            yesPrice,
            fill,
            now(),
          );
        q('UPDATE markets SET volume = volume + ?, last_price = ? WHERE id = ?')
          .run(fill, yesPrice, marketId);
        remaining -= fill;
        filled += fill;
      }
      const { lastInsertRowid } = q(
        'INSERT INTO orders (market_id, user_id, side, price, qty, remaining, status, created_at) VALUES (?,?,?,?,?,?,?,?)',
      ).run(marketId, userId, side, price, qty, remaining, remaining ? 'open' : 'filled', now());
      return { orderId: Number(lastInsertRowid), filled, resting: remaining };
    });
  }

  function cancelOrder(userId, orderId) {
    return tx(() => {
      const order = q('SELECT * FROM orders WHERE id = ?').get(orderId);
      if (!order || order.user_id !== userId) throw new ApiError(404, 'Order not found');
      if (order.status !== 'open') throw new ApiError(400, 'Order is no longer open');
      cancelRow(order);
    });
  }

  // ---------- settlement ----------

  // Pays out a market. outcome: 'yes' | 'no' | 'void' (void returns every
  // stake in full). Runs inside a transaction.
  function settle(marketId, outcome) {
    for (const order of q("SELECT * FROM orders WHERE market_id = ? AND status = 'open'").all(marketId)) {
      cancelRow(order);
    }
    for (const p of q('SELECT * FROM positions WHERE market_id = ?').all(marketId)) {
      const cost = p.yes_cost + p.no_cost;
      const payout = outcome === 'void' ? cost : 100 * (outcome === 'yes' ? p.yes_qty : p.no_qty);
      adjust(p.user_id, payout, outcome === 'void' ? 'void_refund' : 'payout', marketId);
      q('UPDATE positions SET payout = ?, fee = 0 WHERE market_id = ? AND user_id = ?').run(payout, marketId, p.user_id);
    }
    q('UPDATE markets SET status = ?, outcome = ?, resolved_at = ? WHERE id = ?').run(
      outcome === 'void' ? 'voided' : 'resolved',
      outcome === 'void' ? null : outcome,
      now(),
      marketId,
    );
    return { market: getMarket(marketId) };
  }

  const OUTCOMES = ['yes', 'no', 'void'];

  // The market's creator reports what happened, with a source. Trading stops,
  // and nothing pays out until an admin verifies the result.
  function proposeResolution(userId, marketId, outcome, note) {
    if (!OUTCOMES.includes(outcome)) throw new ApiError(400, 'Invalid outcome');
    note = String(note ?? '').trim();
    if (note.length < 5 || note.length > 1000) throw new ApiError(400, 'Add the source for the result (5-1000 characters)');
    return tx(() => {
      const m = q('SELECT * FROM markets WHERE id = ?').get(marketId);
      if (!m) throw new ApiError(404, 'Market not found');
      if (m.creator_id !== userId) throw new ApiError(403, 'Only the market’s creator can report the result');
      if (m.status !== 'open') throw new ApiError(400, 'A result has already been reported');
      for (const order of q("SELECT * FROM orders WHERE market_id = ? AND status = 'open'").all(marketId)) {
        cancelRow(order);
      }
      q("UPDATE markets SET status = 'proposed', proposed_outcome = ?, proposed_at = ?, proposed_note = ? WHERE id = ?")
        .run(outcome, now(), note, marketId);
      return { market: getMarket(marketId) };
    });
  }

  // Admin verification: the only way a market pays out.
  function resolveMarket(adminId, marketId, outcome) {
    if (!OUTCOMES.includes(outcome)) throw new ApiError(400, 'Invalid outcome');
    return tx(() => {
      if (!getUser(adminId)?.isAdmin) throw new ApiError(403, 'Only an admin can resolve markets');
      const m = q('SELECT * FROM markets WHERE id = ?').get(marketId);
      if (!m) throw new ApiError(404, 'Market not found');
      if (m.status === 'resolved' || m.status === 'voided') throw new ApiError(400, 'Market is already settled');
      return settle(marketId, outcome);
    });
  }

  function reportMarket(userId, marketId, reason) {
    reason = String(reason ?? '').trim();
    if (reason.length < 5 || reason.length > 1000) throw new ApiError(400, 'Say what is wrong in 5-1000 characters');
    getMarket(marketId);
    q(`INSERT INTO reports (market_id, user_id, reason, created_at) VALUES (?,?,?,?)
       ON CONFLICT (market_id, user_id) DO UPDATE SET reason = excluded.reason, created_at = excluded.created_at`)
      .run(marketId, userId, reason, now());
  }

  // ---------- reporting ----------

  function portfolio(userId) {
    const positions = q(
      `${MARKET_SELECT} JOIN positions p ON p.market_id = m.id WHERE p.user_id = ? ORDER BY m.id DESC`,
    ).all(userId).map((m) => ({
      market: marketView(m),
      position: positionView(
        q('SELECT * FROM positions WHERE market_id = ? AND user_id = ?').get(m.id, userId),
      ),
    }));
    const orders = q(
      `SELECT o.id, o.market_id AS marketId, m.question, o.side, o.price, o.qty, o.remaining
       FROM orders o JOIN markets m ON m.id = o.market_id
       WHERE o.user_id = ? AND o.status = 'open' ORDER BY o.id DESC`,
    ).all(userId);
    const ledger = q(
      `SELECT l.type, l.amount, l.created_at AS at, l.market_id AS marketId, m.question
       FROM ledger l LEFT JOIN markets m ON m.id = l.market_id
       WHERE l.user_id = ? ORDER BY l.id DESC LIMIT 100`,
    ).all(userId);
    return { positions, orders, ledger };
  }

  // Where every cent is. `deposits` must always equal the sum of the rest:
  // every Avenue given out is in a balance, an open order or an open position.
  function stats() {
    const one = (sql) => q(sql).get().n ?? 0;
    const s = {
      deposits: one("SELECT SUM(amount) AS n FROM ledger WHERE type = 'deposit'"),
      userBalances: one('SELECT SUM(balance) AS n FROM users'),
      orderEscrow: one("SELECT SUM(remaining * price) AS n FROM orders WHERE status = 'open'"),
      positionEscrow: one(
        `SELECT SUM(p.yes_cost + p.no_cost) AS n FROM positions p
         JOIN markets m ON m.id = p.market_id WHERE m.status IN ('open','proposed','disputed')`,
      ),
      // Only an earlier version charged a fee; old databases may still hold some.
      feeRevenue: one("SELECT SUM(amount) AS n FROM ledger WHERE type = 'fee'"),
      users: one('SELECT COUNT(*) AS n FROM users'),
      markets: one('SELECT COUNT(*) AS n FROM markets'),
      contractsTraded: one('SELECT SUM(volume) AS n FROM markets'),
    };
    s.balanced = s.deposits === s.userBalances + s.orderEscrow + s.positionEscrow + s.feeRevenue;
    s.awaitingResolution = q(
      `${MARKET_SELECT} WHERE m.status = 'open' AND m.closes_at <= ? ORDER BY m.closes_at`,
    ).all(now()).map(marketView);
    // 'disputed' only exists in databases from the dispute-window version.
    s.proposed = q(`${MARKET_SELECT} WHERE m.status IN ('proposed','disputed') ORDER BY m.proposed_at`).all().map(marketView);
    s.reports = q(
      `SELECT r.market_id AS marketId, m.question, r.reason, r.created_at AS at, u.username AS reporter
       FROM reports r JOIN markets m ON m.id = r.market_id JOIN users u ON u.id = r.user_id
       WHERE m.status NOT IN ('resolved','voided') ORDER BY r.created_at DESC LIMIT 100`,
    ).all();
    return s;
  }

  return {
    db, demo, register, googleSignIn, login, logout, userForToken, getUser,
    createMarket, getMarket, listMarkets, marketDetail,
    placeOrder, cancelOrder, proposeResolution, resolveMarket, reportMarket,
    portfolio, stats,
  };
}
