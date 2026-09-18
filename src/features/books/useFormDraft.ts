import { useCallback, useEffect, useRef, useState } from 'react'
import type { BookFormTextField, BookFormValues } from '@/features/books/bookForm'
import { readSession, removeSession, writeSession } from '@/lib/storage'

const TEXT_FIELDS: BookFormTextField[] = ['title', 'author', 'purchaseDate', 'pricePaid', 'marketPrice', 'language']

/** A stored draft is used only if it has exactly the form's fields, all strings (it is untrusted input). */
function readDraft(key: string): BookFormValues | null {
  const raw = readSession(key)
  if (!raw) return null
  try {
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null) return null
    const record = parsed as Record<string, unknown>
    if (!TEXT_FIELDS.every((field) => typeof record[field] === 'string')) return null
    const { categories } = record
    if (!Array.isArray(categories) || !categories.every((name) => typeof name === 'string')) return null
    return { ...(Object.fromEntries(TEXT_FIELDS.map((field) => [field, record[field] as string])) as Record<BookFormTextField, string>), categories: categories as string[] }
  } catch {
    return null
  }
}

const sameValues = (a: BookFormValues, b: BookFormValues) =>
  TEXT_FIELDS.every((field) => a[field] === b[field]) && a.categories.length === b.categories.length && a.categories.every((name, i) => name === b.categories[i])

/**
 * Form values mirrored to sessionStorage so a reload doesn't lose them. Fields only: no photo, no token.
 * A draft is kept only while it differs from `initial`; `clearDraft` (after a save or Cancel) stops it
 * being written again.
 */
export function useFormDraft(key: string, initial: BookFormValues) {
  const [restored] = useState(() => {
    const draft = readDraft(key)
    return draft && !sameValues(draft, initial) ? draft : null
  })
  const [values, setValues] = useState<BookFormValues>(restored ?? initial)
  const [wasRestored, setWasRestored] = useState(restored !== null)
  const cleared = useRef(false)

  useEffect(() => {
    if (cleared.current) return
    if (sameValues(values, initial)) removeSession(key)
    else writeSession(key, JSON.stringify(values))
  }, [key, values, initial])

  const clearDraft = useCallback(() => {
    cleared.current = true
    removeSession(key)
  }, [key])

  /** Throw the draft away and go back to the saved values. */
  const discardDraft = useCallback(() => {
    cleared.current = false
    removeSession(key)
    setValues(initial)
    setWasRestored(false)
  }, [key, initial])

  return { values, setValues, wasRestored, clearDraft, discardDraft }
}
