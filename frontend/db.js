
const DB_NAME = 'farm-register-db';
const DB_VERSION = 2;
const STORE_RECORDS = 'records';

/**
 * Open (or create) the IndexedDB database
 */
export function openDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      let store;
      if (!db.objectStoreNames.contains(STORE_RECORDS)) {
        store = db.createObjectStore(STORE_RECORDS, { keyPath: 'id', autoIncrement: true });
      } else {
        store = event.target.transaction.objectStore(STORE_RECORDS);
      }
      if (!store.indexNames.contains('bySynced')) {
        store.createIndex('bySynced', 'synced', { unique: false });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Add a new record to the local store
 */
export async function addRecord(record) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_RECORDS, 'readwrite');
    const store = tx.objectStore(STORE_RECORDS);
    const nowIso = new Date().toISOString();
    const data = { ...record, createdAt: nowIso, synced: false };
    const req = store.add(data);
    req.onsuccess = () => resolve({ ...data, id: req.result });
    req.onerror = () => reject(req.error);
  });
}

/** Get all records (optionally unsynced only) */
export async function getRecords({ unsyncedOnly = false } = {}) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_RECORDS, 'readonly');
    const store = tx.objectStore(STORE_RECORDS);
    const out = [];
    if (unsyncedOnly) {
      try {
        const idx = store.index('bySynced');
        const cursorReq = idx.openCursor(IDBKeyRange.only(false));
        cursorReq.onsuccess = (e) => {
          const cursor = e.target.result;
          if (cursor) {
            out.push(cursor.value);
            cursor.continue();
          } else {
            resolve(out);
          }
        };
        cursorReq.onerror = () => reject(cursorReq.error);
        return;
      } catch (e) {
        // index missing; fallback to filtering
      }
    }
    const req = store.getAll();
    req.onsuccess = () => {
      if (unsyncedOnly) {
        resolve((req.result || []).filter(r => r && r.synced === false));
      } else {
        resolve(req.result);
      }
    };
    req.onerror = () => reject(req.error);
  });
}

/** Mark a record as synced */
export async function markAsSynced(id) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_RECORDS, 'readwrite');
    const store = tx.objectStore(STORE_RECORDS);
    const getReq = store.get(id);
    getReq.onsuccess = () => {
      const val = getReq.result;
      if (!val) return resolve();
      val.synced = true;
      val.syncedAt = new Date().toISOString();
      const putReq = store.put(val);
      putReq.onsuccess = () => resolve();
      putReq.onerror = () => reject(putReq.error);
    };
    getReq.onerror = () => reject(getReq.error);
  });
}

/** Delete all records - not used by default but handy for debugging */
export async function clearAll() {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_RECORDS, 'readwrite');
    const store = tx.objectStore(STORE_RECORDS);
    const req = store.clear();
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

/** Delete a single record by id */
export async function deleteRecord(id) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_RECORDS, 'readwrite');
    const store = tx.objectStore(STORE_RECORDS);
    const req = store.delete(id);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

/** Get last N synced records (sorted by id desc) */
export async function getRecentSynced(limit = 10) {
  const all = await getRecords();
  return (all || [])
    .filter(r => r && r.synced === true)
    .sort((a, b) => (b.id || 0) - (a.id || 0))
    .slice(0, limit);
}

