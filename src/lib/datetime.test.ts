import { describe, expect, it } from 'vitest'
import { formatDate, formatTime, formatTimestamp, isRealIsoDate, isValidTime } from '@/lib/datetime'

describe('formatDate / formatTime', () => {
  it('zero-pad local date and time', () => {
    const d = new Date(2026, 0, 5, 7, 3)
    expect(formatDate(d)).toBe('2026-01-05')
    expect(formatTime(d)).toBe('07:03')
  })
})

describe('formatTimestamp', () => {
  it('shows an ISO timestamp as local yyyy-mm-dd HH:mm, whatever the time zone', () => {
    const local = new Date(2026, 8, 18, 17, 30, 45) // built in local time, so the expectation holds in any zone
    expect(formatTimestamp(local.toISOString())).toBe('2026-09-18 17:30')
  })

  it('crosses midnight correctly for a UTC timestamp', () => {
    const local = new Date(2026, 0, 1, 0, 5)
    expect(formatTimestamp(local.toISOString())).toBe('2026-01-01 00:05')
  })

  it.each(['', 'not a date', '2026-13-45T99:00:00Z'])('returns %j unchanged instead of hiding it', (value) => {
    expect(formatTimestamp(value)).toBe(value)
  })
})

describe('isRealIsoDate / isValidTime', () => {
  it('accept real dates and 24-hour times, reject the rest', () => {
    expect(isRealIsoDate('2024-02-29')).toBe(true)
    expect(isRealIsoDate('2025-02-29')).toBe(false)
    expect(isRealIsoDate('2026-9-1')).toBe(false)
    expect(isValidTime('00:00')).toBe(true)
    expect(isValidTime('23:59')).toBe(true)
    expect(isValidTime('24:00')).toBe(false)
    expect(isValidTime('9:05')).toBe(false)
  })
})
