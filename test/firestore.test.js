// Runs the shared engine and firestore.rules against the Firestore emulator.
// `npm run test:firestore` starts the emulator; without it these tests skip.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { initializeApp } from 'firebase/app';
import * as sdk from 'firebase/firestore';
import { createFirestoreEngine } from '../src/firestore-engine.js';

const HOST = process.env.FIRESTORE_EMULATOR_HOST;
const PROJECT = process.env.GCLOUD_PROJECT || 'demo-crowdline';
const DAY = 86_400_000;
const it = HOST ? test : test.skip;
let apps = 0;

function member(uid, name) {
  const app = initializeApp({ projectId: PROJECT }, `app-${++apps}`);
  const db = sdk.getFirestore(app);
  const [host, port] = HOST.split(':');
  sdk.connectFirestoreEmulator(db, host, Number(port), { mockUserToken: { sub: uid, user_id: uid, name } });
  return { uid, db, engine: createFirestoreEngine({ sdk, db }) };
}

async function reset() {
  const res = await fetch(`http://${HOST}/emulator/v1/projects/${PROJECT}/databases/(default)/documents`, { method: 'DELETE' });
  assert.ok(res.ok, 'emulator reset');
}

async function setup() {
  await reset();
  const people = {};
  for (const [uid, name] of [['u-admin', 'Admin'], ['u-alice', 'Alice'], ['u-bob', 'Bob'], ['u-maker', 'Maker']]) {
    people[uid.slice(2)] = member(uid, name);
    await people[uid.slice(2)].engine.join(uid, { name });
  }
  const { admin, alice, bob, maker } = people;
  const { market } = await maker.engine.createMarket(maker.uid, {
    question: 'Will it rain in Seattle tomorrow?',
    description: 'Resolves YES if SEA airport records measurable rain.',
    category: 'Science',
    closesAt: Date.now() + DAY,
  });
  const balance = async (p) => (await p.engine.me(p.uid)).balance;
  const stats = () => admin.engine.stats(admin.uid);
  return { admin, alice, bob, maker, market, balance, stats };
}

const denied = (promise) => assert.rejects(promise, (err) => err.code === 'permission-denied' || /permission/i.test(err.message));

it('firestore: joining gives 1,000 Avenues once; the first member is admin', async () => {
  const { admin, alice } = await setup();
  assert.equal((await admin.engine.me(admin.uid)).isAdmin, true);
  const a = await alice.engine.me(alice.uid);
  assert.equal(a.isAdmin, false);
  assert.equal(a.balance, 100_000);
  const again = await alice.engine.join(alice.uid, { name: 'Alice' });
  assert.equal(again.isNew, false);
  assert.equal(again.user.balance, 100_000);
  const twin = member('u-alice2', 'alice');
  assert.equal((await twin.engine.join(twin.uid, { name: 'alice' })).user.username, 'alice2');
});

it('firestore: bets wait, then match at the waiting price, with any better price refunded', async () => {
  const { alice, bob, market, balance, stats } = await setup();
  const a = await alice.engine.placeOrder(alice.uid, market.id, { side: 'yes', price: 60, qty: 10 });
  assert.deepEqual([a.filled, a.resting], [0, 10]);
  assert.equal(await balance(alice), 100_000 - 600);
  assert.equal((await bob.engine.placeOrder(bob.uid, market.id, { side: 'no', price: 30, qty: 10 })).filled, 0);
  const b = await bob.engine.placeOrder(bob.uid, market.id, { side: 'no', price: 45, qty: 4 });
  assert.deepEqual([b.filled, b.resting], [4, 0]);
  assert.equal(await balance(bob), 100_000 - 300 - 4 * 40);
  const d = await alice.engine.marketDetail(market.id, alice.uid);
  assert.equal(d.market.lastPrice, 60);
  assert.equal(d.market.volume, 4);
  assert.deepEqual(d.book.yes, [{ price: 60, qty: 6 }]);
  assert.equal(d.position.yesQty, 4);
  assert.equal(d.orders[0].remaining, 6);
  assert.equal((await stats()).balanced, true);
});

it('firestore: creators can bet on their own market; nobody matches themselves', async () => {
  const { alice, maker, market, balance } = await setup();
  await maker.engine.placeOrder(maker.uid, market.id, { side: 'yes', price: 50, qty: 4 });
  assert.equal((await alice.engine.placeOrder(alice.uid, market.id, { side: 'no', price: 50, qty: 4 })).filled, 4);
  await alice.engine.placeOrder(alice.uid, market.id, { side: 'yes', price: 70, qty: 3 });
  assert.equal((await alice.engine.placeOrder(alice.uid, market.id, { side: 'no', price: 40, qty: 3 })).filled, 0);
  assert.equal(await balance(alice), 100_000 - 200 - 210 - 120);
});

it('firestore: cancelling refunds the unmatched part, once', async () => {
  const { alice, bob, market, balance } = await setup();
  const { orderId } = await alice.engine.placeOrder(alice.uid, market.id, { side: 'yes', price: 20, qty: 10 });
  await bob.engine.placeOrder(bob.uid, market.id, { side: 'no', price: 80, qty: 4 });
  await assert.rejects(bob.engine.cancelOrder(bob.uid, orderId), /not found/);
  await alice.engine.cancelOrder(alice.uid, orderId);
  assert.equal(await balance(alice), 100_000 - 4 * 20);
  await assert.rejects(alice.engine.cancelOrder(alice.uid, orderId), /no longer open/);
});

it('firestore: creator reports, admin verifies and pays out, keeping 10% of winnings', async () => {
  const { admin, alice, bob, maker, market, balance, stats } = await setup();
  await alice.engine.placeOrder(alice.uid, market.id, { side: 'yes', price: 60, qty: 10 });
  await bob.engine.placeOrder(bob.uid, market.id, { side: 'no', price: 40, qty: 10 });
  await alice.engine.placeOrder(alice.uid, market.id, { side: 'yes', price: 30, qty: 5 }); // waits
  await assert.rejects(alice.engine.proposeResolution(alice.uid, market.id, 'yes', 'NWS report'), /Only the market/);
  await maker.engine.proposeResolution(maker.uid, market.id, 'yes', 'NWS daily climate report for SEA');
  await assert.rejects(bob.engine.placeOrder(bob.uid, market.id, { side: 'no', price: 50, qty: 1 }), /closed/);
  assert.equal((await stats()).proposed.length, 1);
  await assert.rejects(maker.engine.resolveMarket(maker.uid, market.id, 'yes'), /admin/);
  const { fees } = await admin.engine.resolveMarket(admin.uid, market.id, 'yes');
  assert.equal(fees, 40);
  assert.equal(await balance(alice), 100_000 + 400 - 40, 'won, minus the cut, and the waiting bet refunded');
  assert.equal(await balance(bob), 100_000 - 400);
  const s = await stats();
  assert.equal(s.feeRevenue, 40);
  assert.equal(s.orderEscrow + s.positionEscrow, 0);
  assert.equal(s.balanced, true);
  const p = await alice.engine.portfolio(alice.uid);
  assert.equal(p.positions[0].position.payout, 1000);
  assert.equal(p.positions[0].position.fee, 40);
  assert.ok(p.ledger.some((l) => l.type === 'payout' && l.amount === 960));
  await assert.rejects(admin.engine.resolveMarket(admin.uid, market.id, 'no'), /already settled/);
});

it('firestore: void refunds everyone with no cut', async () => {
  const { admin, alice, bob, market, balance } = await setup();
  await alice.engine.placeOrder(alice.uid, market.id, { side: 'yes', price: 70, qty: 5 });
  await bob.engine.placeOrder(bob.uid, market.id, { side: 'no', price: 30, qty: 3 });
  assert.equal((await admin.engine.resolveMarket(admin.uid, market.id, 'void')).fees, 0);
  assert.equal(await balance(alice), 100_000);
  assert.equal(await balance(bob), 100_000);
});

it('firestore: reports reach the admin', async () => {
  const { alice, market, stats } = await setup();
  await alice.engine.reportMarket(alice.uid, market.id, 'This is about a private person');
  await alice.engine.reportMarket(alice.uid, market.id, 'Updated: about a private person');
  const { reports } = await stats();
  assert.equal(reports.length, 1);
  assert.equal(reports[0].reporter, 'Alice');
});

// ---------- the rules stop cheating ----------

it('rules: nobody can give themselves Avenues or claim admin', async () => {
  const { alice } = await setup();
  const { doc, setDoc, updateDoc } = sdk;
  await denied(updateDoc(doc(alice.db, `users/${alice.uid}`), { balance: 999_999 }));
  await denied(updateDoc(doc(alice.db, `users/${alice.uid}`), { balance: 200_000, lastOp: 'x', lastOpType: 'order' }));
  const mallory = member('u-mallory', 'Mallory');
  await denied(setDoc(doc(mallory.db, 'users/u-mallory'), {
    username: 'Mallory', balance: 5_000_000, lastOp: 'join', lastOpType: 'join', createdAt: sdk.serverTimestamp(),
  }));
  await denied(setDoc(doc(mallory.db, 'meta/admin'), { uid: 'u-mallory' }));
  await denied(sdk.getDoc(doc(mallory.db, `users/${alice.uid}`)));
});

it('rules: a bet must be paid for, and can only be refunded once', async () => {
  const { alice, market } = await setup();
  const { doc, collection, writeBatch, serverTimestamp } = sdk;
  const free = doc(collection(alice.db, 'orders'));
  const b = writeBatch(alice.db);
  b.set(free, { marketId: market.id, uid: alice.uid, side: 'yes', price: 60, qty: 100, filled: 0, status: 'open', createdAt: serverTimestamp(), lastFill: null });
  b.update(doc(alice.db, `users/${alice.uid}`), { balance: 100_000, lastOp: free.id, lastOpType: 'order' });
  await denied(b.commit());
  const { orderId } = await alice.engine.placeOrder(alice.uid, market.id, { side: 'yes', price: 10, qty: 10 });
  await alice.engine.cancelOrder(alice.uid, orderId);
  const again = writeBatch(alice.db);
  again.update(doc(alice.db, `orders/${orderId}`), { status: 'cancelled' });
  again.update(doc(alice.db, `users/${alice.uid}`), { balance: 100_000 + 100, lastOp: orderId, lastOpType: 'cancel' });
  await denied(again.commit());
});

it('rules: fills must cross, respect sizes, and credit only the true price difference', async () => {
  const { alice, bob, market } = await setup();
  const { orderId: makerId } = await alice.engine.placeOrder(alice.uid, market.id, { side: 'yes', price: 60, qty: 10 });
  const { orderId: takerId } = await bob.engine.placeOrder(bob.uid, market.id, { side: 'no', price: 30, qty: 10 }); // doesn't cross
  const { doc, collection, writeBatch, serverTimestamp, getDoc } = sdk;
  const bobBalance = (await getDoc(doc(bob.db, `users/${bob.uid}`))).data().balance;
  const attempt = (overrides = {}, credit = 0, qty = 5) => {
    const f = doc(collection(bob.db, 'fills'));
    const b = writeBatch(bob.db);
    b.set(f, {
      marketId: market.id, makerOrder: makerId, takerOrder: takerId, makerUid: alice.uid, takerUid: bob.uid,
      makerSide: 'yes', makerPrice: 60, takerPrice: 30, yesPrice: 60, qty, at: serverTimestamp(), ...overrides,
    });
    b.update(doc(bob.db, `orders/${makerId}`), { filled: qty, lastFill: f.id });
    b.update(doc(bob.db, `orders/${takerId}`), { filled: qty, lastFill: f.id });
    b.update(doc(bob.db, `users/${bob.uid}`), { balance: bobBalance + credit, lastOp: f.id, lastOpType: 'fill' });
    b.update(doc(bob.db, `markets/${market.id}`), { volume: qty, lastPrice: 60, lastFill: f.id });
    return b.commit();
  };
  await denied(attempt()); // 60 + 30 < 100
  await denied(attempt({ takerPrice: 45 }, 25)); // lying about the taker's price
  // A crossing bet, then a fill that's too big or over-credits.
  const { orderId: crossId } = await bob.engine.placeOrder(bob.uid, market.id, { side: 'no', price: 50, qty: 2 });
  const bal = (await getDoc(doc(bob.db, `users/${bob.uid}`))).data().balance;
  const fill = (qty, credit) => {
    const f = doc(collection(bob.db, 'fills'));
    const b = writeBatch(bob.db);
    b.set(f, {
      marketId: market.id, makerOrder: makerId, takerOrder: crossId, makerUid: alice.uid, takerUid: bob.uid,
      makerSide: 'yes', makerPrice: 60, takerPrice: 50, yesPrice: 60, qty, at: serverTimestamp(),
    });
    b.update(doc(bob.db, `orders/${makerId}`), { filled: 2 + qty, lastFill: f.id });
    b.update(doc(bob.db, `orders/${crossId}`), { filled: qty, lastFill: f.id });
    b.update(doc(bob.db, `users/${bob.uid}`), { balance: bal + credit, lastOp: f.id, lastOpType: 'fill' });
    b.update(doc(bob.db, `markets/${market.id}`), { volume: 2 + qty, lastPrice: 60, lastFill: f.id });
    return b.commit();
  };
  // The engine already matched 2 when the crossing bet was placed: nothing is left.
  await denied(fill(1, 10));
  const d = await bob.engine.marketDetail(market.id, bob.uid);
  assert.equal(d.position.noQty, 2);
});

it('rules: only the creator reports, only the admin settles, trading needs an open market', async () => {
  const { alice, maker, market } = await setup();
  const { doc, updateDoc, serverTimestamp } = sdk;
  await denied(updateDoc(doc(alice.db, `markets/${market.id}`), { status: 'proposed', proposedOutcome: 'yes', reportNote: 'trust me', reportedAt: serverTimestamp() }));
  await denied(updateDoc(doc(maker.db, `markets/${market.id}`), { status: 'resolved', outcome: 'yes' }));
  await denied(updateDoc(doc(alice.db, `markets/${market.id}`), { volume: 1_000_000 }));
  await maker.engine.proposeResolution(maker.uid, market.id, 'yes', 'Official results page');
  await denied(updateDoc(doc(alice.db, `users/${maker.uid}`), { balance: 1 }));
});
