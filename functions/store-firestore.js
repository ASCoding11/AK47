// The engine's storage interface, backed by Firestore through the Admin SDK.
// Paths are slash-separated document paths such as 'users/abc'.
import { FieldValue, getFirestore } from 'firebase-admin/firestore';

export function firestoreStore(fs = getFirestore()) {
  const buildQuery = (coll, wheres = [], { orderBy, limit } = {}) => {
    let q = fs.collection(coll);
    for (const [field, op, value] of wheres) q = q.where(field, op, value);
    if (orderBy) q = q.orderBy(...orderBy);
    if (limit) q = q.limit(limit);
    return q;
  };
  const rows = (snap) => snap.docs.map((d) => ({ id: d.id, data: d.data() }));
  const data = (snap) => (snap.exists ? snap.data() : null);
  const writer = (w) => ({
    set: (path, value, { merge = false } = {}) => w.set(fs.doc(path), value, { merge }),
    update: (path, value) => w.update(fs.doc(path), value),
  });

  return {
    get: async (path) => data(await fs.doc(path).get()),
    query: async (coll, wheres, opts) => rows(await buildQuery(coll, wheres, opts).get()),
    tx: (fn) =>
      fs.runTransaction(async (t) =>
        fn({
          get: async (path) => data(await t.get(fs.doc(path))),
          query: async (coll, wheres, opts) => rows(await t.get(buildQuery(coll, wheres, opts))),
          ...writer(t),
        })),
    batch: async (fn) => {
      const b = fs.batch();
      await fn(writer(b));
      await b.commit();
    },
    inc: (n) => FieldValue.increment(n),
    newId: (coll) => fs.collection(coll).doc().id,
  };
}
