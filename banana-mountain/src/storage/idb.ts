/*
 * Spielstand in IndexedDB speichern (automatisch) + Export/Import als Datei.
 */
import type { SaveData } from '../sim/sim';

const DB_NAME = 'banana-mountain';
const STORE = 'saves';
const KEY = 'autosave';

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return open().then((db) => new Promise<T>((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const req = fn(t.objectStore(STORE));
    t.oncomplete = () => { db.close(); resolve(req.result); };
    t.onerror = () => { db.close(); reject(t.error); };
  }));
}

export async function saveGame(data: SaveData): Promise<void> {
  await tx('readwrite', (s) => s.put({ savedAt: Date.now(), data }, KEY));
}

export async function loadGame(): Promise<SaveData | null> {
  const rec = await tx<{ data: SaveData } | undefined>('readonly', (s) => s.get(KEY));
  return rec ? rec.data : null;
}

export async function deleteGame(): Promise<void> {
  await tx('readwrite', (s) => s.delete(KEY));
}

export function exportFile(data: SaveData) {
  const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  const d = new Date();
  a.download = `banana-mountain-${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

export function readFile(file: File): Promise<SaveData> {
  return file.text().then((t) => JSON.parse(t) as SaveData);
}
