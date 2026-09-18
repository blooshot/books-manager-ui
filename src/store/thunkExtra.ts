import type { OutboxStorage } from '@/services/outbox/types'

/** Injected into every thunk (see makeStore) so tests can swap in a fake Sheet, clock and outbox. */
export interface ThunkExtra {
  sheetId: string
  fetchImpl?: typeof fetch
  now: () => Date
  /** Where writes that failed for a retryable reason are kept until they can be sent (ADR-0006). */
  outbox: OutboxStorage
}
