import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { toStored } from '@/lib/storedBlob'
import { createIndexedDbOutbox } from '@/services/outbox/indexedDbOutbox'
import { OutboxUnavailableError, type OutboxRecord } from '@/services/outbox/types'

const DB = 'BookOutboxTest'
const record = (summary: string, extra: Partial<Omit<OutboxRecord, 'seq'>> = {}): Omit<OutboxRecord, 'seq'> => ({
  createdAt: '2026-09-18T14:05:00.000Z',
  status: 'pending',
  attempts: 0,
  summary,
  op: { kind: 'return', bookId: 'B-0001', returnedDate: '2026-09-18', returnedTime: '14:05' },
  ...extra,
})

beforeEach(async () => {
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase(DB)
    request.onsuccess = () => resolve()
    request.onerror = () => reject(new Error('could not reset the test database'))
  })
})
afterEach(() => vi.unstubAllGlobals())

describe('IndexedDB outbox', () => {
  it('starts empty', async () => {
    expect(await createIndexedDbOutbox(DB).list()).toEqual([])
  })

  it('assigns ascending sequence numbers and lists entries oldest first', async () => {
    const outbox = createIndexedDbOutbox(DB)
    const a = await outbox.add(record('first'))
    const b = await outbox.add(record('second'))
    const c = await outbox.add(record('third'))
    expect(a).toBeLessThan(b)
    expect(b).toBeLessThan(c)
    expect((await outbox.list()).map((r) => r.summary)).toEqual(['first', 'second', 'third'])
  })

  it('keeps entries across a "reload" (a new outbox object on the same database)', async () => {
    await createIndexedDbOutbox(DB).add(record('survives'))
    const afterReload = await createIndexedDbOutbox(DB).list()
    expect(afterReload.map((r) => r.summary)).toEqual(['survives'])
  })

  it('stores the operation exactly, and gets one entry by number', async () => {
    const outbox = createIndexedDbOutbox(DB)
    const op = { kind: 'borrow', input: { bookId: 'B-0002', borrowerName: 'Ravi', place: 'Office', borrowedDate: '2026-09-18', borrowedTime: '14:05' } } as const
    const seq = await outbox.add(record('borrow', { op }))
    expect((await outbox.get(seq))?.op).toEqual(op)
    expect(await outbox.get(seq + 100)).toBeUndefined()
  })

  it('round-trips photo bytes (including CRLF, NUL and high bytes) and their types', async () => {
    const outbox = createIndexedDbOutbox(DB)
    const bytes = [0xff, 0xd8, 0x00, 0x0d, 0x0a, 0x80]
    const photo = { full: await toStored(new Blob([new Uint8Array(bytes)], { type: 'image/jpeg' })), thumb: await toStored(new Blob([new Uint8Array([1])], { type: 'image/jpeg' })) }
    const seq = await outbox.add(record('add with photo', { photo }))
    const stored = await outbox.get(seq)
    expect([...new Uint8Array(stored?.photo?.full.bytes ?? new ArrayBuffer(0))]).toEqual(bytes)
    expect(stored?.photo?.full.type).toBe('image/jpeg')
    expect([...new Uint8Array(stored?.photo?.thumb.bytes ?? new ArrayBuffer(0))]).toEqual([1])
  })

  it('updates only the fields given, keeping the rest', async () => {
    const outbox = createIndexedDbOutbox(DB)
    const seq = await outbox.add(record('to update'))
    await outbox.update(seq, { attempts: 3, status: 'failed', error: 'Conflict' })
    expect(await outbox.get(seq)).toMatchObject({ seq, summary: 'to update', attempts: 3, status: 'failed', error: 'Conflict' })
  })

  it('ignores an update for an entry that no longer exists', async () => {
    await expect(createIndexedDbOutbox(DB).update(999, { attempts: 1 })).resolves.toBeUndefined()
  })

  it('removes one entry and leaves the others', async () => {
    const outbox = createIndexedDbOutbox(DB)
    const a = await outbox.add(record('keep'))
    const b = await outbox.add(record('drop'))
    await outbox.remove(b)
    expect((await outbox.list()).map((r) => r.seq)).toEqual([a])
  })

  it('does not reuse the number of a removed entry', async () => {
    const outbox = createIndexedDbOutbox(DB)
    const a = await outbox.add(record('one'))
    await outbox.remove(a)
    const b = await outbox.add(record('two'))
    expect(b).toBeGreaterThan(a)
  })

  it('reports OutboxUnavailableError for every call when IndexedDB is unavailable', async () => {
    vi.stubGlobal('indexedDB', undefined)
    const outbox = createIndexedDbOutbox(DB)
    await expect(outbox.add(record('x'))).rejects.toBeInstanceOf(OutboxUnavailableError)
    await expect(outbox.list()).rejects.toBeInstanceOf(OutboxUnavailableError)
    await expect(outbox.get(1)).rejects.toBeInstanceOf(OutboxUnavailableError)
    await expect(outbox.update(1, { attempts: 1 })).rejects.toBeInstanceOf(OutboxUnavailableError)
    await expect(outbox.remove(1)).rejects.toBeInstanceOf(OutboxUnavailableError)
  })

  it('reports OutboxUnavailableError when opening the database throws', async () => {
    vi.stubGlobal('indexedDB', {
      open: () => {
        throw new Error('SecurityError')
      },
    })
    await expect(createIndexedDbOutbox(DB).list()).rejects.toBeInstanceOf(OutboxUnavailableError)
  })
})
