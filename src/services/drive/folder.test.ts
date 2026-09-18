import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { getOrCreateFolderId } from './folder'
import type { DriveClient } from './client'

describe('getOrCreateFolderId', () => {
  let mockClient: DriveClient

  beforeEach(() => {
    localStorage.clear()
    mockClient = {
      request: vi.fn(),
      requestBlob: vi.fn(),
    }
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('returns cached ID if available', async () => {
    localStorage.setItem('drive_book_covers_folder_id', 'cached-id-123')
    const id = await getOrCreateFolderId(mockClient)
    expect(id).toBe('cached-id-123')
    expect(mockClient.request).not.toHaveBeenCalled()
  })

  it('searches for folder and caches ID if found', async () => {
    vi.mocked(mockClient.request).mockResolvedValueOnce({
      files: [{ id: 'found-id-456' }],
    })

    const id = await getOrCreateFolderId(mockClient)
    expect(id).toBe('found-id-456')
    expect(localStorage.getItem('drive_book_covers_folder_id')).toBe('found-id-456')
    
    // Verify the query
    expect(mockClient.request).toHaveBeenCalledWith(
      expect.stringContaining(encodeURIComponent(`name = 'Book Covers'`))
    )
    expect(mockClient.request).toHaveBeenCalledTimes(1)
  })

  it('creates folder if not found and caches ID', async () => {
    // 1st request: search (returns empty)
    vi.mocked(mockClient.request).mockResolvedValueOnce({ files: [] })
    // 2nd request: create (returns new ID)
    vi.mocked(mockClient.request).mockResolvedValueOnce({ id: 'new-id-789' })

    const id = await getOrCreateFolderId(mockClient)
    expect(id).toBe('new-id-789')
    expect(localStorage.getItem('drive_book_covers_folder_id')).toBe('new-id-789')

    expect(mockClient.request).toHaveBeenCalledTimes(2)
    // Verify the create request payload
    expect(mockClient.request).toHaveBeenNthCalledWith(2, '/files', {
      method: 'POST',
      body: JSON.stringify({
        name: 'Book Covers',
        mimeType: 'application/vnd.google-apps.folder',
      }),
    })
  })
})
