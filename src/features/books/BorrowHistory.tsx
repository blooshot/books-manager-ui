import { sortLoansNewestFirst } from '@/features/books/bookList'
import { cn } from '@/lib/utils'
import type { Loan } from '@/types/library'

/** A book's loans as an activity feed: a dot per loan (returned = success, still out = neutral). */
export function BorrowHistory({ loans }: { loans: Loan[] }) {
  if (loans.length === 0) return <p className="text-muted-foreground">This book has never been borrowed.</p>
  return (
    <ol className="space-y-4 border-l pl-4">
      {sortLoansNewestFirst(loans).map((loan) => {
        const returned = Boolean(loan.returnedDate)
        return (
          <li key={loan.key} className="relative text-sm">
            <span
              aria-hidden
              className={cn('absolute top-1.5 -left-[1.4rem] size-2.5 rounded-full', returned ? 'bg-success' : 'bg-muted-foreground')}
            />
            <p>
              <span className="font-medium">{loan.borrowerName}</span>
              {loan.place && <span className="text-muted-foreground"> · {loan.place}</span>}
            </p>
            <p className="text-muted-foreground">
              Borrowed <span className="font-mono">{loan.borrowedDate} {loan.borrowedTime}</span>
            </p>
            <p className="text-muted-foreground">
              {returned ? (
                <>
                  Returned <span className="font-mono">{loan.returnedDate}{loan.returnedTime ? ` ${loan.returnedTime}` : ''}</span>
                </>
              ) : (
                <span className="font-medium text-foreground">Still out</span>
              )}
            </p>
          </li>
        )
      })}
    </ol>
  )
}
