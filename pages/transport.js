// How the GitHub Pages app reaches the exchange: the shared Firebase backend
// once `firebase.sharedMarkets` is on in site-config.js, otherwise the
// browser-only copy.
import { SITE_CONFIG, signInMode } from './site-config.js';

const shared = signInMode(SITE_CONFIG) === 'firebase' && SITE_CONFIG.firebase.sharedMarkets === true;
const impl = shared ? await import('./firebase-transport.js') : await import('./local-transport.js');

export const request = (method, path, body) => impl.request(method, path, body);
