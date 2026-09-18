import { createAsyncThunk } from '@reduxjs/toolkit'
import { formatDate, formatTime } from '@/lib/datetime'
import type { CoverVariants } from '@/lib/image'
import { createDriveFileUrl } from '@/services/drive/links'
import { isRetryableFailure } from '@/services/google/errors'
import { describeOp, pendingLoanKey, applyPending } from '@/services/outbox/pending'
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
import { AlreadyBorrowedError, BookNotFoundError, NotBorrowedError, ValidationError } from '@/services/sheets/errors'
import { bookSet, bookUpdated, booksLoaded } from '@/store/booksSlice'
import { loanDiscarded, loanSet, loansLoaded } from '@/store/borrowersSlice'
import { noticeAdded } from '@/store/noticesSlice'
import { enqueue, SAVED_OFFLINE_NOTICE } from '@/store/outboxQueue'
import { booksSelectors, selectOpenLoanByBookId } from '@/store/selectors'
import type { RootState } from '@/store'
import type { ThunkExtra } from '@/store/thunkExtra'
import {
  cacheUploadedCover,
  clientFor,
  inWriteQueue,
  retireOldCover,
  uploadCoverFile,
  withSessionCheck,
} from '@/store/writeSupport'
import type { Book, Loan } from '@/types/library'

interface ThunkConfig {
  state: RootState
  extra: ThunkExtra
}

/** A saved book. `queued` means it could not be sent yet and is waiting in the outbox (it has no Book ID until then). */
export type SavedBook = Book & { queued?: boolean }

const titleOf = (getState: () => RootState) => (bookId: string) => booksSelectors.selectById(getState(), bookId)?.title

/**
 * Load both tabs once and replace the store contents. Changes still waiting in the outbox are shown on top of
 * the loaded data, so a refresh never makes a pending change disappear from the screen.
 */
export const loadAll = createAsyncThunk<void, void, ThunkConfig>(
  'library/loadAll',
  async (_arg, { dispatch, getState, extra }) => {
    const loaded = await withSessionCheck(dispatch, () => readAll(clientFor(getState, extra)))
    const { books, loans } = applyPending(loaded.books, loaded.loans, getState().outbox.entries)
    dispatch(booksLoaded(books))
    dispatch(loansLoaded(loans))
  },
)

/**
 * Not optimistic: the Book ID is assigned from a fresh read at write time (ADR-0006), so the book appears
 * in the store once the Sheet confirms it. With a photo, the cover is uploaded after the ID is chosen and
 * before the row is written (ADR-0007), so a row never exists without its photo.
 *
 * If the write fails for a retryable reason (expired token, no network) it is kept in the outbox and this resolves
 * with `queued: true` and no Book ID. The uploaded cover's file ID is kept too, so a retry links it instead of
 * uploading a second copy. Any other failure rejects, as before.
 */
export const addBook = createAsyncThunk<SavedBook, NewBookInput & { photo?: CoverVariants }, ThunkConfig>(
  'library/addBook',
  async ({ photo, ...input }, { dispatch, getState, extra }) => {
    const now = extra.now()
    let uploadedFileId: string | undefined
    try {
      const book = await withSessionCheck(dispatch, () =>
        inWriteQueue(() =>
          appendBook(
            clientFor(getState, extra),
            input,
            now,
            photo
              ? async (bookId) => {
                  uploadedFileId = await uploadCoverFile(getState, extra, photo.full, bookId)
                  return createDriveFileUrl(uploadedFileId)
                }
              : undefined,
          ),
        ),
      )
      dispatch(bookSet(book))
      if (photo && book.photoUrl) await cacheUploadedCover(book.photoUrl, photo)
      return book
    } catch (error) {
      if (isRetryableFailure(error)) {
        const op = { kind: 'addBook', input, addedAt: now.toISOString(), hasPhoto: Boolean(photo), uploadedFileId } as const
        if (await enqueue(dispatch, extra, { op, summary: describeOp(op, titleOf(getState)), photo })) {
          dispatch(noticeAdded(SAVED_OFFLINE_NOTICE))
          return { id: '', title: input.title, author: input.author, queued: true }
        }
      }
      throw error
    }
  },
)

/**
 * Optimistic for the text fields. A new `photo` is uploaded, then the Photo cell updated, then the old cover
 * renamed (never deleted, ADR-0004); a failed rename does not fail the edit (it becomes a notice).
 * A retryable failure keeps the optimistic change and queues the edit; any other failure rolls back and rejects.
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

    let uploadedFileId: string | undefined
    let saved: Book
    try {
      saved = await withSessionCheck(dispatch, () =>
        inWriteQueue(async () => {
          let photoUrl: string | undefined
          if (photo) {
            uploadedFileId = await uploadCoverFile(getState, extra, photo.full, id)
            photoUrl = createDriveFileUrl(uploadedFileId)
          }
          return updateBook(clientFor(getState, extra), id, photoUrl ? { ...patch, photoUrl } : patch)
        }),
      )
    } catch (error) {
      if (isRetryableFailure(error)) {
        const op = { kind: 'editBook', bookId: id, patch, hasPhoto: Boolean(photo), uploadedFileId, previousPhotoUrl: previous.photoUrl } as const
        if (await enqueue(dispatch, extra, { op, summary: describeOp(op, titleOf(getState)), photo })) {
          dispatch(noticeAdded(SAVED_OFFLINE_NOTICE))
          return { ...previous, ...changes } // the optimistic state stays on screen
        }
      }
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
      key: pendingLoanKey(input.bookId),
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
          appendLoan(clientFor(getState, extra), { ...input, borrowedDate: pending.borrowedDate, borrowedTime: pending.borrowedTime }, now),
        ),
      )
      dispatch(loanDiscarded(pending.key))
      dispatch(loanSet(saved))
      return saved
    } catch (error) {
      if (isRetryableFailure(error)) {
        const op = {
          kind: 'borrow',
          input: { bookId: pending.bookId, borrowerName: pending.borrowerName, place: pending.place, borrowedDate: pending.borrowedDate, borrowedTime: pending.borrowedTime },
        } as const
        if (await enqueue(dispatch, extra, { op, summary: describeOp(op, titleOf(getState)) })) {
          dispatch(noticeAdded(SAVED_OFFLINE_NOTICE))
          return pending // the temporary loan stays on screen
        }
      }
      dispatch(loanDiscarded(pending.key))
      throw error
    }
  },
)

/** Optimistic; a retryable failure keeps the return and queues it, any other failure restores the open loan. */
export const returnBook = createAsyncThunk<Loan, { bookId: string; returnedDate?: string; returnedTime?: string }, ThunkConfig>(
  'library/returnBook',
  async ({ bookId, returnedDate, returnedTime }, { dispatch, getState, extra }) => {
    const previous = selectOpenLoanByBookId(getState()).get(bookId)
    if (!previous) throw new NotBorrowedError(bookId)

    const now = extra.now()
    const date = returnedDate ?? formatDate(now)
    const time = returnedTime ?? formatTime(now)
    const returned: Loan = { ...previous, returned: true, returnedDate: date, returnedTime: time }
    dispatch(loanSet(returned))
    try {
      const saved = await withSessionCheck(dispatch, () =>
        inWriteQueue(() => returnLoan(clientFor(getState, extra), { bookId, returnedDate: date, returnedTime: time }, now)),
      )
      if (saved.key !== previous.key) dispatch(loanDiscarded(previous.key))
      dispatch(loanSet(saved))
      return saved
    } catch (error) {
      if (isRetryableFailure(error)) {
        const op = { kind: 'return', bookId, returnedDate: date, returnedTime: time } as const
        if (await enqueue(dispatch, extra, { op, summary: describeOp(op, titleOf(getState)) })) {
          dispatch(noticeAdded(SAVED_OFFLINE_NOTICE))
          return returned
        }
      }
      dispatch(loanSet(previous))
      throw error
    }
  },
)
