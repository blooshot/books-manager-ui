import { useId, useState, type FormEvent } from 'react'
import { FormField } from '@/components/FormField'
import { Button } from '@/components/ui/button'
import { ResponsiveDialog } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { LoanFormError } from '@/features/loans/LoanFormError'
import {
  defaultDateTime,
  describeLoanError,
  pastBorrowerNames,
  validateBorrowForm,
  type BorrowFormValues,
} from '@/features/loans/loanForm'
import { clock } from '@/lib/clock'
import { useAppDispatch, useAppSelector } from '@/store/hooks'
import { borrowBook } from '@/store/libraryThunks'
import { loansSelectors } from '@/store/selectors'
import type { Book } from '@/types/library'

function BorrowForm({ book, onDone }: { book: Book; onDone: () => void }) {
  const dispatch = useAppDispatch()
  const listId = useId()
  const loans = useAppSelector(loansSelectors.selectAll)
  const suggestions = pastBorrowerNames(loans)
  const [values, setValues] = useState<BorrowFormValues>(() => ({ borrowerName: '', place: '', ...defaultDateTime(clock.now()) }))
  const [attempted, setAttempted] = useState(false)
  const [saving, setSaving] = useState(false)
  const [failure, setFailure] = useState<{ message: string; stale: boolean } | null>(null)

  const errors = attempted ? validateBorrowForm(values) : {}
  const set = (field: keyof BorrowFormValues) => (event: { target: { value: string } }) =>
    setValues((current) => ({ ...current, [field]: event.target.value }))

  async function submit(event: FormEvent) {
    event.preventDefault()
    setAttempted(true)
    setFailure(null)
    if (Object.keys(validateBorrowForm(values)).length > 0) return
    setSaving(true)
    try {
      await dispatch(
        borrowBook({
          bookId: book.id,
          borrowerName: values.borrowerName.trim(),
          place: values.place.trim(),
          borrowedDate: values.date,
          borrowedTime: values.time,
        }),
      ).unwrap()
      onDone()
    } catch (error) {
      setFailure(describeLoanError(error as { name?: string; message?: string }))
      setSaving(false)
    }
  }

  return (
    <form onSubmit={(event) => void submit(event)} noValidate className="space-y-4">
      <FormField label="Borrower" required error={errors.borrowerName}>
        <Input list={listId} value={values.borrowerName} onChange={set('borrowerName')} autoComplete="off" disabled={saving} />
      </FormField>
      <datalist id={listId}>
        {suggestions.map((name) => (
          <option key={name} value={name} />
        ))}
      </datalist>
      <div className="grid grid-cols-2 gap-4">
        <FormField label="Date" error={errors.date}>
          <Input type="date" value={values.date} onChange={set('date')} disabled={saving} />
        </FormField>
        <FormField label="Time" error={errors.time}>
          <Input type="time" value={values.time} onChange={set('time')} disabled={saving} />
        </FormField>
      </div>
      <FormField label="Place" hint="Optional: where the book goes, e.g. Office.">
        <Input value={values.place} onChange={set('place')} autoComplete="off" disabled={saving} />
      </FormField>
      <LoanFormError failure={failure} onRefreshed={onDone} />
      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="ghost" onClick={onDone} disabled={saving}>Cancel</Button>
        <Button type="submit" disabled={saving}>{saving ? 'Saving…' : 'Borrow'}</Button>
      </div>
    </form>
  )
}

/** Record that someone borrowed the book. Dialog on desktop, bottom sheet on phones. */
export function BorrowDialog({ book, open, onOpenChange }: { book: Book; open: boolean; onOpenChange: (open: boolean) => void }) {
  return (
    <ResponsiveDialog open={open} onOpenChange={onOpenChange} title="Borrow this book" description={`Who is borrowing “${book.title}”, and when.`}>
      <BorrowForm book={book} onDone={() => onOpenChange(false)} />
    </ResponsiveDialog>
  )
}
