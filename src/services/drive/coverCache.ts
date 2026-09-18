const DB_NAME = 'BookCoversCache'
const STORE_NAME = 'covers'
const DB_VERSION = 1

export interface CachedCover {
  fileId: string
  blob: Blob
  timestamp: number
}

function getDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)

    request.onerror = () => reject(new Error('Failed to open IndexedDB'))

    request.onsuccess = () => resolve(request.result)

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'fileId' })
      }
    }
  })
}

export async function saveCoverToCache(fileId: string, blob: Blob): Promise<void> {
  const db = await getDB()
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readwrite')
    const store = transaction.objectStore(STORE_NAME)
    
    const item: CachedCover = {
      fileId,
      blob,
      timestamp: Date.now(),
    }
    
    const request = store.put(item)
    
    request.onsuccess = () => resolve()
    request.onerror = () => reject(new Error('Failed to save cover to cache'))
    
    transaction.oncomplete = () => db.close()
  })
}

export async function getCoverFromCache(fileId: string): Promise<Blob | null> {
  const db = await getDB()
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readonly')
    const store = transaction.objectStore(STORE_NAME)
    
    const request = store.get(fileId)
    
    request.onsuccess = () => {
      const result = request.result as CachedCover | undefined
      resolve(result ? result.blob : null)
    }
    
    request.onerror = () => reject(new Error('Failed to get cover from cache'))
    
    transaction.oncomplete = () => db.close()
  })
}
