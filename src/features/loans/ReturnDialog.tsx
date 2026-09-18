import { useState, type FormEvent } from 'react'
import { FormField } from '@/components/FormField'
import { Button } from '@/components/ui/button'
import { ResponsiveDialog } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { LoanFormError } from '@/features/loans/LoanFormError'
import { defaultDateTime, describeLoanError, validateReturnForm, type ReturnFormValues } from '@/features/loans/loanForm'
import { clock } from '@/lib/clock'
import { useAppDispatch } from '@/store/hooks'
import { returnBook } from '@/store/libraryThunks'
import type { Book, Loan } from '@/types/library'

function ReturnForm({ book, loan, onDone }: { book: Book; loan: Loan; onDone: () => void }) {
  const dispatch = useAppDispatch()
  const [values, setValues] = useState<ReturnFormValues>(() => defaultDateTime(clock.now()))
  const [attempted, setAttempted] = useState(false)
  const [saving, setSaving] = useState(false)
  const [failure, setFailure] = useState<{ message: string; stale: boolean } | null>(null)

  const errors = attempted ? validateReturnForm(values, loan) : {}
  const set = (field: keyof ReturnFormValues) => (event: { target: { value: string } }) =>
    setValues((current) => ({ ...current, [field]: event.target.value }))

  async function submit(event: FormEvent) {
    event.preventDefault()
    setAttempted(true)
    setFailure(null)
    if (Object.keys(validateReturnForm(values, loan)).length > 0) return
    setSaving(true)
    try {
      await dispatch(returnBook({ bookId: book.id, returnedDate: values.date, returnedTime: values.time })).unwrap()
      onDone()
    } catch (error) {
      setFailure(describeLoanError(error as { name?: string; message?: string }))
      setSaving(false)
    }
  }

  return (
    <form onSubmit={(event) => void submit(event)} noValidate className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <FormField label="Date returned" error={errors.date}>
          <Input type="date" value={values.date} onChange={set('date')} disabled={saving} />
        </FormField>
        <FormField label="Time returned" error={errors.time}>
          <Input type="time" value={values.time} onChange={set('time')} disabled={saving} />
        </FormField>
      </div>
      <LoanFormError failure={failure} onRefreshed={onDone} />
      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="ghost" onClick={onDone} disabled={saving}>Cancel</Button>
        <Button type="submit" disabled={saving}>{saving ? 'Saving…' : 'Mark returned'}</Button>
      </div>
    </form>
  )
}

/** Record a return with a date and time other than now (the one-tap button covers "just now"). */
export function ReturnDialog({ book, loan, open, onOpenChange }: { book: Book; loan: Loan; open: boolean; onOpenChange: (open: boolean) => void }) {
  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Return this book"
      description={`“${book.title}” was borrowed by ${loan.borrowerName} on ${loan.borrowedDate} at ${loan.borrowedTime}.`}
    >
      <ReturnForm book={book} loan={loan} onDone={() => onOpenChange(false)} />
    </ResponsiveDialog>
  )
}
