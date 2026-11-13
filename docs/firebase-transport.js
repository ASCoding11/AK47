// Shared markets: everyone signs in with Google through Firebase
// Authentication, and every request goes to the `api` Cloud Function.
import { CATEGORIES, FEE_BPS } from './local-engine.js';
import { SITE_CONFIG } from './site-config.js';

const SDK = 'https://www.gstatic.com/firebasejs/10.12.2';

const ready = (async () => {
  const [{ initializeApp }, auth, functions] = await Promise.all([
    import(`${SDK}/firebase-app.js`),
    import(`${SDK}/firebase-auth.js`),
    import(`${SDK}/firebase-functions.js`),
  ]);
  const app = initializeApp(SITE_CONFIG.firebase);
  const session = auth.getAuth(app);
  await session.authStateReady();
  const call = functions.httpsCallable(functions.getFunctions(app, 'us-central1'), 'api');
  return { auth, session, call };
})();
ready.catch(() => {});

async function loaded() {
  try {
    return await ready;
  } catch {
    throw new Error('Crowdline couldn’t load. If you use an ad or tracker blocker, allow gstatic.com and googleapis.com, then reload.');
  }
}

async function callApi(method, path, body) {
  const { call } = await loaded();
  try {
    return (await call({ method, path, body: body ?? {} })).data;
  } catch (err) {
    const unreachable = err.code === 'functions/not-found' || err.code === 'functions/unavailable';
    const e = new Error(unreachable ? 'Crowdline’s server isn’t reachable right now. Try again in a minute.' : err.message || 'Request failed');
    e.code = err.code;
    throw e;
  }
}

export async function request(method, path, body) {
  if (path === '/config') {
    return {
      feeBps: FEE_BPS, categories: CATEGORIES, signIn: 'firebase', shared: true,
      firebase: SITE_CONFIG.firebase, ads: SITE_CONFIG.ads,
    };
  }
  const { auth, session } = await loaded();
  if (path === '/firebase-signin') {
    // Errors keep Firebase's `code` (e.g. auth/popup-blocked) for the page to explain.
    await auth.signInWithPopup(session, new auth.GoogleAuthProvider());
    return callApi('GET', '/me');
  }
  if (path === '/logout') {
    await auth.signOut(session);
    return {};
  }
  if (path === '/me' && !session.currentUser) return { user: null };
  return callApi(method, path, body);
}
