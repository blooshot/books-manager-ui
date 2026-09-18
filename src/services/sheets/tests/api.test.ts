import { beforeEach, describe, expect, it } from 'vitest'
import {
  AlreadyBorrowedError,
  BookNotFoundError,
  NotBorrowedError,
  SessionExpiredError,
  SheetsError,
  SheetsPermissionError,
  ValidationError,
} from '@/services/sheets/errors'
import { isRetryableFailure } from '@/services/google/errors'
import { appendBook, appendLoan, readAll, returnLoan, updateBook } from '@/services/sheets/api'
import { createSheetsClient } from '@/services/sheets/client'
import { BOOK_HEADER, FakeSheets } from '@/test/fakeSheets'

const NOW = new Date(2026, 8, 18, 14, 5) // 2026-09-18 14:05 local

let sheets: FakeSheets
const client = () =>
  createSheetsClient({ sheetId: 'sheet-1', getAccessToken: () => sheets.token, fetchImpl: sheets.fetch })

beforeEach(() => {
  sheets = new FakeSheets()
})

const writes = () => sheets.calls.filter((c) => c.method !== 'GET')

describe('readAll', () => {
  it('reads all four tabs in one request', async () => {
    sheets.tabs.Books.push(['B-0001', 'Dune', 'Herbert'])
    sheets.tabs.Borrowers.push(['B-0001', 'Ravi', '2026-02-01', '10:30', 'Office', 'No'])
    const data = await readAll(client())
    expect(data.books.map((b) => b.id)).toEqual(['B-0001'])
    expect(data.loans[0].borrowerName).toBe('Ravi')
    expect(sheets.calls).toHaveLength(1)
    expect(sheets.calls[0].url).toContain('valueRenderOption=FORMATTED_VALUE')
    expect(sheets.calls[0].url.match(/ranges=/g)).toHaveLength(4)
    expect(data.setup).toEqual({})
  })
})

describe('appendBook', () => {
  it('assigns sequential IDs from a fresh read and stamps Added at', async () => {
    const first = await appendBook(client(), { title: ' Dune ', author: 'Herbert', pricePaid: 500 }, NOW)
    const second = await appendBook(client(), { title: 'Emma', author: 'Austen' }, NOW)
    expect(first.id).toBe('B-0001')
    expect(second.id).toBe('B-0002')
    expect(first.title).toBe('Dune')
    expect(sheets.tabs.Books[1]).toEqual(['B-0001', 'Dune', 'Herbert', '', 500, '', '', NOW.toISOString(), '', ''].map(String))
  })

  it('continues after the highest existing ID, including hand-added rows', async () => {
    sheets.tabs.Books.push(['B-0041', 'Old', 'Author'])
    expect((await appendBook(client(), { title: 'New', author: 'A' })).id).toBe('B-0042')
  })

  it('writes into the right columns when the owner reordered them, leaving unknown columns empty', async () => {
    sheets.tabs.Books = [['Notes', ...BOOK_HEADER.slice().reverse()]]
    await appendBook(client(), { title: 'Dune', author: 'Herbert' }, NOW)
    const header = sheets.tabs.Books[0]
    const row = sheets.tabs.Books[1]
    expect(row[header.indexOf('Book ID')]).toBe('B-0001')
    expect(row[header.indexOf('Title')]).toBe('Dune')
    expect(row[header.indexOf('Notes')]).toBe('')
  })

  it('stores text that looks like a formula as plain text and reads it back unchanged', async () => {
    await appendBook(client(), { title: '=SUM(1,2)', author: '@someone' })
    expect(sheets.tabs.Books[1][1]).toBe('=SUM(1,2)') // stored as text (apostrophe consumed by Sheets)
    expect(sheets.calls.at(-1)?.body).toMatchObject({ values: [expect.arrayContaining(["'=SUM(1,2)", "'@someone"])] })
    const { books } = await readAll(client())
    expect(books[0].title).toBe('=SUM(1,2)')
  })

  it('rejects a missing title or author without writing', async () => {
    await expect(appendBook(client(), { title: '  ', author: 'A' })).rejects.toBeInstanceOf(ValidationError)
    await expect(appendBook(client(), { title: 'T', author: '' })).rejects.toBeInstanceOf(ValidationError)
    expect(writes()).toHaveLength(0)
  })
})

describe('Added at round trip', () => {
  it('reads back exactly what was written, even though Sheets parses ISO datetimes typed into a cell', async () => {
    const book = await appendBook(client(), { title: 'Dune', author: 'Herbert' }, NOW)
    const { books } = await readAll(client())
    expect(books[0].addedAt).toBe(NOW.toISOString())
    expect(books[0].addedAt).toBe(book.addedAt)
  })

  it('an idempotent retry of the same add finds the row it already wrote instead of appending a second', async () => {
    const first = await appendBook(client(), { title: 'Dune', author: 'Herbert' }, NOW)
    const again = await appendBook(client(), { title: 'Dune', author: 'Herbert' }, NOW, undefined, { idempotent: true })
    expect(again.id).toBe(first.id)
    expect(sheets.tabs.Books).toHaveLength(2)
  })

  it('without idempotency the same call does append another book (so the option is what prevents duplicates)', async () => {
    await appendBook(client(), { title: 'Dune', author: 'Herbert' }, NOW)
    await appendBook(client(), { title: 'Dune', author: 'Herbert' }, NOW)
    expect(sheets.tabs.Books).toHaveLength(3)
  })
})

describe('updateBook', () => {
  beforeEach(async () => {
    await appendBook(client(), { title: 'Dune', author: 'Herbert', marketPrice: 900 }, NOW)
    await appendBook(client(), { title: 'Emma', author: 'Austen' }, NOW)
    sheets.calls = []
  })

  it('writes only the changed cells', async () => {
    const book = await updateBook(client(), 'B-0002', { marketPrice: 350 })
    expect(book).toMatchObject({ id: 'B-0002', title: 'Emma', marketPrice: 350 })
    expect(writes()).toHaveLength(1)
    expect(writes()[0].body).toMatchObject({ data: [{ range: 'Books!F3', values: [[350]] }] })
  })

  it('never touches Book ID or Added at, and preserves unknown columns', async () => {
    sheets.tabs.Books[0].push('Notes')
    sheets.tabs.Books[2].push('keep me')
    await updateBook(client(), 'B-0001', { title: 'Dune Messiah', author: 'F. Herbert' })
    expect(sheets.tabs.Books[1][0]).toBe('B-0001')
    expect(sheets.tabs.Books[1][7]).toBe(NOW.toISOString())
    expect(sheets.tabs.Books[2][10]).toBe('keep me')
  })

  it('clears a cell when the patch value is null', async () => {
    const book = await updateBook(client(), 'B-0001', { marketPrice: null })
    expect(book.marketPrice).toBeUndefined()
    expect(sheets.tabs.Books[1][5]).toBe('')
  })

  it('finds the row by Book ID even if the rows were reordered since loading', async () => {
    sheets.tabs.Books = [sheets.tabs.Books[0], sheets.tabs.Books[2], sheets.tabs.Books[1]] // swap the two books
    await updateBook(client(), 'B-0001', { title: 'Changed' })
    expect(sheets.tabs.Books[2][1]).toBe('Changed') // B-0001 is now on row 3
    expect(sheets.tabs.Books[1][1]).toBe('Emma')
  })

  it('rejects unknown books and empty titles without writing', async () => {
    await expect(updateBook(client(), 'B-9999', { title: 'x' })).rejects.toBeInstanceOf(BookNotFoundError)
    await expect(updateBook(client(), 'B-0001', { title: ' ' })).rejects.toBeInstanceOf(ValidationError)
    expect(writes()).toHaveLength(0)
  })
})

describe('appendLoan / returnLoan', () => {
  beforeEach(async () => {
    await appendBook(client(), { title: 'Dune', author: 'Herbert' }, NOW)
    await appendBook(client(), { title: 'Emma', author: 'Austen' }, NOW)
    sheets.calls = []
  })

  it('records a loan defaulting to now, with Returned = No', async () => {
    const loan = await appendLoan(client(), { bookId: 'B-0001', borrowerName: 'Ravi', place: 'Office' }, NOW)
    expect(loan).toMatchObject({
      key: 'B-0001|2',
      borrowedDate: '2026-09-18',
      borrowedTime: '14:05',
      returned: false,
    })
    expect(sheets.tabs.Borrowers[1].slice(0, 6)).toEqual(['B-0001', 'Ravi', '2026-09-18', '14:05', 'Office', 'No'])
  })

  it('rejects borrowing a book that is already out, without writing', async () => {
    await appendLoan(client(), { bookId: 'B-0001', borrowerName: 'Ravi', place: '' }, NOW)
    sheets.calls = []
    await expect(appendLoan(client(), { bookId: 'B-0001', borrowerName: 'Asha', place: '' })).rejects.toBeInstanceOf(
      AlreadyBorrowedError,
    )
    expect(writes()).toHaveLength(0)
  })

  it('rejects unknown books and blank borrower names', async () => {
    await expect(appendLoan(client(), { bookId: 'B-9999', borrowerName: 'Ravi', place: '' })).rejects.toBeInstanceOf(
      BookNotFoundError,
    )
    await expect(appendLoan(client(), { bookId: 'B-0001', borrowerName: '', place: '' })).rejects.toBeInstanceOf(
      ValidationError,
    )
  })

  it('allows borrowing again after a return, and keeps history', async () => {
    await appendLoan(client(), { bookId: 'B-0001', borrowerName: 'Ravi', place: '' }, NOW)
    await returnLoan(client(), { bookId: 'B-0001' }, NOW)
    const again = await appendLoan(client(), { bookId: 'B-0001', borrowerName: 'Asha', place: '' }, NOW)
    expect(again.key).toBe('B-0001|3')
    expect((await readAll(client())).loans).toHaveLength(2)
  })

  it('returns a loan by updating Returned, date and time on the right row', async () => {
    await appendLoan(client(), { bookId: 'B-0001', borrowerName: 'Ravi', place: '' }, NOW)
    await appendLoan(client(), { bookId: 'B-0002', borrowerName: 'Asha', place: '' }, NOW)
    const returned = await returnLoan(client(), { bookId: 'B-0002' }, new Date(2026, 8, 20, 9, 0))
    expect(returned).toMatchObject({ bookId: 'B-0002', returned: true, returnedDate: '2026-09-20', returnedTime: '09:00' })
    expect(sheets.tabs.Borrowers[2].slice(5)).toEqual(['Yes', '2026-09-20', '09:00'])
    expect(sheets.tabs.Borrowers[1][5]).toBe('No') // Ravi's loan untouched
  })

  it('finds the loan row after the sheet was re-sorted since loading', async () => {
    await appendLoan(client(), { bookId: 'B-0001', borrowerName: 'Ravi', place: '' }, NOW)
    await appendLoan(client(), { bookId: 'B-0002', borrowerName: 'Asha', place: '' }, NOW)
    sheets.tabs.Borrowers = [sheets.tabs.Borrowers[0], sheets.tabs.Borrowers[2], sheets.tabs.Borrowers[1]]
    await returnLoan(client(), { bookId: 'B-0001' }, NOW)
    expect(sheets.tabs.Borrowers[2][5]).toBe('Yes') // Ravi's row moved to 3
    expect(sheets.tabs.Borrowers[1][5]).toBe('No')
  })

  it('rejects returning a book that is not borrowed', async () => {
    await expect(returnLoan(client(), { bookId: 'B-0001' })).rejects.toBeInstanceOf(NotBorrowedError)
    expect(writes()).toHaveLength(0)
  })
})

describe('a Sheet that is not set up as expected', () => {
  it('names the missing tab when there is no "Books" tab (e.g. the first tab is still called Sheet1)', async () => {
    delete sheets.tabs.Books
    const error = await readAll(client()).catch((e: unknown) => e)
    expect(error).toMatchObject({ name: 'SheetTabMissingError' })
    expect((error as Error).message).toContain('"Books"')
    expect((error as Error).message).toMatch(/Borrowers/)
  })

  it('names the missing tab when only "Borrowers" is missing', async () => {
    delete sheets.tabs.Borrowers
    const error = await readAll(client()).catch((e: unknown) => e)
    expect(error).toMatchObject({ name: 'SheetTabMissingError' })
    expect((error as Error).message).toContain('"Borrowers"')
  })

  it.each([
    ['adding a book', () => appendBook(client(), { title: 'Dune', author: 'Herbert' })],
    ['editing a book', () => updateBook(client(), 'B-0001', { title: 'x' })],
    ['borrowing', () => appendLoan(client(), { bookId: 'B-0001', borrowerName: 'Ravi', place: '' })],
    ['returning', () => returnLoan(client(), { bookId: 'B-0001' })],
  ])('reports the missing tab when %s', async (_label, action) => {
    delete sheets.tabs.Books
    delete sheets.tabs.Borrowers
    await expect(action()).rejects.toMatchObject({ name: 'SheetTabMissingError' })
  })

  it('is not retried or queued: a missing tab is a setup problem, not a network problem', async () => {
    delete sheets.tabs.Books
    const error = await readAll(client()).catch((e: unknown) => e)
    expect(isRetryableFailure(error)).toBe(false)
  })

  it('explains an uploaded Excel file (Google refuses the API for it)', async () => {
    sheets.notNativeSheet = true
    const error = await readAll(client()).catch((e: unknown) => e)
    expect((error as Error).message).toMatch(/not a Google Sheet|Excel/i)
    expect((error as Error).message).toMatch(/Save as Google Sheets/)
    expect(isRetryableFailure(error)).toBe(false)
  })

  it('still passes an unrecognised 400 through with Google’s own words', async () => {
    sheets.failNext = 400
    const error = await readAll(client()).catch((e: unknown) => e)
    expect(error).toMatchObject({ name: 'SheetsError', code: '400' })
    expect((error as Error).message).toContain('fake failure 400')
  })
})

describe('errors', () => {
  it('maps 401 to SessionExpiredError (safe to retry)', async () => {
    const stale = createSheetsClient({ sheetId: 'sheet-1', getAccessToken: () => 'expired-token', fetchImpl: sheets.fetch })
    await expect(readAll(stale)).rejects.toBeInstanceOf(SessionExpiredError)
  })

  it('maps 403 to a wrong-account error and other failures to SheetsError with the status', async () => {
    sheets.failNext = 403
    await expect(readAll(client())).rejects.toBeInstanceOf(SheetsPermissionError)
    sheets.failNext = 500
    await expect(readAll(client())).rejects.toMatchObject({ name: 'SheetsError', status: 500 })
  })

  it('reports network failures as SheetsError without a status', async () => {
    const offline = createSheetsClient({
      sheetId: 's',
      getAccessToken: () => 't',
      fetchImpl: () => Promise.reject(new TypeError('Failed to fetch')),
    })
    const error = await readAll(offline).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(SheetsError)
    expect((error as SheetsError).status).toBeUndefined()
    expect((error as SheetsError).code).toBe('NETWORK')
  })
})
