import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createDriveClient } from '@/services/drive/client'
import { createCoverLoader, type CoverLoaderDeps } from '@/services/drive/covers'
import { getCoverFromCache, saveCoverToCache } from '@/services/drive/coverCache'
import { FakeDrive } from '@/test/fakeDrive'

const FULL_BYTES = new Uint8Array([0xff, 0xd8, 0x01, 0x02, 0x03])
const THUMB_BYTES = new Uint8Array([0xff, 0xd8, 0x09])
const bytesOf = async (blob: Blob | null) => (blob ? [...new Uint8Array(await blob.arrayBuffer())] : null)

let drive: FakeDrive
let fileId: string
let revoked: string[]
let makeThumb: ReturnType<typeof vi.fn>

/** A loader on the real cache and the real Drive client (against FakeDrive); only the browser bits are stand-ins. */
function loader(overrides: Partial<CoverLoaderDeps> = {}) {
  const client = createDriveClient({ getAccessToken: () => drive.token, fetchImpl: drive.fetch })
  const urlToBlob = new Map<string, Blob>()
  const created = createCoverLoader({
    fetchBlob: (id) => client.requestBlob(`/files/${id}?alt=media`),
    readCache: getCoverFromCache,
    writeCache: saveCoverToCache,
    makeThumb: makeThumb as unknown as CoverLoaderDeps['makeThumb'],
    createObjectURL: (blob) => {
      const url = `blob:test/${urlToBlob.size + 1}`
      urlToBlob.set(url, blob)
      return url
    },
    revokeObjectURL: (url) => revoked.push(url),
    ...overrides,
  })
  return { ...created, urlToBlob }
}

beforeEach(async () => {
  drive = new FakeDrive()
  fileId = drive.seed({ name: 'B-0001.jpg', mimeType: 'image/jpeg', bytes: FULL_BYTES }).id
  revoked = []
  makeThumb = vi.fn(async () => new Blob([THUMB_BYTES], { type: 'image/jpeg' }))
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase('BookCoversCache')
    request.onsuccess = () => resolve()
    request.onerror = () => reject(new Error('could not reset the test database'))
  })
})
afterEach(() => vi.unstubAllGlobals())

const driveDownloads = () => drive.calls.filter((c) => c.url.includes('alt=media')).length

describe('cover loader', () => {
  it('downloads a cover once, caches it, and serves later requests without touching Drive', async () => {
    const first = loader()
    const url = await first.getCoverUrl(fileId, 'full')
    expect(await bytesOf(first.urlToBlob.get(url) ?? null)).toEqual([...FULL_BYTES])
    expect(driveDownloads()).toBe(1)

    // a fresh loader (e.g. after a reload) is served from IndexedDB
    const second = loader()
    const again = await second.getCoverUrl(fileId, 'full')
    expect(await bytesOf(second.urlToBlob.get(again) ?? null)).toEqual([...FULL_BYTES])
    expect(driveDownloads()).toBe(1)
  })

  it('reuses the same URL for repeat requests in one loader', async () => {
    const l = loader()
    const a = await l.getCoverUrl(fileId, 'full')
    const b = await l.getCoverUrl(fileId, 'full')
    expect(b).toBe(a)
  })

  it('derives a thumbnail from the downloaded full image and caches both', async () => {
    const l = loader()
    const url = await l.getCoverUrl(fileId, 'thumb')
    expect(await bytesOf(l.urlToBlob.get(url) ?? null)).toEqual([...THUMB_BYTES])
    expect(makeThumb).toHaveBeenCalledTimes(1)
    expect(await bytesOf(await getCoverFromCache(fileId, 'full'))).toEqual([...FULL_BYTES])
    expect(await bytesOf(await getCoverFromCache(fileId, 'thumb'))).toEqual([...THUMB_BYTES])
  })

  it('derives the thumbnail from a cached full image without downloading again', async () => {
    await saveCoverToCache(fileId, new Blob([FULL_BYTES], { type: 'image/jpeg' }))
    const l = loader()
    const url = await l.getCoverUrl(fileId, 'thumb')
    expect(await bytesOf(l.urlToBlob.get(url) ?? null)).toEqual([...THUMB_BYTES])
    expect(driveDownloads()).toBe(0)
    expect(await bytesOf(await getCoverFromCache(fileId, 'thumb'))).toEqual([...THUMB_BYTES])
  })

  it('serves a cached thumbnail straight from the cache', async () => {
    await saveCoverToCache(fileId, new Blob([FULL_BYTES]), new Blob([THUMB_BYTES], { type: 'image/jpeg' }))
    const l = loader()
    const url = await l.getCoverUrl(fileId, 'thumb')
    expect(await bytesOf(l.urlToBlob.get(url) ?? null)).toEqual([...THUMB_BYTES])
    expect(makeThumb).not.toHaveBeenCalled()
    expect(driveDownloads()).toBe(0)
  })

  it('falls back to the full image when a thumbnail cannot be made, and does not cache the fallback', async () => {
    makeThumb.mockRejectedValue(new Error('no canvas'))
    const l = loader()
    const url = await l.getCoverUrl(fileId, 'thumb')
    expect(await bytesOf(l.urlToBlob.get(url) ?? null)).toEqual([...FULL_BYTES])
    expect(await getCoverFromCache(fileId, 'thumb')).toBeNull() // a later attempt can still succeed
  })

  it('shares one download between simultaneous requests for the same cover', async () => {
    const l = loader()
    const [a, b, c] = await Promise.all([l.getCoverUrl(fileId, 'full'), l.getCoverUrl(fileId, 'full'), l.getCoverUrl(fileId, 'full')])
    expect(a).toBe(b)
    expect(b).toBe(c)
    expect(driveDownloads()).toBe(1)
  })

  it('rejects when the file is gone from Drive, and hands out no URL', async () => {
    const l = loader()
    await expect(l.getCoverUrl('1DoesNotExist00000000000000000', 'full')).rejects.toMatchObject({ name: 'DriveError', code: '404' })
    expect(l.urlToBlob.size).toBe(0)
  })

  it('still works when IndexedDB is unavailable', async () => {
    vi.stubGlobal('indexedDB', undefined)
    const l = loader()
    const url = await l.getCoverUrl(fileId, 'full')
    expect(await bytesOf(l.urlToBlob.get(url) ?? null)).toEqual([...FULL_BYTES])
  })

  it('releaseAll revokes every URL it handed out', async () => {
    const l = loader()
    const a = await l.getCoverUrl(fileId, 'full')
    const b = await l.getCoverUrl(fileId, 'thumb')
    l.releaseAll()
    expect(revoked.sort()).toEqual([a, b].sort())
  })
})
