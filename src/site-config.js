// Site settings shared by the Node server and the GitHub Pages build.
// Fill these in, then run `npm run build:pages` (for Pages) or restart the server.
// None of these values are secret: they all end up in the browser.
export const SITE_CONFIG = {
  // OAuth 2.0 Web client ID from Google Cloud Console (APIs & Services → Credentials),
  // e.g. '1234567890-abc123.apps.googleusercontent.com'. While empty, the site falls
  // back to username/password accounts so it stays usable.
  googleClientId: '',

  // Firebase Authentication (an alternative to googleClientId; used instead of
  // it when filled in). Copy these from Firebase console → Project settings →
  // General → Your apps → SDK setup and configuration → Config. Turn on Google
  // under Authentication → Sign-in method, and add the site's domain (e.g.
  // ascoding11.github.io) under Authentication → Settings → Authorized domains.
  firebase: {
    apiKey: 'AIzaSyBo1mso8mS2sCSsjUQWwNxQ7qh_RrHysTA',
    authDomain: 'crowdline-243a7.firebaseapp.com',
    projectId: 'crowdline-243a7',
    storageBucket: 'crowdline-243a7.firebasestorage.app',
    messagingSenderId: '488845118165',
    appId: '1:488845118165:web:b6c82c9082d056159ef05c',
    // Turn on once the Cloud Functions are deployed (see README): everyone then
    // shares the same markets. While false, each browser keeps its own copy.
    sharedMarkets: false,
  },

  // Google AdSense. `client` is your publisher ID, e.g. 'ca-pub-1234567890123456'.
  // Each slot is the numeric ID of a display ad unit you create in AdSense.
  ads: {
    client: '',
    slots: {
      marketsTop: '', // banner under the markets heading
      marketsInline: '', // between rows of market cards
      marketSide: '', // market page sidebar
    },
    // Show labelled empty boxes where ads will go until `client` is set.
    showPlaceholders: true,
  },
};

// Which sign-in the site uses: 'firebase', 'google' (plain Google Identity
// Services), or 'password' when neither is configured.
export function signInMode(config = SITE_CONFIG) {
  if (config.firebase?.apiKey && config.firebase?.projectId) return 'firebase';
  if (config.googleClientId) return 'google';
  return 'password';
}
