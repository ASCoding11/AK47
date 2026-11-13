// Cloud Function entry point. Every request from the web app arrives through
// the `api` callable function, signed in with Firebase Authentication.
import { initializeApp } from 'firebase-admin/app';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { handle } from './api.js';
import { ApiError, createEngine } from './engine.js';
import { firestoreStore } from './store-firestore.js';

initializeApp();
const engine = createEngine(firestoreStore());

const CODES = { 400: 'invalid-argument', 401: 'unauthenticated', 403: 'permission-denied', 404: 'not-found', 409: 'already-exists' };

export const api = onCall({ region: 'us-central1', maxInstances: 10 }, async (request) => {
  const auth = request.auth;
  const ctx = { uid: auth?.uid ?? null, profile: { name: auth?.token?.name, email: auth?.token?.email } };
  try {
    return await handle(engine, ctx, request.data ?? {});
  } catch (err) {
    if (err instanceof ApiError) throw new HttpsError(CODES[err.status] ?? 'failed-precondition', err.message);
    console.error(err);
    throw new HttpsError('internal', 'Something went wrong. Try again.');
  }
});
