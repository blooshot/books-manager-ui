import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createDriveClient } from '@/services/drive/client'
import { SessionExpiredError } from '@/services/drive/errors'
import { createFolderResolver } from '@/services/drive/folder'
import { FakeDrive } from '@/test/fakeDrive'

const FOLDER = 'application/vnd.google-apps.folder'
let drive: FakeDrive

const clientFor = () => createDriveClient({ getAccessToken: () => drive.token, fetchImpl: drive.fetch })
const resolver = (account = 'me@example.com') => createFolderResolver(clientFor(), account)
const methodsUsed = () => drive.calls.map((c) => c.method)

beforeEach(() => {
  drive = new FakeDrive()
  localStorage.clear()
})
afterEach(() => vi.restoreAllMocks())

describe('createFolderResolver', () => {
  it('creates the folder when none exists, and remembers it', async () => {
    const id = await resolver().getFolderId()
    expect(drive.files.get(id)).toMatchObject({ name: 'Book Covers', mimeType: FOLDER })
    expect(drive.byName('Book Covers')).toHaveLength(1)
    expect(localStorage.getItem('bm.coverFolderId:me@example.com')).toBe(id)
  })

  it('reuses an existing folder instead of creating another', async () => {
    const existing = drive.seed({ name: 'Book Covers' })
    expect(await resolver().getFolderId()).toBe(existing.id)
    expect(methodsUsed()).toEqual(['GET'])
  })

  it('picks the oldest when duplicates exist, so every device agrees', async () => {
    const oldest = drive.seed({ name: 'Book Covers' })
    drive.seed({ name: 'Book Covers' })
    expect(await resolver().getFolderId()).toBe(oldest.id)
  })

  it('ignores trashed folders and non-folders with the same name', async () => {
    drive.seed({ name: 'Book Covers', trashed: true })
    drive.seed({ name: 'Book Covers', mimeType: 'image/jpeg' })
    const id = await resolver().getFolderId()
    expect(drive.files.get(id)?.trashed).toBe(false)
    expect(drive.files.get(id)?.mimeType).toBe(FOLDER)
    expect(drive.byName('Book Covers')).toHaveLength(3) // the two decoys plus one new folder
  })

  it('checks a cached ID once per session, then trusts it', async () => {
    const existing = drive.seed({ name: 'Book Covers' })
    localStorage.setItem('bm.coverFolderId:me@example.com', existing.id)
    const r = resolver()
    expect(await r.getFolderId()).toBe(existing.id)
    drive.calls = []
    expect(await r.getFolderId()).toBe(existing.id)
    expect(drive.calls).toHaveLength(0)
  })

  it('replaces a cached ID whose folder was deleted or is not visible to this app', async () => {
    localStorage.setItem('bm.coverFolderId:me@example.com', '1StaleFolderIdThatDoesNotExist000')
    const id = await resolver().getFolderId()
    expect(id).not.toBe('1StaleFolderIdThatDoesNotExist000')
    expect(localStorage.getItem('bm.coverFolderId:me@example.com')).toBe(id)
  })

  it('replaces a cached ID whose folder was trashed', async () => {
    const trashed = drive.seed({ name: 'Book Covers', trashed: true })
    localStorage.setItem('bm.coverFolderId:me@example.com', trashed.id)
    const id = await resolver().getFolderId()
    expect(id).not.toBe(trashed.id)
  })

  it('keeps separate cache entries per Google account', async () => {
    const a = await resolver('a@example.com').getFolderId()
    localStorage.setItem('bm.coverFolderId:b@example.com', '1FolderOfAnotherAccount000000000')
    const b = await resolver('b@example.com').getFolderId() // stale for b: not found, so resolved again
    expect(localStorage.getItem('bm.coverFolderId:a@example.com')).toBe(a)
    expect(b).toBe(a) // same fake Drive, so the search finds the folder a created
  })

  it('does not forget the folder on an expired token or a network error', async () => {
    const existing = drive.seed({ name: 'Book Covers' })
    localStorage.setItem('bm.coverFolderId:me@example.com', existing.id)
    const stale = createDriveClient({ getAccessToken: () => 'old-token', fetchImpl: drive.fetch })
    await expect(createFolderResolver(stale, 'me@example.com').getFolderId()).rejects.toBeInstanceOf(SessionExpiredError)
    expect(localStorage.getItem('bm.coverFolderId:me@example.com')).toBe(existing.id)
  })

  it('creates a single folder when two callers ask at once', async () => {
    const r = resolver()
    const [a, b] = await Promise.all([r.getFolderId(), r.getFolderId()])
    expect(a).toBe(b)
    expect(drive.byName('Book Covers')).toHaveLength(1)
  })

  it('forget() drops the cached ID so the next call resolves again', async () => {
    const r = resolver()
    const first = await r.getFolderId()
    r.forget()
    expect(localStorage.getItem('bm.coverFolderId:me@example.com')).toBeNull()
    drive.files.delete(first)
    expect(await r.getFolderId()).not.toBe(first)
  })

  it('works when localStorage is blocked', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    const id = await resolver().getFolderId()
    expect(drive.files.get(id)?.name).toBe('Book Covers')
  })
})
