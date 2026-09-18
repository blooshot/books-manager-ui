import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getCoverFromCache, saveCoverToCache } from '@/services/drive/coverCache'

const blobOf = (text: string) => new Blob([text], { type: 'image/jpeg' })
const textOf = async (blob: Blob | null) => (blob ? blob.text() : null)

beforeEach(async () => {
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase('BookCoversCache')
    request.onsuccess = () => resolve()
    request.onerror = () => reject(new Error('could not reset the test database'))
  })
})
afterEach(() => vi.unstubAllGlobals())

describe('cover cache', () => {
  it('returns null for a cover that was never saved', async () => {
    expect(await getCoverFromCache('nope')).toBeNull()
  })

  it('saves and reads back the full image', async () => {
    expect(await saveCoverToCache('file-1', blobOf('full bytes'))).toBe(true)
    expect(await textOf(await getCoverFromCache('file-1'))).toBe('full bytes')
  })

  it('stores the thumbnail next to the full image and serves each variant separately', async () => {
    await saveCoverToCache('file-1', blobOf('full bytes'), blobOf('thumb bytes'))
    expect(await textOf(await getCoverFromCache('file-1', 'full'))).toBe('full bytes')
    expect(await textOf(await getCoverFromCache('file-1', 'thumb'))).toBe('thumb bytes')
  })

  it('has no thumbnail to serve when none was saved', async () => {
    await saveCoverToCache('file-1', blobOf('full bytes'))
    expect(await getCoverFromCache('file-1', 'thumb')).toBeNull()
  })

  it('keeps covers for different files apart', async () => {
    await saveCoverToCache('a', blobOf('image a'))
    await saveCoverToCache('b', blobOf('image b'))
    expect(await textOf(await getCoverFromCache('a'))).toBe('image a')
    expect(await textOf(await getCoverFromCache('b'))).toBe('image b')
  })

  it('overwrites an existing entry with the same file ID', async () => {
    await saveCoverToCache('a', blobOf('first'), blobOf('first thumb'))
    await saveCoverToCache('a', blobOf('second'))
    expect(await textOf(await getCoverFromCache('a'))).toBe('second')
    expect(await getCoverFromCache('a', 'thumb')).toBeNull()
  })

  it('does not throw when IndexedDB is unavailable: reads give null, writes report false', async () => {
    vi.stubGlobal('indexedDB', undefined)
    expect(await saveCoverToCache('a', blobOf('x'))).toBe(false)
    expect(await getCoverFromCache('a')).toBeNull()
  })
})
