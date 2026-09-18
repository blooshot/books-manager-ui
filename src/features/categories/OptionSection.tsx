import { Archive, Check, Pencil, RotateCcw, X } from 'lucide-react'
import { useMemo, useState, type FormEvent } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { describeOptionError } from '@/features/categories/optionErrors'
import { useAppDispatch, useAppSelector } from '@/store/hooks'
import { booksSelectors } from '@/store/selectors'
import { addOption, renameOption, setOptionActive } from '@/store/taxonomyThunks'
import type { OptionList } from '@/types/library'

const COPY: Record<OptionList, { title: string; noun: string; addLabel: string; empty: string }> = {
  categories: { title: 'Categories', noun: 'category', addLabel: 'New category', empty: 'No categories yet. Add one above, for example Self-help or Business.' },
  languages: { title: 'Languages', noun: 'language', addLabel: 'New language', empty: 'No languages yet. Add one above, for example English or Hindi.' },
}

const sameName = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase()

/**
 * One managed list: add, rename, archive, restore. There is no delete: archiving hides an entry from pickers and
 * filters, and books keep their text, so Restore brings everything back (ADR-0008).
 */
export function OptionSection({ list }: { list: OptionList }) {
  const copy = COPY[list]
  const dispatch = useAppDispatch()
  const options = useAppSelector((s) => s.taxonomy[list])
  const setup = useAppSelector((s) => s.taxonomy.setup[list])
  const allBooks = useAppSelector(booksSelectors.selectAll)
  const books = useMemo(() => allBooks.filter((book) => !book.archived), [allBooks]) // deleted books are not counted
  const [newName, setNewName] = useState('')
  const [editing, setEditing] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const sorted = useMemo(() => [...options].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })), [options])
  const active = sorted.filter((o) => o.active)
  const archived = sorted.filter((o) => !o.active)
  const countFor = (name: string) =>
    books.filter((book) => (list === 'categories' ? (book.categories ?? []).some((c) => sameName(c, name)) : book.language && sameName(book.language, name))).length

  async function run(work: () => Promise<unknown>): Promise<boolean> {
    setBusy(true)
    setError(null)
    try {
      await work()
      return true
    } catch (caught) {
      setError(describeOptionError(caught as { name?: string; message?: string; code?: string }))
      return false
    } finally {
      setBusy(false)
    }
  }

  async function submitNew(event: FormEvent) {
    event.preventDefault()
    if (await run(() => dispatch(addOption({ list, name: newName })).unwrap())) setNewName('')
  }

  async function submitRename(event: FormEvent, from: string) {
    event.preventDefault()
    if (await run(() => dispatch(renameOption({ list, from, to: draft })).unwrap())) setEditing(null)
  }

  const headingId = `${list}-heading`
  return (
    <section aria-labelledby={headingId} className="space-y-3">
      <h2 id={headingId} className="font-display text-lg font-bold">{copy.title}</h2>

      {setup ? (
        <p role="status" className="rounded-md border bg-card p-3 text-sm">{setup}</p>
      ) : (
        <>
          <form onSubmit={(event) => void submitNew(event)} className="flex max-w-md gap-2">
            <label htmlFor={`${list}-new`} className="sr-only">{copy.addLabel}</label>
            <Input id={`${list}-new`} value={newName} onChange={(event) => setNewName(event.target.value)} placeholder={copy.addLabel} autoComplete="off" disabled={busy} />
            <Button type="submit" disabled={busy || newName.trim() === ''}>Add</Button>
          </form>

          {error && <p role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm">{error}</p>}

          {active.length === 0 && archived.length === 0 && <p className="text-sm text-muted-foreground">{copy.empty}</p>}

          {active.length > 0 && (
            <ul aria-label={`Active ${copy.title.toLowerCase()}`} className="divide-y rounded-lg border bg-card">
              {active.map(({ name }) => (
                <li key={name} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                  {editing === name ? (
                    <form onSubmit={(event) => void submitRename(event, name)} className="flex flex-1 gap-2">
                      <label htmlFor={`${list}-rename`} className="sr-only">New name for {name}</label>
                      <Input id={`${list}-rename`} value={draft} onChange={(event) => setDraft(event.target.value)} autoComplete="off" disabled={busy} autoFocus />
                      <Button type="submit" size="sm" disabled={busy || draft.trim() === ''} aria-label={`Save name for ${name}`}><Check aria-hidden />Save</Button>
                      <Button type="button" size="sm" variant="ghost" onClick={() => setEditing(null)} disabled={busy}><X aria-hidden />Cancel</Button>
                    </form>
                  ) : (
                    <>
                      <span className="min-w-0 flex-1 truncate">
                        {name} <span className="font-mono text-xs text-muted-foreground">{countFor(name)} {countFor(name) === 1 ? 'book' : 'books'}</span>
                      </span>
                      <span className="flex gap-1">
                        <Button size="sm" variant="ghost" aria-label={`Rename ${name}`} disabled={busy} onClick={() => { setEditing(name); setDraft(name); setError(null) }}>
                          <Pencil aria-hidden />Rename
                        </Button>
                        <Button size="sm" variant="ghost" aria-label={`Archive ${name}`} disabled={busy} onClick={() => void run(() => dispatch(setOptionActive({ list, name, active: false })).unwrap())}>
                          <Archive aria-hidden />Archive
                        </Button>
                      </span>
                    </>
                  )}
                </li>
              ))}
            </ul>
          )}

          {archived.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-sm font-medium text-muted-foreground">Archived</h3>
              <p className="text-xs text-muted-foreground">Hidden from pickers and filters. Books keep them, so restoring brings everything back.</p>
              <ul aria-label={`Archived ${copy.title.toLowerCase()}`} className="divide-y rounded-lg border bg-card">
                {archived.map(({ name }) => (
                  <li key={name} className="flex items-center justify-between gap-2 px-3 py-2 text-muted-foreground">
                    <span className="truncate">{name}</span>
                    <Button size="sm" variant="ghost" aria-label={`Restore ${name}`} disabled={busy} onClick={() => void run(() => dispatch(setOptionActive({ list, name, active: true })).unwrap())}>
                      <RotateCcw aria-hidden />Restore
                    </Button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </section>
  )
}
