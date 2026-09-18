import { describe, expect, it, vi } from 'vitest'
import { createDriveClient } from '@/services/drive/client'
import { DriveError, DrivePermissionError, SessionExpiredError } from '@/services/drive/errors'
import { SessionExpiredError as SheetsSessionExpiredError } from '@/services/sheets/errors'

const ok = (body: unknown = {}) => new Response(JSON.stringify(body), { status: 200 })

function clientWith(fetchImpl: typeof fetch) {
  return createDriveClient({ getAccessToken: () => 'fake-token', fetchImpl })
}

/** The URL and headers of the first call. */
function firstCall(fetchImpl: ReturnType<typeof vi.fn>) {
  const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit]
  return { url, init, headers: new Headers(init.headers) }
}

describe('Drive client requests', () => {
  it('sends the Bearer token and routes normal paths to the v3 base', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(ok({ id: '123' }))
    const res = await clientWith(fetchImpl).request<{ id: string }>('/files')
    expect(res.id).toBe('123')
    const { url, headers } = firstCall(fetchImpl)
    expect(url).toBe('https://www.googleapis.com/drive/v3/files')
    expect(headers.get('Authorization')).toBe('Bearer fake-token')
  })

  it('routes /upload paths to the upload base', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(ok())
    await clientWith(fetchImpl).request('/upload/files?uploadType=multipart')
    expect(firstCall(fetchImpl).url).toBe('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart')
  })

  it('declares string bodies as JSON (fetch would default to text/plain)', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(ok())
    await clientWith(fetchImpl).request('/files', { method: 'POST', body: JSON.stringify({ name: 'x' }) })
    expect(firstCall(fetchImpl).headers.get('Content-Type')).toBe('application/json')
  })

  it('keeps a Content-Type the caller set (multipart uploads)', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(ok())
    await clientWith(fetchImpl).request('/upload/files', {
      method: 'POST',
      headers: { 'Content-Type': 'multipart/related; boundary=abc' },
      body: new Blob(['x']),
    })
    expect(firstCall(fetchImpl).headers.get('Content-Type')).toBe('multipart/related; boundary=abc')
  })

  it('adds no Content-Type when there is no body', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(ok())
    await clientWith(fetchImpl).request('/files')
    expect(firstCall(fetchImpl).headers.has('Content-Type')).toBe(false)
  })

  it('requestBlob returns the response body as a Blob', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response('blob content', { status: 200 }))
    const blob = await clientWith(fetchImpl).requestBlob('/files/123?alt=media')
    expect(await blob.text()).toBe('blob content')
  })
})

describe('Drive client errors', () => {
  it('reports network failures with code NETWORK and no status', async () => {
    const error = await clientWith(vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))
      .request('/files')
      .catch((e: unknown) => e)
    expect(error).toBeInstanceOf(DriveError)
    expect(error).toMatchObject({ code: 'NETWORK', status: undefined })
  })

  it('maps 401 to the same SessionExpiredError class Sheets uses', async () => {
    const error = await clientWith(vi.fn().mockResolvedValue(new Response('no', { status: 401 })))
      .request('/files')
      .catch((e: unknown) => e)
    expect(error).toBeInstanceOf(SessionExpiredError)
    expect(error).toBeInstanceOf(SheetsSessionExpiredError) // one class, so one instanceof check covers both APIs
    expect(error).toMatchObject({ name: 'SessionExpiredError', code: '401' })
  })

  it('maps 403 to DrivePermissionError', async () => {
    const error = await clientWith(vi.fn().mockResolvedValue(new Response('no', { status: 403 })))
      .request('/files')
      .catch((e: unknown) => e)
    expect(error).toBeInstanceOf(DrivePermissionError)
    expect(error).toMatchObject({ code: '403' })
  })

  it('maps other failures to DriveError with the API message and status code', async () => {
    const response = new Response(JSON.stringify({ error: { message: 'File not found' } }), { status: 404 })
    const error = await clientWith(vi.fn().mockResolvedValue(response))
      .request('/files/123')
      .catch((e: unknown) => e)
    expect(error).toMatchObject({ name: 'DriveError', message: 'File not found', status: 404, code: '404' })
  })
})
