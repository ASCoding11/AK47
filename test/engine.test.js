import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createEngine } from '../src/engine.js';

const DAY = 86_400_000;

function setup() {
  let clock = 1_000_000;
  const engine = createEngine(':memory:', { now: () => clock });
  const admin = engine.register('admin', 'password1').user;
  const alice = engine.register('alice', 'password1').user;
  const bob = engine.register('bob', 'password1').user;
  const market = engine.createMarket(alice.id, {
    question: 'Will it rain in Seattle tomorrow?',
    description: 'Resolves YES if SEA airport records measurable rain.',
    category: 'Science',
    closesAt: clock + DAY,
  });
  const balance = (u) => engine.getUser(u.id).balance;
  return { engine, admin, alice, bob, market, balance, advance: (ms) => (clock += ms) };
}

test('first user is admin and everyone starts with demo credits', () => {
  const { admin, alice } = setup();
  assert.equal(admin.isAdmin, true);
  assert.equal(alice.isAdmin, false);
  assert.equal(alice.balance, 100_000);
});

test('orders rest until the opposite side agrees on price', () => {
  const { engine, alice, bob, market, balance } = setup();
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

test('winner pays 10% of profit, loser pays nothing, platform holds no risk', () => {
  const { engine, admin, alice, bob, market, balance } = setup();
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

test('fee is charged on net profit across both sides of a market', () => {
  const { engine, admin, alice, bob, market, balance } = setup();
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

test('void refunds every stake and open order with no fee', () => {
  const { engine, admin, alice, bob, market, balance } = setup();
  engine.placeOrder(alice.id, market.id, { side: 'yes', price: 70, qty: 5 });
  engine.placeOrder(bob.id, market.id, { side: 'no', price: 30, qty: 3 });
  const { fees } = engine.resolveMarket(admin.id, market.id, 'void');
  assert.equal(fees, 0);
  assert.equal(balance(alice), 100_000);
  assert.equal(balance(bob), 100_000);
  assert.equal(engine.getMarket(market.id).status, 'voided');
});

test('cancelling returns the unfilled reservation', () => {
  const { engine, alice, bob, market, balance } = setup();
  const { orderId } = engine.placeOrder(alice.id, market.id, { side: 'yes', price: 20, qty: 10 });
  assert.throws(() => engine.cancelOrder(bob.id, orderId), /not found/);
  engine.cancelOrder(alice.id, orderId);
  assert.equal(balance(alice), 100_000);
  assert.throws(() => engine.cancelOrder(alice.id, orderId), /no longer open/);
});

test('a user never trades against their own order', () => {
  const { engine, alice, market, balance } = setup();
  engine.placeOrder(alice.id, market.id, { side: 'yes', price: 60, qty: 10 });
  const r = engine.placeOrder(alice.id, market.id, { side: 'no', price: 50, qty: 10 });
  assert.equal(r.filled, 0);
  assert.equal(engine.getMarket(market.id).volume, 0);
  assert.equal(balance(alice), 100_000 - 500);
});

test('guards: balance, closed markets, permissions, bad input', () => {
  const { engine, admin, alice, bob, market, advance } = setup();
  assert.throws(() => engine.placeOrder(alice.id, market.id, { side: 'yes', price: 99, qty: 2000 }), /balance/);
  assert.throws(() => engine.placeOrder(alice.id, market.id, { side: 'yes', price: 0, qty: 1 }), /Price/);
  assert.throws(() => engine.placeOrder(alice.id, market.id, { side: 'yes', price: 50, qty: 1.5 }), /Quantity/);
  assert.throws(() => engine.resolveMarket(bob.id, market.id, 'yes'), /admin/);
  advance(2 * DAY);
  assert.throws(() => engine.placeOrder(alice.id, market.id, { side: 'yes', price: 50, qty: 1 }), /closed/);
  engine.resolveMarket(admin.id, market.id, 'no');
  assert.throws(() => engine.resolveMarket(admin.id, market.id, 'yes'), /already settled/);
});

test('money is conserved through random trading and settlement', () => {
  const { engine, admin, alice, bob, market } = setup();
  const carol = engine.register('carol', 'password1').user;
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
