import { afterEach, describe, expect, it, vi } from 'vitest'
import { readSession, readStored, removeSession, removeStored, writeSession, writeStored } from '@/lib/storage'

afterEach(() => {
  vi.restoreAllMocks()
  localStorage.clear()
  sessionStorage.clear()
})

describe('local storage helpers', () => {
  it('round-trips and removes values', () => {
    writeStored('k', 'v')
    expect(readStored('k')).toBe('v')
    removeStored('k')
    expect(readStored('k')).toBeNull()
  })

  it('never throws when storage is blocked', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    expect(readStored('k')).toBeNull()
    expect(() => writeStored('k', 'v')).not.toThrow()
    expect(() => removeStored('k')).not.toThrow()
  })
})

describe('session storage helpers', () => {
  it('round-trips and removes values, separately from local storage', () => {
    writeSession('k', 'draft')
    expect(readSession('k')).toBe('draft')
    expect(localStorage.getItem('k')).toBeNull()
    removeSession('k')
    expect(readSession('k')).toBeNull()
  })

  it('never throws when storage is blocked', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    expect(readSession('k')).toBeNull()
    expect(() => writeSession('k', 'v')).not.toThrow()
    expect(() => removeSession('k')).not.toThrow()
  })
})
