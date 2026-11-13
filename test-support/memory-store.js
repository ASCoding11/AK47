// In-memory stand-in for functions/store-firestore.js, for tests. It enforces
// the Firestore rules that catch real bugs: in a transaction every read must
// come before any write, `update` needs an existing document, and writes in a
// transaction or batch apply all together or not at all.
const INC = Symbol('inc');

export function memoryStore() {
  const docs = new Map();
  let ids = 0;
  const clone = (v) => (v == null ? null : structuredClone(v));

  const matches = (data, [field, op, value]) => {
    const v = data[field];
    if (op === '==') return v === value;
    if (op === 'in') return value.includes(v);
    throw new Error(`memory store: unsupported operator ${op}`);
  };
  const query = (coll, wheres = [], { orderBy, limit } = {}) => {
    const depth = coll.split('/').length + 1;
    let rows = [...docs]
      .filter(([path]) => path.startsWith(`${coll}/`) && path.split('/').length === depth)
      .map(([path, data]) => ({ id: path.split('/').pop(), data: clone(data) }))
      .filter((r) => wheres.every((w) => matches(r.data, w)));
    if (orderBy) {
      const [field, dir = 'asc'] = orderBy;
      rows.sort((a, b) => (a.data[field] < b.data[field] ? -1 : a.data[field] > b.data[field] ? 1 : 0) * (dir === 'desc' ? -1 : 1));
    }
    if (limit) rows = rows.slice(0, limit);
    return rows;
  };
  const apply = (base, value) => {
    const out = { ...(base ?? {}) };
    for (const [k, v] of Object.entries(value)) out[k] = v && v[INC] !== undefined ? (out[k] ?? 0) + v[INC] : v;
    return out;
  };
  const writer = (ops) => ({
    set: (path, value, { merge = false } = {}) => ops.push(() => docs.set(path, apply(merge ? docs.get(path) : {}, value))),
    update: (path, value) => ops.push(() => {
      if (!docs.has(path)) throw new Error(`memory store: update of missing document ${path}`);
      docs.set(path, apply(docs.get(path), value));
    }),
  });
  const commit = (ops) => {
    const snapshot = new Map(docs);
    try {
      for (const op of ops) op();
    } catch (err) {
      docs.clear();
      for (const [k, v] of snapshot) docs.set(k, v);
      throw err;
    }
  };

  let queue = Promise.resolve();
  const serial = (fn) => {
    const run = queue.then(fn, fn);
    queue = run.catch(() => {});
    return run;
  };

  return {
    docs,
    get: async (path) => clone(docs.get(path)),
    query: async (coll, wheres, opts) => query(coll, wheres, opts),
    tx: (fn) => serial(async () => {
      const ops = [];
      const w = writer(ops);
      const readGuard = (what) => {
        if (ops.length) throw new Error(`memory store: transaction ${what} after a write`);
      };
      const result = await fn({
        get: async (path) => (readGuard(`read of ${path}`), clone(docs.get(path))),
        query: async (coll, wheres, opts) => (readGuard(`query of ${coll}`), query(coll, wheres, opts)),
        set: (...a) => w.set(...a),
        update: (...a) => w.update(...a),
      });
      if (ops.length > 500) throw new Error(`memory store: ${ops.length} writes in one transaction`);
      commit(ops);
      return result;
    }),
    batch: (fn) => serial(async () => {
      const ops = [];
      await fn(writer(ops));
      if (ops.length > 500) throw new Error(`memory store: ${ops.length} writes in one batch`);
      commit(ops);
    }),
    inc: (n) => ({ [INC]: n }),
    newId: () => `id${String(++ids).padStart(6, '0')}`,
  };
}
