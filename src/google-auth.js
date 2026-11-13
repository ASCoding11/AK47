// Verifies a Google Identity Services ID token (the `credential` the Sign in
// with Google button returns) on the server. Node only.
import { createPublicKey, verify } from 'node:crypto';
import { ApiError } from './engine.js';

const CERTS_URL = 'https://www.googleapis.com/oauth2/v3/certs';
const ISSUERS = new Set(['accounts.google.com', 'https://accounts.google.com']);

const b64url = (s) => Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64');

export function createGoogleVerifier({ clientId, fetchImpl = fetch, now = () => Date.now() }) {
  let keys = new Map();
  let fetchedAt = 0;

  async function loadKeys(force) {
    if (!force && keys.size && now() - fetchedAt < 3_600_000) return;
    const res = await fetchImpl(CERTS_URL);
    if (!res.ok) throw new ApiError(502, 'Could not reach Google to check your sign-in');
    const { keys: jwks } = await res.json();
    keys = new Map(jwks.map((k) => [k.kid, createPublicKey({ key: k, format: 'jwk' })]));
    fetchedAt = now();
  }

  // Resolves the token's claims ({ sub, name, email, ... }) or throws a 401.
  return async function verifyIdToken(token) {
    if (!clientId) throw new ApiError(400, 'Google sign-in is not set up on this site');
    const parts = String(token ?? '').split('.');
    if (parts.length !== 3) throw new ApiError(401, 'Invalid Google sign-in');
    let header, claims;
    try {
      header = JSON.parse(b64url(parts[0]).toString('utf8'));
      claims = JSON.parse(b64url(parts[1]).toString('utf8'));
    } catch {
      throw new ApiError(401, 'Invalid Google sign-in');
    }
    if (header.alg !== 'RS256') throw new ApiError(401, 'Invalid Google sign-in');
    await loadKeys(false);
    if (!keys.has(header.kid)) await loadKeys(true); // Google rotates keys
    const key = keys.get(header.kid);
    const ok = key && verify('RSA-SHA256', Buffer.from(`${parts[0]}.${parts[1]}`), key, b64url(parts[2]));
    if (!ok) throw new ApiError(401, 'Invalid Google sign-in');
    if (claims.aud !== clientId || !ISSUERS.has(claims.iss)) throw new ApiError(401, 'Invalid Google sign-in');
    if (!(claims.exp * 1000 > now())) throw new ApiError(401, 'Your Google sign-in expired. Try again.');
    if (!claims.sub) throw new ApiError(401, 'Invalid Google sign-in');
    return claims;
  };
}
