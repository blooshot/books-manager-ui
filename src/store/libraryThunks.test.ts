import { beforeEach, describe, expect, it } from 'vitest'
import { AlreadyBorrowedError, NotBorrowedError } from '@/services/sheets/errors'
import { makeStore, type AppStore } from '@/store'
import { booksSelectors, loansSelectors, selectOpenLoanByBookId } from '@/store/selectors'
import { addBook, borrowBook, editBook, loadAll, returnBook } from '@/store/libraryThunks'
import { signIn } from '@/store/sessionSlice'
import { FakeSheets } from '@/test/fakeSheets'

const NOW = new Date(2026, 8, 18, 14, 5)

let sheets: FakeSheets

function signedInStore(opts: { token?: string; expiresAt?: number; fetchImpl?: typeof fetch } = {}): AppStore {
  const store = makeStore({ sheetId: 'sheet-1', fetchImpl: opts.fetchImpl ?? sheets.fetch, now: () => NOW })
  store.dispatch(
    signIn.fulfilled(
      { accessToken: opts.token ?? 'test-token', expiresAt: opts.expiresAt ?? NOW.getTime() + 3_600_000, email: 'me@example.com' },
      'req',
      undefined,
    ),
  )
  return store
}

beforeEach(() => {
  sheets = new FakeSheets()
})

describe('loadAll', () => {
  it('fills the store from the Sheet and marks the library ready', async () => {
    sheets.tabs.Books.push(['B-0001', 'Dune', 'Herbert'])
    sheets.tabs.Borrowers.push(['B-0001', 'Ravi', '2026-02-01', '10:30', 'Office', 'No'])
    const store = signedInStore()
    await store.dispatch(loadAll())
    expect(booksSelectors.selectAll(store.getState()).map((b) => b.id)).toEqual(['B-0001'])
    expect(selectOpenLoanByBookId(store.getState()).has('B-0001')).toBe(true)
    expect(store.getState().library.status).toBe('ready')
  })

  it('records a schema problem as an error state', async () => {
    sheets.tabs.Books = [['Book ID', 'Title']]
    const store = signedInStore()
    await store.dispatch(loadAll())
    expect(store.getState().library.status).toBe('error')
    expect(store.getState().library.error).toContain('missing column')
  })
})

describe('addBook', () => {
  it('appends to the Sheet and then adds the book with its assigned ID', async () => {
    const store = signedInStore()
    const book = await store.dispatch(addBook({ title: 'Dune', author: 'Herbert' })).unwrap()
    expect(book.id).toBe('B-0001')
    expect(booksSelectors.selectById(store.getState(), 'B-0001')?.title).toBe('Dune')
    expect(sheets.tabs.Books).toHaveLength(2)
  })

  it('leaves the store unchanged when validation fails', async () => {
    const store = signedInStore()
    await expect(store.dispatch(addBook({ title: '', author: 'x' })).unwrap()).rejects.toMatchObject({ name: 'ValidationError' })
    expect(booksSelectors.selectTotal(store.getState())).toBe(0)
  })
})

describe('concurrent writes', () => {
  it('gives two overlapping adds different Book IDs', async () => {
    const store = signedInStore()
    const [a, b] = await Promise.all([
      store.dispatch(addBook({ title: 'One', author: 'A' })).unwrap(),
      store.dispatch(addBook({ title: 'Two', author: 'B' })).unwrap(),
    ])
    expect([a.id, b.id].sort()).toEqual(['B-0001', 'B-0002'])
    expect(sheets.tabs.Books).toHaveLength(3)
  })

  it('a failed write does not block the next one', async () => {
    const store = signedInStore()
    sheets.failNext = 500
    const failing = store.dispatch(addBook({ title: 'One', author: 'A' })).unwrap().catch((e: unknown) => e)
    const ok = store.dispatch(addBook({ title: 'Two', author: 'B' })).unwrap()
    expect(await failing).toMatchObject({ name: 'SheetsError', code: '500' })
    expect((await ok).id).toBe('B-0001')
  })
})

describe('input validation before any optimistic change', () => {
  it('rejects a blank borrower name without touching the store or the network', async () => {
    const store = signedInStore()
    await store.dispatch(addBook({ title: 'Dune', author: 'Herbert' }))
    sheets.calls = []
    await expect(store.dispatch(borrowBook({ bookId: 'B-0001', borrowerName: '  ', place: '' })).unwrap()).rejects.toMatchObject({
      name: 'ValidationError',
    })
    expect(loansSelectors.selectTotal(store.getState())).toBe(0)
    expect(sheets.calls).toHaveLength(0)
  })

  it('rejects a blank title on edit without changing the book', async () => {
    const store = signedInStore()
    await store.dispatch(addBook({ title: 'Dune', author: 'Herbert' }))
    sheets.calls = []
    await expect(store.dispatch(editBook({ id: 'B-0001', patch: { title: '' } })).unwrap()).rejects.toMatchObject({
      name: 'ValidationError',
    })
    expect(booksSelectors.selectById(store.getState(), 'B-0001')?.title).toBe('Dune')
    expect(sheets.calls).toHaveLength(0)
  })
})

describe('editBook', () => {
  async function storeWithBook() {
    const store = signedInStore()
    await store.dispatch(addBook({ title: 'Dune', author: 'Herbert' }))
    return store
  }

  it('updates the store before the write is sent, then keeps the saved value', async () => {
    // Observe the store at the moment the write request goes out
    let titleWhenWriteSent: string | undefined
    const store: AppStore = signedInStore({
      fetchImpl: (input, init) => {
        if (String(input).includes('values:batchUpdate')) {
          titleWhenWriteSent = booksSelectors.selectById(store.getState(), 'B-0001')?.title
        }
        return sheets.fetch(input, init)
      },
    })
    await store.dispatch(addBook({ title: 'Dune', author: 'Herbert' }))
    await store.dispatch(editBook({ id: 'B-0001', patch: { title: 'Dune Messiah' } })).unwrap()
    expect(titleWhenWriteSent).toBe('Dune Messiah')
    expect(booksSelectors.selectById(store.getState(), 'B-0001')?.title).toBe('Dune Messiah')
    expect(sheets.tabs.Books[1][1]).toBe('Dune Messiah')
  })

  it('rolls back to the previous book when the write fails', async () => {
    const store = await storeWithBook()
    sheets.failNext = 500
    await expect(store.dispatch(editBook({ id: 'B-0001', patch: { title: 'Nope' } })).unwrap()).rejects.toMatchObject({
      name: 'SheetsError',
    })
    expect(booksSelectors.selectById(store.getState(), 'B-0001')?.title).toBe('Dune')
    expect(sheets.tabs.Books[1][1]).toBe('Dune')
  })

  it('clears a field when the patch value is null', async () => {
    const store = signedInStore()
    await store.dispatch(addBook({ title: 'Dune', author: 'Herbert', marketPrice: 900 }))
    await store.dispatch(editBook({ id: 'B-0001', patch: { marketPrice: null } })).unwrap()
    expect(booksSelectors.selectById(store.getState(), 'B-0001')?.marketPrice).toBeUndefined()
  })
})

describe('borrowBook / returnBook', () => {
  async function storeWithBook() {
    const store = signedInStore()
    await store.dispatch(addBook({ title: 'Dune', author: 'Herbert' }))
    return store
  }

  it('borrows: the store ends up with the real loan row, not the temporary one', async () => {
    const store = await storeWithBook()
    await store.dispatch(borrowBook({ bookId: 'B-0001', borrowerName: 'Ravi', place: 'Office' })).unwrap()
    const loans = loansSelectors.selectAll(store.getState())
    expect(loans.map((l) => l.key)).toEqual(['B-0001|2'])
    expect(loans[0]).toMatchObject({ borrowerName: 'Ravi', borrowedDate: '2026-09-18', borrowedTime: '14:05' })
    expect(sheets.tabs.Borrowers[1][5]).toBe('No')
  })

  it('rejects borrowing a book that is already out, with no request and no store change', async () => {
    const store = await storeWithBook()
    await store.dispatch(borrowBook({ bookId: 'B-0001', borrowerName: 'Ravi', place: '' })).unwrap()
    sheets.calls = []
    const error = await store.dispatch(borrowBook({ bookId: 'B-0001', borrowerName: 'Asha', place: '' })).unwrap().catch((e: unknown) => e)
    expect((error as Error).name).toBe(new AlreadyBorrowedError('x', 'y').name)
    expect(sheets.calls).toHaveLength(0)
    expect(loansSelectors.selectTotal(store.getState())).toBe(1)
  })

  it('discards the temporary loan when the write fails', async () => {
    const store = await storeWithBook()
    sheets.failNext = 500
    await expect(store.dispatch(borrowBook({ bookId: 'B-0001', borrowerName: 'Ravi', place: '' })).unwrap()).rejects.toBeTruthy()
    expect(loansSelectors.selectTotal(store.getState())).toBe(0)
    expect(sheets.tabs.Borrowers).toHaveLength(1)
  })

  it('returns: the book becomes available and the Sheet row is closed', async () => {
    const store = await storeWithBook()
    await store.dispatch(borrowBook({ bookId: 'B-0001', borrowerName: 'Ravi', place: '' })).unwrap()
    await store.dispatch(returnBook({ bookId: 'B-0001' })).unwrap()
    expect(selectOpenLoanByBookId(store.getState()).size).toBe(0)
    expect(sheets.tabs.Borrowers[1].slice(5)).toEqual(['Yes', '2026-09-18', '14:05'])
    expect(loansSelectors.selectTotal(store.getState())).toBe(1) // history kept
  })

  it('restores the open loan when the return fails', async () => {
    const store = await storeWithBook()
    await store.dispatch(borrowBook({ bookId: 'B-0001', borrowerName: 'Ravi', place: '' })).unwrap()
    sheets.failNext = 500
    await expect(store.dispatch(returnBook({ bookId: 'B-0001' })).unwrap()).rejects.toBeTruthy()
    expect(selectOpenLoanByBookId(store.getState()).has('B-0001')).toBe(true)
  })

  it('rejects returning a book that is not out', async () => {
    const store = await storeWithBook()
    const error = await store.dispatch(returnBook({ bookId: 'B-0001' })).unwrap().catch((e: unknown) => e)
    expect((error as Error).name).toBe(new NotBorrowedError('x').name)
  })
})

describe('session expiry during a write', () => {
  it('on a 401, marks the session expired and rolls the change back', async () => {
    const store = signedInStore()
    await store.dispatch(addBook({ title: 'Dune', author: 'Herbert' }))
    // Google now rejects this token
    sheets.token = 'a-different-token'
    await expect(store.dispatch(editBook({ id: 'B-0001', patch: { title: 'Nope' } })).unwrap()).rejects.toMatchObject({
      name: 'SessionExpiredError',
    })
    expect(store.getState().session.status).toBe('expired')
    expect(booksSelectors.selectById(store.getState(), 'B-0001')?.title).toBe('Dune')
  })

  it('makes no request at all when the token is already past its expiry', async () => {
    const store = signedInStore({ expiresAt: NOW.getTime() - 1 })
    sheets.calls = []
    await expect(store.dispatch(addBook({ title: 'Dune', author: 'Herbert' })).unwrap()).rejects.toMatchObject({
      name: 'SessionExpiredError',
    })
    expect(sheets.calls).toHaveLength(0)
    expect(store.getState().session.status).toBe('expired')
  })
})
