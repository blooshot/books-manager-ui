import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { getCoverFromCache } from '@/services/drive/coverCache'
import { createDriveFileUrl, getDriveFileIdFromUrl } from '@/services/drive/links'
import { makeStore, type AppStore } from '@/store'
import { booksSelectors, loansSelectors, selectOpenLoanByBookId } from '@/store/selectors'
import { addBook, borrowBook, editBook, loadAll, returnBook } from '@/store/libraryThunks'
import { discardEntry, flushOutbox, loadOutbox, retryEntry, startSync, syncAll } from '@/store/outboxThunks'
import { selectFailedCount, selectPendingCount } from '@/store/outboxSlice'
import { signIn } from '@/store/sessionSlice'
import { FakeDrive } from '@/test/fakeDrive'
import { MemoryOutbox, UnavailableOutbox } from '@/test/fakeOutbox'
import { FakeSheets } from '@/test/fakeSheets'
import { bookRow, loanRow } from '@/test/fixtures'
import type { OutboxStorage } from '@/services/outbox/types'

const NOW = new Date(2026, 8, 18, 14, 5)
const ONE_BYTE = (n: number) => ({ full: new Blob([new Uint8Array([n, n])], { type: 'image/jpeg' }), thumb: new Blob([new Uint8Array([n])], { type: 'image/jpeg' }) })

interface Rig {
  store: AppStore
  sheets: FakeSheets
  drive: FakeDrive
  outbox: MemoryOutbox
  network: {
    /** All requests fail like a dropped connection. */
    offline: boolean
    /** Only Sheets requests fail (Drive still works). */
    sheetsOffline: boolean
    /** Google applies the next Sheets write, but the response never arrives. */
    loseNextSheetsWriteResponse: boolean
  }
  log: string[]
}

let rig: Rig

function newRig(options: { outbox?: OutboxStorage; sheets?: FakeSheets; drive?: FakeDrive } = {}): Rig {
  const sheets = options.sheets ?? new FakeSheets()
  const drive = options.drive ?? new FakeDrive()
  const outbox = (options.outbox ?? new MemoryOutbox()) as MemoryOutbox
  const network = { offline: false, sheetsOffline: false, loseNextSheetsWriteResponse: false }
  const log: string[] = []
  const fetchImpl: typeof fetch = async (input, init) => {
    const url = new URL(String(input))
    const isSheets = url.hostname === 'sheets.googleapis.com'
    log.push(`${isSheets ? 'sheets' : 'drive'} ${init?.method ?? 'GET'} ${url.pathname}`)
    if (network.offline || (isSheets && network.sheetsOffline)) throw new TypeError('Failed to fetch')
    const response = await (isSheets ? sheets : drive).fetch(input, init)
    if (isSheets && init?.method === 'POST' && network.loseNextSheetsWriteResponse) {
      network.loseNextSheetsWriteResponse = false
      throw new TypeError('Failed to fetch') // the write happened; the app never finds out
    }
    return response
  }
  const store = makeStore({ sheetId: 'sheet-1', fetchImpl, now: () => NOW, outbox })
  signInAs(store)
  return { store, sheets, drive, outbox, network, log }
}

const signInAs = (store: AppStore, token = 'test-token') =>
  store.dispatch(signIn.fulfilled({ accessToken: token, expiresAt: NOW.getTime() + 3_600_000, email: 'me@example.com' }, 'req', undefined))

/** A Sheet with two books already in it, and the app loaded with them. */
async function loadedRig(options: Parameters<typeof newRig>[0] = {}) {
  const sheets = options.sheets ?? new FakeSheets()
  if (sheets.tabs.Books.length === 1) {
    sheets.tabs.Books.push(bookRow({ id: 'B-0001', title: 'Dune', author: 'Herbert', photo: undefined }), bookRow({ id: 'B-0002', title: 'Emma', author: 'Austen' }))
  }
  rig = newRig({ ...options, sheets })
  await rig.store.dispatch(loadAll())
  return rig
}

const state = () => rig.store.getState()
const entries = () => state().outbox.entries
const loans = () => loansSelectors.selectAll(state())
const bookTitle = (id: string) => booksSelectors.selectById(state(), id)?.title
const sheetLoans = () => rig.sheets.tabs.Borrowers.slice(1)
const drivePosts = () => rig.log.filter((l) => l.startsWith('drive POST /upload'))

beforeEach(() => {
  rig = newRig()
})

describe('queueing a write that cannot be sent', () => {
  it('borrow while offline: keeps the loan on screen, queues it, and says so', async () => {
    await loadedRig()
    rig.network.offline = true
    const loan = await rig.store.dispatch(borrowBook({ bookId: 'B-0001', borrowerName: 'Ravi', place: 'Office' })).unwrap()

    expect(loan.borrowerName).toBe('Ravi')
    expect(selectOpenLoanByBookId(state()).get('B-0001')?.borrowerName).toBe('Ravi')
    expect(entries()).toHaveLength(1)
    expect(entries()[0]).toMatchObject({ status: 'pending', attempts: 0, summary: 'Lend “Dune” to Ravi', op: { kind: 'borrow' } })
    expect(state().notices.items.join(' ')).toMatch(/sync/i)
    expect(rig.sheets.tabs.Borrowers).toHaveLength(1)
    expect(rig.outbox.records.size).toBe(1)
  })

  it('return while offline: keeps the return on screen and queues it', async () => {
    const sheets = new FakeSheets()
    sheets.tabs.Books.push(bookRow({ id: 'B-0001', title: 'Dune', author: 'Herbert' }))
    sheets.tabs.Borrowers.push(loanRow({ bookId: 'B-0001', borrower: 'Ravi' }))
    await loadedRig({ sheets })
    rig.network.offline = true
    await rig.store.dispatch(returnBook({ bookId: 'B-0001' })).unwrap()

    expect(selectOpenLoanByBookId(state()).size).toBe(0)
    expect(entries()[0]).toMatchObject({ summary: 'Mark “Dune” as returned', op: { kind: 'return', returnedDate: '2026-09-18', returnedTime: '14:05' } })
    expect(sheets.tabs.Borrowers[1][5]).toBe('No')
  })

  it('edit while offline: keeps the new values on screen and queues the patch', async () => {
    await loadedRig()
    rig.network.offline = true
    await rig.store.dispatch(editBook({ id: 'B-0001', patch: { title: 'Dune Messiah', marketPrice: 999 } })).unwrap()

    expect(bookTitle('B-0001')).toBe('Dune Messiah')
    expect(entries()[0]).toMatchObject({ summary: 'Edit “Dune Messiah” (title, market price)', op: { kind: 'editBook', patch: { title: 'Dune Messiah', marketPrice: 999 } } })
    expect(rig.sheets.tabs.Books[1][1]).toBe('Dune')
  })

  it('editing categories and language while offline: shown at once, queued as plain data, described, sent on Sync, survives a reload', async () => {
    await loadedRig()
    rig.network.offline = true
    await rig.store.dispatch(editBook({ id: 'B-0001', patch: { categories: ['Business', 'Self-help'], language: 'Hindi' } })).unwrap()

    const book = () => booksSelectors.selectById(state(), 'B-0001')
    expect(book()).toMatchObject({ categories: ['Business', 'Self-help'], language: 'Hindi' })
    expect(entries()[0].summary).toBe('Edit “Dune” (categories, language)')
    expect(rig.sheets.tabs.Books[1][8]).toBe('')

    // a refresh while still waiting must not hide the pending change
    rig.network.offline = false
    await rig.store.dispatch(loadAll())
    expect(book()?.categories).toEqual(['Business', 'Self-help'])

    await rig.store.dispatch(flushOutbox())
    expect(rig.sheets.tabs.Books[1][8]).toBe('Business, Self-help')
    expect(rig.sheets.tabs.Books[1][9]).toBe('Hindi')
    expect(entries()).toHaveLength(0)
  })

  it('adding a book with categories while offline sends them with the row on Sync', async () => {
    await loadedRig()
    rig.network.offline = true
    await rig.store.dispatch(addBook({ title: 'Godan', author: 'Premchand', categories: ['Fiction'], language: 'Hindi' })).unwrap()
    rig.network.offline = false
    await rig.store.dispatch(flushOutbox())
    expect(rig.sheets.tabs.Books[3].slice(1, 3)).toEqual(['Godan', 'Premchand'])
    expect(rig.sheets.tabs.Books[3][8]).toBe('Fiction')
    expect(rig.sheets.tabs.Books[3][9]).toBe('Hindi')
  })

  it('edit with a new photo while offline: the photo bytes are stored with the entry', async () => {
    await loadedRig()
    rig.network.offline = true
    await rig.store.dispatch(editBook({ id: 'B-0001', patch: {}, photo: ONE_BYTE(7) })).unwrap()
    const [record] = await rig.outbox.list()
    expect(record.op).toMatchObject({ kind: 'editBook', hasPhoto: true })
    expect([...new Uint8Array(record.photo?.full.bytes ?? new ArrayBuffer(0))]).toEqual([7, 7])
    expect(entries()[0].summary).toContain('cover photo')
  })

  it('add while offline: resolves as queued, with no Book ID, and does not appear among the books', async () => {
    await loadedRig()
    rig.network.offline = true
    const saved = await rig.store.dispatch(addBook({ title: 'Neuromancer', author: 'Gibson', pricePaid: 300 })).unwrap()

    expect(saved).toMatchObject({ queued: true, id: '', title: 'Neuromancer' })
    expect(booksSelectors.selectTotal(state())).toBe(2)
    expect(entries()[0]).toMatchObject({ summary: 'Add “Neuromancer” by Gibson', op: { kind: 'addBook', input: { title: 'Neuromancer', author: 'Gibson', pricePaid: 300 }, addedAt: NOW.toISOString(), hasPhoto: false } })
  })

  it('add with a photo when the upload succeeded but the Sheet was unreachable: remembers the uploaded file', async () => {
    await loadedRig()
    rig.network.sheetsOffline = true
    // The Sheet read that picks the Book ID fails first, so nothing is uploaded yet: queued with the photo bytes
    const saved = await rig.store.dispatch(addBook({ title: 'Neuromancer', author: 'Gibson', photo: ONE_BYTE(5) })).unwrap()
    expect(saved.queued).toBe(true)
    const [record] = await rig.outbox.list()
    expect(record.photo).toBeDefined()
    expect(record.op).toMatchObject({ hasPhoto: true })
    expect((record.op as { uploadedFileId?: string }).uploadedFileId).toBeUndefined()
  })

  it('queues when the session has expired, and shows the reconnect banner state', async () => {
    await loadedRig()
    rig.sheets.token = 'a-different-token' // Google now rejects the token
    await rig.store.dispatch(borrowBook({ bookId: 'B-0001', borrowerName: 'Ravi', place: '' })).unwrap()
    expect(state().session.status).toBe('expired')
    expect(entries()).toHaveLength(1)
    expect(selectPendingCount(state())).toBe(1)
  })

  it.each([
    ['a server error (500)', () => (rig.sheets.failNextMethod = { method: 'POST', status: 500 })],
    ['a permission error (403)', () => (rig.sheets.failNextMethod = { method: 'POST', status: 403 })],
  ])('does not queue %s: it rolls back and reports it', async (_label, arm) => {
    await loadedRig()
    arm()
    await expect(rig.store.dispatch(borrowBook({ bookId: 'B-0001', borrowerName: 'Ravi', place: '' })).unwrap()).rejects.toBeTruthy()
    expect(entries()).toHaveLength(0)
    expect(loans()).toHaveLength(0)
  })

  it('does not queue input that is invalid', async () => {
    await loadedRig()
    rig.network.offline = true
    await expect(rig.store.dispatch(borrowBook({ bookId: 'B-0001', borrowerName: '  ', place: '' })).unwrap()).rejects.toMatchObject({ name: 'ValidationError' })
    await expect(rig.store.dispatch(addBook({ title: '', author: 'x' })).unwrap()).rejects.toMatchObject({ name: 'ValidationError' })
    expect(entries()).toHaveLength(0)
  })

  it('when nothing can be stored, reports the original error and undoes the change instead of losing it silently', async () => {
    await loadedRig({ outbox: new UnavailableOutbox() as unknown as MemoryOutbox })
    rig.network.offline = true
    await expect(rig.store.dispatch(borrowBook({ bookId: 'B-0001', borrowerName: 'Ravi', place: '' })).unwrap()).rejects.toMatchObject({ code: 'NETWORK' })
    await expect(rig.store.dispatch(editBook({ id: 'B-0001', patch: { title: 'X' } })).unwrap()).rejects.toMatchObject({ code: 'NETWORK' })
    expect(loans()).toHaveLength(0)
    expect(bookTitle('B-0001')).toBe('Dune')
    expect(entries()).toHaveLength(0)
    expect(state().notices.items).toEqual([])
  })

  it('never stores the access token in the outbox', async () => {
    await loadedRig()
    rig.network.offline = true
    await rig.store.dispatch(borrowBook({ bookId: 'B-0001', borrowerName: 'Ravi', place: '' })).unwrap()
    await rig.store.dispatch(addBook({ title: 'X', author: 'Y', photo: ONE_BYTE(1) })).unwrap()
    const stored = JSON.stringify(await rig.outbox.list())
    expect(stored).not.toContain('test-token')
    expect(JSON.stringify(state().outbox)).not.toContain('test-token')
  })
})

describe('sending the queue', () => {
  it('sends borrow then return of the same book in order, and removes them once sent', async () => {
    await loadedRig()
    rig.network.offline = true
    await rig.store.dispatch(borrowBook({ bookId: 'B-0001', borrowerName: 'Ravi', place: 'Office', borrowedDate: '2026-09-18', borrowedTime: '09:00' })).unwrap()
    await rig.store.dispatch(returnBook({ bookId: 'B-0001', returnedDate: '2026-09-18', returnedTime: '13:00' })).unwrap()
    expect(entries().map((e) => e.op.kind)).toEqual(['borrow', 'return'])

    rig.network.offline = false
    const result = await rig.store.dispatch(flushOutbox()).unwrap()

    expect(result).toEqual({ sent: 2, failed: 0, stopped: false })
    expect(sheetLoans()).toHaveLength(1)
    expect(sheetLoans()[0].slice(0, 8)).toEqual(['B-0001', 'Ravi', '2026-09-18', '09:00', 'Office', 'Yes', '2026-09-18', '13:00'])
    expect(entries()).toHaveLength(0)
    expect(rig.outbox.records.size).toBe(0)
  })

  it('sends an offline-added book with its photo: cover uploaded once, row linked to it, cache filled', async () => {
    await loadedRig()
    rig.network.offline = true
    await rig.store.dispatch(addBook({ title: 'Neuromancer', author: 'Gibson', photo: ONE_BYTE(9) })).unwrap()
    rig.network.offline = false
    await rig.store.dispatch(flushOutbox()).unwrap()

    expect(rig.sheets.tabs.Books).toHaveLength(4)
    const row = rig.sheets.tabs.Books[3]
    expect(row.slice(0, 3)).toEqual(['B-0003', 'Neuromancer', 'Gibson'])
    const fileId = getDriveFileIdFromUrl(row[6]) ?? ''
    expect(rig.drive.files.get(fileId)?.name).toBe('B-0003.jpg')
    expect([...(rig.drive.files.get(fileId)?.bytes ?? [])]).toEqual([9, 9])
    expect(drivePosts()).toHaveLength(1)
    expect(booksSelectors.selectById(state(), 'B-0003')?.title).toBe('Neuromancer')
    expect(entries()).toHaveLength(0)
    expect([...new Uint8Array((await getCoverFromCache(fileId, 'thumb'))?.size ? await (await getCoverFromCache(fileId, 'thumb'))!.arrayBuffer() : new ArrayBuffer(0))]).toEqual([9])
  })

  it('sends an edit with a new photo: new cover uploaded once, cell updated, old cover renamed (never deleted)', async () => {
    const old = new FakeDrive()
    const oldFile = old.seed({ name: 'B-0001.jpg', mimeType: 'image/jpeg', bytes: new Uint8Array([1, 2, 3]) })
    const sheets = new FakeSheets()
    sheets.tabs.Books.push(bookRow({ id: 'B-0001', title: 'Dune', author: 'Herbert', photo: createDriveFileUrl(oldFile.id) }), bookRow({ id: 'B-0002', title: 'Emma', author: 'Austen' }))
    await loadedRig({ sheets, drive: old })
    rig.network.offline = true
    await rig.store.dispatch(editBook({ id: 'B-0001', patch: { title: 'Dune 2' }, photo: ONE_BYTE(4) })).unwrap()
    rig.network.offline = false
    await rig.store.dispatch(flushOutbox()).unwrap()

    const newId = getDriveFileIdFromUrl(sheets.tabs.Books[1][6]) ?? ''
    expect(newId).not.toBe(oldFile.id)
    expect(sheets.tabs.Books[1][1]).toBe('Dune 2')
    expect([...(old.files.get(newId)?.bytes ?? [])]).toEqual([4, 4])
    expect(old.files.get(oldFile.id)?.name).toBe('deleted-file-B-0001.jpg')
    expect(old.files.get(oldFile.id)?.trashed).toBe(false)
    expect(drivePosts()).toHaveLength(1)
    expect(old.calls.map((c) => c.method)).not.toContain('DELETE')
  })

  it('stops at the first retryable failure and leaves that entry and everything after it queued', async () => {
    await loadedRig()
    rig.network.offline = true
    await rig.store.dispatch(borrowBook({ bookId: 'B-0001', borrowerName: 'Ravi', place: '' })).unwrap()
    await rig.store.dispatch(borrowBook({ bookId: 'B-0002', borrowerName: 'Asha', place: '' })).unwrap()
    await rig.store.dispatch(editBook({ id: 'B-0002', patch: { title: 'Emma 2' } })).unwrap()
    rig.network.offline = false

    // The first entry goes through; then the connection drops again
    let sheetWrites = 0
    const original = rig.sheets.fetch
    rig.sheets.fetch = (async (input, init) => {
      if (init?.method === 'POST' && ++sheetWrites === 2) throw new TypeError('Failed to fetch')
      return original(input, init)
    }) as typeof fetch
    const first = await rig.store.dispatch(flushOutbox()).unwrap()

    expect(first).toEqual({ sent: 1, failed: 0, stopped: true })
    expect(sheetLoans().map((r) => r[1])).toEqual(['Ravi'])
    expect(entries().map((e) => [e.op.kind, e.attempts])).toEqual([['borrow', 1], ['editBook', 0]])
    expect(selectPendingCount(state())).toBe(2)

    rig.sheets.fetch = original
    const second = await rig.store.dispatch(flushOutbox()).unwrap()
    expect(second).toEqual({ sent: 2, failed: 0, stopped: false })
    expect(sheetLoans().map((r) => r[1])).toEqual(['Ravi', 'Asha'])
    expect(rig.sheets.tabs.Books[2][1]).toBe('Emma 2')
    expect(entries()).toHaveLength(0)
  })

  it('a permanent conflict marks only that entry failed, with the reason, and the rest are still sent', async () => {
    await loadedRig()
    rig.network.offline = true
    await rig.store.dispatch(borrowBook({ bookId: 'B-0001', borrowerName: 'Ravi', place: '' })).unwrap()
    await rig.store.dispatch(editBook({ id: 'B-0002', patch: { title: 'Emma 2' } })).unwrap()
    rig.network.offline = false
    rig.sheets.tabs.Borrowers.push(loanRow({ bookId: 'B-0001', borrower: 'Asha', date: '2026-09-15' })) // someone else took it meanwhile

    const result = await rig.store.dispatch(flushOutbox()).unwrap()

    expect(result).toEqual({ sent: 1, failed: 1, stopped: false })
    expect(sheetLoans()).toHaveLength(1) // Ravi's borrow was NOT added on top of Asha's
    expect(rig.sheets.tabs.Books[2][1]).toBe('Emma 2')
    expect(entries()).toHaveLength(1)
    expect(entries()[0]).toMatchObject({ status: 'failed', attempts: 1 })
    expect(entries()[0].error).toContain('already borrowed by Asha')
    expect(selectFailedCount(state())).toBe(1)
    expect(selectPendingCount(state())).toBe(0)
  })

  it('an expired token stops the flush, raises the banner state, and a later sign-in lets it finish', async () => {
    await loadedRig()
    rig.network.offline = true
    await rig.store.dispatch(borrowBook({ bookId: 'B-0001', borrowerName: 'Ravi', place: '' })).unwrap()
    rig.network.offline = false
    rig.sheets.token = 'a-different-token'

    const stopped = await rig.store.dispatch(flushOutbox()).unwrap()
    expect(stopped.stopped).toBe(true)
    expect(state().session.status).toBe('expired')
    expect(entries()).toHaveLength(1)

    rig.sheets.token = 'fresh-token'
    signInAs(rig.store, 'fresh-token')
    const done = await rig.store.dispatch(flushOutbox()).unwrap()
    expect(done.sent).toBe(1)
    expect(sheetLoans()).toHaveLength(1)
  })

  it('two flushes at once send each entry once', async () => {
    await loadedRig()
    rig.network.offline = true
    await rig.store.dispatch(borrowBook({ bookId: 'B-0001', borrowerName: 'Ravi', place: '' })).unwrap()
    rig.network.offline = false
    await Promise.all([rig.store.dispatch(flushOutbox()), rig.store.dispatch(flushOutbox())])
    expect(sheetLoans()).toHaveLength(1)
    expect(entries()).toHaveLength(0)
  })

  it('never issues a DELETE and never trashes anything', async () => {
    await loadedRig()
    rig.network.offline = true
    await rig.store.dispatch(editBook({ id: 'B-0001', patch: {}, photo: ONE_BYTE(2) })).unwrap()
    await rig.store.dispatch(borrowBook({ bookId: 'B-0002', borrowerName: 'Asha', place: '' })).unwrap()
    rig.network.offline = false
    await rig.store.dispatch(flushOutbox()).unwrap()
    expect(rig.log.filter((l) => / DELETE /.test(l))).toEqual([])
    expect([...rig.drive.files.values()].some((f) => f.trashed)).toBe(false)
  })
})

describe('a retry never writes twice (the response was lost)', () => {
  it('borrow: Google recorded it, the app did not hear back; the retry finds it instead of adding another', async () => {
    await loadedRig()
    rig.network.loseNextSheetsWriteResponse = true
    await rig.store.dispatch(borrowBook({ bookId: 'B-0001', borrowerName: 'Ravi', place: 'Office' })).unwrap()
    expect(sheetLoans()).toHaveLength(1) // it did reach the Sheet
    expect(entries()).toHaveLength(1) // ...but the app queued it because the response was lost

    await rig.store.dispatch(flushOutbox()).unwrap()
    expect(sheetLoans()).toHaveLength(1)
    expect(entries()).toHaveLength(0)
  })

  it('add: the retry finds the row by its Added-at timestamp instead of appending a duplicate', async () => {
    await loadedRig()
    rig.network.loseNextSheetsWriteResponse = true
    await rig.store.dispatch(addBook({ title: 'Neuromancer', author: 'Gibson' })).unwrap()
    expect(rig.sheets.tabs.Books).toHaveLength(4) // written
    expect(entries()).toHaveLength(1)

    await rig.store.dispatch(flushOutbox()).unwrap()
    expect(rig.sheets.tabs.Books).toHaveLength(4)
    expect(entries()).toHaveLength(0)
    expect(booksSelectors.selectById(state(), 'B-0003')?.title).toBe('Neuromancer')
  })

  it('add with a photo: no second cover is uploaded and no second row is appended', async () => {
    await loadedRig()
    rig.network.loseNextSheetsWriteResponse = true
    await rig.store.dispatch(addBook({ title: 'Neuromancer', author: 'Gibson', photo: ONE_BYTE(6) })).unwrap()
    expect(drivePosts()).toHaveLength(1) // uploaded once before the row was written
    const [queued] = await rig.outbox.list()
    expect((queued.op as { uploadedFileId?: string }).uploadedFileId).toBeDefined() // remembered for the retry

    await rig.store.dispatch(flushOutbox()).unwrap()
    expect(drivePosts()).toHaveLength(1)
    expect(rig.sheets.tabs.Books).toHaveLength(4)
    expect([...rig.drive.files.values()].filter((f) => f.bytes)).toHaveLength(1)
  })

  it('return: Google applied it, the app did not hear back; the retry succeeds quietly', async () => {
    const sheets = new FakeSheets()
    sheets.tabs.Books.push(bookRow({ id: 'B-0001', title: 'Dune', author: 'Herbert' }))
    sheets.tabs.Borrowers.push(loanRow({ bookId: 'B-0001', borrower: 'Ravi' }))
    await loadedRig({ sheets })
    rig.network.loseNextSheetsWriteResponse = true
    await rig.store.dispatch(returnBook({ bookId: 'B-0001' })).unwrap()
    expect(sheets.tabs.Borrowers[1][5]).toBe('Yes')

    const result = await rig.store.dispatch(flushOutbox()).unwrap()
    expect(result).toEqual({ sent: 1, failed: 0, stopped: false }) // not reported as "not borrowed"
    expect(entries()).toHaveLength(0)
  })

  it('but a return that finds the book returned at a different time is a conflict, not a duplicate', async () => {
    const sheets = new FakeSheets()
    sheets.tabs.Books.push(bookRow({ id: 'B-0001', title: 'Dune', author: 'Herbert' }))
    sheets.tabs.Borrowers.push(loanRow({ bookId: 'B-0001', borrower: 'Ravi' }))
    await loadedRig({ sheets })
    rig.network.offline = true
    await rig.store.dispatch(returnBook({ bookId: 'B-0001', returnedDate: '2026-09-18', returnedTime: '14:00' })).unwrap()
    rig.network.offline = false
    sheets.tabs.Borrowers[1][5] = 'Yes'
    sheets.tabs.Borrowers[1][6] = '2026-09-10' // returned by someone else earlier
    sheets.tabs.Borrowers[1][7] = '09:00'

    const result = await rig.store.dispatch(flushOutbox()).unwrap()
    expect(result.failed).toBe(1)
    expect(entries()[0].error).toMatch(/not currently borrowed/)
  })
})

describe('sync, startup, refresh', () => {
  it('syncAll sends the queue, then reloads from the Sheet', async () => {
    await loadedRig()
    rig.network.offline = true
    await rig.store.dispatch(borrowBook({ bookId: 'B-0001', borrowerName: 'Ravi', place: '' })).unwrap()
    rig.network.offline = false
    rig.sheets.tabs.Books.push(bookRow({ id: 'B-0009', title: 'Added by hand', author: 'Me' }))

    await rig.store.dispatch(syncAll())
    expect(sheetLoans()).toHaveLength(1)
    expect(bookTitle('B-0009')).toBe('Added by hand') // reloaded
    expect(entries()).toHaveLength(0)
    expect(loans().map((l) => l.key)).toEqual(['B-0001|2']) // the temporary loan was replaced by the real row
  })

  it('syncAll skips the reload when the session is expired (the reload would fail anyway)', async () => {
    await loadedRig()
    rig.network.offline = true
    await rig.store.dispatch(borrowBook({ bookId: 'B-0001', borrowerName: 'Ravi', place: '' })).unwrap()
    rig.network.offline = false
    rig.sheets.token = 'a-different-token'
    await rig.store.dispatch(syncAll())
    expect(state().session.status).toBe('expired')
    // A reload would have failed with the expired token and turned the library into an error state
    expect(state().library).toMatchObject({ status: 'ready', error: null })
    expect(entries()).toHaveLength(1)
  })

  it('a refresh keeps queued changes on screen instead of wiping them', async () => {
    await loadedRig()
    rig.network.offline = true
    await rig.store.dispatch(borrowBook({ bookId: 'B-0001', borrowerName: 'Ravi', place: '' })).unwrap()
    await rig.store.dispatch(editBook({ id: 'B-0002', patch: { title: 'Emma 2' } })).unwrap()
    rig.network.offline = false

    await rig.store.dispatch(loadAll())
    expect(selectOpenLoanByBookId(state()).get('B-0001')?.borrowerName).toBe('Ravi')
    expect(bookTitle('B-0002')).toBe('Emma 2')
    expect(entries()).toHaveLength(2)
  })

  it('startSync after a restart: reads the stored queue, sends it, and reloads', async () => {
    await loadedRig()
    rig.network.offline = true
    await rig.store.dispatch(borrowBook({ bookId: 'B-0001', borrowerName: 'Ravi', place: '' })).unwrap()
    const { sheets, drive, outbox } = rig

    // "Reload the page": a brand-new store over the same persisted outbox
    rig = newRig({ sheets, drive, outbox })
    expect(entries()).toHaveLength(0)
    await rig.store.dispatch(startSync())

    expect(sheetLoans()).toHaveLength(1)
    expect(sheets.tabs.Borrowers[1][1]).toBe('Ravi')
    expect(entries()).toHaveLength(0)
    expect(state().outbox.loaded).toBe(true)
    expect(selectOpenLoanByBookId(state()).get('B-0001')?.borrowerName).toBe('Ravi')
  })

  it('startSync with an empty queue just loads the library', async () => {
    const sheets = new FakeSheets()
    sheets.tabs.Books.push(bookRow({ id: 'B-0001', title: 'Dune', author: 'Herbert' }))
    rig = newRig({ sheets })
    await rig.store.dispatch(startSync())
    expect(booksSelectors.selectTotal(state())).toBe(1)
    expect(rig.log.filter((l) => l.includes('POST'))).toHaveLength(0)
  })

  it('startSync shows the stored queue on screen even when it cannot send it yet (still offline)', async () => {
    await loadedRig()
    rig.network.offline = true
    await rig.store.dispatch(editBook({ id: 'B-0001', patch: { title: 'Dune 2' } })).unwrap()
    const { sheets, drive, outbox } = rig

    rig = newRig({ sheets, drive, outbox })
    rig.network.offline = true
    await rig.store.dispatch(startSync())
    expect(entries()).toHaveLength(1)
    expect(entries()[0].attempts).toBe(1)
    expect(booksSelectors.selectTotal(state())).toBe(0) // nothing to show the books from while offline, but the entry is listed
  })

  it('loadOutbox notes when this browser cannot keep a queue', async () => {
    rig = newRig({ outbox: new UnavailableOutbox() as unknown as MemoryOutbox })
    await rig.store.dispatch(loadOutbox())
    expect(state().outbox).toMatchObject({ loaded: true, available: false, entries: [] })
  })
})

describe('managing queued changes', () => {
  it('discarding a queued change removes it locally, sends nothing, and the screen returns to what the Sheet says', async () => {
    await loadedRig()
    rig.network.offline = true
    await rig.store.dispatch(borrowBook({ bookId: 'B-0001', borrowerName: 'Ravi', place: '' })).unwrap()
    rig.network.offline = false
    const [entry] = entries()
    rig.log.length = 0

    await rig.store.dispatch(discardEntry(entry.seq))
    expect(entries()).toHaveLength(0)
    expect(rig.outbox.records.size).toBe(0)
    expect(loans()).toHaveLength(0)
    expect(sheetLoans()).toHaveLength(0)
    expect(rig.log.filter((l) => l.includes('POST') || l.includes('DELETE'))).toEqual([])
  })

  it('retrying a failed entry puts it back in the queue and sends it', async () => {
    await loadedRig()
    rig.network.offline = true
    await rig.store.dispatch(borrowBook({ bookId: 'B-0001', borrowerName: 'Ravi', place: '' })).unwrap()
    rig.network.offline = false
    rig.sheets.tabs.Borrowers.push(loanRow({ bookId: 'B-0001', borrower: 'Asha', date: '2026-09-15' }))
    await rig.store.dispatch(flushOutbox()).unwrap()
    expect(entries()[0].status).toBe('failed')

    rig.sheets.tabs.Borrowers[1][5] = 'Yes' // Asha brought it back
    rig.sheets.tabs.Borrowers[1][6] = '2026-09-16'
    rig.sheets.tabs.Borrowers[1][7] = '10:00'
    await rig.store.dispatch(retryEntry(entries()[0].seq))

    expect(entries()).toHaveLength(0)
    expect(sheetLoans().map((r) => r[1])).toEqual(['Asha', 'Ravi'])
  })
})
