import { describe, it, expect, vi } from 'vitest'
import { createDriveClient } from './client'
import { DriveError, SessionExpiredError, DrivePermissionError } from './errors'

describe('Drive API Client', () => {
  it('adds the Authorization header', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: '123' }), { status: 200 }))
    const client = createDriveClient({
      getAccessToken: () => 'fake-token',
      fetchImpl,
    })

    const res = await client.request<{ id: string }>('/files')
    expect(res.id).toBe('123')
    expect(fetchImpl).toHaveBeenCalledWith('https://www.googleapis.com/drive/v3/files', {
      headers: { Authorization: 'Bearer fake-token' },
    })
  })

  it('routes /upload paths to the upload base', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify({}), { status: 200 }))
    const client = createDriveClient({
      getAccessToken: () => 'fake-token',
      fetchImpl,
    })

    await client.request('/upload/files?uploadType=multipart')
    expect(fetchImpl).toHaveBeenCalledWith('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
      headers: { Authorization: 'Bearer fake-token' },
    })
  })

  it('throws Network error when fetch fails', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'))
    const client = createDriveClient({
      getAccessToken: () => 'fake-token',
      fetchImpl,
    })

    await expect(client.request('/files')).rejects.toThrowError(
      new DriveError('Network error: could not reach Google Drive.')
    )
  })

  it('maps 401 to SessionExpiredError', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response('Unauthorized', { status: 401 }))
    const client = createDriveClient({
      getAccessToken: () => 'fake-token',
      fetchImpl,
    })

    await expect(client.request('/files')).rejects.toThrowError(SessionExpiredError)
  })

  it('maps 403 to DrivePermissionError', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response('Forbidden', { status: 403 }))
    const client = createDriveClient({
      getAccessToken: () => 'fake-token',
      fetchImpl,
    })

    await expect(client.request('/files')).rejects.toThrowError(DrivePermissionError)
  })

  it('maps other errors to DriveError with message', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: { message: 'File not found' } }), { status: 404 })
    )
    const client = createDriveClient({
      getAccessToken: () => 'fake-token',
      fetchImpl,
    })

    await expect(client.request('/files/123')).rejects.toThrowError(
      new DriveError('File not found', 404)
    )
  })

  it('requestBlob returns a Blob', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response('blob content', { status: 200 }))
    const client = createDriveClient({
      getAccessToken: () => 'fake-token',
      fetchImpl,
    })

    const blob = await client.requestBlob('/files/123?alt=media')
    expect(await blob.text()).toBe('blob content')
  })
})
