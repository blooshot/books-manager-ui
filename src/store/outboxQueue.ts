import type { Dispatch } from '@reduxjs/toolkit'
import type { CoverVariants } from '@/lib/image'
import { toStored } from '@/lib/storedBlob'
import type { OutboxOp } from '@/services/outbox/types'
import { entryQueued } from '@/store/outboxSlice'
import type { ThunkExtra } from '@/store/thunkExtra'

export const SAVED_OFFLINE_NOTICE = 'Saved on this device. It will be sent to your Sheet when you sync.'

/**
 * Keeps a write that failed for a retryable reason (expired token, no network) so it can be sent later.
 * Returns false if it could not be stored (IndexedDB unavailable, quota): the caller must then report the
 * original error and undo any optimistic change, because a change that is neither saved nor queued would be lost silently.
 */
export async function enqueue(
  dispatch: Dispatch,
  extra: ThunkExtra,
  entry: { op: OutboxOp; summary: string; photo?: CoverVariants },
): Promise<boolean> {
  try {
    const record = {
      createdAt: extra.now().toISOString(),
      status: 'pending' as const,
      attempts: 0,
      summary: entry.summary,
      op: entry.op,
      photo: entry.photo ? { full: await toStored(entry.photo.full), thumb: await toStored(entry.photo.thumb) } : undefined,
    }
    const seq = await extra.outbox.add(record)
    dispatch(entryQueued({ seq, createdAt: record.createdAt, status: 'pending', attempts: 0, summary: record.summary, op: record.op }))
    return true
  } catch {
    return false
  }
}
