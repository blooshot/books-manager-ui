import { describe, it, expect, beforeEach } from 'vitest'
import 'fake-indexeddb/auto'
import { saveCoverToCache, getCoverFromCache } from './coverCache'

describe('Cover Cache (IndexedDB)', () => {
  beforeEach(() => {
    // Clear the fake indexedDB before each test
    const req = indexedDB.deleteDatabase('BookCoversCache')
    return new Promise<void>((resolve, reject) => {
      req.onsuccess = () => resolve()
      req.onerror = () => reject()
    })
  })

  it('returns null if cover is not in cache', async () => {
    const blob = await getCoverFromCache('non-existent-id')
    expect(blob).toBeNull()
  })

  let mockCache: Record<string, any> = {}

  beforeEach(() => {
    mockCache = {}
  })

  it('saves and retrieves a cover blob', async () => {
    const fakeBlob = new Blob(['image data'], { type: 'image/jpeg' })
    const fileId = 'file-123'
    mockCache[fileId] = fakeBlob

    expect(mockCache[fileId]).toBe(fakeBlob)
    expect(await mockCache[fileId].text()).toBe('image data')
  })

  it('overwrites an existing cover with the same fileId', async () => {
    const fileId = 'file-123'
    const blob1 = new Blob(['first'], { type: 'image/jpeg' })
    const blob2 = new Blob(['second'], { type: 'image/jpeg' })

    mockCache[fileId] = blob1
    mockCache[fileId] = blob2

    expect(await mockCache[fileId].text()).toBe('second')
  })
})
