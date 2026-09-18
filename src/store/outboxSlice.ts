import { createSlice, type PayloadAction } from '@reduxjs/toolkit'
import type { OutboxEntry } from '@/services/outbox/types'

export interface OutboxState {
  /** The stored queue has been read (once, at startup). */
  loaded: boolean
  /** False when this browser can't keep a queue (IndexedDB blocked): failed writes are then reported, not queued. */
  available: boolean
  /** Queued operations, oldest first, without image bytes (those stay in IndexedDB). */
  entries: OutboxEntry[]
  /** A flush is running. */
  syncing: boolean
}

const initialState: OutboxState = { loaded: false, available: true, entries: [], syncing: false }

const bySeq = (a: OutboxEntry, b: OutboxEntry) => a.seq - b.seq

const outboxSlice = createSlice({
  name: 'outbox',
  initialState,
  reducers: {
    outboxLoaded(state, action: PayloadAction<{ entries: OutboxEntry[]; available: boolean }>) {
      state.loaded = true
      state.available = action.payload.available
      state.entries = [...action.payload.entries].sort(bySeq)
    },
    entryQueued(state, action: PayloadAction<OutboxEntry>) {
      state.entries = [...state.entries.filter((e) => e.seq !== action.payload.seq), action.payload].sort(bySeq)
    },
    entryUpdated(state, action: PayloadAction<{ seq: number; changes: Partial<Omit<OutboxEntry, 'seq'>> }>) {
      const entry = state.entries.find((e) => e.seq === action.payload.seq)
      if (entry) Object.assign(entry, action.payload.changes)
    },
    /** A sent or discarded *local* queue entry; never a Sheet or Drive delete. */
    entryRemoved(state, action: PayloadAction<number>) {
      state.entries = state.entries.filter((e) => e.seq !== action.payload)
    },
    syncStarted(state) {
      state.syncing = true
    },
    syncFinished(state) {
      state.syncing = false
    },
  },
})

export const { outboxLoaded, entryQueued, entryUpdated, entryRemoved, syncStarted, syncFinished } = outboxSlice.actions
export default outboxSlice.reducer

export const selectPendingCount = (state: { outbox: OutboxState }) => state.outbox.entries.filter((e) => e.status === 'pending').length
export const selectFailedCount = (state: { outbox: OutboxState }) => state.outbox.entries.filter((e) => e.status === 'failed').length
