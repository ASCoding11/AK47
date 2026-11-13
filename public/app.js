import { request } from './transport.js';

const view = document.getElementById('view');
const nav = document.getElementById('nav');
const toastEl = document.getElementById('toast');

const state = {
  user: null,
  config: { categories: [] },
  filters: { status: 'open', category: '', q: '' },
  ticket: { side: 'yes', price: null, qty: 100 },
  detail: null,
};

// ---------- helpers ----------

const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
// Balances are play money: 100 units = 1 Avenue. Contracts pay 1 Avenue, and a
// contract's price (1-99) reads as a percentage of that Avenue.
const money = (units) => {
  const n = Math.abs(units) / 100;
  const text = n.toLocaleString('en-US', { minimumFractionDigits: Number.isInteger(n) ? 0 : 2, maximumFractionDigits: 2 });
  return `${units < 0 ? '-' : ''}${text} ${n === 1 ? 'Avenue' : 'Avenues'}`;
};
const signed = (cents) => (cents > 0 ? '+' : '') + money(cents);
const date = (ms) => new Date(ms).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });

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
      : state.config.googleClientId
        ? `<a class="btn primary" href="#/signin">Sign in · 1,000 free Avenues</a>`
        : `${link('#/login', 'Log in')}<a class="btn primary" href="#/signup">Sign up</a>`}`;
}

function statusBadge(m) {
  if (m.status === 'resolved') return `<span class="badge ${m.outcome}">Resolved ${m.outcome.toUpperCase()}</span>`;
  if (m.status === 'voided') return '<span class="badge">Voided</span>';
  if (m.status === 'closed') return '<span class="badge warn">Waiting for result</span>';
  if (m.status === 'proposed' || m.status === 'disputed') return '<span class="badge warn">Being verified</span>';
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
      <p>Crowdline is a play-money prediction marketplace. Members create markets, trade with each other in Avenues,
      and each market’s creator reports the result. Every contract pays 1 Avenue to the side that is right.
      ${state.user ? '' : `<a class="yes" href="${signInHref()}">Sign in${state.config.googleClientId ? ' with Google' : ''}</a> and get 1,000 Avenues free.`}
      Avenues have no cash value. <a class="yes" href="#/terms">How it works</a></p>
    </div>
    ${adSlot('marketsTop')}
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
      ? `<div class="grid">${markets.map((m, i) => card(m) + (i === 5 && markets.length > 6 ? adSlot('marketsInline') : '')).join('')}</div>`
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
    state.ticket = { marketId: m.id, side: 'yes', qty: 100, price: bestNo ? 100 - bestNo : m.lastPrice ?? 50 };
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
          <h2>YES price ${p == null ? '' : `· <span class="yes">${p}%</span>`}</h2>
          ${chart(d.trades)}
        </div>
        <div class="panel">
          <h2>Order book</h2>
          <div class="book">
            ${bookSide('yes', d.book.yes)}
            ${bookSide('no', d.book.no)}
          </div>
          <p class="muted small" style="margin:12px 0 0">A YES bid at 60% trades with a NO bid at 40% or more: together they fund the 1 Avenue payout.</p>
        </div>
        <div class="panel">
          <h2>How this resolves</h2>
          <div class="rules">${esc(m.description)}</div>
          <p class="muted small" style="margin:12px 0 0">When the event happens, ${esc(m.creator)} reports the result with a source,
          and Crowdline verifies it before anything pays out.</p>
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
               ${d.trades.slice(0, 15).map((t) => `<tr><td class="muted">${date(t.at)}</td><td class="r num">${t.yesPrice}%</td><td class="r num">${t.qty}</td></tr>`).join('')}</table>`
            : '<div class="muted">No trades yet.</div>'}
        </div>
      </div>
      <div>
        ${resultPanel(d, isCreator)}
        ${m.status === 'open' ? '<div class="panel" id="ticket"></div>' : ''}
        ${positionPanel(d)}
        ${ordersPanel(d)}
        ${adSlot('marketSide')}
        ${state.user?.isAdmin && !['resolved', 'voided'].includes(m.status) ? `
          <div class="panel">
            <h2>${m.proposedOutcome ? 'Verify the result' : 'Settle this market'}</h2>
            <p class="muted small">${m.proposedOutcome
              ? `${esc(m.creator)} reported <b>${outcomeWord(m.proposedOutcome)}</b>. Check the source, then confirm it or settle it differently.`
              : 'Settle once the result is known, or void a market that breaks the rules.'}
              This pays out every position immediately and can’t be undone.</p>
            <div class="actions">
              ${['yes', 'no', 'void'].map((o) => `<button class="${o === 'yes' ? 'buy-yes' : o === 'no' ? 'buy-no' : ''}"
                data-action="resolve" data-outcome="${o}">${m.proposedOutcome === o ? 'Confirm ' : ''}${o === 'void' ? 'Void and refund' : o.toUpperCase()}</button>`).join('')}
            </div>
          </div>` : ''}
      </div>
    </div>`;
  renderTicket();
}

const outcomeWord = (o) => (o === 'void' ? 'Void (refund everyone)' : o.toUpperCase());

// The creator reports what happened; Crowdline verifies it before payout.
function resultPanel(d, isCreator) {
  const m = d.market;
  if (m.status === 'proposed' || m.status === 'disputed') {
    return `<div class="panel">
      <h2>Result being verified</h2>
      <p>${esc(m.creator)} reported <b>${outcomeWord(m.proposedOutcome)}</b>${m.reportedAt ? ` on ${date(m.reportedAt)}` : ''}.</p>
      ${m.reportNote ? `<p class="rules muted">Source: ${esc(m.reportNote)}</p>` : ''}
      <p class="muted small">Crowdline checks the result before anything pays out. Trading is closed until then.</p>
    </div>`;
  }
  if (isCreator && (m.status === 'open' || m.status === 'closed')) {
    return `<div class="panel">
      <h2>Report the result</h2>
      <p class="muted small">You created this market, so once the event happens, tell us what happened and where to check it.
      Trading stops when you report, and Crowdline verifies the result before anything pays out.</p>
      <form data-form="propose">
        <div class="sides outcome-pick">
          ${['yes', 'no', 'void'].map((o) => `<label class="pick"><input type="radio" name="outcome" value="${o}" required>
            <span>${o === 'void' ? 'Void' : o.toUpperCase()}</span></label>`).join('')}
        </div>
        <label>Source<textarea id="report-note" name="note" required minlength="5" maxlength="1000"
          placeholder="Link or name the source that shows the result."></textarea></label>
        <button class="primary">Report result</button>
      </form>
    </div>`;
  }
  return '';
}

function bookSide(side, levels) {
  return `
    <table>
      <tr><th class="${side}">${side.toUpperCase()} bids</th><th class="r">Contracts</th></tr>
      ${levels.length
        ? levels.map((l) => `<tr><td class="num ${side}">${l.price}%</td><td class="r num">${l.qty.toLocaleString()}</td></tr>`).join('')
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
    el.innerHTML = `<h2>Trade</h2><p class="muted">Sign in to trade. New members get 1,000 Avenues free.</p>
      <a class="btn primary" href="${signInHref()}">Sign in</a>`;
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
        <label>Limit price (%)<input name="price" type="number" min="1" max="99" step="1" required value="${t.price ?? ''}"></label>
        <label>Contracts<input name="qty" type="number" min="1" step="1" required value="${t.qty}"></label>
      </div>
      <p class="muted small">${ask == null
        ? `Nobody is offering ${t.side.toUpperCase()} right now. Your order will wait in the book for a match.`
        : `Fills right away at ${ask}% or higher. A lower price waits in the book.`}</p>
      <p class="muted small">Each contract pays 1 Avenue if you’re right. Its price is a percentage of that Avenue:
      at 60%, a contract costs 0.60 Avenues.</p>
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
    <div class="total"><span>Profit if ${side.toUpperCase()}</span><span class="num yes">${signed(profit)}</span></div>`;
}

function positionPanel(d) {
  const p = d.position;
  if (!p || (!p.yesQty && !p.noQty)) return '';
  const cost = p.yesCost + p.noCost;
  const row = (side, qty, c) =>
    qty ? `<tr><td class="${side}">${side.toUpperCase()}</td><td class="r num">${qty.toLocaleString()}</td><td class="r num">${(c / qty).toFixed(1)}%</td><td class="r num">${money(c)}</td></tr>` : '';
  let outcome = '';
  if (p.payout != null) {
    const net = p.payout - cost;
    outcome = `<div class="summary">
      <div><span class="muted">Payout</span><span class="num">${money(p.payout)}</span></div>
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
      <td class="num">${o.remaining.toLocaleString()} @ ${o.price}%</td>
      <td class="r"><button class="link" data-action="cancel" data-id="${o.id}">Cancel</button></td></tr>`).join('')}
  </table></div>`;
}

// ---------- create ----------

function createPage() {
  if (!state.user) return (location.hash = signInHref());
  const d = new Date(Date.now() + 7 * 86_400_000);
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  view.innerHTML = `
    <h1>Create a market</h1>
    <p class="muted">Ask a yes-or-no question with an outcome anyone can check. You can trade in your own market.
    When the event happens you report the result, and Crowdline verifies it.</p>
    <div class="panel form">
      <h2>Market rules</h2>
      <ul class="rule-list">
        <li>The result must be public and checkable. Name the source that decides it.</li>
        <li>No markets on anyone’s death, injury or safety, or on violence, terrorism, war casualties or crimes.</li>
        <li>No markets about private individuals.</li>
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
      <p class="muted">${signup ? 'New accounts get 1,000 Avenues to play with.' : '&nbsp;'}</p>
      <label>Username<input name="username" required autocomplete="username" minlength="3" maxlength="20"></label>
      <label>Password<input name="password" type="password" required minlength="8" autocomplete="${signup ? 'new-password' : 'current-password'}"></label>
      ${signup ? `<p class="muted small">By signing up you agree to the <a class="yes" href="#/terms">marketplace terms</a>.</p>` : ''}
      <button class="primary wide">${signup ? 'Sign up' : 'Log in'}</button>
      <p class="muted small" style="margin-top:14px">${signup
        ? 'Already have an account? <a class="yes" href="#/login">Log in</a>'
        : 'New here? <a class="yes" href="#/signup">Sign up</a>'}</p>
    </form>`;
}

// ---------- portfolio ----------

const LEDGER_LABELS = {
  deposit: 'Welcome Avenues',
  order_reserve: 'Order placed',
  order_refund: 'Order cancelled',
  price_improvement: 'Filled at a better price',
  payout: 'Market payout',
  void_refund: 'Market voided, stake returned',
};

async function portfolioPage() {
  if (!state.user) return (location.hash = signInHref());
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
    <div class="panel scroll"><h2>Positions</h2>
      ${live.length ? `<table><tr><th>Market</th><th>Holding</th><th class="r">Cost</th><th class="r">Status</th></tr>
        ${live.map((r) => `<tr><td><a href="#/m/${r.market.id}">${esc(r.market.question)}</a></td><td>${holding(r.position)}</td>
          <td class="r num">${money(r.position.yesCost + r.position.noCost)}</td><td class="r">${statusBadge(r.market)}</td></tr>`).join('')}</table>`
        : '<div class="muted">No open positions.</div>'}
    </div>
    <div class="panel scroll"><h2>Open orders</h2>
      ${orders.length ? `<table><tr><th>Market</th><th>Order</th><th class="r">Reserved</th><th></th></tr>
        ${orders.map((o) => `<tr><td><a href="#/m/${o.marketId}">${esc(o.question)}</a></td>
          <td><span class="${o.side}">${o.side.toUpperCase()}</span> ${o.remaining.toLocaleString()} @ ${o.price}%</td>
          <td class="r num">${money(o.remaining * o.price)}</td>
          <td class="r"><button class="link" data-action="cancel" data-id="${o.id}">Cancel</button></td></tr>`).join('')}</table>`
        : '<div class="muted">No open orders.</div>'}
    </div>
    <div class="panel scroll"><h2>Settled</h2>
      ${settled.length ? `<table><tr><th>Market</th><th>Held</th><th class="r">Cost</th><th class="r">Payout</th><th class="r">Result</th></tr>
        ${settled.map((r) => {
          const p = r.position, cost = p.yesCost + p.noCost, net = p.payout - cost;
          return `<tr><td><a href="#/m/${r.market.id}">${esc(r.market.question)}</a> ${statusBadge(r.market)}</td><td>${holding(p)}</td>
            <td class="r num">${money(cost)}</td><td class="r num">${money(p.payout)}</td>
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
      ${stat('Users', s.users.toLocaleString())}
      ${stat('Markets', s.markets.toLocaleString())}
      ${stat('Contracts traded', s.contractsTraded.toLocaleString())}
    </div>
    <div class="panel"><h2>Where the money is</h2>
      <div class="summary">
        <div><span class="muted">Member balances</span><span class="num">${money(s.userBalances)}</span></div>
        <div><span class="muted">Held for open orders</span><span class="num">${money(s.orderEscrow)}</span></div>
        <div><span class="muted">Held for open positions</span><span class="num">${money(s.positionEscrow)}</span></div>
        ${s.feeRevenue ? `<div><span class="muted">Fees from an earlier version</span><span class="num">${money(s.feeRevenue)}</span></div>` : ''}
        <div class="total"><span>Avenues given out</span><span class="num">${money(s.deposits)}</span></div>
      </div>
      <span class="badge ${s.balanced ? 'yes' : 'no'}">${s.balanced ? 'Books balance: every payout is fully funded by traders' : 'Books do not balance'}</span>
    </div>
    <div class="panel scroll"><h2>Reported markets</h2>
      ${s.reports.length ? `<table>${s.reports.map((r) => `<tr>
        <td><a href="#/m/${r.marketId}">${esc(r.question)}</a><div class="muted small">${esc(r.reason)}</div></td>
        <td class="r muted">${esc(r.reporter)} · ${date(r.at)}</td></tr>`).join('')}</table>`
        : '<div class="muted">No open reports.</div>'}
    </div>
    <div class="panel scroll"><h2>Results to verify</h2>
      ${s.proposed.length ? `<table>${s.proposed.map((m) => `<tr>
        <td><a href="#/m/${m.id}">${esc(m.question)}</a>${m.reportNote ? `<div class="muted small">Source: ${esc(m.reportNote)}</div>` : ''}</td>
        <td class="r">${outcomeWord(m.proposedOutcome)}</td></tr>`).join('')}</table>`
        : '<div class="muted">Nothing to verify.</div>'}
    </div>
    <div class="panel scroll"><h2>Closed, waiting for the creator</h2>
      ${s.awaitingResolution.length ? `<table>${s.awaitingResolution.map((m) => `<tr>
        <td><a href="#/m/${m.id}">${esc(m.question)}</a></td><td class="r muted">${esc(m.creator)} · closed ${date(m.closesAt)}</td></tr>`).join('')}</table>`
        : '<div class="muted">Every closed market has a reported result.</div>'}
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
      the other buys NO, and together their payments fund the 1 Avenue that each contract pays the winner.
      Crowdline never buys or sells contracts, never takes the other side of a trade, and doesn’t set prices.</p>
      <h2>No fees</h2>
      <p>When a market settles, every winning contract pays its holder 1 Avenue in full. Crowdline takes nothing.</p>
      <h2>Who decides the result</h2>
      <p>Crowdline verifies every result. When the event happens, the member who created the market reports what
      happened and the source that shows it, and trading stops. A Crowdline admin checks the result against the
      market’s rules before anything pays out, and the admin’s decision is final. Creators can trade in their own
      markets like anyone else. Admins can also void a market that breaks the rules, which refunds every stake.</p>
      <h2>Market rules</h2>
      <p>No markets on anyone’s death, injury or safety; on violence, terrorism, war casualties or crimes; about private
      individuals; or on anything the creator can decide or influence. Report markets that break these rules.</p>
      <h2>Avenues are play money</h2>
      <p>Avenues have no cash value. New members get 1,000 Avenues free when they first sign in${state.config.googleClientId ? ' with Google' : ''},
      once per account. Avenues can’t be bought, sold, withdrawn, transferred or exchanged for prizes. When you place an
      order, its full cost is set aside from your balance until it fills or you cancel it, and Avenues in open positions
      are held until the market settles.</p>
      <h2>How Crowdline makes money</h2>
      <p>Crowdline shows ads. It never charges members anything. See the <a class="yes" href="#/privacy">privacy page</a>
      for what the ads and Google sign-in collect.</p>
      <h2>Play fair</h2>
      <p>Crowdline is just for fun. Don’t trade on information you got in confidence, manipulate the event a market
      is about, or use more than one account.</p>
    </article>`;
}

// ---------- Google sign-in ----------

function signInHref() {
  return state.config.googleClientId ? '#/signin' : '#/signup';
}

const scripts = new Map();
function loadScript(src) {
  if (!scripts.has(src)) {
    scripts.set(src, new Promise((resolve, reject) => {
      const el = document.createElement('script');
      el.src = src;
      el.async = true;
      el.crossOrigin = 'anonymous';
      el.onload = resolve;
      el.onerror = () => {
        scripts.delete(src);
        reject(new Error('blocked'));
      };
      document.head.append(el);
    }));
  }
  return scripts.get(src);
}

async function onGoogleCredential({ credential }) {
  try {
    const { user, isNew } = await api('/google', { method: 'POST', body: { credential } });
    state.user = user;
    toast(isNew ? `Welcome! You have ${money(user.balance)} to trade with.` : `Welcome back, ${user.username}`);
    location.hash = '#/';
  } catch (err) {
    toast(err.message, true);
  }
}

function signInPage() {
  if (!state.config.googleClientId) return (location.hash = '#/signup');
  if (state.user) return (location.hash = '#/');
  view.innerHTML = `
    <div class="panel narrow signin">
      <h1>Sign in to Crowdline</h1>
      <p>New members get <b>1,000 Avenues</b> free, once per Google account. Avenues are play money:
      they can’t be bought, cashed out or exchanged for prizes.</p>
      <div id="google-button" class="google-button"><span class="muted small">Loading Google sign-in…</span></div>
      <p class="muted small">By signing in you agree to the <a class="yes" href="#/terms">marketplace terms</a> and
      <a class="yes" href="#/privacy">privacy policy</a>. We keep your Google account ID and a username made from your name,
      and we don’t post anything to your account.</p>
    </div>`;
  loadScript('https://accounts.google.com/gsi/client')
    .then(() => {
      const holder = document.getElementById('google-button');
      if (!holder || !window.google?.accounts?.id) return;
      google.accounts.id.initialize({ client_id: state.config.googleClientId, callback: onGoogleCredential });
      holder.innerHTML = '';
      google.accounts.id.renderButton(holder, { theme: 'filled_black', size: 'large', shape: 'pill', text: 'continue_with', width: 280 });
    })
    .catch(() => {
      const holder = document.getElementById('google-button');
      if (holder) holder.innerHTML = '<p class="no small">Google sign-in couldn’t load. If you use an ad or tracker blocker, allow accounts.google.com and reload.</p>';
    });
}

// ---------- ads ----------

function adSlot(name) {
  const ads = state.config.ads ?? {};
  const slot = ads.slots?.[name];
  if (ads.client && slot) {
    return `<div class="ad ad-${name}"><span class="ad-label">Advertisement</span>
      <ins class="adsbygoogle" style="display:block" data-ad-client="${esc(ads.client)}" data-ad-slot="${esc(slot)}"
        data-ad-format="auto" data-full-width-responsive="true"></ins></div>`;
  }
  if (!ads.client && ads.showPlaceholders) {
    return `<div class="ad ad-${name} ad-placeholder"><span class="ad-label">Ad space</span></div>`;
  }
  return '';
}

function fillAds() {
  const slots = view.querySelectorAll('ins.adsbygoogle:not([data-adsbygoogle-status])');
  if (!slots.length) return;
  const client = encodeURIComponent(state.config.ads.client);
  loadScript(`https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${client}`).catch(() => {});
  for (let i = 0; i < slots.length; i++) {
    try {
      (window.adsbygoogle = window.adsbygoogle || []).push({});
    } catch {}
  }
}

// ---------- privacy ----------

function privacyPage() {
  view.innerHTML = `
    <article class="panel terms">
      <h1>Privacy</h1>
      <p class="muted">What Crowdline collects and why.</p>
      <h2>Your account</h2>
      <p>${state.config.googleClientId
        ? 'When you sign in with Google, Crowdline receives your Google account ID, name and email address from Google. It keeps only the account ID, to recognise you next time, and a username made from your name. It doesn’t store your email address or get access to anything else in your Google account.'
        : 'Crowdline stores your username and a scrambled (hashed) copy of your password.'}
      It also stores the markets you create, your orders, trades, balance, and any reports you send.
      Usernames, markets and trades can be seen by other members.</p>
      ${state.config.local ? `<h2>This copy runs in your browser</h2>
      <p>On this site, Crowdline runs entirely in your browser. Your account and everything you do is saved in your
      browser’s storage on this device and isn’t sent to a Crowdline server. Clearing your browser data, or using Reset demo, erases it.</p>` : ''}
      <h2>Ads</h2>
      <p>Crowdline pays for itself with ads from Google AdSense. Google and its partners use cookies to show ads and to
      measure them, and may use them to personalise ads based on your visits to this and other sites. You can turn off
      personalised ads in <a class="yes" href="https://adssettings.google.com" target="_blank" rel="noopener">Google’s ad settings</a>.
      Read <a class="yes" href="https://policies.google.com/technologies/partner-sites" target="_blank" rel="noopener">how Google uses
      information from sites that use its services</a>.</p>
      <h2>Questions</h2>
      <p>Open an issue on the project’s <a class="yes" href="https://github.com/ASCoding11/AK47/issues" target="_blank" rel="noopener">GitHub page</a>.</p>
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
    else if (hash === '#/privacy') privacyPage();
    else if (hash === '#/signin') signInPage();
    else await marketsPage();
  } catch (err) {
    view.innerHTML = `<div class="empty">${esc(err.message)}</div>`;
  }
  fillAds();
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
    await api(`/markets/${state.detail.market.id}/resolve`, { method: 'POST', body: { outcome } });
    toast(outcome === 'void' ? 'Market voided, stakes refunded' : `Market settled as ${outcome.toUpperCase()}`);
    render();
  },
  async resetDemo() {
    if (!confirm('Erase every account, market and trade in this browser and start over with the example markets?')) return;
    await api('/reset-demo', { method: 'POST' });
    location.hash = '#/';
    location.reload();
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
  async propose(data) {
    await api(`/markets/${state.detail.market.id}/propose`, { method: 'POST', body: data });
    toast('Result reported. Crowdline will verify it.');
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
