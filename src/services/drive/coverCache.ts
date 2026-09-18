/**
 * IndexedDB cache of cover images, keyed by Drive file ID.
 * A cover's bytes never change (a new photo is a new file ID), so entries never expire.
 * The cache is only an optimisation: if IndexedDB is unavailable (private window, blocked
 * storage) reads return null and writes are skipped; nothing here throws.
 */
import { fromStored, toStored, type StoredBlob } from '@/lib/storedBlob'

const DB_NAME = 'BookCoversCache'
const STORE_NAME = 'covers'
const DB_VERSION = 1

export type CoverVariant = 'full' | 'thumb'

interface CachedCover {
  fileId: string
  full: StoredBlob
  thumb?: StoredBlob
  timestamp: number
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB is not available'))
      return
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onerror = () => reject(new Error('Failed to open IndexedDB'))
    request.onsuccess = () => resolve(request.result)
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) {
        request.result.createObjectStore(STORE_NAME, { keyPath: 'fileId' })
      }
    }
  })
}

/** Runs one request against the store, closes the connection, and resolves with its result. */
async function withStore<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDb()
  try {
    return await new Promise<T>((resolve, reject) => {
      const request = run(db.transaction(STORE_NAME, mode).objectStore(STORE_NAME))
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(new Error('IndexedDB request failed'))
    })
  } finally {
    db.close()
  }
}

/** Stores a cover (and optionally its thumbnail). Returns false if it could not be cached. */
export async function saveCoverToCache(fileId: string, full: Blob, thumb?: Blob): Promise<boolean> {
  try {
    const entry: CachedCover = {
      fileId,
      full: await toStored(full),
      thumb: thumb ? await toStored(thumb) : undefined,
      timestamp: Date.now(),
    }
    await withStore('readwrite', (store) => store.put(entry))
    return true
  } catch {
    return false
  }
}

/** The cached image, or null if it isn't cached (or has no thumbnail when one was asked for). */
export async function getCoverFromCache(fileId: string, variant: CoverVariant = 'full'): Promise<Blob | null> {
  try {
    const entry = await withStore<CachedCover | undefined>('readonly', (store) => store.get(fileId))
    const image = variant === 'thumb' ? entry?.thumb : entry?.full
    return image ? fromStored(image) : null
  } catch {
    return null
  }
}
