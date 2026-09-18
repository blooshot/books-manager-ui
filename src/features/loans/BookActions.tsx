import { RotateCcw, UserPlus } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { BorrowDialog } from '@/features/loans/BorrowDialog'
import { LoanFormError } from '@/features/loans/LoanFormError'
import { describeLoanError } from '@/features/loans/loanForm'
import { ReturnDialog } from '@/features/loans/ReturnDialog'
import { useAppDispatch } from '@/store/hooks'
import { returnBook } from '@/store/libraryThunks'
import type { Book, Loan } from '@/types/library'

/**
 * What can be done with a book right now: borrow it if it is available; if it is out, return it in one tap
 * (date and time = now) or record an earlier return. There is no delete anywhere (ADR-0004).
 */
export function BookActions({ book, openLoan }: { book: Book; openLoan?: Loan }) {
  const dispatch = useAppDispatch()
  const [borrowOpen, setBorrowOpen] = useState(false)
  // The loan being returned is remembered when the dialog opens: the optimistic update changes `openLoan` while
  // the request is in flight, and the dialog (with its state and any error) must not vanish or reappear blank.
  const [returnTarget, setReturnTarget] = useState<Loan | null>(null)
  const [returning, setReturning] = useState(false)
  const [failure, setFailure] = useState<{ message: string; stale: boolean } | null>(null)

  async function returnNow() {
    setFailure(null)
    setReturning(true)
    try {
      await dispatch(returnBook({ bookId: book.id })).unwrap()
    } catch (error) {
      setFailure(describeLoanError(error as { name?: string; message?: string }))
    } finally {
      setReturning(false)
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {openLoan ? (
          <>
            <Button onClick={() => void returnNow()} disabled={returning}>
              <RotateCcw aria-hidden />
              {returning ? 'Returning…' : 'Mark returned'}
            </Button>
            <Button variant="ghost" onClick={() => setReturnTarget(openLoan)} disabled={returning}>
              Returned earlier…
            </Button>
          </>
        ) : (
          <Button onClick={() => setBorrowOpen(true)}>
            <UserPlus aria-hidden />
            Borrow
          </Button>
        )}
      </div>
      <LoanFormError failure={failure} />
      <BorrowDialog book={book} open={borrowOpen} onOpenChange={setBorrowOpen} />
      {returnTarget && (
        <ReturnDialog book={book} loan={returnTarget} open onOpenChange={(open) => !open && setReturnTarget(null)} />
      )}
    </div>
  )
}
