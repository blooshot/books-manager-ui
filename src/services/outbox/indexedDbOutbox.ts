import { OutboxUnavailableError, type OutboxRecord, type OutboxStorage } from '@/services/outbox/types'

const STORE = 'entries'
const VERSION = 1

function openDb(name: string): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new OutboxUnavailableError())
      return
    }
    let request: IDBOpenDBRequest
    try {
      request = indexedDB.open(name, VERSION)
    } catch {
      reject(new OutboxUnavailableError())
      return
    }
    request.onerror = () => reject(new OutboxUnavailableError())
    request.onblocked = () => reject(new OutboxUnavailableError())
    request.onsuccess = () => resolve(request.result)
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) {
        request.result.createObjectStore(STORE, { keyPath: 'seq', autoIncrement: true })
      }
    }
  })
}

/**
 * The outbox in IndexedDB (never localStorage: entries can carry photos). Each call opens and closes its own
 * connection, so nothing is held open. Every failure surfaces as OutboxUnavailableError; the caller then falls back
 * to reporting the original error instead of queueing, so a change is never silently lost.
 */
export function createIndexedDbOutbox(dbName = 'BookOutbox'): OutboxStorage {
  async function inTransaction<T>(mode: IDBTransactionMode, work: (store: IDBObjectStore, done: (value: T) => void, fail: () => void) => void): Promise<T> {
    const db = await openDb(dbName)
    try {
      return await new Promise<T>((resolve, reject) => {
        const fail = () => reject(new OutboxUnavailableError())
        const transaction = db.transaction(STORE, mode)
        transaction.onerror = fail
        transaction.onabort = fail
        work(transaction.objectStore(STORE), resolve, fail)
      })
    } finally {
      db.close()
    }
  }

  return {
    add: (record) =>
      inTransaction<number>('readwrite', (store, done, fail) => {
        const request = store.add(record)
        request.onsuccess = () => done(Number(request.result))
        request.onerror = fail
      }),

    list: () =>
      inTransaction<OutboxRecord[]>('readonly', (store, done, fail) => {
        const request = store.getAll()
        request.onsuccess = () => done(request.result as OutboxRecord[])
        request.onerror = fail
      }),

    get: (seq) =>
      inTransaction<OutboxRecord | undefined>('readonly', (store, done, fail) => {
        const request = store.get(seq)
        request.onsuccess = () => done(request.result as OutboxRecord | undefined)
        request.onerror = fail
      }),

    update: (seq, changes) =>
      inTransaction<void>('readwrite', (store, done, fail) => {
        const read = store.get(seq)
        read.onerror = fail
        read.onsuccess = () => {
          const current = read.result as OutboxRecord | undefined
          if (!current) {
            done()
            return
          }
          const write = store.put({ ...current, ...changes, seq })
          write.onsuccess = () => done()
          write.onerror = fail
        }
      }),

    remove: (seq) =>
      inTransaction<void>('readwrite', (store, done, fail) => {
        const request = store.delete(seq)
        request.onsuccess = () => done()
        request.onerror = fail
      }),
  }
}
