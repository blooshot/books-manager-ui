import { OutboxUnavailableError, type OutboxRecord, type OutboxStorage } from '@/services/outbox/types'

/**
 * In-memory OutboxStorage for tests. Like IndexedDB it stores copies (structured clone), so mutating what you
 * passed in, or got back, never changes what is stored.
 */
export class MemoryOutbox implements OutboxStorage {
  records = new Map<number, OutboxRecord>()
  private next = 1

  async add(record: Omit<OutboxRecord, 'seq'>): Promise<number> {
    const seq = this.next++
    this.records.set(seq, structuredClone({ ...record, seq }))
    return seq
  }

  async list(): Promise<OutboxRecord[]> {
    return [...this.records.values()].sort((a, b) => a.seq - b.seq).map((r) => structuredClone(r))
  }

  async get(seq: number): Promise<OutboxRecord | undefined> {
    const record = this.records.get(seq)
    return record ? structuredClone(record) : undefined
  }

  async update(seq: number, changes: Partial<Omit<OutboxRecord, 'seq'>>): Promise<void> {
    const current = this.records.get(seq)
    if (current) this.records.set(seq, structuredClone({ ...current, ...changes, seq }))
  }

  async remove(seq: number): Promise<void> {
    this.records.delete(seq)
  }
}

/** An outbox that cannot store anything (IndexedDB blocked): changes must be reported, never silently lost. */
export class UnavailableOutbox implements OutboxStorage {
  add(): Promise<number> {
    return Promise.reject(new OutboxUnavailableError())
  }
  list(): Promise<OutboxRecord[]> {
    return Promise.reject(new OutboxUnavailableError())
  }
  get(): Promise<OutboxRecord | undefined> {
    return Promise.reject(new OutboxUnavailableError())
  }
  update(): Promise<void> {
    return Promise.reject(new OutboxUnavailableError())
  }
  remove(): Promise<void> {
    return Promise.reject(new OutboxUnavailableError())
  }
}
