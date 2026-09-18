import { createAsyncThunk, type Dispatch } from '@reduxjs/toolkit'
import { formatDate, formatTime } from '@/lib/datetime'
import {
  appendBook,
  appendLoan,
  readAll,
  returnLoan,
  updateBook,
  type BookPatch,
  type NewBookInput,
  type NewLoanInput,
} from '@/services/sheets/api'
import { createSheetsClient } from '@/services/sheets/client'
import {
  AlreadyBorrowedError,
  BookNotFoundError,
  NotBorrowedError,
  SessionExpiredError,
  ValidationError,
} from '@/services/sheets/errors'
import { bookSet, bookUpdated, booksLoaded } from '@/store/booksSlice'
import { loanDiscarded, loanSet, loansLoaded } from '@/store/borrowersSlice'
import { booksSelectors, selectOpenLoanByBookId } from '@/store/selectors'
import { tokenExpired } from '@/store/sessionSlice'
import type { RootState } from '@/store'
import type { Book, Loan } from '@/types/library'

/** Injected into every thunk (see makeStore) so tests can swap in a fake Sheet. */
export interface ThunkExtra {
  sheetId: string
  fetchImpl?: typeof fetch
  now: () => Date
}

interface ThunkConfig {
  state: RootState
  extra: ThunkExtra
}

/**
 * A client that reads the token from the store at call time. No token, or one past
 * its expiry, fails fast with SessionExpiredError (no request is made).
 */
function clientFor(getState: () => RootState, extra: ThunkExtra) {
  return createSheetsClient({
    sheetId: extra.sheetId,
    fetchImpl: extra.fetchImpl,
    getAccessToken: () => {
      const { accessToken, expiresAt } = getState().session
      if (!accessToken || (expiresAt !== null && expiresAt <= extra.now().getTime())) {
        throw new SessionExpiredError()
      }
      return accessToken
    },
  })
}

/**
 * Sheet writes run strictly one at a time. Each write re-reads the tab and derives
 * something from it (next Book ID, which row to update), so two overlapping writes
 * (e.g. a double-clicked Add) could otherwise both pick the same ID.
 */
let writeTail: Promise<unknown> = Promise.resolve()
function inWriteQueue<T>(work: () => Promise<T>): Promise<T> {
  const result = writeTail.then(work)
  writeTail = result.catch(() => undefined)
  return result
}

/** Flips the session to 'expired' (shows the reconnect banner) when Google says 401. */
async function withSessionCheck<T>(dispatch: Dispatch, work: () => Promise<T>): Promise<T> {
  try {
    return await work()
  } catch (error) {
    if (error instanceof SessionExpiredError) dispatch(tokenExpired())
    throw error
  }
}

/** Load both tabs once and replace the store contents. */
export const loadAll = createAsyncThunk<void, void, ThunkConfig>(
  'library/loadAll',
  async (_arg, { dispatch, getState, extra }) => {
    const { books, loans } = await withSessionCheck(dispatch, () => readAll(clientFor(getState, extra)))
    dispatch(booksLoaded(books))
    dispatch(loansLoaded(loans))
  },
)

/**
 * Not optimistic: the Book ID is assigned from a fresh read at write time (ADR-0006),
 * so the book appears in the store once the Sheet confirms it.
 */
export const addBook = createAsyncThunk<Book, NewBookInput, ThunkConfig>(
  'library/addBook',
  async (input, { dispatch, getState, extra }) => {
    const book = await withSessionCheck(dispatch, () =>
      inWriteQueue(() => appendBook(clientFor(getState, extra), input, extra.now())),
    )
    dispatch(bookSet(book))
    return book
  },
)

/** Optimistic; rolls back to the previous book if the write fails. */
export const editBook = createAsyncThunk<Book, { id: string; patch: BookPatch }, ThunkConfig>(
  'library/editBook',
  async ({ id, patch }, { dispatch, getState, extra }) => {
    const previous = booksSelectors.selectById(getState(), id)
    if (!previous) throw new BookNotFoundError(id)
    if (patch.title !== undefined && patch.title.trim() === '') throw new ValidationError('Title is required.')
    if (patch.author !== undefined && patch.author.trim() === '') throw new ValidationError('Author is required.')

    const changes: Partial<Book> = {}
    for (const [field, value] of Object.entries(patch)) {
      ;(changes as Record<string, unknown>)[field] = value ?? undefined // null clears
    }
    dispatch(bookUpdated({ id, changes }))
    try {
      const saved = await withSessionCheck(dispatch, () =>
        inWriteQueue(() => updateBook(clientFor(getState, extra), id, patch)),
      )
      dispatch(bookSet(saved))
      return saved
    } catch (error) {
      dispatch(bookSet(previous))
      throw error
    }
  },
)

/** Optimistic; a book that is already out is rejected before anything changes. */
export const borrowBook = createAsyncThunk<Loan, NewLoanInput, ThunkConfig>(
  'library/borrowBook',
  async (input, { dispatch, getState, extra }) => {
    const openLoan = selectOpenLoanByBookId(getState()).get(input.bookId)
    if (openLoan) throw new AlreadyBorrowedError(input.bookId, openLoan.borrowerName)
    if (!booksSelectors.selectById(getState(), input.bookId)) throw new BookNotFoundError(input.bookId)
    if (input.borrowerName.trim() === '') throw new ValidationError('Borrower name is required.')

    const now = extra.now()
    const pending: Loan = {
      key: `pending|${input.bookId}`,
      bookId: input.bookId,
      borrowerName: input.borrowerName.trim(),
      borrowedDate: input.borrowedDate ?? formatDate(now),
      borrowedTime: input.borrowedTime ?? formatTime(now),
      place: input.place.trim(),
      returned: false,
    }
    dispatch(loanSet(pending))
    try {
      const saved = await withSessionCheck(dispatch, () =>
        inWriteQueue(() =>
          appendLoan(
            clientFor(getState, extra),
            { ...input, borrowedDate: pending.borrowedDate, borrowedTime: pending.borrowedTime },
            now,
          ),
        ),
      )
      dispatch(loanDiscarded(pending.key))
      dispatch(loanSet(saved))
      return saved
    } catch (error) {
      dispatch(loanDiscarded(pending.key))
      throw error
    }
  },
)

/** Optimistic; restores the open loan if the write fails. */
export const returnBook = createAsyncThunk<Loan, { bookId: string; returnedDate?: string; returnedTime?: string }, ThunkConfig>(
  'library/returnBook',
  async ({ bookId, returnedDate, returnedTime }, { dispatch, getState, extra }) => {
    const previous = selectOpenLoanByBookId(getState()).get(bookId)
    if (!previous) throw new NotBorrowedError(bookId)

    const now = extra.now()
    const date = returnedDate ?? formatDate(now)
    const time = returnedTime ?? formatTime(now)
    dispatch(loanSet({ ...previous, returned: true, returnedDate: date, returnedTime: time }))
    try {
      const saved = await withSessionCheck(dispatch, () =>
        inWriteQueue(() => returnLoan(clientFor(getState, extra), { bookId, returnedDate: date, returnedTime: time }, now)),
      )
      if (saved.key !== previous.key) dispatch(loanDiscarded(previous.key))
      dispatch(loanSet(saved))
      return saved
    } catch (error) {
      dispatch(loanSet(previous))
      throw error
    }
  },
)
