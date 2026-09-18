import { createAsyncThunk } from '@reduxjs/toolkit'
import { fromStored } from '@/lib/storedBlob'
import type { CoverVariants } from '@/lib/image'
import { createDriveFileUrl } from '@/services/drive/links'
import { isRetryableFailure } from '@/services/google/errors'
import { OutboxUnavailableError, type OutboxEntry, type OutboxRecord } from '@/services/outbox/types'
import { appendBook, appendLoan, returnLoan, updateBook } from '@/services/sheets/api'
import { bookSet } from '@/store/booksSlice'
import { loanDiscarded, loanSet } from '@/store/borrowersSlice'
import { loadAll } from '@/store/libraryThunks'
import { noticeAdded } from '@/store/noticesSlice'
import { entryRemoved, entryUpdated, outboxLoaded, syncFinished, syncStarted } from '@/store/outboxSlice'
import { pendingLoanKey } from '@/services/outbox/pending'
import type { RootState } from '@/store'
import type { ThunkExtra } from '@/store/thunkExtra'
import { cacheUploadedCover, clientFor, inWriteQueue, retireOldCover, uploadCoverFile, withSessionCheck } from '@/store/writeSupport'

interface ThunkConfig {
  state: RootState
  extra: ThunkExtra
}

const toEntry = ({ photo: _photo, ...entry }: OutboxRecord): OutboxEntry => entry

/** Read the stored queue into the store, once. If the browser can't keep a queue, note that instead of failing. */
export const loadOutbox = createAsyncThunk<void, void, ThunkConfig>('outbox/load', async (_arg, { dispatch, extra }) => {
  try {
    const records = await extra.outbox.list()
    dispatch(outboxLoaded({ entries: records.map(toEntry), available: true }))
  } catch (error) {
    if (!(error instanceof OutboxUnavailableError)) throw error
    dispatch(outboxLoaded({ entries: [], available: false }))
  }
})

const photoOf = (record: OutboxRecord): CoverVariants | undefined =>
  record.photo ? { full: fromStored(record.photo.full), thumb: fromStored(record.photo.thumb) } : undefined

/**
 * Sends one queued operation. Each is written to be safe to repeat: a retry after a lost response finds the write
 * already in the Sheet (`idempotent`) and an uploaded cover is reused, so nothing is written or uploaded twice.
 */
async function send(
  record: OutboxRecord,
  ctx: { dispatch: Parameters<typeof withSessionCheck>[0]; getState: () => RootState; extra: ThunkExtra },
): Promise<void> {
  const { dispatch, getState, extra } = ctx
  const { op, seq } = record
  const photo = photoOf(record)

  /** Uploads the cover unless a previous attempt already did; remembers the file ID before anything else can fail. */
  async function coverLink(bookId: string, uploadedFileId: string | undefined): Promise<{ link: string; fileId: string }> {
    let fileId = uploadedFileId
    if (!fileId && photo) {
      fileId = await uploadCoverFile(getState, extra, photo.full, bookId)
      const updated = { ...op, uploadedFileId: fileId } as typeof op
      await extra.outbox.update(seq, { op: updated })
      dispatch(entryUpdated({ seq, changes: { op: updated } }))
    }
    if (!fileId) throw new Error('This queued change lost its cover photo.')
    return { link: createDriveFileUrl(fileId), fileId }
  }

  switch (op.kind) {
    case 'addBook': {
      const book = await withSessionCheck(dispatch, () =>
        inWriteQueue(() =>
          appendBook(
            clientFor(getState, extra),
            op.input,
            new Date(op.addedAt),
            record.photo ? async (bookId) => (await coverLink(bookId, op.uploadedFileId)).link : undefined,
            { idempotent: true },
          ),
        ),
      )
      dispatch(bookSet(book))
      if (photo && book.photoUrl) await cacheUploadedCover(book.photoUrl, photo)
      return
    }
    case 'editBook': {
      const saved = await withSessionCheck(dispatch, () =>
        inWriteQueue(async () => {
          const link = record.photo ? (await coverLink(op.bookId, op.uploadedFileId)).link : undefined
          return updateBook(clientFor(getState, extra), op.bookId, link ? { ...op.patch, photoUrl: link } : op.patch)
        }),
      )
      dispatch(bookSet(saved))
      if (photo && saved.photoUrl) {
        await cacheUploadedCover(saved.photoUrl, photo)
        await retireOldCover(dispatch, getState, extra, op.previousPhotoUrl, saved.photoUrl, op.bookId)
      }
      return
    }
    case 'borrow': {
      const loan = await withSessionCheck(dispatch, () =>
        inWriteQueue(() => appendLoan(clientFor(getState, extra), op.input, extra.now(), { idempotent: true })),
      )
      dispatch(loanDiscarded(pendingLoanKey(op.input.bookId)))
      dispatch(loanSet(loan))
      return
    }
    case 'return': {
      const loan = await withSessionCheck(dispatch, () =>
        inWriteQueue(() =>
          returnLoan(clientFor(getState, extra), { bookId: op.bookId, returnedDate: op.returnedDate, returnedTime: op.returnedTime }, extra.now(), { idempotent: true }),
        ),
      )
      dispatch(loanSet(loan))
      return
    }
  }
}

export interface FlushResult {
  sent: number
  /** Entries that can never be applied as they are (e.g. someone else borrowed the book). They stay listed, for the user. */
  failed: number
  /** The flush stopped early because the token expired or the network is down; the rest stays queued. */
  stopped: boolean
}

/**
 * Sends queued operations strictly in order. A retryable failure (expired token, no network) stops the flush and
 * leaves everything from that entry on queued. A permanent failure (a conflict, a rejected write) marks just that
 * entry `failed` with the reason and carries on, so one bad entry never blocks the rest.
 */
export const flushOutbox = createAsyncThunk<FlushResult, void, ThunkConfig>('outbox/flush', async (_arg, { dispatch, getState, extra }) => {
  if (getState().outbox.syncing) return { sent: 0, failed: 0, stopped: false }
  dispatch(syncStarted())
  const attempted = new Set<number>()
  const result: FlushResult = { sent: 0, failed: 0, stopped: false }
  try {
    for (;;) {
      const next = getState().outbox.entries.find((entry) => entry.status === 'pending' && !attempted.has(entry.seq))
      if (!next) break
      attempted.add(next.seq)

      const record = await extra.outbox.get(next.seq)
      if (!record) {
        dispatch(entryRemoved(next.seq))
        continue
      }
      try {
        await send(record, { dispatch, getState, extra })
      } catch (error) {
        const attempts = record.attempts + 1
        if (isRetryableFailure(error)) {
          await extra.outbox.update(record.seq, { attempts })
          dispatch(entryUpdated({ seq: record.seq, changes: { attempts } }))
          result.stopped = true
          break
        }
        const message = error instanceof Error && error.message ? error.message : 'This change could not be saved.'
        await extra.outbox.update(record.seq, { status: 'failed', attempts, error: message })
        dispatch(entryUpdated({ seq: record.seq, changes: { status: 'failed', attempts, error: message } }))
        result.failed += 1
        continue
      }
      await extra.outbox.remove(record.seq)
      dispatch(entryRemoved(record.seq))
      result.sent += 1
    }
    return result
  } finally {
    dispatch(syncFinished())
  }
})

/**
 * Send everything queued, then reload from the Sheet (unless the session is no longer signed in).
 * Says what happened when it was not a clean success; a clean success is quiet (the pending count just disappears).
 */
export const syncAll = createAsyncThunk<void, void, ThunkConfig>('outbox/syncAll', async (_arg, { dispatch, getState }) => {
  let result: FlushResult
  try {
    result = await dispatch(flushOutbox()).unwrap()
  } catch {
    dispatch(noticeAdded('Could not read the changes saved on this device, so nothing was sent.'))
    return
  }
  if (result.stopped && getState().session.status === 'signedIn') {
    dispatch(noticeAdded('Could not reach Google. Your changes are still saved on this device; try Sync again when you are back online.'))
  }
  if (result.failed > 0) {
    dispatch(noticeAdded(`${result.failed} ${result.failed === 1 ? 'change' : 'changes'} could not be applied. Open Pending changes to review.`))
  }
  if (getState().session.status === 'signedIn' && !result.stopped) await dispatch(loadAll())
})

/** On sign-in, and after a reconnect: read the queue once, send it if anything is waiting, otherwise just load. */
export const startSync = createAsyncThunk<void, void, ThunkConfig>('outbox/start', async (_arg, { dispatch, getState }) => {
  if (!getState().outbox.loaded) await dispatch(loadOutbox())
  const waiting = getState().outbox.entries.some((entry) => entry.status === 'pending')
  if (waiting) await dispatch(syncAll())
  else await dispatch(loadAll())
})

/** Give up a queued change (or a failed one) without sending it. Only the local queue entry goes; no Sheet data. */
export const discardEntry = createAsyncThunk<void, number, ThunkConfig>('outbox/discard', async (seq, { dispatch, extra }) => {
  await extra.outbox.remove(seq)
  dispatch(entryRemoved(seq))
  await dispatch(loadAll()) // the screen goes back to what the Sheet says
})

/** Put a failed entry back in the queue and try again. */
export const retryEntry = createAsyncThunk<void, number, ThunkConfig>('outbox/retry', async (seq, { dispatch, extra }) => {
  await extra.outbox.update(seq, { status: 'pending', error: undefined })
  dispatch(entryUpdated({ seq, changes: { status: 'pending', error: undefined } }))
  await dispatch(syncAll())
})
