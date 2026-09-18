import { describe, it, expect, vi, beforeEach } from 'vitest'
import { uploadCover, fetchCoverBlob, markReplaced } from './photos'
import type { DriveClient } from './client'

describe('Drive Photo Operations', () => {
  let mockClient: DriveClient

  beforeEach(() => {
    mockClient = {
      request: vi.fn(),
      requestBlob: vi.fn(),
    }
  })

  describe('uploadCover', () => {
    it('uploads a file using multipart form data', async () => {
      vi.mocked(mockClient.request).mockResolvedValueOnce({ id: 'new-file-id' })
      const fakeBlob = new Blob(['fake image data'], { type: 'image/jpeg' })
      
      const id = await uploadCover(mockClient, fakeBlob, 'B-0001', 'folder-123')
      expect(id).toBe('new-file-id')

      expect(mockClient.request).toHaveBeenCalledTimes(1)
      const args = vi.mocked(mockClient.request).mock.calls[0]
      expect(args[0]).toBe('/upload/files?uploadType=multipart')
      expect(args[1]?.method).toBe('POST')
      expect(args[1]?.body).toBeInstanceOf(FormData)
    })
  })

  describe('fetchCoverBlob', () => {
    it('fetches a blob with alt=media', async () => {
      const fakeBlob = new Blob(['fake image data'], { type: 'image/jpeg' })
      vi.mocked(mockClient.requestBlob).mockResolvedValueOnce(fakeBlob)
      
      const blob = await fetchCoverBlob(mockClient, 'file-123')
      expect(blob).toBe(fakeBlob)
      expect(mockClient.requestBlob).toHaveBeenCalledWith('/files/file-123?alt=media')
    })
  })

  describe('markReplaced', () => {
    it('renames the file instead of deleting it', async () => {
      vi.mocked(mockClient.request).mockResolvedValueOnce({})
      
      await markReplaced(mockClient, 'file-123', 'B-0001')
      
      expect(mockClient.request).toHaveBeenCalledWith('/files/file-123', {
        method: 'PATCH',
        body: JSON.stringify({
          name: 'deleted-file-B-0001.jpg',
        }),
      })
    })
  })
})
