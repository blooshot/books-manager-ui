import { Link } from 'react-router'
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion'
import { Badge } from '@/components/ui/badge'
import { CoverImage } from '@/features/covers/CoverImage'
import { useAppSelector } from '@/store/hooks'
import { selectLentOutByBorrower } from '@/store/selectors'

/** Who currently has which books, grouped by borrower (one group open at a time), oldest loans first. */
export function LentOutPage() {
  const groups = useAppSelector(selectLentOutByBorrower)
  const library = useAppSelector((s) => s.library)
  const bookCount = groups.reduce((total, group) => total + group.items.length, 0)
  const loading = library.status === 'idle' || library.status === 'loading'

  return (
    <section aria-labelledby="lent-out-heading" className="space-y-4">
      <h1 id="lent-out-heading" className="font-display text-xl font-bold">Lent out</h1>

      {library.status === 'error' && (
        <p role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm">{library.error}</p>
      )}
      {loading && groups.length === 0 && <p role="status" className="text-muted-foreground">Loading your library…</p>}
      {library.status === 'ready' && groups.length === 0 && <p className="text-muted-foreground">Nothing is lent out right now.</p>}

      {groups.length > 0 && (
        <>
          <p className="text-sm text-muted-foreground" aria-live="polite">
            <span className="font-mono">{bookCount}</span> {bookCount === 1 ? 'book' : 'books'} lent to <span className="font-mono">{groups.length}</span>{' '}
            {groups.length === 1 ? 'person' : 'people'}
          </p>
          <Accordion type="single" collapsible defaultValue={groups[0].borrowerName} className="rounded-lg border bg-card px-4">
            {groups.map((group) => (
              <AccordionItem key={group.borrowerName} value={group.borrowerName}>
                <AccordionTrigger>
                  <span>{group.borrowerName}</span>
                  <Badge variant="neutral" className="ml-auto">
                    {group.items.length} {group.items.length === 1 ? 'book' : 'books'}
                  </Badge>
                </AccordionTrigger>
                <AccordionContent>
                  <ul className="space-y-3">
                    {group.items.map(({ book, loan }) => (
                      <li key={loan.key}>
                        <Link to={`/books/${book.id}`} className="flex gap-3 rounded-md p-1 transition-colors hover:bg-accent">
                          <CoverImage book={book} variant="thumb" className="w-12 shrink-0" />
                          <span className="flex min-w-0 flex-col gap-0.5">
                            <span className="truncate font-medium">{book.title}</span>
                            <span className="truncate text-sm text-muted-foreground">{book.author}</span>
                            <span className="text-xs text-muted-foreground">
                              since <span className="font-mono">{loan.borrowedDate} {loan.borrowedTime}</span>
                              {loan.place && <> · {loan.place}</>}
                            </span>
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </>
      )}
    </section>
  )
}
