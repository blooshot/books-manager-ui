import { describe, expect, it } from 'vitest'
import { nextBookId } from '@/services/sheets/ids'

describe('nextBookId', () => {
  it('starts at B-0001 for an empty library', () => {
    expect(nextBookId([])).toBe('B-0001')
  })
  it('uses the highest number, not the count, so gaps never cause reuse', () => {
    expect(nextBookId(['B-0001', 'B-0007', 'B-0003'])).toBe('B-0008')
  })
  it('ignores hand-typed IDs that do not match the pattern, and is case-insensitive', () => {
    expect(nextBookId(['old-1', 'b-0004', ''])).toBe('B-0005')
  })
  it('grows past four digits', () => {
    expect(nextBookId(['B-9999'])).toBe('B-10000')
  })
})
