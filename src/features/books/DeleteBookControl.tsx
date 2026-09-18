import { RotateCcw, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router'
import { Button } from '@/components/ui/button'
import { ResponsiveDialog } from '@/components/ui/dialog'
import { useAppDispatch, useAppSelector } from '@/store/hooks'
import { archiveBook, restoreBook } from '@/store/libraryThunks'
import type { Book, Loan } from '@/types/library'

const messageOf = (error: unknown) => (error as { message?: string }).message || 'Could not save that change. Try again.'

/**
 * "Delete book". It only hides the book (Active = No): the row stays in the Sheet and the book can be restored from
 * Archived (ADR-0009). The dialog says so, because the word "delete" suggests otherwise.
 */
export function DeleteBookControl({ book, openLoan }: { book: Book; openLoan?: Loan }) {
  const dispatch = useAppDispatch()
  const navigate = useNavigate()
  const archiveSetup = useAppSelector((s) => s.library.archiveSetup)
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const blocked = archiveSetup ?? (openLoan ? `Lent to ${openLoan.borrowerName}. Mark it returned first, then you can delete it.` : undefined)

  async function confirm() {
    setSaving(true)
    setError(null)
    try {
      await dispatch(archiveBook({ id: book.id })).unwrap()
      setOpen(false)
      navigate('/')
    } catch (caught) {
      setError(messageOf(caught))
      setSaving(false)
    }
  }

  return (
    <div className="space-y-1.5">
      {/* The optimistic delete flips `book.archived` at once. The trigger goes, but the dialog stays mounted, so a
          failure can still be shown in it (an editing surface must not unmount because of the data it edits). */}
      {!book.archived && (
        <>
          <Button variant="outline" size="sm" onClick={() => { setError(null); setSaving(false); setOpen(true) }} disabled={Boolean(blocked)}>
            <Trash2 aria-hidden />
            Delete book
          </Button>
          {blocked && <p className="max-w-sm text-xs text-muted-foreground">{blocked}</p>}
        </>
      )}
      <ResponsiveDialog
        open={open}
        onOpenChange={(next) => !saving && setOpen(next)}
        title="Delete this book?"
        description={`“${book.title}” will be hidden from your library. It is not erased from your Sheet, and you can restore it from Archived.`}
      >
        {error && <p role="alert" className="mb-3 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm">{error}</p>}
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="ghost" onClick={() => setOpen(false)} disabled={saving}>Cancel</Button>
          <Button type="button" onClick={() => void confirm()} disabled={saving}>{saving ? 'Deleting…' : 'Delete book'}</Button>
        </div>
      </ResponsiveDialog>
    </div>
  )
}

/**
 * Shown on a deleted book instead of the normal actions: says it is hidden, and restores it. It stays mounted while a
 * restore is in flight (the optimistic restore un-deletes the book at once) so a failure can still be shown.
 */
export function ArchivedBanner({ book }: { book: Book }) {
  const dispatch = useAppDispatch()
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function restore() {
    setSaving(true)
    setError(null)
    try {
      await dispatch(restoreBook({ id: book.id })).unwrap()
    } catch (caught) {
      setError(messageOf(caught))
    } finally {
      setSaving(false)
    }
  }

  if (!book.archived && !saving && !error) return null
  return (
    <div role="status" className="space-y-2 rounded-lg border bg-card p-4 text-sm">
      <p>This book is deleted, so it is hidden from your library. Its row is still in your Sheet, and restoring brings it back.</p>
      {error && <p role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 p-3">{error}</p>}
      <Button size="sm" onClick={() => void restore()} disabled={saving}>
        <RotateCcw aria-hidden />
        {saving ? 'Restoring…' : 'Restore book'}
      </Button>
    </div>
  )
}
