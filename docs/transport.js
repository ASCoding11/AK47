// GitHub Pages build: there is no server, so the exchange runs in this
// browser and saves to localStorage.
import { createLocalApi } from './local-api.js';

let storage;
try {
  storage = window.localStorage;
  storage.getItem('crowdline:probe');
} catch {
  // Private mode or blocked storage: keep state in memory for this visit.
  const map = new Map();
  storage = {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
  };
}

const local = createLocalApi({ storage });

export function request(method, path, body) {
  // Round-trip through JSON so the page never holds live engine objects.
  return local.request(method, path, body).then((data) => JSON.parse(JSON.stringify(data)));
}
