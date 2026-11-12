import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createEngine as createSqlEngine } from '../src/engine.js';
import { createEngine as createLocalEngine, memoryStorage } from '../src/local-engine.js';
import { createLocalApi } from '../src/local-api.js';

const DAY = 86_400_000;

const ENGINES = {
  server: (now) => createSqlEngine(':memory:', { now }),
  browser: (now) => createLocalEngine({ storage: memoryStorage(), now }),
};

for (const [kind, make] of Object.entries(ENGINES)) {

async function setup() {
  let clock = 1_000_000;
  const engine = make(() => clock);
  const admin = (await engine.register('admin', 'password1')).user;
  const alice = (await engine.register('alice', 'password1')).user;
  const bob = (await engine.register('bob', 'password1')).user;
  const market = engine.createMarket(alice.id, {
    question: 'Will it rain in Seattle tomorrow?',
    description: 'Resolves YES if SEA airport records measurable rain.',
    category: 'Science',
    closesAt: clock + DAY,
  });
  const balance = (u) => engine.getUser(u.id).balance;
  return { engine, admin, alice, bob, market, balance, advance: (ms) => (clock += ms) };
}

test(`${kind}: first user is admin and everyone starts with demo credits`, async () => {
  const { admin, alice } = await setup();
  assert.equal(admin.isAdmin, true);
  assert.equal(alice.isAdmin, false);
  assert.equal(alice.balance, 100_000);
});

test(`${kind}: orders rest until the opposite side agrees on price`, async () => {
  const { engine, alice, bob, market, balance } = await setup();
  const a = engine.placeOrder(alice.id, market.id, { side: 'yes', price: 60, qty: 10 });
  assert.deepEqual([a.filled, a.resting], [0, 10]);
  assert.equal(balance(alice), 100_000 - 600);

  // 60 + 30 < 100: no deal.
  const b1 = engine.placeOrder(bob.id, market.id, { side: 'no', price: 30, qty: 10 });
  assert.equal(b1.filled, 0);

  // 60 + 45 >= 100: trades at the resting YES price, Bob pays only 40.
  const b2 = engine.placeOrder(bob.id, market.id, { side: 'no', price: 45, qty: 4 });
  assert.deepEqual([b2.filled, b2.resting], [4, 0]);
  assert.equal(balance(bob), 100_000 - 300 - 4 * 40);
  assert.equal(engine.getMarket(market.id).lastPrice, 60);
  assert.equal(engine.stats().balanced, true);
});

test(`${kind}: winner pays 10% of profit, loser pays nothing, platform holds no risk`, async () => {
  const { engine, admin, alice, bob, market, balance } = await setup();
  engine.placeOrder(alice.id, market.id, { side: 'yes', price: 60, qty: 10 });
  engine.placeOrder(bob.id, market.id, { side: 'no', price: 40, qty: 10 });
  const { fees } = engine.resolveMarket(admin.id, market.id, 'yes');

  // Alice staked 600, wins 1000: profit 400, fee 40.
  assert.equal(fees, 40);
  assert.equal(balance(alice), 100_000 + 400 - 40);
  assert.equal(balance(bob), 100_000 - 400);
  const s = engine.stats();
  assert.equal(s.feeRevenue, 40);
  assert.equal(s.orderEscrow + s.positionEscrow, 0);
  assert.equal(s.balanced, true);
});

test(`${kind}: fee is charged on net profit across both sides of a market`, async () => {
  const { engine, admin, alice, bob, market, balance } = await setup();
  engine.placeOrder(alice.id, market.id, { side: 'yes', price: 50, qty: 10 });
  engine.placeOrder(bob.id, market.id, { side: 'no', price: 50, qty: 10 });
  // Alice hedges: buys NO at 70 from Bob's YES bid at 30.
  engine.placeOrder(bob.id, market.id, { side: 'yes', price: 30, qty: 10 });
  engine.placeOrder(alice.id, market.id, { side: 'no', price: 70, qty: 10 });
  engine.resolveMarket(admin.id, market.id, 'yes');
  // Alice: paid 500 + 700, receives 1000: a loss, so no fee.
  assert.equal(balance(alice), 100_000 - 200);
  // Bob: paid 500 + 300, receives 1000: profit 200, fee 20.
  assert.equal(balance(bob), 100_000 + 200 - 20);
  assert.equal(engine.stats().balanced, true);
});

test(`${kind}: void refunds every stake and open order with no fee`, async () => {
  const { engine, admin, alice, bob, market, balance } = await setup();
  engine.placeOrder(alice.id, market.id, { side: 'yes', price: 70, qty: 5 });
  engine.placeOrder(bob.id, market.id, { side: 'no', price: 30, qty: 3 });
  const { fees } = engine.resolveMarket(admin.id, market.id, 'void');
  assert.equal(fees, 0);
  assert.equal(balance(alice), 100_000);
  assert.equal(balance(bob), 100_000);
  assert.equal(engine.getMarket(market.id).status, 'voided');
});

test(`${kind}: cancelling returns the unfilled reservation`, async () => {
  const { engine, alice, bob, market, balance } = await setup();
  const { orderId } = engine.placeOrder(alice.id, market.id, { side: 'yes', price: 20, qty: 10 });
  assert.throws(() => engine.cancelOrder(bob.id, orderId), /not found/);
  engine.cancelOrder(alice.id, orderId);
  assert.equal(balance(alice), 100_000);
  assert.throws(() => engine.cancelOrder(alice.id, orderId), /no longer open/);
});

test(`${kind}: a user never trades against their own order`, async () => {
  const { engine, alice, market, balance } = await setup();
  engine.placeOrder(alice.id, market.id, { side: 'yes', price: 60, qty: 10 });
  const r = engine.placeOrder(alice.id, market.id, { side: 'no', price: 50, qty: 10 });
  assert.equal(r.filled, 0);
  assert.equal(engine.getMarket(market.id).volume, 0);
  assert.equal(balance(alice), 100_000 - 500);
});

test(`${kind}: guards: balance, closed markets, permissions, bad input`, async () => {
  const { engine, admin, alice, bob, market, advance } = await setup();
  assert.throws(() => engine.placeOrder(alice.id, market.id, { side: 'yes', price: 99, qty: 2000 }), /balance/);
  assert.throws(() => engine.placeOrder(alice.id, market.id, { side: 'yes', price: 0, qty: 1 }), /Price/);
  assert.throws(() => engine.placeOrder(alice.id, market.id, { side: 'yes', price: 50, qty: 1.5 }), /Quantity/);
  assert.throws(() => engine.resolveMarket(bob.id, market.id, 'yes'), /admin/);
  advance(2 * DAY);
  assert.throws(() => engine.placeOrder(alice.id, market.id, { side: 'yes', price: 50, qty: 1 }), /closed/);
  engine.resolveMarket(admin.id, market.id, 'no');
  assert.throws(() => engine.resolveMarket(admin.id, market.id, 'yes'), /already settled/);
});

test(`${kind}: money is conserved through random trading and settlement`, async () => {
  const { engine, admin, alice, bob, market } = await setup();
  const carol = (await engine.register('carol', 'password1')).user;
  const users = [alice, bob, carol];
  let seed = 42;
  const rand = (n) => (seed = (seed * 1_103_515_245 + 12_345) % 2 ** 31) % n;
  for (let i = 0; i < 300; i++) {
    try {
      engine.placeOrder(users[rand(3)].id, market.id, {
        side: rand(2) ? 'yes' : 'no',
        price: 1 + rand(99),
        qty: 1 + rand(50),
      });
    } catch (err) {
      assert.match(err.message, /balance/);
    }
    assert.equal(engine.stats().balanced, true);
  }
  assert.ok(engine.getMarket(market.id).volume > 0);
  engine.resolveMarket(admin.id, market.id, 'no');
  const s = engine.stats();
  assert.equal(s.balanced, true);
  assert.equal(s.orderEscrow + s.positionEscrow, 0);
  assert.equal(s.deposits, s.userBalances + s.feeRevenue);
});

} // engines

test('browser: state survives a reload of the page', async () => {
  const storage = memoryStorage();
  const first = createLocalEngine({ storage });
  const { user } = await first.register('alice', 'password1');
  const m = first.createMarket(user.id, {
    question: 'Will it snow in Denver this week?',
    description: 'Resolves YES if DEN records measurable snow before Sunday.',
    category: 'Science',
    closesAt: Date.now() + DAY,
  });
  first.placeOrder(user.id, m.id, { side: 'yes', price: 40, qty: 5 });
  const second = createLocalEngine({ storage });
  assert.equal(second.getUser(user.id).balance, 100_000 - 200);
  assert.equal(second.marketDetail(m.id).book.yes[0].qty, 5);
  assert.equal((await second.login('alice', 'password1')).user.id, user.id);
  await assert.rejects(second.login('alice', 'wrong-pass'), /Wrong/);
});

test('browser: a failed order changes nothing', async () => {
  const storage = memoryStorage();
  const engine = createLocalEngine({ storage });
  const { user } = await engine.register('alice', 'password1');
  const m = engine.createMarket(user.id, {
    question: 'Will it snow in Denver this week?',
    description: 'Resolves YES if DEN records measurable snow before Sunday.',
    category: 'Science',
    closesAt: Date.now() + DAY,
  });
  const before = storage.getItem('crowdline:state');
  assert.throws(() => engine.placeOrder(user.id, m.id, { side: 'yes', price: 99, qty: 5000 }), /balance/);
  assert.equal(storage.getItem('crowdline:state'), before);
});

test('pages demo: example markets are seeded and the visitor becomes admin', async () => {
  const api = createLocalApi({ storage: memoryStorage() });
  const { markets } = await api.request('GET', '/markets?status=open');
  assert.equal(markets.length, 6);
  assert.ok(markets.every((m) => m.volume > 0 && m.yesBid != null && m.yesAsk != null && m.yesBid < m.yesAsk));
  await assert.rejects(api.request('GET', '/portfolio'), /Log in/);
  const { user } = await api.request('POST', '/register', { username: 'visitor', password: 'password1' });
  assert.equal(user.isAdmin, true);
  const target = markets[0];
  const r = await api.request('POST', `/markets/${target.id}/orders`, { side: 'yes', price: target.yesAsk, qty: 10 });
  assert.equal(r.filled, 10);
  await api.request('POST', `/markets/${target.id}/resolve`, { outcome: 'yes' });
  const stats = await api.request('GET', '/admin/stats');
  assert.equal(stats.balanced, true);
  assert.ok(stats.feeRevenue > 0);
  await api.request('POST', '/reset-demo');
  assert.equal((await api.request('GET', '/me')).user, null);
});
