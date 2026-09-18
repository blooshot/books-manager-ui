import { Plus, Search } from 'lucide-react'
import { useMemo } from 'react'
import { Link, useSearchParams } from 'react-router'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { CoverImage } from '@/features/covers/CoverImage'
import { filterBookItems, parseStatus, selectBookListItems, STATUS_FILTERS, type BookListItem, type StatusFilter } from '@/features/books/bookList'
import { StatusBadge } from '@/features/books/StatusBadge'
import { useIsDesktop } from '@/lib/useMediaQuery'
import { useAppDispatch, useAppSelector } from '@/store/hooks'
import { loadAll } from '@/store/libraryThunks'

function BorrowedBy({ item }: { item: BookListItem }) {
  if (!item.openLoan) return null
  return (
    <span className="text-xs text-muted-foreground">
      {item.openLoan.borrowerName} · since <span className="font-mono">{item.openLoan.borrowedDate}</span>
    </span>
  )
}

function BookTable({ items }: { items: BookListItem[] }) {
  return (
    <table className="w-full text-left text-sm">
      <thead className="text-xs text-muted-foreground">
        <tr>
          <th scope="col" className="w-16 py-2 pr-3 font-medium"><span className="sr-only">Cover</span></th>
          <th scope="col" className="py-2 pr-3 font-medium">Title</th>
          <th scope="col" className="py-2 pr-3 font-medium">Author</th>
          <th scope="col" className="py-2 pr-3 font-medium">Book ID</th>
          <th scope="col" className="py-2 font-medium">Status</th>
        </tr>
      </thead>
      <tbody>
        {items.map((item) => (
          <tr key={item.book.id} className="border-t transition-colors hover:bg-accent/60">
            <td className="py-2 pr-3"><CoverImage book={item.book} variant="thumb" className="w-10" /></td>
            <td className="py-2 pr-3">
              <Link to={`/books/${item.book.id}`} className="font-medium underline-offset-4 hover:underline focus-visible:underline">
                {item.book.title}
              </Link>
            </td>
            <td className="py-2 pr-3 text-muted-foreground">{item.book.author}</td>
            <td className="py-2 pr-3 font-mono text-xs">{item.book.id}</td>
            <td className="py-2">
              <div className="flex flex-col items-start gap-1">
                <StatusBadge borrowed={Boolean(item.openLoan)} />
                <BorrowedBy item={item} />
              </div>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function BookCards({ items }: { items: BookListItem[] }) {
  return (
    <ul aria-label="Books" className="grid gap-3">
      {items.map((item) => (
        <li key={item.book.id}>
          <Link
            to={`/books/${item.book.id}`}
            className="flex gap-3 rounded-lg border bg-card p-3 transition duration-150 hover:-translate-y-0.5 hover:border-primary hover:shadow-md motion-reduce:transition-none motion-reduce:hover:translate-y-0"
          >
            <CoverImage book={item.book} variant="thumb" className="w-16 shrink-0" />
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <span className="truncate font-medium">{item.book.title}</span>
              <span className="truncate text-sm text-muted-foreground">{item.book.author}</span>
              <span className="font-mono text-xs text-muted-foreground">{item.book.id}</span>
              <div className="mt-1 flex flex-col items-start gap-1">
                <StatusBadge borrowed={Boolean(item.openLoan)} />
                <BorrowedBy item={item} />
              </div>
            </div>
          </Link>
        </li>
      ))}
    </ul>
  )
}

export function BookListPage() {
  const dispatch = useAppDispatch()
  const isDesktop = useIsDesktop()
  const library = useAppSelector((s) => s.library)
  const items = useAppSelector(selectBookListItems)
  const [params, setParams] = useSearchParams()

  // Search and filter live in the URL, so going back from a book keeps them.
  const query = params.get('q') ?? ''
  const status = parseStatus(params.get('status'))
  const visible = useMemo(() => filterBookItems(items, { query, status }), [items, query, status])

  function update(next: { q?: string; status?: StatusFilter }) {
    const updated = new URLSearchParams(params)
    const q = next.q ?? query
    const st = next.status ?? status
    if (q) updated.set('q', q)
    else updated.delete('q')
    if (st !== 'all') updated.set('status', st)
    else updated.delete('status')
    setParams(updated, { replace: true })
  }

  const loading = library.status === 'idle' || library.status === 'loading'

  return (
    <section aria-labelledby="books-heading" className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h1 id="books-heading" className="font-display text-xl font-bold">Books</h1>
        <Button asChild size="sm">
          <Link to="/books/new">
            <Plus aria-hidden />
            Add book
          </Link>
        </Button>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <label htmlFor="book-search" className="sr-only">Search books by title, author or ID</label>
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input
            id="book-search"
            type="search"
            value={query}
            onChange={(event) => update({ q: event.target.value })}
            placeholder="Search title, author or ID"
            className="pl-9"
          />
        </div>
        <div role="group" aria-label="Filter by status" className="flex gap-1">
          {STATUS_FILTERS.map((filter) => (
            <Button
              key={filter.value}
              size="sm"
              variant={status === filter.value ? 'default' : 'outline'}
              aria-pressed={status === filter.value}
              onClick={() => update({ status: filter.value })}
            >
              {filter.label}
            </Button>
          ))}
        </div>
      </div>

      {library.status === 'error' && (
        <div role="alert" className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm">
          <span>{library.error}</span>
          <Button size="sm" variant="outline" onClick={() => void dispatch(loadAll())}>Try again</Button>
        </div>
      )}

      {loading && items.length === 0 && (
        <p role="status" className="text-muted-foreground">Loading your library…</p>
      )}
      {library.status === 'ready' && items.length === 0 && (
        <p className="text-muted-foreground">Your library is empty.</p>
      )}
      {items.length > 0 && visible.length === 0 && (
        <div className="space-y-2">
          <p className="text-muted-foreground">No books match your search.</p>
          <Button size="sm" variant="ghost" onClick={() => setParams({}, { replace: true })}>Clear search and filter</Button>
        </div>
      )}
      {visible.length > 0 && (
        <>
          <p className="text-sm text-muted-foreground" aria-live="polite">
            <span className="font-mono">{visible.length}</span> of <span className="font-mono">{items.length}</span> books
          </p>
          {isDesktop ? <BookTable items={visible} /> : <BookCards items={visible} />}
        </>
      )}
    </section>
  )
}
