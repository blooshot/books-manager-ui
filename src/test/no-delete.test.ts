import { readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * ADR-0004 code guard: the app must never call a delete/clear operation on
 * Sheets or Drive. Books are append-only; replaced covers are renamed, not deleted.
 */
const FORBIDDEN: [string, RegExp][] = [
  ['Sheets deleteDimension', /deleteDimension/],
  ['Sheets deleteRange', /deleteRange/],
  ['Sheets deleteSheet', /deleteSheet/],
  ['Sheets values:clear', /values\/[^'"`\s]*:(batchClear|clear)|:batchClear/],
  ['Drive emptyTrash', /emptyTrash/],
  ['HTTP DELETE', /method:\s*['"`]DELETE['"`]/i],
]

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name)
    if (statSync(full).isDirectory()) return name === 'test' ? [] : sourceFiles(full)
    return /\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name) ? [full] : []
  })
}

describe('guard patterns', () => {
  it.each([
    ['deleteDimension', 'requests: [{ deleteDimension: {} }]'],
    ['Sheets values:clear', "`${root}/values/Books!A1:H9:clear`"],
    ['Sheets values:clear', "`${root}/values:batchClear`"],
    ['HTTP DELETE', "fetch(url, { method: 'DELETE' })"],
    ['Drive emptyTrash', 'drive.files.emptyTrash()'],
  ])('would catch %s', (label, sample) => {
    const pattern = FORBIDDEN.find(([name]) => name.includes(label.split(' ').pop()!))?.[1]
    expect(pattern, `no pattern for ${label}`).toBeDefined()
    expect(pattern!.test(sample)).toBe(true)
  })
})

describe('Sheets endpoint allow-list (ADR-0004)', () => {
  const servicesDir = path.resolve(import.meta.dirname, '..', 'services')
  const source = sourceFiles(servicesDir).map((f) => readFileSync(f, 'utf8')).join('\n')

  it('only calls values:batchGet, values:batchUpdate and :append', () => {
    const used = new Set([...source.matchAll(/values:(\w+)/g)].map((m) => m[1]))
    expect([...used].filter((op) => !['batchGet', 'batchUpdate'].includes(op))).toEqual([])
    expect(used.has('batchGet') && used.has('batchUpdate')).toBe(true)
    expect(source).toContain(':append')
  })
})

describe('append-only guard (ADR-0004)', () => {
  const files = sourceFiles(path.resolve(import.meta.dirname, '..'))

  it('scans some source files', () => {
    expect(files.length).toBeGreaterThan(5)
  })

  it.each(FORBIDDEN)('contains no %s call', (_label, pattern) => {
    const offenders = files.filter((file) => pattern.test(readFileSync(file, 'utf8')))
    expect(offenders).toEqual([])
  })
})
