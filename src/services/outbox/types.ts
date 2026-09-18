import type { StoredBlob } from '@/lib/storedBlob'
import type { BookPatch, NewBookInput, NewLoanInput } from '@/services/sheets/api'

/**
 * What was asked for and could not be sent yet. Only operations that failed for a *retryable* reason
 * (expired token, no network) are queued. Everything is plain data; there is never a token in here.
 */
export type OutboxOp =
  | {
      kind: 'addBook'
      input: NewBookInput
      /** Chosen when the user saved. Reused on every retry: it is the idempotency key that stops a row being added twice. */
      addedAt: string
      hasPhoto: boolean
      /** Set once the cover is uploaded, so a retry links it instead of uploading a second copy. */
      uploadedFileId?: string
    }
  | {
      kind: 'editBook'
      bookId: string
      patch: BookPatch
      hasPhoto: boolean
      uploadedFileId?: string
      /** The Photo link before the edit, so the old cover can be renamed once the new one is saved. */
      previousPhotoUrl?: string
    }
  | { kind: 'borrow'; input: Required<Pick<NewLoanInput, 'bookId' | 'borrowerName' | 'place' | 'borrowedDate' | 'borrowedTime'>> }
  | { kind: 'return'; bookId: string; returnedDate: string; returnedTime: string }

export type OutboxStatus = 'pending' | 'failed'

/** A queued operation plus its bookkeeping. `photo` (add/edit with a cover) lives only in IndexedDB. */
export interface OutboxRecord {
  /** Ascending, assigned by the store: entries are sent in this order. */
  seq: number
  createdAt: string
  status: OutboxStatus
  attempts: number
  /** Why it is `failed` (a permanent problem such as a conflict), for the user. */
  error?: string
  /** Human description, e.g. `Borrow “Dune” to Ravi`. */
  summary: string
  op: OutboxOp
  photo?: { full: StoredBlob; thumb: StoredBlob }
}

/** The same without the image bytes: small and serializable, so it can live in the Redux store. */
export type OutboxEntry = Omit<OutboxRecord, 'photo'>

export interface OutboxStorage {
  /** Persists a new entry and returns its `seq`. Throws OutboxUnavailableError if it cannot be stored. */
  add(record: Omit<OutboxRecord, 'seq'>): Promise<number>
  /** Every entry, oldest first. Throws OutboxUnavailableError if storage cannot be read. */
  list(): Promise<OutboxRecord[]>
  get(seq: number): Promise<OutboxRecord | undefined>
  update(seq: number, changes: Partial<Omit<OutboxRecord, 'seq'>>): Promise<void>
  /** Drops a queue entry (a sent, or discarded, *local* change). This never touches the Sheet or Drive. */
  remove(seq: number): Promise<void>
}

/** IndexedDB is missing or blocked (private window, storage disabled). Nothing can be queued. */
export class OutboxUnavailableError extends Error {
  constructor(message = 'Saving changes for later is not available in this browser.') {
    super(message)
    this.name = 'OutboxUnavailableError'
  }
}
