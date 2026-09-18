import { readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * Cheap, mechanical checks for rules in conductor/code_styleguides. They exist because these
 * rules were broken once already; a rule nobody can run is a rule nobody follows.
 */
const SRC = path.resolve(import.meta.dirname, '..', '..')

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name)
    if (statSync(full).isDirectory()) return walk(full)
    return /\.(ts|tsx)$/.test(name) ? [full] : []
  })
}

const isTest = (file: string) => /\.test\.tsx?$/.test(file) || file.includes(`${path.sep}test${path.sep}`)
const production = walk(SRC).filter((f) => !isTest(f))
const rel = (f: string) => path.relative(SRC, f)

describe('code conventions', () => {
  it('sees production files', () => {
    expect(production.length).toBeGreaterThan(10)
  })

  it('touches browser storage only through src/lib/storage.ts (it can throw when storage is blocked)', () => {
    const offenders = production
      .filter((f) => rel(f) !== path.join('lib', 'storage.ts'))
      .filter((f) => /\b(localStorage|sessionStorage)\s*[.[]/.test(readFileSync(f, 'utf8')))
      .map(rel)
    expect(offenders).toEqual([])
  })

  it('uses no `any` in production code (use unknown or a real type)', () => {
    const offenders = production.filter((f) => /:\s*any\b|\bas any\b|<any>/.test(readFileSync(f, 'utf8'))).map(rel)
    expect(offenders).toEqual([])
  })

  it('has no default export outside app entry points and Redux slices', () => {
    const allowed = /(^App\.tsx$|Slice\.ts$|^main\.tsx$)/
    const offenders = production
      .filter((f) => /^export default /m.test(readFileSync(f, 'utf8')))
      .map(rel)
      .filter((f) => !allowed.test(path.basename(f)))
    expect(offenders).toEqual([])
  })

  it('uses the themed Select (components/ui/select.tsx), not a native <select>, whose open list ignores the design system', () => {
    const offenders = production
      .filter((f) => rel(f) !== path.join('components', 'ui', 'select.tsx'))
      .filter((f) => /<select[\s>]/.test(readFileSync(f, 'utf8')))
      .map(rel)
    expect(offenders).toEqual([])
  })
})
