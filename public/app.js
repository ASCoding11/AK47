import { request } from './transport.js';

const view = document.getElementById('view');
const nav = document.getElementById('nav');
const toastEl = document.getElementById('toast');

const state = {
  user: null,
  config: { feeBps: 1000, categories: [], demo: false },
  filters: { status: 'open', category: '', q: '' },
  ticket: { side: 'yes', price: null, qty: 10 },
  detail: null,
};

// ---------- helpers ----------

const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const money = (cents) =>
  `${cents < 0 ? '-' : ''}$${(Math.abs(cents) / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const signed = (cents) => (cents > 0 ? '+' : '') + money(cents);
const date = (ms) => new Date(ms).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
const fee = (profit) => (profit > 0 ? Math.floor((profit * state.config.feeBps) / 10000) : 0);
const feePct = () => `${state.config.feeBps / 100}%`;

function api(path, { method = 'GET', body } = {}) {
  return request(method, path, body);
}

let toastTimer;
function toast(message, isError = false) {
  toastEl.textContent = message;
  toastEl.className = `show${isError ? ' error' : ''}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (toastEl.className = ''), 3500);
}

async function refreshUser() {
  state.user = (await api('/me')).user;
  renderNav();
}

function renderNav() {
  const here = location.hash || '#/';
  const link = (href, label) =>
    `<a href="${href}" class="${here === href ? 'active' : ''}">${label}</a>`;
  const u = state.user;
  nav.innerHTML = `
    ${link('#/', 'Markets')}
    ${link('#/create', 'Create market')}
    ${link('#/terms', 'How it works')}
    ${u ? link('#/portfolio', 'Portfolio') : ''}
    ${u?.isAdmin ? link('#/admin', 'Admin') : ''}
    <span class="spacer"></span>
    ${u
      ? `<span class="balance num" title="Available balance">${money(u.balance)}</span>
         <span class="muted">${esc(u.username)}</span>
         <button class="link" data-action="logout">Log out</button>`
      : `${link('#/login', 'Log in')}<a class="btn primary" href="#/signup">Sign up</a>`}`;
}

function statusBadge(m) {
  if (m.status === 'resolved') return `<span class="badge ${m.outcome}">Resolved ${m.outcome.toUpperCase()}</span>`;
  if (m.status === 'voided') return '<span class="badge">Voided</span>';
  if (m.status === 'closed') return '<span class="badge warn">Waiting for result</span>';
  if (m.status === 'proposed') return `<span class="badge warn">Reported ${m.proposedOutcome === 'void' ? 'void' : m.proposedOutcome.toUpperCase()}</span>`;
  if (m.status === 'disputed') return '<span class="badge no">Disputed</span>';
  return '<span class="badge">Open</span>';
}

function closeLabel(m) {
  if (m.status === 'open') return `Closes ${date(m.closesAt)}`;
  return m.closesAt > Date.now() ? 'Trading stopped early' : `Closed ${date(m.closesAt)}`;
}

// Best estimate of the YES price: last trade, else the middle of the book.
function impliedPrice(m) {
  if (m.status === 'resolved') return m.outcome === 'yes' ? 100 : 0;
  if (m.lastPrice != null) return m.lastPrice;
  if (m.yesBid != null && m.yesAsk != null) return Math.round((m.yesBid + m.yesAsk) / 2);
  return null;
}

// ---------- markets list ----------

async function marketsPage() {
  const f = state.filters;
  const params = new URLSearchParams({ status: f.status });
  if (f.category) params.set('category', f.category);
  if (f.q) params.set('q', f.q);
  const { markets } = await api(`/markets?${params}`);
  const chip = (group, value, label) =>
    `<button class="chip ${f[group] === value ? 'active' : ''}" data-action="filter" data-group="${group}" data-value="${esc(value)}">${esc(label)}</button>`;

  view.innerHTML = `
    <div class="hero">
      <h1>Trade on what happens next</h1>
      <p>Crowdline is a marketplace. Members create markets, trade with each other, and each market’s creator
      reports the result. We never take a side: every contract pays $1.00 to the side that is right, funded by the other side.
      We keep ${feePct()} of your profit, and nothing when you lose. <a class="yes" href="#/terms">How it works</a></p>
    </div>
    <div class="filters">
      <input id="search" type="search" placeholder="Search markets" value="${esc(f.q)}">
      <div class="chips">
        ${chip('status', 'open', 'Open')}${chip('status', 'closed', 'Waiting for result')}${chip('status', 'settled', 'Settled')}
      </div>
    </div>
    <div class="filters chips">
      ${chip('category', '', 'All')}${state.config.categories.map((c) => chip('category', c, c)).join('')}
    </div>
    ${markets.length
      ? `<div class="grid">${markets.map(card).join('')}</div>`
      : `<div class="empty">No markets here yet. <a class="yes" href="#/create">Create the first one.</a></div>`}`;
}

function card(m) {
  const p = impliedPrice(m);
  return `
    <a class="card" href="#/m/${m.id}">
      <div class="row"><span class="tag">${esc(m.category)}</span>${statusBadge(m)}</div>
      <div class="q">${esc(m.question)}</div>
      <div class="row">
        <span class="pct num">${p == null ? '—' : `${p}%`}</span>
        <span class="muted small">${p == null ? 'No trades yet' : 'chance of YES'}</span>
      </div>
      <div class="bar"><div style="width:${p ?? 0}%"></div></div>
      <div class="row muted small">
        <span>${m.volume.toLocaleString()} contracts traded</span>
        <span>${closeLabel(m)}</span>
      </div>
    </a>`;
}

// ---------- market detail ----------

async function marketPage(id) {
  const d = (state.detail = await api(`/markets/${id}`));
  const m = d.market;
  const bestNo = d.book.no[0]?.price;
  const bestYes = d.book.yes[0]?.price;
  if (state.ticket.marketId !== m.id) {
    state.ticket = { marketId: m.id, side: 'yes', qty: 10, price: bestNo ? 100 - bestNo : m.lastPrice ?? 50 };
  }
  const p = impliedPrice({ ...m, yesBid: bestYes, yesAsk: bestNo ? 100 - bestNo : null });
  const isCreator = state.user?.id === m.creatorId;

  view.innerHTML = `
    <div class="detail">
      <div>
        <div class="tag">${esc(m.category)}</div>
        <h1>${esc(m.question)}</h1>
        <div class="meta">
          ${statusBadge(m)}
          <span>${closeLabel(m)}</span>
          <span>${m.volume.toLocaleString()} contracts traded</span>
          <span>Created by ${esc(m.creator)}</span>
        </div>
        <div class="panel">
          <h2>YES price ${p == null ? '' : `· <span class="yes">${p}¢</span>`}</h2>
          ${chart(d.trades)}
        </div>
        <div class="panel">
          <h2>Order book</h2>
          <div class="book">
            ${bookSide('yes', d.book.yes)}
            ${bookSide('no', d.book.no)}
          </div>
          <p class="muted small" style="margin:12px 0 0">A YES bid at 60¢ trades with a NO bid at 40¢ or more: together they fund the $1.00 payout.</p>
        </div>
        <div class="panel">
          <h2>How this resolves</h2>
          <div class="rules">${esc(m.description)}</div>
          <p class="muted small" style="margin:12px 0 0">${esc(m.creator)} created this market and reports its result.
          Traders then have ${DISPUTE_HOURS} hours to dispute it before it pays out.</p>
          ${state.user && !isCreator ? `
            <details class="report">
              <summary>Report this market</summary>
              <form data-form="report">
                <label>What breaks the rules?<textarea id="report-reason" name="reason" required minlength="5" maxlength="1000"
                  placeholder="For example: it bets on someone’s death, targets a private person, or has no way to check the result."></textarea></label>
                <button>Send report</button>
              </form>
            </details>` : ''}
        </div>
        <div class="panel">
          <h2>Recent trades</h2>
          ${d.trades.length
            ? `<table><tr><th>Time</th><th class="r">YES price</th><th class="r">Contracts</th></tr>
               ${d.trades.slice(0, 15).map((t) => `<tr><td class="muted">${date(t.at)}</td><td class="r num">${t.yesPrice}¢</td><td class="r num">${t.qty}</td></tr>`).join('')}</table>`
            : '<div class="muted">No trades yet.</div>'}
        </div>
      </div>
      <div>
        ${resultPanel(d, isCreator)}
        ${m.status === 'open' ? '<div class="panel" id="ticket"></div>' : ''}
        ${positionPanel(d)}
        ${ordersPanel(d)}
        ${state.user?.isAdmin && !['resolved', 'voided'].includes(m.status) ? `
          <div class="panel">
            <h2>Admin decision</h2>
            <p class="muted small">${m.status === 'disputed'
              ? 'A trader disputed the reported result. Your decision pays out every position and is final.'
              : 'Normally the creator reports the result. Step in only for a dispute, a rules violation or an absent creator. This pays out immediately and cannot be undone.'}</p>
            <div class="actions">
              <button class="buy-yes" data-action="resolve" data-outcome="yes">YES</button>
              <button class="buy-no" data-action="resolve" data-outcome="no">NO</button>
              <button data-action="resolve" data-outcome="void">Void and refund</button>
            </div>
          </div>` : ''}
      </div>
    </div>`;
  renderTicket();
}

const DISPUTE_HOURS = 24;
const outcomeWord = (o) => (o === 'void' ? 'Void (refund everyone)' : o.toUpperCase());

// Who reports the result, and how traders can challenge it.
function resultPanel(d, isCreator) {
  const m = d.market;
  const hasStake = d.position && d.position.yesQty + d.position.noQty > 0;
  if (m.status === 'proposed') {
    return `<div class="panel">
      <h2>Reported result</h2>
      <p><b>${outcomeWord(m.proposedOutcome)}</b>, reported by ${esc(m.creator)}.
      It pays out ${date(m.finalizesAt)} unless a trader disputes it first.</p>
      ${state.user && hasStake && !isCreator ? `
        <form data-form="dispute">
          <label>Think it’s wrong? Explain why, with a source.
            <textarea id="dispute-reason" name="reason" required minlength="10" maxlength="1000"></textarea></label>
          <button class="buy-no">Dispute result</button>
        </form>` : ''}
    </div>`;
  }
  if (m.status === 'disputed') {
    return `<div class="panel">
      <h2>Result disputed</h2>
      <p>${esc(m.creator)} reported <b>${outcomeWord(m.proposedOutcome)}</b>. A trader disputed it:</p>
      <p class="rules muted">${esc(m.disputeReason)}</p>
      <p class="muted small">An admin will review the dispute and decide. Stakes stay held until then.</p>
    </div>`;
  }
  if (isCreator && (m.status === 'open' || m.status === 'closed')) {
    return `<div class="panel">
      <h2>Report the result</h2>
      <p class="muted small">You created this market, so you report what happened, following its rules.
      Trading stops when you report. Traders get ${DISPUTE_HOURS} hours to dispute before anything pays out.</p>
      <div class="actions">
        <button class="buy-yes" data-action="propose" data-outcome="yes">YES</button>
        <button class="buy-no" data-action="propose" data-outcome="no">NO</button>
        <button data-action="propose" data-outcome="void">Void and refund</button>
      </div>
    </div>`;
  }
  return '';
}

function bookSide(side, levels) {
  return `
    <table>
      <tr><th class="${side}">${side.toUpperCase()} bids</th><th class="r">Contracts</th></tr>
      ${levels.length
        ? levels.map((l) => `<tr><td class="num ${side}">${l.price}¢</td><td class="r num">${l.qty.toLocaleString()}</td></tr>`).join('')
        : '<tr><td colspan="2" class="muted">No bids</td></tr>'}
    </table>`;
}

function chart(trades) {
  if (trades.length < 2) return '<div class="muted">The chart appears after a couple of trades.</div>';
  const pts = [...trades].reverse();
  const W = 600, H = 160;
  const x = (i) => (i / (pts.length - 1)) * W;
  const y = (price) => H - (price / 100) * H;
  const line = pts.map((t, i) => `${x(i).toFixed(1)},${y(t.yesPrice).toFixed(1)}`).join(' ');
  return `
    <svg class="chart" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="YES price history">
      ${[25, 50, 75].map((g) => `<line x1="0" x2="${W}" y1="${y(g)}" y2="${y(g)}" stroke="#2a323d" stroke-dasharray="4 4"/>`).join('')}
      <polyline points="${line}" fill="none" stroke="#1fb37a" stroke-width="2" vector-effect="non-scaling-stroke"/>
    </svg>`;
}

function renderTicket() {
  const el = document.getElementById('ticket');
  if (!el) return;
  if (!state.user) {
    el.innerHTML = `<h2>Trade</h2><p class="muted">Log in to place an order.</p>
      <a class="btn primary" href="#/login">Log in</a>`;
    return;
  }
  if (state.user.id === state.detail.market.creatorId) {
    el.innerHTML = `<h2>Trade</h2><p class="muted">You created this market, so you can’t trade in it.
      Creators report the result, and keeping them out of the trading removes the reason to report it wrongly.</p>`;
    return;
  }
  const t = state.ticket;
  const book = state.detail.book;
  const opp = t.side === 'yes' ? book.no : book.yes;
  const ask = opp[0] ? 100 - opp[0].price : null;
  el.innerHTML = `
    <h2>Trade</h2>
    <div class="sides">
      <button class="s-yes ${t.side === 'yes' ? 'active' : ''}" data-action="side" data-side="yes">Buy YES</button>
      <button class="s-no ${t.side === 'no' ? 'active' : ''}" data-action="side" data-side="no">Buy NO</button>
    </div>
    <form data-form="order">
      <div class="two">
        <label>Limit price (¢)<input name="price" type="number" min="1" max="99" step="1" required value="${t.price ?? ''}"></label>
        <label>Contracts<input name="qty" type="number" min="1" step="1" required value="${t.qty}"></label>
      </div>
      <p class="muted small">${ask == null
        ? `Nobody is offering ${t.side.toUpperCase()} right now. Your order will wait in the book for a match.`
        : `Fills right away at ${ask}¢ or higher. A lower price waits in the book.`}</p>
      <div class="summary" id="summary"></div>
      <button class="wide ${t.side === 'yes' ? 'buy-yes' : 'buy-no'}">Buy ${t.side.toUpperCase()}</button>
    </form>`;
  renderSummary();
}

function renderSummary() {
  const el = document.getElementById('summary');
  if (!el) return;
  const { price, qty, side } = state.ticket;
  const ok = Number.isInteger(price) && price >= 1 && price <= 99 && Number.isInteger(qty) && qty >= 1;
  if (!ok) return (el.innerHTML = '<div class="muted">Enter a price from 1 to 99 and a quantity.</div>');
  const cost = price * qty;
  const profit = qty * 100 - cost;
  el.innerHTML = `
    <div><span class="muted">You pay at most</span><span class="num">${money(cost)}</span></div>
    <div><span class="muted">Payout if ${side.toUpperCase()}</span><span class="num">${money(qty * 100)}</span></div>
    <div><span class="muted">Fee (${feePct()} of profit)</span><span class="num">-${money(fee(profit))}</span></div>
    <div class="total"><span>Profit if ${side.toUpperCase()}</span><span class="num yes">${signed(profit - fee(profit))}</span></div>`;
}

function positionPanel(d) {
  const p = d.position;
  if (!p || (!p.yesQty && !p.noQty)) return '';
  const cost = p.yesCost + p.noCost;
  const row = (side, qty, c) =>
    qty ? `<tr><td class="${side}">${side.toUpperCase()}</td><td class="r num">${qty.toLocaleString()}</td><td class="r num">${(c / qty).toFixed(1)}¢</td><td class="r num">${money(c)}</td></tr>` : '';
  let outcome = '';
  if (p.payout != null) {
    const net = p.payout - p.fee - cost;
    outcome = `<div class="summary">
      <div><span class="muted">Payout</span><span class="num">${money(p.payout)}</span></div>
      <div><span class="muted">Fee</span><span class="num">-${money(p.fee)}</span></div>
      <div class="total"><span>Result</span><span class="num ${net >= 0 ? 'yes' : 'no'}">${signed(net)}</span></div></div>`;
  }
  return `<div class="panel"><h2>Your position</h2>
    <table><tr><th>Side</th><th class="r">Contracts</th><th class="r">Avg</th><th class="r">Cost</th></tr>
    ${row('yes', p.yesQty, p.yesCost)}${row('no', p.noQty, p.noCost)}</table>${outcome}</div>`;
}

function ordersPanel(d) {
  if (!d.orders?.length) return '';
  return `<div class="panel"><h2>Your open orders</h2><table>
    ${d.orders.map((o) => `<tr>
      <td class="${o.side}">${o.side.toUpperCase()}</td>
      <td class="num">${o.remaining.toLocaleString()} @ ${o.price}¢</td>
      <td class="r"><button class="link" data-action="cancel" data-id="${o.id}">Cancel</button></td></tr>`).join('')}
  </table></div>`;
}

// ---------- create ----------

function createPage() {
  if (!state.user) return (location.hash = '#/login');
  const d = new Date(Date.now() + 7 * 86_400_000);
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  view.innerHTML = `
    <h1>Create a market</h1>
    <p class="muted">Ask a yes-or-no question with an outcome anyone can check. As the creator you report the result,
    and you can’t trade in your own market.</p>
    <div class="panel form">
      <h2>Market rules</h2>
      <ul class="rule-list">
        <li>The result must be public and checkable. Name the source that decides it.</li>
        <li>No markets on anyone’s death, injury or safety, or on violence, terrorism, war casualties or crimes.</li>
        <li>No markets about private individuals or anyone under 18.</li>
        <li>No markets you or a friend can decide or influence.</li>
      </ul>
      <p class="muted small">Markets that break these rules are voided and every stake is refunded.</p>
    </div>
    <form class="panel form" data-form="create">
      <label>Question
        <input name="question" required minlength="10" maxlength="200" placeholder="Will ... happen by ...?">
      </label>
      <label>How it resolves
        <textarea name="description" required minlength="20" maxlength="2000"
          placeholder="State exactly what makes this YES, what makes it NO, and the source that decides it."></textarea>
      </label>
      <div class="two">
        <label>Category
          <select name="category">${state.config.categories.map((c) => `<option>${esc(c)}</option>`).join('')}</select>
        </label>
        <label>Trading closes
          <input name="closesAt" type="datetime-local" required value="${d.toISOString().slice(0, 16)}">
        </label>
      </div>
      <label class="check"><input type="checkbox" id="create-agree" name="agree" required>
        <span>This market follows the rules, and I’ll report its result honestly, using the source above.</span></label>
      <button class="primary">Create market</button>
    </form>`;
}

// ---------- auth ----------

function authPage(mode) {
  const signup = mode === 'signup';
  view.innerHTML = `
    <form class="panel narrow" data-form="${mode}">
      <h1>${signup ? 'Create your account' : 'Log in'}</h1>
      <p class="muted">${signup && state.config.demo ? 'New accounts start with $1,000.00 in demo credits.' : '&nbsp;'}</p>
      <label>Username<input name="username" required autocomplete="username" minlength="3" maxlength="20"></label>
      <label>Password<input name="password" type="password" required minlength="8" autocomplete="${signup ? 'new-password' : 'current-password'}"></label>
      ${signup ? `<label class="check"><input type="checkbox" id="signup-agree" name="agree" required>
        <span>I am 18 or older and agree to the <a class="yes" href="#/terms" target="_blank">marketplace terms</a>.</span></label>` : ''}
      <button class="primary wide">${signup ? 'Sign up' : 'Log in'}</button>
      <p class="muted small" style="margin-top:14px">${signup
        ? 'Already have an account? <a class="yes" href="#/login">Log in</a>'
        : 'New here? <a class="yes" href="#/signup">Sign up</a>'}</p>
    </form>`;
}

// ---------- portfolio ----------

const LEDGER_LABELS = {
  deposit: 'Deposit',
  order_reserve: 'Order placed',
  order_refund: 'Order cancelled',
  price_improvement: 'Filled at a better price',
  payout: 'Market payout (after fee)',
  void_refund: 'Market voided, stake returned',
};

async function portfolioPage() {
  if (!state.user) return (location.hash = '#/login');
  const { positions, orders, ledger } = await api('/portfolio');
  const live = positions.filter((r) => r.position.payout == null);
  const settled = positions.filter((r) => r.position.payout != null);
  const inPositions = live.reduce((s, r) => s + r.position.yesCost + r.position.noCost, 0);
  const inOrders = orders.reduce((s, o) => s + o.remaining * o.price, 0);
  const holding = (p) =>
    [p.yesQty && `<span class="yes">${p.yesQty.toLocaleString()} YES</span>`, p.noQty && `<span class="no">${p.noQty.toLocaleString()} NO</span>`]
      .filter(Boolean).join(' · ');

  view.innerHTML = `
    <h1>Portfolio</h1>
    <div class="stats">
      <div class="stat"><span class="muted small">Available</span><b class="num">${money(state.user.balance)}</b></div>
      <div class="stat"><span class="muted small">In positions</span><b class="num">${money(inPositions)}</b></div>
      <div class="stat"><span class="muted small">In open orders</span><b class="num">${money(inOrders)}</b></div>
    </div>
    ${state.config.demo ? '<p><button data-action="faucet">Add $500.00 demo credits</button></p>' : ''}
    <div class="panel scroll"><h2>Positions</h2>
      ${live.length ? `<table><tr><th>Market</th><th>Holding</th><th class="r">Cost</th><th class="r">Status</th></tr>
        ${live.map((r) => `<tr><td><a href="#/m/${r.market.id}">${esc(r.market.question)}</a></td><td>${holding(r.position)}</td>
          <td class="r num">${money(r.position.yesCost + r.position.noCost)}</td><td class="r">${statusBadge(r.market)}</td></tr>`).join('')}</table>`
        : '<div class="muted">No open positions.</div>'}
    </div>
    <div class="panel scroll"><h2>Open orders</h2>
      ${orders.length ? `<table><tr><th>Market</th><th>Order</th><th class="r">Reserved</th><th></th></tr>
        ${orders.map((o) => `<tr><td><a href="#/m/${o.marketId}">${esc(o.question)}</a></td>
          <td><span class="${o.side}">${o.side.toUpperCase()}</span> ${o.remaining.toLocaleString()} @ ${o.price}¢</td>
          <td class="r num">${money(o.remaining * o.price)}</td>
          <td class="r"><button class="link" data-action="cancel" data-id="${o.id}">Cancel</button></td></tr>`).join('')}</table>`
        : '<div class="muted">No open orders.</div>'}
    </div>
    <div class="panel scroll"><h2>Settled</h2>
      ${settled.length ? `<table><tr><th>Market</th><th>Held</th><th class="r">Cost</th><th class="r">Payout</th><th class="r">Fee</th><th class="r">Result</th></tr>
        ${settled.map((r) => {
          const p = r.position, cost = p.yesCost + p.noCost, net = p.payout - p.fee - cost;
          return `<tr><td><a href="#/m/${r.market.id}">${esc(r.market.question)}</a> ${statusBadge(r.market)}</td><td>${holding(p)}</td>
            <td class="r num">${money(cost)}</td><td class="r num">${money(p.payout)}</td><td class="r num">${money(p.fee)}</td>
            <td class="r num ${net >= 0 ? 'yes' : 'no'}">${signed(net)}</td></tr>`;
        }).join('')}</table>`
        : '<div class="muted">Nothing settled yet.</div>'}
    </div>
    <div class="panel scroll"><h2>Account activity</h2>
      <table><tr><th>Time</th><th>Activity</th><th>Market</th><th class="r">Amount</th></tr>
        ${ledger.map((l) => `<tr><td class="muted">${date(l.at)}</td><td>${LEDGER_LABELS[l.type] ?? esc(l.type)}</td>
          <td>${l.marketId ? `<a href="#/m/${l.marketId}">${esc(l.question)}</a>` : ''}</td>
          <td class="r num ${l.amount >= 0 ? 'yes' : ''}">${signed(l.amount)}</td></tr>`).join('')}
      </table>
    </div>`;
}

// ---------- admin ----------

async function adminPage() {
  if (!state.user?.isAdmin) return (location.hash = '#/');
  const s = await api('/admin/stats');
  const stat = (label, value) => `<div class="stat"><span class="muted small">${label}</span><b class="num">${value}</b></div>`;
  view.innerHTML = `
    <h1>Admin</h1>
    <div class="stats">
      ${stat(`Fee revenue (${feePct()} of profit)`, money(s.feeRevenue))}
      ${stat('Users', s.users.toLocaleString())}
      ${stat('Markets', s.markets.toLocaleString())}
      ${stat('Contracts traded', s.contractsTraded.toLocaleString())}
    </div>
    <div class="panel"><h2>Where the money is</h2>
      <div class="summary">
        <div><span class="muted">Customer balances</span><span class="num">${money(s.userBalances)}</span></div>
        <div><span class="muted">Held for open orders</span><span class="num">${money(s.orderEscrow)}</span></div>
        <div><span class="muted">Held for open positions</span><span class="num">${money(s.positionEscrow)}</span></div>
        <div><span class="muted">Platform fees earned</span><span class="num">${money(s.feeRevenue)}</span></div>
        <div class="total"><span>Total deposits</span><span class="num">${money(s.deposits)}</span></div>
      </div>
      <span class="badge ${s.balanced ? 'yes' : 'no'}">${s.balanced ? 'Books balance: every payout is fully funded by traders' : 'Books do not balance'}</span>
    </div>
    <div class="panel scroll"><h2>Disputed results</h2>
      ${s.disputed.length ? `<table>${s.disputed.map((m) => `<tr>
        <td><a href="#/m/${m.id}">${esc(m.question)}</a><div class="muted small">${esc(m.disputeReason)}</div></td>
        <td class="r">Reported ${outcomeWord(m.proposedOutcome)}</td></tr>`).join('')}</table>`
        : '<div class="muted">No disputes to decide.</div>'}
    </div>
    <div class="panel scroll"><h2>Reported markets</h2>
      ${s.reports.length ? `<table>${s.reports.map((r) => `<tr>
        <td><a href="#/m/${r.marketId}">${esc(r.question)}</a><div class="muted small">${esc(r.reason)}</div></td>
        <td class="r muted">${esc(r.reporter)} · ${date(r.at)}</td></tr>`).join('')}</table>`
        : '<div class="muted">No open reports.</div>'}
    </div>
    <div class="panel scroll"><h2>Results in their dispute window</h2>
      ${s.proposed.length ? `<table>${s.proposed.map((m) => `<tr>
        <td><a href="#/m/${m.id}">${esc(m.question)}</a></td>
        <td class="r">${outcomeWord(m.proposedOutcome)} · pays out ${date(m.finalizesAt)}</td></tr>`).join('')}</table>`
        : '<div class="muted">None right now.</div>'}
    </div>
    <div class="panel scroll"><h2>Closed, waiting for the creator</h2>
      ${s.awaitingResolution.length ? `<table>${s.awaitingResolution.map((m) => `<tr>
        <td><a href="#/m/${m.id}">${esc(m.question)}</a></td><td class="r muted">${esc(m.creator)} · closed ${date(m.closesAt)}</td></tr>`).join('')}</table>`
        : '<div class="muted">Every closed market has a reported result.</div>'}
    </div>
    <div class="panel scroll"><h2>Fees by market</h2>
      ${s.feesByMarket.length ? `<table>${s.feesByMarket.map((f) => `<tr>
        <td><a href="#/m/${f.marketId}">${esc(f.question)}</a></td><td class="r num">${money(f.amount)}</td></tr>`).join('')}</table>`
        : '<div class="muted">No fees collected yet.</div>'}
    </div>`;
}

// ---------- terms ----------

function termsPage() {
  view.innerHTML = `
    <article class="panel terms">
      <h1>How Crowdline works</h1>
      <p class="muted">These terms describe the marketplace. They are a starting point, not legal advice.</p>
      <h2>Crowdline is a venue, not a party to your trades</h2>
      <p>Members create markets and trade with each other. Every trade is between two members: one buys YES,
      the other buys NO, and together their payments fund the $1.00 that each contract pays the winner.
      Crowdline never buys or sells contracts, never takes the other side of a trade, and doesn’t set prices.</p>
      <h2>Our fee</h2>
      <p>When a market settles, we keep ${feePct()} of each member’s net profit in that market. Net profit is what the
      market paid you minus everything you paid for contracts in it. If you lose or break even, you pay no fee.</p>
      <h2>Who decides the result</h2>
      <p>The member who created a market reports its result, following the rules written in the market.
      Creators can’t trade in their own markets. After a result is reported, trading stops and traders have
      ${DISPUTE_HOURS} hours to dispute it. An undisputed result then pays out automatically. A disputed result is
      reviewed by a Crowdline admin, whose decision is final. Admins can also void a market that breaks the
      rules or has no reported result, which refunds every stake.</p>
      <h2>Market rules</h2>
      <p>No markets on anyone’s death, injury or safety; on violence, terrorism, war casualties or crimes; about private
      individuals or anyone under 18; or on anything the creator can decide or influence. Report markets that break these rules.</p>
      <h2>Your money</h2>
      <p>When you place an order, its full cost is set aside from your balance until it fills or you cancel it.
      Money in open positions is held until the market settles. ${state.config.local || state.config.demo
        ? 'Right now all balances are play money with no cash value: you can’t buy credits or withdraw them.' : ''}</p>
      <h2>Eligibility and conduct</h2>
      <p>You must be 18 or older. Don’t trade on information you got in confidence, manipulate the event a market
      is about, or use more than one account.</p>
    </article>`;
}

// ---------- routing and events ----------

async function render() {
  await refreshUser().catch(() => renderNav());
  const hash = location.hash || '#/';
  const market = /^#\/m\/(\d+)$/.exec(hash);
  try {
    if (market) await marketPage(Number(market[1]));
    else if (hash === '#/create') createPage();
    else if (hash === '#/login') authPage('login');
    else if (hash === '#/signup') authPage('signup');
    else if (hash === '#/portfolio') await portfolioPage();
    else if (hash === '#/admin') await adminPage();
    else if (hash === '#/terms') termsPage();
    else await marketsPage();
  } catch (err) {
    view.innerHTML = `<div class="empty">${esc(err.message)}</div>`;
  }
}

const actions = {
  async logout() {
    await api('/logout', { method: 'POST' });
    state.user = null;
    location.hash = '#/';
    render();
  },
  filter(el) {
    state.filters[el.dataset.group] = el.dataset.value;
    render();
  },
  side(el) {
    const t = state.ticket;
    if (t.side !== el.dataset.side && Number.isInteger(t.price)) t.price = 100 - t.price;
    t.side = el.dataset.side;
    renderTicket();
  },
  async cancel(el) {
    await api(`/orders/${el.dataset.id}`, { method: 'DELETE' });
    toast('Order cancelled');
    render();
  },
  async resolve(el) {
    const outcome = el.dataset.outcome;
    const label = outcome === 'void' ? 'void this market and refund everyone' : `resolve this market ${outcome.toUpperCase()}`;
    if (!confirm(`Really ${label}? This cannot be undone.`)) return;
    const { fees } = await api(`/markets/${state.detail.market.id}/resolve`, { method: 'POST', body: { outcome } });
    toast(outcome === 'void' ? 'Market voided, stakes refunded' : `Market settled. Fees collected: ${money(fees)}`);
    render();
  },
  async propose(el) {
    const outcome = el.dataset.outcome;
    if (!confirm(`Report the result as ${outcomeWord(outcome)}? Trading stops now, and traders get ${DISPUTE_HOURS} hours to dispute it.`)) return;
    await api(`/markets/${state.detail.market.id}/propose`, { method: 'POST', body: { outcome } });
    toast('Result reported. It pays out after the dispute window.');
    render();
  },
  async resetDemo() {
    if (!confirm('Erase every account, market and trade in this browser and start over with the example markets?')) return;
    await api('/reset-demo', { method: 'POST' });
    location.hash = '#/';
    location.reload();
  },
  async faucet() {
    await api('/faucet', { method: 'POST' });
    toast('Demo credits added');
    render();
  },
};

const forms = {
  async order() {
    const { marketId, side, price, qty } = state.ticket;
    const r = await api(`/markets/${marketId}/orders`, { method: 'POST', body: { side, price, qty } });
    toast(r.filled && r.resting ? `${r.filled} filled, ${r.resting} waiting in the book`
      : r.filled ? `Filled ${r.filled} contracts` : 'Order is waiting in the book');
    render();
  },
  async create(data) {
    const { market } = await api('/markets', {
      method: 'POST',
      body: { ...data, closesAt: new Date(data.closesAt).getTime() },
    });
    toast('Market created');
    location.hash = `#/m/${market.id}`;
  },
  async dispute(data) {
    await api(`/markets/${state.detail.market.id}/dispute`, { method: 'POST', body: data });
    toast('Dispute sent. An admin will decide.');
    render();
  },
  async report(data) {
    await api(`/markets/${state.detail.market.id}/report`, { method: 'POST', body: data });
    toast('Report sent to the admins');
    render();
  },
  async login(data) {
    state.user = (await api('/login', { method: 'POST', body: data })).user;
    location.hash = '#/';
  },
  async signup(data) {
    state.user = (await api('/register', { method: 'POST', body: data })).user;
    location.hash = '#/';
  },
};

document.addEventListener('click', async (e) => {
  const el = e.target.closest('[data-action]');
  if (!el) return;
  e.preventDefault();
  try {
    await actions[el.dataset.action](el);
  } catch (err) {
    toast(err.message, true);
  }
});

document.addEventListener('submit', async (e) => {
  const form = e.target.closest('[data-form]');
  if (!form) return;
  e.preventDefault();
  const button = form.querySelector('button:not([type=button]):not([data-action])');
  if (button) button.disabled = true;
  try {
    await forms[form.dataset.form](Object.fromEntries(new FormData(form)));
  } catch (err) {
    toast(err.message, true);
  } finally {
    if (button) button.disabled = false;
  }
});

let searchTimer;
document.addEventListener('input', (e) => {
  if (e.target.id === 'search') {
    state.filters.q = e.target.value;
    clearTimeout(searchTimer);
    searchTimer = setTimeout(async () => {
      await marketsPage();
      const input = document.getElementById('search');
      input.focus();
      input.setSelectionRange(input.value.length, input.value.length);
    }, 250);
  } else if (e.target.closest('[data-form=order]')) {
    state.ticket[e.target.name] = e.target.value === '' ? null : Number(e.target.value);
    renderSummary();
  }
});

window.addEventListener('hashchange', render);

state.config = await api('/config');
if (state.config.local) {
  document.getElementById('demo-note').hidden = false;
}
render();
