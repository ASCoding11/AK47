// How the app reaches the exchange. This version talks to the Node server;
// the GitHub Pages build swaps in pages/transport.js, which runs it in the browser.
export async function request(method, path, body) {
  const res = await fetch(`api${path}`, {
    method,
    headers: method === 'POST' ? { 'Content-Type': 'application/json' } : undefined,
    body: method === 'POST' ? JSON.stringify(body ?? {}) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? 'Request failed');
  return data;
}

// The Node server has no live updates; pages refresh when you navigate.
export const watch = null;
