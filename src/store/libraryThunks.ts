import { createAsyncThunk, type Dispatch } from '@reduxjs/toolkit'
import { formatDate, formatTime } from '@/lib/datetime'
import type { CoverVariants } from '@/lib/image'
import { createDriveClient, type DriveClient } from '@/services/drive/client'
import { saveCoverToCache } from '@/services/drive/coverCache'
import { createFolderResolver, type FolderResolver } from '@/services/drive/folder'
import { createDriveFileUrl, getDriveFileIdFromUrl } from '@/services/drive/links'
import { markReplaced, uploadCoverInFolder } from '@/services/drive/photos'
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
import { noticeAdded } from '@/store/noticesSlice'
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
 * The token is read from the store at call time. No token, or one past its expiry, fails fast
 * with SessionExpiredError (no request is made). Shared by the Sheets and Drive clients.
 */
function tokenGetter(getState: () => RootState, extra: ThunkExtra) {
  return () => {
    const { accessToken, expiresAt } = getState().session
    if (!accessToken || (expiresAt !== null && expiresAt <= extra.now().getTime())) {
      throw new SessionExpiredError()
    }
    return accessToken
  }
}

function clientFor(getState: () => RootState, extra: ThunkExtra) {
  return createSheetsClient({ sheetId: extra.sheetId, fetchImpl: extra.fetchImpl, getAccessToken: tokenGetter(getState, extra) })
}

function driveFor(getState: () => RootState, extra: ThunkExtra): DriveClient {
  return createDriveClient({ fetchImpl: extra.fetchImpl, getAccessToken: tokenGetter(getState, extra) })
}

/** One folder resolver per Google account for the life of the app (keyed by `extra`, so tests stay isolated). */
const folderResolvers = new WeakMap<ThunkExtra, Map<string, FolderResolver>>()

function folderFor(getState: () => RootState, extra: ThunkExtra, drive: DriveClient): FolderResolver {
  const account = getState().session.email ?? 'default'
  let byAccount = folderResolvers.get(extra)
  if (!byAccount) {
    byAccount = new Map()
    folderResolvers.set(extra, byAccount)
  }
  let resolver = byAccount.get(account)
  if (!resolver) {
    resolver = createFolderResolver(drive, account)
    byAccount.set(account, resolver)
  }
  return resolver
}

/** Uploads a cover for `bookId` and returns the Photo-cell link. */
async function uploadCoverLink(getState: () => RootState, extra: ThunkExtra, photo: CoverVariants, bookId: string): Promise<string> {
  const drive = driveFor(getState, extra)
  const fileId = await uploadCoverInFolder(drive, folderFor(getState, extra, drive), photo.full, bookId)
  return createDriveFileUrl(fileId)
}

/** Best-effort: puts a freshly uploaded cover in the local cache so the list never re-downloads it. */
async function cacheUploadedCover(photoUrl: string, photo: CoverVariants): Promise<void> {
  const fileId = getDriveFileIdFromUrl(photoUrl)
  if (fileId) await saveCoverToCache(fileId, photo.full, photo.thumb)
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
 * Not optimistic: the Book ID is assigned from a fresh read at write time (ADR-0006), so the book appears
 * in the store once the Sheet confirms it. With a photo, the cover is uploaded after the ID is chosen and
 * before the row is written (ADR-0007), so a row never exists without its photo. If the row write then
 * fails, the uploaded file is left in Drive as a harmless orphan.
 */
export const addBook = createAsyncThunk<Book, NewBookInput & { photo?: CoverVariants }, ThunkConfig>(
  'library/addBook',
  async ({ photo, ...input }, { dispatch, getState, extra }) => {
    const book = await withSessionCheck(dispatch, () =>
      inWriteQueue(() =>
        appendBook(
          clientFor(getState, extra),
          input,
          extra.now(),
          photo ? (bookId) => uploadCoverLink(getState, extra, photo, bookId) : undefined,
        ),
      ),
    )
    dispatch(bookSet(book))
    if (photo && book.photoUrl) await cacheUploadedCover(book.photoUrl, photo)
    return book
  },
)

/**
 * Optimistic for the text fields; rolls back to the previous book if the write fails.
 * A new `photo` is uploaded, then the Photo cell is updated, then the old cover is renamed (never deleted,
 * ADR-0004). A failed rename does not fail the edit: it is reported as a notice instead.
 */
export const editBook = createAsyncThunk<Book, { id: string; patch: BookPatch; photo?: CoverVariants }, ThunkConfig>(
  'library/editBook',
  async ({ id, patch, photo }, { dispatch, getState, extra }) => {
    const previous = booksSelectors.selectById(getState(), id)
    if (!previous) throw new BookNotFoundError(id)
    if (patch.title !== undefined && patch.title.trim() === '') throw new ValidationError('Title is required.')
    if (patch.author !== undefined && patch.author.trim() === '') throw new ValidationError('Author is required.')

    const changes: Partial<Book> = {}
    for (const [field, value] of Object.entries(patch)) {
      ;(changes as Record<string, unknown>)[field] = value ?? undefined // null clears
    }
    dispatch(bookUpdated({ id, changes }))

    let saved: Book
    try {
      saved = await withSessionCheck(dispatch, () =>
        inWriteQueue(async () => {
          const photoUrl = photo ? await uploadCoverLink(getState, extra, photo, id) : undefined
          return updateBook(clientFor(getState, extra), id, photoUrl ? { ...patch, photoUrl } : patch)
        }),
      )
    } catch (error) {
      dispatch(bookSet(previous))
      throw error
    }
    dispatch(bookSet(saved))

    if (photo && saved.photoUrl) {
      await cacheUploadedCover(saved.photoUrl, photo)
      await retireOldCover(dispatch, getState, extra, previous.photoUrl, saved.photoUrl, id)
    }
    return saved
  },
)

/** Renames the replaced cover so the owner can delete it by hand. Never deletes; never fails the edit. */
async function retireOldCover(
  dispatch: Dispatch,
  getState: () => RootState,
  extra: ThunkExtra,
  oldUrl: string | undefined,
  newUrl: string,
  bookId: string,
): Promise<void> {
  const oldId = oldUrl ? getDriveFileIdFromUrl(oldUrl) : null
  if (!oldId || oldId === getDriveFileIdFromUrl(newUrl)) return
  try {
    await markReplaced(driveFor(getState, extra), oldId, bookId)
  } catch {
    dispatch(noticeAdded(`The new cover for ${bookId} was saved, but the old cover file could not be renamed in Google Drive.`))
  }
}

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
