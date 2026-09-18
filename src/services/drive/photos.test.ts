import { beforeEach, describe, expect, it } from 'vitest'
import { createDriveClient } from '@/services/drive/client'
import { DriveError, SessionExpiredError } from '@/services/drive/errors'
import { fetchCoverBlob, markReplaced, uploadCover } from '@/services/drive/photos'
import { FakeDrive } from '@/test/fakeDrive'

let drive: FakeDrive
const client = () => createDriveClient({ getAccessToken: () => drive.token, fetchImpl: drive.fetch })

// JPEG magic number plus bytes that would break a naive text-based body (CRLF, NUL, high bytes)
const IMAGE_BYTES = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x0d, 0x0a, 0x2d, 0x2d, 0x80, 0xfe])
const image = () => new Blob([IMAGE_BYTES], { type: 'image/jpeg' })

beforeEach(() => {
  drive = new FakeDrive()
})

describe('uploadCover', () => {
  it('stores the bytes in the folder as <BookID>.jpg and returns the new file ID', async () => {
    const folder = drive.seed({ name: 'Book Covers' })
    const id = await uploadCover(client(), image(), 'B-0001', folder.id)

    const file = drive.files.get(id)
    expect(file).toMatchObject({ name: 'B-0001.jpg', mimeType: 'image/jpeg', parents: [folder.id] })
    expect([...(file?.bytes ?? [])]).toEqual([...IMAGE_BYTES])
  })

  it('uses multipart/related, which Drive requires (FormData would be rejected)', async () => {
    const folder = drive.seed({ name: 'Book Covers' })
    await uploadCover(client(), image(), 'B-0001', folder.id)
    const upload = drive.calls.find((c) => c.url.includes('/upload/'))
    expect(upload?.method).toBe('POST')
    expect(upload?.url).toContain('uploadType=multipart')
    expect(upload?.body).toEqual({ name: 'B-0001.jpg', parents: [folder.id] })
  })

  it('fails with a 404 DriveError when the folder no longer exists, and stores nothing', async () => {
    const error = await uploadCover(client(), image(), 'B-0001', '1GoneFolderId00000000000000000').catch((e: unknown) => e)
    expect(error).toBeInstanceOf(DriveError)
    expect(error).toMatchObject({ code: '404' })
    expect([...drive.files.values()].filter((f) => f.bytes)).toHaveLength(0)
  })

  it('surfaces an expired token as SessionExpiredError', async () => {
    const folder = drive.seed({ name: 'Book Covers' })
    const stale = createDriveClient({ getAccessToken: () => 'expired-token', fetchImpl: drive.fetch })
    await expect(uploadCover(stale, image(), 'B-0001', folder.id)).rejects.toBeInstanceOf(SessionExpiredError)
  })
})

describe('fetchCoverBlob', () => {
  it('returns exactly the bytes that were uploaded', async () => {
    const folder = drive.seed({ name: 'Book Covers' })
    const id = await uploadCover(client(), image(), 'B-0001', folder.id)
    const blob = await fetchCoverBlob(client(), id)
    expect([...new Uint8Array(await blob.arrayBuffer())]).toEqual([...IMAGE_BYTES])
  })

  it('reports a missing file as a 404 DriveError', async () => {
    await expect(fetchCoverBlob(client(), '1DoesNotExist00000000000000000')).rejects.toMatchObject({ name: 'DriveError', code: '404' })
  })
})

describe('markReplaced', () => {
  it('renames the old cover to deleted-file-<BookID>.jpg and keeps its content', async () => {
    const folder = drive.seed({ name: 'Book Covers' })
    const id = await uploadCover(client(), image(), 'B-0001', folder.id)
    await markReplaced(client(), id, 'B-0001')

    const file = drive.files.get(id)
    expect(file?.name).toBe('deleted-file-B-0001.jpg')
    expect(file?.trashed).toBe(false)
    expect([...(file?.bytes ?? [])]).toEqual([...IMAGE_BYTES])
  })

  it('sends only the new name, never trashed or anything else (ADR-0004)', async () => {
    const folder = drive.seed({ name: 'Book Covers' })
    const id = await uploadCover(client(), image(), 'B-0001', folder.id)
    await markReplaced(client(), id, 'B-0001')
    const patch = drive.calls.find((c) => c.method === 'PATCH')
    expect(patch?.body).toEqual({ name: 'deleted-file-B-0001.jpg' })
  })
})

describe('append-only guard at runtime', () => {
  it('never issues a DELETE across upload, fetch and replace', async () => {
    const folder = drive.seed({ name: 'Book Covers' })
    const id = await uploadCover(client(), image(), 'B-0001', folder.id)
    await fetchCoverBlob(client(), id)
    await markReplaced(client(), id, 'B-0001')
    expect(drive.calls.map((c) => c.method)).not.toContain('DELETE')
    expect([...drive.files.values()].some((f) => f.trashed)).toBe(false)
  })
})
