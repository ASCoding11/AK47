import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createEngine } from '../functions/engine.js';
import { handle } from '../functions/api.js';
import { memoryStore } from '../test-support/memory-store.js';

const DAY = 86_400_000;

async function setup() {
  let clock = 1_000_000;
  const db = memoryStore();
  const engine = createEngine(db, { now: () => clock });
  const join = async (uid, name) => (await engine.join(uid, { name })).user;
  const admin = await join('u-admin', 'Admin');
  const alice = await join('u-alice', 'Alice');
  const bob = await join('u-bob', 'Bob');
  const maker = await join('u-maker', 'Maker');
  const { market } = await engine.createMarket(maker.id, {
    question: 'Will it rain in Seattle tomorrow?',
    description: 'Resolves YES if SEA airport records measurable rain.',
    category: 'Science',
    closesAt: clock + DAY,
  });
  const balance = async (u) => (await engine.me(u.id)).balance;
  const stats = () => engine.stats(admin.id);
  return { db, engine, admin, alice, bob, maker, market, balance, stats, advance: (ms) => (clock += ms) };
}

test('firebase: joining grants 1,000 Avenues once; first member is admin; names stay unique', async () => {
  const { engine, admin, alice } = await setup();
  assert.equal(admin.isAdmin, true);
  assert.equal(alice.isAdmin, false);
  assert.equal(alice.balance, 100_000);
  const again = await engine.join('u-alice', { name: 'Alice' });
  assert.equal(again.isNew, false);
  assert.equal(again.user.balance, 100_000);
  const twin = await engine.join('u-alice-2', { name: 'alice' });
  assert.equal(twin.user.username, 'alice2');
  const short = await engine.join('u-x', { email: 'xy@example.com' });
  assert.equal(short.user.username, 'memberxy');
});

test('firebase: market ids count up from 1', async () => {
  const { engine, market, maker } = await setup();
  assert.equal(market.id, 1);
  const { market: next } = await engine.createMarket(maker.id, {
    question: 'Will the river freeze this winter?',
    description: 'Resolves YES if the city reports ice cover on the river.',
    category: 'Science',
    closesAt: 1_000_000 + 2 * DAY,
  });
  assert.equal(next.id, 2);
});

test('firebase: bets wait until the other side agrees, then match at the waiting price', async () => {
  const { engine, alice, bob, market, balance, stats } = await setup();
  const a = await engine.placeOrder(alice.id, market.id, { side: 'yes', price: 60, qty: 10 });
  assert.deepEqual([a.filled, a.resting], [0, 10]);
  assert.equal(await balance(alice), 100_000 - 600);
  const b1 = await engine.placeOrder(bob.id, market.id, { side: 'no', price: 30, qty: 10 });
  assert.equal(b1.filled, 0);
  const b2 = await engine.placeOrder(bob.id, market.id, { side: 'no', price: 45, qty: 4 });
  assert.deepEqual([b2.filled, b2.resting], [4, 0]);
  assert.equal(await balance(bob), 100_000 - 300 - 4 * 40);
  const { markets } = await engine.listMarkets();
  assert.equal(markets[0].lastPrice, 60);
  assert.equal(markets[0].yesBid, 60);
  assert.equal(markets[0].yesAsk, 70);
  const d = await engine.marketDetail(market.id, alice.id);
  assert.deepEqual(d.book.yes, [{ price: 60, qty: 6 }]);
  assert.deepEqual(d.position, { yesQty: 4, noQty: 0, yesCost: 240, noCost: 0, payout: null, fee: null });
  assert.equal(d.trades.length, 1);
  assert.equal((await stats()).balanced, true);
});

test('firebase: creators can bet on their own market', async () => {
  const { engine, alice, maker, market } = await setup();
  await engine.placeOrder(maker.id, market.id, { side: 'yes', price: 50, qty: 4 });
  assert.equal((await engine.placeOrder(alice.id, market.id, { side: 'no', price: 50, qty: 4 })).filled, 4);
});

test('firebase: a member never matches their own bet', async () => {
  const { engine, alice, market, balance } = await setup();
  await engine.placeOrder(alice.id, market.id, { side: 'yes', price: 60, qty: 10 });
  const r = await engine.placeOrder(alice.id, market.id, { side: 'no', price: 50, qty: 10 });
  assert.equal(r.filled, 0);
  assert.equal(await balance(alice), 100_000 - 500);
});

test('firebase: cancelling refunds the unmatched part and updates the best price', async () => {
  const { engine, alice, bob, market, balance } = await setup();
  const { orderId } = await engine.placeOrder(alice.id, market.id, { side: 'yes', price: 20, qty: 10 });
  await engine.placeOrder(alice.id, market.id, { side: 'yes', price: 15, qty: 10 });
  await assert.rejects(engine.cancelOrder(bob.id, orderId), /not found/);
  await engine.cancelOrder(alice.id, orderId);
  assert.equal(await balance(alice), 100_000 - 150);
  assert.equal((await engine.listMarkets()).markets[0].yesBid, 15);
  await assert.rejects(engine.cancelOrder(alice.id, orderId), /no longer open/);
});

test('firebase: report, then admin verifies; 10% of winnings is kept', async () => {
  const { engine, admin, alice, bob, maker, market, balance, stats, advance } = await setup();
  await engine.placeOrder(alice.id, market.id, { side: 'yes', price: 60, qty: 10 });
  await engine.placeOrder(bob.id, market.id, { side: 'no', price: 40, qty: 10 });
  await engine.placeOrder(alice.id, market.id, { side: 'yes', price: 30, qty: 5 }); // waiting
  await assert.rejects(engine.proposeResolution(alice.id, market.id, 'yes', 'NWS report'), /Only the market/);
  await assert.rejects(engine.proposeResolution(maker.id, market.id, 'yes', ''), /source/);
  await engine.proposeResolution(maker.id, market.id, 'yes', 'NWS daily climate report for SEA');
  assert.equal(await balance(alice), 100_000 - 600, 'waiting bet refunded');
  await assert.rejects(engine.placeOrder(bob.id, market.id, { side: 'no', price: 50, qty: 1 }), /closed/);
  advance(30 * DAY);
  const d = await engine.marketDetail(market.id);
  assert.equal(d.market.status, 'proposed');
  assert.match(d.market.reportNote, /NWS/);
  assert.equal((await stats()).proposed.length, 1);
  assert.equal((await stats()).balanced, true);
  await assert.rejects(engine.resolveMarket(maker.id, market.id, 'yes'), /admin/);
  const { fees } = await engine.resolveMarket(admin.id, market.id, 'yes');
  assert.equal(fees, 40);
  assert.equal(await balance(alice), 100_000 + 400 - 40);
  assert.equal(await balance(bob), 100_000 - 400);
  const s = await stats();
  assert.equal(s.feeRevenue, 40);
  assert.equal(s.positionEscrow + s.orderEscrow, 0);
  assert.equal(s.balanced, true);
  assert.deepEqual(s.feesByMarket, [{ marketId: 1, question: 'Will it rain in Seattle tomorrow?', amount: 40 }]);
  await assert.rejects(engine.resolveMarket(admin.id, market.id, 'no'), /already settled/);
  const p = await engine.portfolio(alice.id);
  assert.equal(p.positions[0].position.payout, 1000);
  assert.equal(p.positions[0].position.fee, 40);
  assert.ok(p.ledger.some((l) => l.type === 'payout' && l.amount === 960));
});

test('firebase: void refunds everything with no cut', async () => {
  const { engine, admin, alice, bob, market, balance } = await setup();
  await engine.placeOrder(alice.id, market.id, { side: 'yes', price: 70, qty: 5 });
  await engine.placeOrder(bob.id, market.id, { side: 'no', price: 30, qty: 3 });
  const { fees } = await engine.resolveMarket(admin.id, market.id, 'void');
  assert.equal(fees, 0);
  assert.equal(await balance(alice), 100_000);
  assert.equal(await balance(bob), 100_000);
});

test('firebase: settlement runs in batches and resumes without paying twice', async () => {
  const { db, engine, admin, market, stats } = await setup();
  const traders = [];
  for (let i = 0; i < 260; i++) traders.push((await engine.join(`u-t${i}`, { name: `Trader ${i}` })).user);
  for (let i = 0; i < traders.length; i += 2) {
    await engine.placeOrder(traders[i].id, market.id, { side: 'yes', price: 50, qty: 2 });
    await engine.placeOrder(traders[i + 1].id, market.id, { side: 'no', price: 50, qty: 2 });
  }
  // Simulate a crash after the first batch: run one batch by hand, then resume.
  await db.tx(async (t) => {
    await t.get(`markets/${market.id}`);
    t.update(`markets/${market.id}`, { status: 'settling', settlingOutcome: 'yes' });
  });
  const firstBatch = [...db.docs].filter(([k, v]) => k.startsWith('positions/') && v.settled === false).slice(0, 50);
  await db.batch(async (w) => {
    for (const [k, p] of firstBatch) {
      const payout = 100 * (p.yesQty ?? 0);
      const fee = Math.floor(((payout - (p.yesCost ?? 0) - (p.noCost ?? 0)) * 1000) / 10_000);
      w.update(`users/${p.uid}`, { balance: db.inc(payout - Math.max(fee, 0)) });
      w.update(k, { settled: true, payout, fee: Math.max(fee, 0) });
      if (fee > 0) w.set('meta/stats', { fees: db.inc(fee) }, { merge: true });
    }
  });
  const { market: done } = await engine.resolveMarket(admin.id, market.id, 'no'); // keeps 'yes'
  assert.equal(done.outcome, 'yes');
  const s = await stats();
  assert.equal(s.positionEscrow, 0);
  assert.equal(s.balanced, true);
  const winner = await engine.me(traders[0].id);
  assert.equal(winner.balance, 100_000 + 100 - 10);
});

test('firebase: content reports reach the admin', async () => {
  const { engine, alice, market, stats } = await setup();
  await assert.rejects(engine.reportMarket(alice.id, market.id, 'bad'), /5-1000/);
  await engine.reportMarket(alice.id, market.id, 'This is about a private person');
  await engine.reportMarket(alice.id, market.id, 'Updated: about a private person');
  const { reports } = await stats();
  assert.equal(reports.length, 1);
  assert.equal(reports[0].reporter, 'Alice');
});

test('firebase: money is conserved through random betting and settlement', async () => {
  const { engine, admin, alice, bob, maker, market, stats } = await setup();
  const users = [alice, bob, maker];
  let seed = 7;
  const rand = (n) => (seed = (seed * 1_103_515_245 + 12_345) % 2 ** 31) % n;
  for (let i = 0; i < 150; i++) {
    try {
      await engine.placeOrder(users[rand(3)].id, market.id, { side: rand(2) ? 'yes' : 'no', price: 1 + rand(99), qty: 1 + rand(80) });
    } catch (err) {
      assert.match(err.message, /balance/);
    }
  }
  assert.equal((await stats()).balanced, true);
  await engine.resolveMarket(admin.id, market.id, 'no');
  const s = await stats();
  assert.equal(s.balanced, true);
  assert.equal(s.orderEscrow + s.positionEscrow, 0);
});

test('firebase api: routes, sign-in checks and auto-join', async () => {
  const db = memoryStore();
  const engine = createEngine(db);
  const anon = { uid: null };
  const ada = { uid: 'g-ada', profile: { name: 'Ada Lovelace' } };
  assert.deepEqual(await handle(engine, anon, { method: 'GET', path: '/me' }), { user: null });
  await assert.rejects(handle(engine, anon, { method: 'POST', path: '/markets', body: {} }), /Sign in first/);
  const joined = await handle(engine, ada, { method: 'GET', path: '/me' });
  assert.equal(joined.isNew, true);
  assert.equal(joined.user.balance, 100_000);
  assert.equal((await handle(engine, ada, { method: 'GET', path: '/me' })).isNew, false);
  const { market } = await handle(engine, ada, {
    method: 'POST', path: '/markets',
    body: { question: 'Will the bakery open on Sunday?', description: 'Resolves YES if the bakery website lists Sunday hours.', category: 'Other', closesAt: Date.now() + DAY },
  });
  const { orderId } = await handle(engine, ada, { method: 'POST', path: `/markets/${market.id}/orders`, body: { side: 'yes', price: 40, qty: 5 } });
  const list = await handle(engine, anon, { method: 'GET', path: '/markets?status=open' });
  assert.equal(list.markets.length, 1);
  await handle(engine, ada, { method: 'DELETE', path: `/orders/${orderId}` });
  assert.equal((await handle(engine, ada, { method: 'GET', path: '/portfolio' })).orders.length, 0);
  await assert.rejects(handle(engine, ada, { method: 'GET', path: '/nope' }), /Not found/);
  assert.equal((await handle(engine, ada, { method: 'GET', path: '/admin/stats' })).balanced, true);
});
