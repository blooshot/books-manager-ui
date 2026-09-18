import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { getCoverFromCache } from '@/services/drive/coverCache'
import { createDriveFileUrl, getDriveFileIdFromUrl } from '@/services/drive/links'
import { makeStore, type AppStore } from '@/store'
import { addBook, editBook } from '@/store/libraryThunks'
import { booksSelectors } from '@/store/selectors'
import { signIn } from '@/store/sessionSlice'
import { FakeDrive } from '@/test/fakeDrive'
import { MemoryOutbox } from '@/test/fakeOutbox'
import { FakeSheets } from '@/test/fakeSheets'

const NOW = new Date(2026, 8, 18, 14, 5)
const PHOTO_COLUMN = 6 // Books tab: Book ID, Title, Author, Purchase date, Price paid, Current market price, Photo, Added at

let sheets: FakeSheets
let drive: FakeDrive
/** Every request across both APIs, in order, e.g. "drive POST /upload/drive/v3/files". */
let log: string[]

const bytes = (...values: number[]) => new Uint8Array(values)
const photo = (full: number[], thumb: number[]) => ({
  full: new Blob([bytes(...full)], { type: 'image/jpeg' }),
  thumb: new Blob([bytes(...thumb)], { type: 'image/jpeg' }),
})
const bytesOf = async (blob: Blob | null) => (blob ? [...new Uint8Array(await blob.arrayBuffer())] : null)

/** Routes each request to the fake for that Google API, recording the order. */
const routedFetch: typeof fetch = (input, init) => {
  const url = new URL(String(input))
  const api = url.hostname === 'sheets.googleapis.com' ? 'sheets' : 'drive'
  log.push(`${api} ${init?.method ?? 'GET'} ${url.pathname}`)
  return (api === 'sheets' ? sheets : drive).fetch(input, init)
}

function signedInStore(): AppStore {
  const store = makeStore({ sheetId: 'sheet-1', fetchImpl: routedFetch, now: () => NOW, outbox: new MemoryOutbox() })
  store.dispatch(
    signIn.fulfilled({ accessToken: 'test-token', expiresAt: NOW.getTime() + 3_600_000, email: 'me@example.com' }, 'req', undefined),
  )
  return store
}

const uploads = () => log.filter((l) => l.startsWith('drive POST /upload'))
const sheetAppends = () => log.filter((l) => l.startsWith('sheets POST') && l.endsWith(':append'))
const photoCell = (row: number) => sheets.tabs.Books[row][PHOTO_COLUMN]
const coverFiles = () => [...drive.files.values()].filter((f) => f.bytes)

beforeEach(async () => {
  sheets = new FakeSheets()
  drive = new FakeDrive()
  log = []
  localStorage.clear()
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase('BookCoversCache')
    request.onsuccess = () => resolve()
    request.onerror = () => reject(new Error('could not reset the test database'))
  })
})

describe('addBook with a photo', () => {
  it('uploads the cover before the row is written, and the row links to it', async () => {
    const store = signedInStore()
    const book = await store.dispatch(addBook({ title: 'Dune', author: 'Herbert', photo: photo([1, 2, 3], [9]) })).unwrap()

    expect(log.findIndex((l) => l.startsWith('drive POST /upload'))).toBeGreaterThan(-1)
    expect(log.findIndex((l) => l.startsWith('drive POST /upload'))).toBeLessThan(log.findIndex((l) => l.endsWith(':append')))

    const [file] = coverFiles()
    expect(file).toMatchObject({ name: 'B-0001.jpg', mimeType: 'image/jpeg' })
    expect([...(file.bytes ?? [])]).toEqual([1, 2, 3])
    expect(file.parents).toEqual([drive.byName('Book Covers')[0].id])
    expect(photoCell(1)).toBe(createDriveFileUrl(file.id))
    expect(book.photoUrl).toBe(photoCell(1))
    expect(booksSelectors.selectById(store.getState(), 'B-0001')?.photoUrl).toBe(photoCell(1))
  })

  it('puts the full image and the thumbnail in the local cache', async () => {
    const store = signedInStore()
    const book = await store.dispatch(addBook({ title: 'Dune', author: 'Herbert', photo: photo([1, 2, 3], [9]) })).unwrap()
    const fileId = getDriveFileIdFromUrl(book.photoUrl ?? '') ?? ''
    expect(await bytesOf(await getCoverFromCache(fileId, 'full'))).toEqual([1, 2, 3])
    expect(await bytesOf(await getCoverFromCache(fileId, 'thumb'))).toEqual([9])
  })

  it('makes no Drive calls when there is no photo', async () => {
    const store = signedInStore()
    const book = await store.dispatch(addBook({ title: 'Dune', author: 'Herbert' })).unwrap()
    expect(log.some((l) => l.startsWith('drive'))).toBe(false)
    expect(book.photoUrl).toBeUndefined()
    expect(photoCell(1)).toBe('')
  })

  it('writes no row and adds no book when the upload fails', async () => {
    const store = signedInStore()
    drive.failNextMethod = { method: 'POST', status: 500 }
    await expect(store.dispatch(addBook({ title: 'Dune', author: 'Herbert', photo: photo([1], [2]) })).unwrap()).rejects.toMatchObject({
      name: 'DriveError',
      code: '500',
    })
    expect(sheetAppends()).toHaveLength(0)
    expect(sheets.tabs.Books).toHaveLength(1)
    expect(booksSelectors.selectTotal(store.getState())).toBe(0)
  })

  it('leaves only an orphan file (and no row, no store entry) when the row write fails after the upload', async () => {
    const store = signedInStore()
    sheets.failNextMethod = { method: 'POST', status: 500 }
    await expect(store.dispatch(addBook({ title: 'Dune', author: 'Herbert', photo: photo([1], [2]) })).unwrap()).rejects.toMatchObject({
      name: 'SheetsError',
      code: '500',
    })
    expect(uploads()).toHaveLength(1)
    expect(coverFiles()).toHaveLength(1) // the orphan
    expect(sheets.tabs.Books).toHaveLength(1)
    expect(booksSelectors.selectTotal(store.getState())).toBe(0)
    expect(store.getState().session.status).toBe('signedIn') // a 500 is not an expired session
  })

  it('rejects a blank title before anything is uploaded', async () => {
    const store = signedInStore()
    await expect(store.dispatch(addBook({ title: ' ', author: 'H', photo: photo([1], [2]) })).unwrap()).rejects.toMatchObject({
      name: 'ValidationError',
    })
    expect(log).toHaveLength(0)
  })

  it('when Drive says the token is no longer valid: marks the session expired, writes nothing, and queues the book with its photo', async () => {
    const store = signedInStore()
    drive.token = 'a-different-token' // Sheets still accepts the token, Drive does not
    const saved = await store.dispatch(addBook({ title: 'Dune', author: 'Herbert', photo: photo([1], [2]) })).unwrap()

    expect(saved.queued).toBe(true)
    expect(store.getState().session.status).toBe('expired')
    expect(sheets.tabs.Books).toHaveLength(1)
    expect(booksSelectors.selectTotal(store.getState())).toBe(0)
    expect(store.getState().outbox.entries).toHaveLength(1)
    expect(store.getState().outbox.entries[0].op).toMatchObject({ kind: 'addBook', hasPhoto: true })
  })

  it('replaces a stale cached folder ID instead of failing', async () => {
    localStorage.setItem('bm.coverFolderId:me@example.com', '1StaleFolderIdThatDoesNotExist000')
    const store = signedInStore()
    await store.dispatch(addBook({ title: 'Dune', author: 'Herbert', photo: photo([1], [2]) })).unwrap()
    const [file] = coverFiles()
    expect(drive.files.get(file.parents[0])?.name).toBe('Book Covers')
  })

  it('recovers when the covers folder is deleted mid-session', async () => {
    const store = signedInStore()
    const first = await store.dispatch(addBook({ title: 'One', author: 'A', photo: photo([1], [2]) })).unwrap()
    const firstFile = drive.files.get(getDriveFileIdFromUrl(first.photoUrl ?? '') ?? '')
    drive.files.delete(firstFile?.parents[0] ?? '')

    const second = await store.dispatch(addBook({ title: 'Two', author: 'B', photo: photo([3], [4]) })).unwrap()
    const secondFile = drive.files.get(getDriveFileIdFromUrl(second.photoUrl ?? '') ?? '')
    expect(drive.files.get(secondFile?.parents[0] ?? '')?.name).toBe('Book Covers')
  })

  it('keeps two simultaneous adds apart: distinct IDs, each file linked from its own row', async () => {
    const store = signedInStore()
    const [a, b] = await Promise.all([
      store.dispatch(addBook({ title: 'One', author: 'A', photo: photo([1], [1]) })).unwrap(),
      store.dispatch(addBook({ title: 'Two', author: 'B', photo: photo([2], [2]) })).unwrap(),
    ])
    expect([a.id, b.id].sort()).toEqual(['B-0001', 'B-0002'])
    for (const book of [a, b]) {
      const file = drive.files.get(getDriveFileIdFromUrl(book.photoUrl ?? '') ?? '')
      expect(file?.name).toBe(`${book.id}.jpg`)
    }
  })
})

describe('editBook with a new photo', () => {
  async function storeWithCover() {
    const store = signedInStore()
    const book = await store.dispatch(addBook({ title: 'Dune', author: 'Herbert', photo: photo([1, 2, 3], [9]) })).unwrap()
    log = []
    drive.calls = []
    return { store, oldFileId: getDriveFileIdFromUrl(book.photoUrl ?? '') ?? '' }
  }

  it('uploads the new cover, updates the Photo cell, and renames (never deletes) the old file', async () => {
    const { store, oldFileId } = await storeWithCover()
    const saved = await store.dispatch(editBook({ id: 'B-0001', patch: { title: 'Dune (2nd ed.)' }, photo: photo([7, 7], [8]) })).unwrap()

    const newFileId = getDriveFileIdFromUrl(saved.photoUrl ?? '') ?? ''
    expect(newFileId).not.toBe(oldFileId)
    expect(photoCell(1)).toBe(createDriveFileUrl(newFileId))
    expect(sheets.tabs.Books[1][1]).toBe('Dune (2nd ed.)')

    expect(drive.files.get(newFileId)).toMatchObject({ name: 'B-0001.jpg' })
    expect([...(drive.files.get(newFileId)?.bytes ?? [])]).toEqual([7, 7])

    const old = drive.files.get(oldFileId)
    expect(old?.name).toBe('deleted-file-B-0001.jpg')
    expect(old?.trashed).toBe(false)
    expect([...(old?.bytes ?? [])]).toEqual([1, 2, 3]) // content kept for the owner to review

    expect(drive.calls.map((c) => c.method)).not.toContain('DELETE')
    expect(drive.calls.find((c) => c.method === 'PATCH')?.body).toEqual({ name: 'deleted-file-B-0001.jpg' })
    expect(await bytesOf(await getCoverFromCache(newFileId, 'full'))).toEqual([7, 7])
    expect(store.getState().notices.items).toEqual([])
  })

  it('uploads before it touches the Sheet, and renames only after the Sheet is updated', async () => {
    const { store } = await storeWithCover()
    await store.dispatch(editBook({ id: 'B-0001', patch: {}, photo: photo([7], [8]) })).unwrap()
    const upload = log.findIndex((l) => l.startsWith('drive POST /upload'))
    const sheetWrite = log.findIndex((l) => l.startsWith('sheets POST') && l.endsWith('values:batchUpdate'))
    const rename = log.findIndex((l) => l.startsWith('drive PATCH'))
    expect(upload).toBeGreaterThan(-1)
    expect(upload).toBeLessThan(sheetWrite)
    expect(sheetWrite).toBeLessThan(rename)
  })

  it('still saves the edit when the old cover cannot be renamed, and reports it as a notice', async () => {
    const { store, oldFileId } = await storeWithCover()
    drive.failNextMethod = { method: 'PATCH', status: 500 }
    const saved = await store.dispatch(editBook({ id: 'B-0001', patch: {}, photo: photo([7], [8]) })).unwrap()

    expect(photoCell(1)).toBe(saved.photoUrl)
    expect(drive.files.get(oldFileId)?.name).toBe('B-0001.jpg') // not renamed
    expect(store.getState().notices.items).toHaveLength(1)
    expect(store.getState().notices.items[0]).toContain('B-0001')
  })

  it('rolls the book back and leaves the old cover untouched when the Sheet write fails', async () => {
    const { store, oldFileId } = await storeWithCover()
    const before = booksSelectors.selectById(store.getState(), 'B-0001')
    sheets.failNextMethod = { method: 'POST', status: 500 }
    await expect(
      store.dispatch(editBook({ id: 'B-0001', patch: { title: 'Nope' }, photo: photo([7], [8]) })).unwrap(),
    ).rejects.toMatchObject({ code: '500' })

    expect(booksSelectors.selectById(store.getState(), 'B-0001')).toEqual(before)
    expect(sheets.tabs.Books[1][1]).toBe('Dune')
    expect(drive.files.get(oldFileId)?.name).toBe('B-0001.jpg') // the old cover is not retired
    expect(drive.calls.some((c) => c.method === 'PATCH')).toBe(false)
  })

  it('makes no Drive calls for a text-only edit', async () => {
    const { store } = await storeWithCover()
    await store.dispatch(editBook({ id: 'B-0001', patch: { title: 'Dune Messiah' } })).unwrap()
    expect(log.some((l) => l.startsWith('drive'))).toBe(false)
  })

  it('adds a first photo to a book that had none, with nothing to rename', async () => {
    const store = signedInStore()
    await store.dispatch(addBook({ title: 'Dune', author: 'Herbert' })).unwrap()
    drive.calls = []
    const saved = await store.dispatch(editBook({ id: 'B-0001', patch: {}, photo: photo([5], [6]) })).unwrap()
    expect(photoCell(1)).toBe(saved.photoUrl)
    expect(drive.calls.some((c) => c.method === 'PATCH')).toBe(false)
    expect(store.getState().notices.items).toEqual([])
  })
})
