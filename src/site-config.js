// Site settings shared by the Node server and the GitHub Pages build.
// Fill these in, then run `npm run build:pages` (for Pages) or restart the server.
// None of these values are secret: they all end up in the browser.
export const SITE_CONFIG = {
  // OAuth 2.0 Web client ID from Google Cloud Console (APIs & Services → Credentials),
  // e.g. '1234567890-abc123.apps.googleusercontent.com'. While empty, the site falls
  // back to username/password accounts so it stays usable.
  googleClientId: '',

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
