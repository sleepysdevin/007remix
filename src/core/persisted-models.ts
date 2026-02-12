/**
 * Persist uploaded models to IndexedDB so they survive page reloads and mode switches.
 */

const DB_NAME = '007remix_models';
const STORE = 'uploads';
const KEY_ENEMY = 'enemy';
const KEY_PLAYER = 'player';
const KEY_CHARACTER = 'character';

export interface PersistedModel {
  arrayBuffer: ArrayBuffer;
  fileName: string;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => resolve(req.result);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(STORE);
    };
  });
}

/** Save uploaded enemy model to IndexedDB. */
export async function persistEnemyModel(arrayBuffer: ArrayBuffer, fileName: string): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    const store = tx.objectStore(STORE);
    store.put({ arrayBuffer, fileName }, KEY_ENEMY);
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}

/** Load persisted enemy model from IndexedDB, or null if none. */
export async function loadPersistedEnemyModel(): Promise<PersistedModel | null> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).get(KEY_ENEMY);
    tx.oncomplete = () => {
      db.close();
      const v = req.result;
      resolve(v && v.arrayBuffer && v.fileName ? v : null);
    };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}

/** Remove persisted enemy model from IndexedDB. */
export async function clearPersistedEnemyModel(): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).delete(KEY_ENEMY);
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}

/** Save uploaded player model. */
export async function persistPlayerModel(arrayBuffer: ArrayBuffer, fileName: string): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put({ arrayBuffer, fileName }, KEY_PLAYER);
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}

/** Load persisted player model. */
export async function loadPersistedPlayerModel(): Promise<PersistedModel | null> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).get(KEY_PLAYER);
    tx.oncomplete = () => {
      db.close();
      const v = req.result;
      resolve(v && v.arrayBuffer && v.fileName ? v : null);
    };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}

/** Clear persisted player model. */
export async function clearPersistedPlayerModel(): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).delete(KEY_PLAYER);
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}

/** Save uploaded character model. */
export async function persistCharacterModel(arrayBuffer: ArrayBuffer, fileName: string): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put({ arrayBuffer, fileName }, KEY_CHARACTER);
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}

/** Load persisted character model. */
export async function loadPersistedCharacterModel(): Promise<PersistedModel | null> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).get(KEY_CHARACTER);
    tx.oncomplete = () => {
      db.close();
      const v = req.result;
      resolve(v && v.arrayBuffer && v.fileName ? v : null);
    };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}

/** Clear persisted character model. */
export async function clearPersistedCharacterModel(): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).delete(KEY_CHARACTER);
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}
