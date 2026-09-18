import { ArrowLeft, Pencil } from 'lucide-react'
import { useMemo } from 'react'
import { Link, useParams } from 'react-router'
import { Button } from '@/components/ui/button'
import { visibleCategories } from '@/features/books/bookList'
import { ArchivedBanner, DeleteBookControl } from '@/features/books/DeleteBookControl'
import { BorrowHistory } from '@/features/books/BorrowHistory'
import { StatusBadge } from '@/features/books/StatusBadge'
import { BookActions } from '@/features/loans/BookActions'
import { CoverImage } from '@/features/covers/CoverImage'
import { formatTimestamp } from '@/lib/datetime'
import { formatMoney } from '@/lib/format'
import { useAppSelector } from '@/store/hooks'
import { booksSelectors, loansSelectors, selectActiveCategories, selectOpenLoanByBookId } from '@/store/selectors'

function BackLink() {
  return (
    <Link to="/" className="inline-flex items-center gap-1 text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">
      <ArrowLeft className="size-4" aria-hidden /> Books
    </Link>
  )
}

function Field({ label, children, mono }: { label: string; children: React.ReactNode; mono?: boolean }) {
  return (
    <div className="grid grid-cols-[9rem_1fr] gap-2 border-b py-2 text-sm last:border-b-0">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={mono ? 'font-mono' : undefined}>{children}</dd>
    </div>
  )
}

export function BookDetailPage() {
  const { id = '' } = useParams()
  const book = useAppSelector((s) => booksSelectors.selectById(s, id))
  const openLoan = useAppSelector((s) => selectOpenLoanByBookId(s).get(id))
  const allLoans = useAppSelector(loansSelectors.selectAll)
  const libraryStatus = useAppSelector((s) => s.library.status)
  const activeCategories = useAppSelector(selectActiveCategories)
  const loans = useMemo(() => allLoans.filter((loan) => loan.bookId === id), [allLoans, id])

  if (!book) {
    const loading = libraryStatus === 'idle' || libraryStatus === 'loading'
    return (
      <div className="space-y-4">
        <BackLink />
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
    <article aria-labelledby="book-title" className="space-y-6">
      <BackLink />
      <div className="flex flex-col gap-6 sm:flex-row">
        <CoverImage book={book} variant="full" className="w-40 shrink-0 self-start sm:w-48" />
        <div className="min-w-0 flex-1 space-y-3">
          <div className="space-y-2">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <h1 id="book-title" className="font-display text-2xl font-bold">{book.title}</h1>
              {!book.archived && (
                <Button asChild size="sm" variant="outline">
                  <Link to={`/books/${book.id}/edit`}>
                    <Pencil aria-hidden />
                    Edit
                  </Link>
                </Button>
              )}
            </div>
            <p className="text-muted-foreground">{book.author}</p>
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge borrowed={Boolean(openLoan)} />
              {openLoan && (
                <span className="text-sm text-muted-foreground">
                  with {openLoan.borrowerName} since <span className="font-mono">{openLoan.borrowedDate}</span>
                </span>
              )}
            </div>
          </div>
          {!book.archived && <BookActions book={book} openLoan={openLoan} />}
          <DeleteBookControl book={book} openLoan={openLoan} />
          <ArchivedBanner book={book} />
          <dl>
            <Field label="Book ID" mono>{book.id}</Field>
            <Field label="Categories">{visibleCategories(book, activeCategories).join(', ') || '—'}</Field>
            <Field label="Language">{book.language ?? '—'}</Field>
            <Field label="Purchase date" mono>{book.purchaseDate ?? '—'}</Field>
            <Field label="Price paid" mono>{formatMoney(book.pricePaid)}</Field>
            <Field label="Market price" mono>{formatMoney(book.marketPrice)}</Field>
            <Field label="Added" mono>{book.addedAt ? formatTimestamp(book.addedAt) : '—'}</Field>
          </dl>
        </div>
      </div>
      <section aria-labelledby="history-heading" className="space-y-3">
        <h2 id="history-heading" className="font-display text-lg font-bold">Borrow history</h2>
        <BorrowHistory loans={loans} />
      </section>
    </article>
  )
}
