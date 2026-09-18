import { Plus, Search } from 'lucide-react'
import { useMemo } from 'react'
import { Link, useSearchParams } from 'react-router'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { CoverImage } from '@/features/covers/CoverImage'
import {
  filterBookItems,
  groupBooksByCategory,
  parseSort,
  parseStatus,
  selectBookListItems,
  sortBookItems,
  SORT_ORDERS,
  STATUS_FILTERS,
  visibleCategories,
  type BookListItem,
  type SortOrder,
  type StatusFilter,
} from '@/features/books/bookList'
import { StatusBadge } from '@/features/books/StatusBadge'
import { formatMoney } from '@/lib/format'
import { useIsDesktop } from '@/lib/useMediaQuery'
import { useAppDispatch, useAppSelector } from '@/store/hooks'
import { loadAll } from '@/store/libraryThunks'
import { selectActiveCategories, selectActiveLanguages } from '@/store/selectors'

function BorrowedBy({ item }: { item: BookListItem }) {
  if (!item.openLoan) return null
  return (
    <span className="text-xs text-muted-foreground">
      {item.openLoan.borrowerName} · since <span className="font-mono">{item.openLoan.borrowedDate}</span>
    </span>
  )
}

/** The names as options; a name from the URL that is no longer active stays selectable so the filter still shows what it is doing. */
function namesWith(names: readonly string[], current: string): { value: string; label: string }[] {
  return [...new Set([...names, ...(current ? [current] : [])])].map((name) => ({ value: name, label: name }))
}

/** "Hindi · Business, Self-help": language, then the book's active categories. Nothing when it has neither. */
function BookTags({ item, activeCategories }: { item: BookListItem; activeCategories: readonly string[] }) {
  const parts = [item.book.language, ...visibleCategories(item.book, activeCategories)].filter(Boolean)
  if (parts.length === 0) return null
  return <span className="truncate text-xs text-muted-foreground">{parts.join(' · ')}</span>
}

/** Desktop: product-style tiles. The cover fills the top, then title, author, prices and status. */
function BookGrid({ items, label, activeCategories }: { items: BookListItem[]; label: string; activeCategories: readonly string[] }) {
  return (
    <ul aria-label={label} className="grid grid-cols-3 gap-4 lg:grid-cols-4">
      {items.map((item) => {
        const { book } = item
        return (
          <li key={book.id}>
            <Link
              to={`/books/${book.id}`}
              className="flex h-full flex-col overflow-hidden rounded-lg border bg-card transition duration-150 hover:-translate-y-0.5 hover:border-primary hover:shadow-md focus-visible:border-primary motion-reduce:transition-none motion-reduce:hover:translate-y-0"
            >
              <div className="flex h-60 items-center justify-center bg-secondary/40 p-3">
                <CoverImage book={book} variant="thumb" className="h-full w-auto max-w-full" />
              </div>
              <div className="flex flex-1 flex-col gap-1 p-3">
                <span className="line-clamp-2 font-medium">{book.title}</span>
                <span className="truncate text-sm text-muted-foreground">{book.author}</span>
                <BookTags item={item} activeCategories={activeCategories} />
                {(book.marketPrice !== undefined || book.pricePaid !== undefined) && (
                  <div className="mt-1 flex flex-wrap items-baseline gap-x-2">
                    {book.marketPrice !== undefined && <span className="font-mono font-medium">{formatMoney(book.marketPrice)}</span>}
                    {book.pricePaid !== undefined && (
                      <span className="font-mono text-xs text-muted-foreground">Paid {formatMoney(book.pricePaid)}</span>
                    )}
                  </div>
                )}
                {book.purchaseDate && <span className="font-mono text-xs text-muted-foreground">Bought {book.purchaseDate}</span>}
                <div className="mt-auto flex flex-col items-start gap-1 pt-2">
                  <StatusBadge borrowed={Boolean(item.openLoan)} />
                  <BorrowedBy item={item} />
                </div>
              </div>
            </Link>
          </li>
        )
      })}
    </ul>
  )
}

function BookCards({ items, label, activeCategories }: { items: BookListItem[]; label: string; activeCategories: readonly string[] }) {
  return (
    <ul aria-label={label} className="grid gap-3">
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
              <BookTags item={item} activeCategories={activeCategories} />
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
  const sort = parseSort(params.get('sort'))
  const category = params.get('category') ?? ''
  const language = params.get('language') ?? ''
  const grouped = params.get('group') === 'category'
  const categories = useAppSelector(selectActiveCategories)
  const languages = useAppSelector(selectActiveLanguages)
  const visible = useMemo(
    () => sortBookItems(filterBookItems(items, { query, status, category, language }), sort),
    [items, query, status, category, language, sort],
  )
  const groups = useMemo(() => (grouped ? groupBooksByCategory(visible, categories) : []), [grouped, visible, categories])

  function update(next: { q?: string; status?: StatusFilter; sort?: SortOrder; category?: string; language?: string; group?: boolean }) {
    const updated = new URLSearchParams(params)
    const q = next.q ?? query
    const st = next.status ?? status
    const so = next.sort ?? sort
    if (q) updated.set('q', q)
    else updated.delete('q')
    if (st !== 'all') updated.set('status', st)
    else updated.delete('status')
    if (so !== 'title') updated.set('sort', so)
    else updated.delete('sort')
    const setOrDelete = (key: string, value: string) => (value ? updated.set(key, value) : updated.delete(key))
    setOrDelete('category', next.category ?? category)
    setOrDelete('language', next.language ?? language)
    setOrDelete('group', (next.group ?? grouped) ? 'category' : '')
    setParams(updated, { replace: true })
  }

  const loading = library.status === 'idle' || library.status === 'loading'

  return (
    <section aria-labelledby="books-heading" className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h1 id="books-heading" className="font-display text-xl font-bold">Books</h1>
        {/* On desktop "Add book" lives in the header menu. */}
        {!isDesktop && (
          <Button asChild size="sm">
            <Link to="/books/new">
              <Plus aria-hidden />
              Add book
            </Link>
          </Button>
        )}
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
        <div className="flex items-center gap-2">
          <label htmlFor="book-sort" className="text-sm text-muted-foreground">Sort by</label>
          <Select id="book-sort" value={sort} onValueChange={(next) => update({ sort: parseSort(next) })} options={SORT_ORDERS} className="flex-1 sm:w-56 sm:flex-none" />
        </div>
      </div>

      {(categories.length > 0 || languages.length > 0 || category || language) && (
        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
          {(categories.length > 0 || category) && (
            <div className="flex items-center gap-2">
              <label htmlFor="book-category" className="text-sm text-muted-foreground">Category</label>
              <Select
                id="book-category"
                value={category}
                onValueChange={(next) => update({ category: next })}
                options={[{ value: '', label: 'All categories' }, ...namesWith(categories, category)]}
                className="flex-1 sm:w-48 sm:flex-none"
              />
            </div>
          )}
          {(languages.length > 0 || language) && (
            <div className="flex items-center gap-2">
              <label htmlFor="book-language" className="text-sm text-muted-foreground">Language</label>
              <Select
                id="book-language"
                value={language}
                onValueChange={(next) => update({ language: next })}
                options={[{ value: '', label: 'All languages' }, ...namesWith(languages, language)]}
                className="flex-1 sm:w-44 sm:flex-none"
              />
            </div>
          )}
          {categories.length > 0 && (
            <Button size="sm" variant={grouped ? 'default' : 'outline'} aria-pressed={grouped} onClick={() => update({ group: !grouped })}>
              Group by category
            </Button>
          )}
        </div>
      )}

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
          {grouped ? (
            groups.map((group) => (
              <section key={group.name} aria-labelledby={`group-${group.name}`} className="space-y-3">
                <h2 id={`group-${group.name}`} className="font-display text-lg font-bold">
                  {group.name} <span className="font-mono text-sm font-normal text-muted-foreground">{group.items.length}</span>
                </h2>
                {isDesktop ? (
                  <BookGrid items={group.items} label={`Books in ${group.name}`} activeCategories={categories} />
                ) : (
                  <BookCards items={group.items} label={`Books in ${group.name}`} activeCategories={categories} />
                )}
              </section>
            ))
          ) : isDesktop ? (
            <BookGrid items={visible} label="Books" activeCategories={categories} />
          ) : (
            <BookCards items={visible} label="Books" activeCategories={categories} />
          )}
        </>
      )}
    </section>
  )
}
