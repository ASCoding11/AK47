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
  const maker = (await engine.register('maker', 'password1')).user;
  const market = engine.createMarket(maker.id, {
    question: 'Will it rain in Seattle tomorrow?',
    description: 'Resolves YES if SEA airport records measurable rain.',
    category: 'Science',
    closesAt: clock + DAY,
  });
  const balance = (u) => engine.getUser(u.id).balance;
  return { engine, admin, alice, bob, maker, market, balance, advance: (ms) => (clock += ms) };
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

test(`${kind}: winner pays 10% of winnings, loser pays nothing, platform holds no risk`, async () => {
  const { engine, admin, alice, bob, market, balance } = await setup();
  engine.placeOrder(alice.id, market.id, { side: 'yes', price: 60, qty: 10 });
  engine.placeOrder(bob.id, market.id, { side: 'no', price: 40, qty: 10 });
  const { fees } = engine.resolveMarket(admin.id, market.id, 'yes');

  // Alice staked 600 and wins 1000: winnings 400, fee 40. Bob loses his 400.
  assert.equal(fees, 40);
  assert.equal(balance(alice), 100_000 + 400 - 40);
  assert.equal(balance(bob), 100_000 - 400);
  const s = engine.stats();
  assert.equal(s.feeRevenue, 40);
  assert.equal(s.orderEscrow + s.positionEscrow, 0);
  assert.equal(s.balanced, true);
});

test(`${kind}: the fee is on net winnings across both sides of a market`, async () => {
  const { engine, admin, alice, bob, market, balance } = await setup();
  engine.placeOrder(alice.id, market.id, { side: 'yes', price: 50, qty: 10 });
  engine.placeOrder(bob.id, market.id, { side: 'no', price: 50, qty: 10 });
  // Alice hedges: buys NO at 70 from Bob's YES bid at 30.
  engine.placeOrder(bob.id, market.id, { side: 'yes', price: 30, qty: 10 });
  engine.placeOrder(alice.id, market.id, { side: 'no', price: 70, qty: 10 });
  engine.resolveMarket(admin.id, market.id, 'yes');
  // Alice: paid 500 + 700, receives 1000: a loss, so no fee.
  assert.equal(balance(alice), 100_000 - 200);
  // Bob: paid 500 + 300, receives 1000: winnings 200, fee 20.
  assert.equal(balance(bob), 100_000 + 200 - 20);
  assert.equal(engine.stats().balanced, true);
});

test(`${kind}: void refunds every stake and open order`, async () => {
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

test(`${kind}: creators can trade in their own market`, async () => {
  const { engine, alice, maker, market } = await setup();
  engine.placeOrder(maker.id, market.id, { side: 'yes', price: 50, qty: 4 });
  const r = engine.placeOrder(alice.id, market.id, { side: 'no', price: 50, qty: 4 });
  assert.equal(r.filled, 4);
});

test(`${kind}: anyone can sign up, with no age check`, async () => {
  const engine = make(() => Date.now());
  assert.equal((await engine.register('newbie', 'password1')).user.balance, 100_000);
});

test(`${kind}: a reported result pays out only after an admin verifies it`, async () => {
  const { engine, admin, alice, bob, maker, market, balance, advance } = await setup();
  engine.placeOrder(alice.id, market.id, { side: 'yes', price: 60, qty: 10 });
  engine.placeOrder(bob.id, market.id, { side: 'no', price: 40, qty: 10 });
  engine.placeOrder(alice.id, market.id, { side: 'yes', price: 30, qty: 5 }); // resting
  assert.throws(() => engine.proposeResolution(alice.id, market.id, 'yes', 'NWS daily report'), /Only the market/);
  assert.throws(() => engine.proposeResolution(maker.id, market.id, 'yes', ''), /source/);
  engine.proposeResolution(maker.id, market.id, 'yes', 'NWS daily climate report for SEA');
  // Trading stops and the resting order is refunded.
  const reported = engine.getMarket(market.id);
  assert.equal(reported.status, 'proposed');
  assert.equal(reported.proposedOutcome, 'yes');
  assert.match(reported.reportNote, /NWS/);
  assert.equal(balance(alice), 100_000 - 600);
  assert.throws(() => engine.placeOrder(bob.id, market.id, { side: 'no', price: 50, qty: 1 }), /closed/);
  assert.throws(() => engine.proposeResolution(maker.id, market.id, 'no', 'changed my mind'), /already been reported/);
  // Nothing pays out on its own, however long it waits.
  advance(30 * DAY);
  engine.listMarkets();
  assert.equal(engine.getMarket(market.id).status, 'proposed');
  assert.equal(engine.stats().proposed.length, 1);
  assert.equal(engine.stats().balanced, true);
  // The admin verifies, and can overrule the report.
  assert.throws(() => engine.resolveMarket(maker.id, market.id, 'yes'), /admin/);
  engine.resolveMarket(admin.id, market.id, 'no');
  assert.equal(engine.getMarket(market.id).outcome, 'no');
  assert.equal(balance(bob), 100_000 + 600 - 60);
  assert.equal(engine.stats().proposed.length, 0);
  assert.equal(engine.stats().balanced, true);
});

test(`${kind}: users can report a market to admins`, async () => {
  const { engine, alice, market } = await setup();
  assert.throws(() => engine.reportMarket(alice.id, market.id, 'bad'), /5-1000/);
  engine.reportMarket(alice.id, market.id, 'This is about a private person');
  engine.reportMarket(alice.id, market.id, 'Updated: about a private person');
  const { reports } = engine.stats();
  assert.equal(reports.length, 1);
  assert.equal(reports[0].reporter, 'alice');
});

} // engines

test('browser: state survives a reload of the page', async () => {
  const storage = memoryStorage();
  const first = createLocalEngine({ storage });
  const { user } = await first.register('alice', 'password1');
  const maker = (await first.register('maker', 'password1')).user;
  const m = first.createMarket(maker.id, {
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
  const maker = (await engine.register('maker', 'password1')).user;
  const m = engine.createMarket(maker.id, {
    question: 'Will it snow in Denver this week?',
    description: 'Resolves YES if DEN records measurable snow before Sunday.',
    category: 'Science',
    closesAt: Date.now() + DAY,
  });
  const before = storage.getItem('crowdline:state');
  assert.throws(() => engine.placeOrder(user.id, m.id, { side: 'yes', price: 99, qty: 5000 }), /balance/);
  assert.equal(storage.getItem('crowdline:state'), before);
});

test('pages demo: starts with no markets until someone creates one', async () => {
  // Password accounts: the mode the site uses when no Google sign-in is configured.
  const config = { googleClientId: '', firebase: {}, ads: { client: '', slots: {}, showPlaceholders: false } };
  const api = createLocalApi({ storage: memoryStorage(), config });
  assert.equal((await api.request('GET', '/markets?status=open')).markets.length, 0);
  await assert.rejects(api.request('GET', '/portfolio'), /Log in/);
  const { user } = await api.request('POST', '/register', { username: 'visitor', password: 'password1' });
  assert.equal(user.isAdmin, true);
  const { market } = await api.request('POST', '/markets', {
    question: 'Will it snow in Denver this week?',
    description: 'Resolves YES if DEN records measurable snow before Sunday.',
    category: 'Science',
    closesAt: Date.now() + DAY,
  });
  assert.equal((await api.request('GET', '/markets?status=open')).markets.length, 1);
  const r = await api.request('POST', `/markets/${market.id}/orders`, { side: 'yes', price: 60, qty: 10 });
  assert.equal(r.resting, 10);
  const stats = await api.request('GET', '/admin/stats');
  assert.equal(stats.balanced, true);
  await api.request('POST', '/reset-demo');
  assert.equal((await api.request('GET', '/me')).user, null);
  assert.equal((await api.request('GET', '/markets?status=open')).markets.length, 0);
});

// ---------- Google sign-in ----------

for (const [kind, make] of Object.entries(ENGINES)) {
  test(`${kind}: Google sign-in grants 1,000 Avenues once per Google account`, async () => {
    const engine = make(() => Date.now());
    const first = engine.googleSignIn({ sub: 'g-1', name: 'Ada Lovelace' });
    assert.equal(first.isNew, true);
    assert.equal(first.user.username, 'Ada_Lovelace');
    assert.equal(first.user.balance, 100_000);
    assert.equal(first.user.isAdmin, true);
    const again = engine.googleSignIn({ sub: 'g-1', name: 'Ada Lovelace' });
    assert.equal(again.isNew, false);
    assert.equal(again.user.id, first.user.id);
    assert.equal(engine.getUser(first.user.id).balance, 100_000);
    const twin = engine.googleSignIn({ sub: 'g-2', name: 'Ada Lovelace' });
    assert.equal(twin.user.username, 'Ada_Lovelace2');
    assert.equal(twin.user.isAdmin, false);
    const short = engine.googleSignIn({ sub: 'g-3', email: 'xy@example.com' });
    assert.equal(short.user.username, 'memberxy');
    assert.equal(engine.userForToken(short.token).id, short.user.id);
    await assert.rejects(async () => engine.login('Ada_Lovelace', ''), /Wrong/);
    assert.equal(engine.stats().balanced, true);
  });
}

import { generateKeyPairSync, sign as rsaSign } from 'node:crypto';
import { createFirebaseVerifier, createGoogleVerifier } from '../src/google-auth.js';

const b64u = (v) => Buffer.from(typeof v === 'string' ? v : JSON.stringify(v)).toString('base64url');

function fakeGoogle() {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const jwk = { ...publicKey.export({ format: 'jwk' }), kid: 'k1', alg: 'RS256', use: 'sig' };
  let fetches = 0;
  const fetchImpl = async () => {
    fetches++;
    return { ok: true, json: async () => ({ keys: [jwk] }) };
  };
  const token = (claims, { kid = 'k1', key = privateKey } = {}) => {
    const head = b64u({ alg: 'RS256', kid, typ: 'JWT' });
    const body = b64u(claims);
    return `${head}.${body}.${rsaSign('RSA-SHA256', Buffer.from(`${head}.${body}`), key).toString('base64url')}`;
  };
  return { fetchImpl, token, fetches: () => fetches };
}

test('server: Google ID tokens are verified against Google keys', async () => {
  const g = fakeGoogle();
  const t0 = Date.now();
  const verify = createGoogleVerifier({ clientId: 'my-app', fetchImpl: g.fetchImpl, now: () => t0 });
  const good = { iss: 'https://accounts.google.com', aud: 'my-app', sub: '42', name: 'Ada', exp: t0 / 1000 + 600 };
  assert.equal((await verify(g.token(good))).sub, '42');
  await verify(g.token(good));
  assert.equal(g.fetches(), 1, 'keys are cached');
  await assert.rejects(verify(g.token({ ...good, aud: 'other-app' })), /Invalid/);
  await assert.rejects(verify(g.token({ ...good, iss: 'evil.example' })), /Invalid/);
  await assert.rejects(verify(g.token({ ...good, exp: t0 / 1000 - 1 })), /expired/);
  const other = generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey;
  await assert.rejects(verify(g.token(good, { key: other })), /Invalid/);
  await assert.rejects(verify(g.token(good, { kid: 'unknown' })), /Invalid/);
  await assert.rejects(verify('not.a.jwt'), /Invalid/);
  await assert.rejects(createGoogleVerifier({ clientId: '' })('x.y.z'), /not set up/);
});

test('pages demo: Google sign-in replaces password signup once configured', async () => {
  const config = { googleClientId: 'my-app', ads: { client: '', slots: {}, showPlaceholders: false } };
  const api = createLocalApi({ storage: memoryStorage(), config });
  assert.equal((await api.request('GET', '/config')).googleClientId, 'my-app');
  await assert.rejects(api.request('POST', '/register', { username: 'pw_user', password: 'password1' }), /Sign in with Google/);
  const exp = Math.floor(Date.now() / 1000) + 600;
  const cred = `${b64u({ alg: 'RS256' })}.${b64u({ aud: 'my-app', sub: 'g-9', name: 'Grace Hopper', exp })}.sig`;
  const { user, isNew } = await api.request('POST', '/google', { credential: cred });
  assert.equal(isNew, true);
  assert.equal(user.balance, 100_000);
  assert.equal((await api.request('GET', '/me')).user.username, 'Grace_Hopper');
  const wrongAud = `${b64u({ alg: 'RS256' })}.${b64u({ aud: 'someone-else', sub: 'g-9', exp })}.sig`;
  await assert.rejects(api.request('POST', '/google', { credential: wrongAud }), /Invalid/);
});

test('server: Firebase ID tokens are verified against the project', async () => {
  const g = fakeGoogle();
  const t0 = Date.now();
  const verify = createFirebaseVerifier({ projectId: 'crowdline-123', fetchImpl: g.fetchImpl, now: () => t0 });
  const good = { iss: 'https://securetoken.google.com/crowdline-123', aud: 'crowdline-123', sub: 'uid-7', name: 'Ada', exp: t0 / 1000 + 600 };
  assert.equal((await verify(g.token(good))).sub, 'uid-7');
  await assert.rejects(verify(g.token({ ...good, aud: 'other-project' })), /Invalid/);
  await assert.rejects(verify(g.token({ ...good, iss: 'https://securetoken.google.com/other-project' })), /Invalid/);
  await assert.rejects(verify(g.token({ ...good, iss: 'https://accounts.google.com' })), /Invalid/);
});

test('pages demo: Firebase sign-in takes precedence when configured', async () => {
  const config = {
    googleClientId: '',
    firebase: { apiKey: 'AIza-test', authDomain: 'crowdline-123.firebaseapp.com', projectId: 'crowdline-123', appId: '1:2:web:3' },
    ads: { client: '', slots: {}, showPlaceholders: false },
  };
  const api = createLocalApi({ storage: memoryStorage(), config });
  const cfg = await api.request('GET', '/config');
  assert.equal(cfg.signIn, 'firebase');
  assert.equal(cfg.firebase.projectId, 'crowdline-123');
  await assert.rejects(api.request('POST', '/register', { username: 'pw_user', password: 'password1' }), /Sign in with Google/);
  const exp = Math.floor(Date.now() / 1000) + 600;
  const tok = (claims) => `${b64u({ alg: 'RS256' })}.${b64u(claims)}.sig`;
  const good = { iss: 'https://securetoken.google.com/crowdline-123', aud: 'crowdline-123', sub: 'uid-1', name: 'Linus T', exp };
  await assert.rejects(api.request('POST', '/google', { credential: tok({ ...good, iss: 'https://accounts.google.com' }) }), /Invalid/);
  const { user, isNew } = await api.request('POST', '/google', { credential: tok(good) });
  assert.equal(isNew, true);
  assert.equal(user.username, 'Linus_T');
  assert.equal(user.balance, 100_000);
});
