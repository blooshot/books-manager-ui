import { ArrowLeft } from 'lucide-react'
import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { FormField } from '@/components/FormField'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  EMPTY_BOOK_FORM,
  findDuplicate,
  toBookPatch,
  toNewBookInput,
  validateBookForm,
  valuesFromBook,
  type BookFormErrors,
  type BookFormValues,
} from '@/features/books/bookForm'
import { PhotoField } from '@/features/books/PhotoField'
import { useFormDraft } from '@/features/books/useFormDraft'
import { config } from '@/lib/config'
import type { CoverVariants } from '@/lib/image'
import { useAppDispatch, useAppSelector } from '@/store/hooks'
import { addBook, editBook } from '@/store/libraryThunks'
import { booksSelectors } from '@/store/selectors'
import type { Book } from '@/types/library'

/** What the user should do about a failed save, by error name (Redux serializes errors; see STATUS gotchas). */
function describeSaveError(error: { name?: string; message?: string }): string {
  if (error.name === 'SessionExpiredError') return 'Your Google session has expired. Reconnect using the banner above, then save again. Your changes are kept.'
  return error.message || 'Could not save the book. Try again.'
}

function BookForm({ book }: { book?: Book }) {
  const dispatch = useAppDispatch()
  const navigate = useNavigate()
  const books = useAppSelector(booksSelectors.selectAll)
  const initial = useMemo<BookFormValues>(() => (book ? valuesFromBook(book) : EMPTY_BOOK_FORM), [book])
  const { values, setValues, wasRestored, clearDraft, discardDraft } = useFormDraft(`bm.draft.book:${book?.id ?? 'new'}`, initial)
  const [photo, setPhoto] = useState<CoverVariants | null>(null)
  const [attempted, setAttempted] = useState(false)
  const [invalidSubmits, setInvalidSubmits] = useState(0)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  // After a submit with errors, move focus to the first invalid field so keyboard and screen reader users land on
  // the problem. This runs right after the render that shows the errors (not on a timer, which could fire
  // mid-typing and pull focus into another field).
  useEffect(() => {
    if (invalidSubmits > 0) document.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus()
  }, [invalidSubmits])

  const errors: BookFormErrors = attempted ? validateBookForm(values) : {}
  const duplicate = findDuplicate(books, values.title, values.author, book?.id)
  const backTo = book ? `/books/${book.id}` : '/'

  const set = (field: keyof BookFormValues) => (event: { target: { value: string } }) =>
    setValues((current) => ({ ...current, [field]: event.target.value }))

  async function submit(event: FormEvent) {
    event.preventDefault()
    setAttempted(true)
    setSaveError(null)
    if (Object.keys(validateBookForm(values)).length > 0) {
      setInvalidSubmits((count) => count + 1)
      return
    }

    setSaving(true)
    try {
      if (book) {
        const patch = toBookPatch(values, book)
        if (Object.keys(patch).length > 0 || photo) await dispatch(editBook({ id: book.id, patch, photo: photo ?? undefined })).unwrap()
        clearDraft()
        navigate(`/books/${book.id}`)
      } else {
        const saved = await dispatch(addBook({ ...toNewBookInput(values), photo: photo ?? undefined })).unwrap()
        clearDraft()
        navigate(`/books/${saved.id}`)
      }
    } catch (error) {
      setSaveError(describeSaveError(error as { name?: string; message?: string }))
      setSaving(false)
    }
  }

  function cancel() {
    clearDraft()
    navigate(backTo)
  }

  return (
    <form onSubmit={(event) => void submit(event)} noValidate className="max-w-xl space-y-5">
      <h1 className="font-display text-xl font-bold">{book ? 'Edit book' : 'Add book'}</h1>

      {wasRestored && (
        <div role="status" className="flex flex-wrap items-center justify-between gap-2 rounded-md border bg-card p-3 text-sm">
          <span>Restored your unsaved changes.</span>
          <Button type="button" size="sm" variant="ghost" onClick={discardDraft}>Discard</Button>
        </div>
      )}

      <FormField label="Book ID" hint={book ? undefined : 'Assigned when you save.'}>
        <Input value={book?.id ?? 'Assigned when saved'} readOnly disabled className="font-mono" />
      </FormField>
      <FormField label="Title" required error={errors.title}>
        <Input value={values.title} onChange={set('title')} autoComplete="off" disabled={saving} />
      </FormField>
      <FormField label="Author" required error={errors.author}>
        <Input value={values.author} onChange={set('author')} autoComplete="off" disabled={saving} />
      </FormField>

      {duplicate && (
        <p role="status" className="rounded-md border border-attention/40 bg-attention/10 p-3 text-sm">
          A book with this title and author already exists (
          <Link to={`/books/${duplicate.id}`} className="font-mono underline underline-offset-4">{duplicate.id}</Link>
          ). You can still save it, for example if you own two copies.
        </p>
      )}

      <FormField label="Purchase date" error={errors.purchaseDate}>
        <Input type="date" value={values.purchaseDate} onChange={set('purchaseDate')} disabled={saving} />
      </FormField>
      <div className="grid gap-5 sm:grid-cols-2">
        <FormField label={`Price paid (${config.currency})`} error={errors.pricePaid}>
          <Input inputMode="decimal" value={values.pricePaid} onChange={set('pricePaid')} disabled={saving} className="font-mono" />
        </FormField>
        <FormField label={`Market price (${config.currency})`} error={errors.marketPrice}>
          <Input inputMode="decimal" value={values.marketPrice} onChange={set('marketPrice')} disabled={saving} className="font-mono" />
        </FormField>
      </div>

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">Cover photo</legend>
        <PhotoField book={{ title: values.title || 'this book', photoUrl: book?.photoUrl }} value={photo} onChange={setPhoto} />
      </fieldset>

      {saveError && (
        <p role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm">
          {saveError}
        </p>
      )}

      <div className="flex gap-2">
        <Button type="submit" disabled={saving}>{saving ? 'Saving…' : book ? 'Save changes' : 'Save book'}</Button>
        <Button type="button" variant="ghost" onClick={cancel} disabled={saving}>Cancel</Button>
      </div>
    </form>
  )
}

function BackLink({ to, label }: { to: string; label: string }) {
  return (
    <Link to={to} className="inline-flex items-center gap-1 text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">
      <ArrowLeft className="size-4" aria-hidden /> {label}
    </Link>
  )
}

/** `/books/new`: a blank form. */
export function AddBookPage() {
  return (
    <div className="space-y-4">
      <BackLink to="/" label="Books" />
      <BookForm />
    </div>
  )
}

/** `/books/:id/edit`: the form for an existing book, once the library has loaded. */
export function EditBookPage() {
  const { id = '' } = useParams()
  const book = useAppSelector((s) => booksSelectors.selectById(s, id))
  const libraryStatus = useAppSelector((s) => s.library.status)
  if (!book) {
    const loading = libraryStatus === 'idle' || libraryStatus === 'loading'
    return (
      <div className="space-y-4">
        <BackLink to="/" label="Books" />
        {loading ? (
          <p role="status" className="text-muted-foreground">Loading your library…</p>
        ) : (
          <p role="alert">
            Book <span className="font-mono">{id}</span> was not found.
          </p>
        )}
      </div>
    )
  }
  return (
    <div className="space-y-4">
      <BackLink to={`/books/${book.id}`} label={book.title} />
      <BookForm key={book.id} book={book} />
    </div>
  )
}
