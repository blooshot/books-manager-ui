import { screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { bookRow, loanRow } from '@/test/fixtures'
import { FakeSheets } from '@/test/fakeSheets'
import { renderApp } from '@/test/render'

const PHOTO = 'https://drive.google.com/file/d/1aBcDeFgHiJkLmNoPqRsTuVwXyZ123456/view?usp=drivesdk'

function libraryWithThreeBooks() {
  const sheets = new FakeSheets()
  sheets.tabs.Books.push(
    bookRow({ id: 'B-0001', title: 'Dune', author: 'Frank Herbert', photo: PHOTO }),
    bookRow({ id: 'B-0002', title: 'emma', author: 'Jane Austen' }),
    bookRow({ id: 'B-0003', title: 'Anathem', author: 'Neal Stephenson' }),
  )
  sheets.tabs.Borrowers.push(loanRow({ bookId: 'B-0002', borrower: 'Ravi', date: '2026-02-01' }))
  return sheets
}

const location = () => screen.getByTestId('location').textContent

describe('book list (phone: cards)', () => {
  it('loads the library after sign-in and lists books sorted by title, with status', async () => {
    renderApp({ sheets: libraryWithThreeBooks() })
    await screen.findByText('Dune')
    const list = screen.getByRole('list', { name: 'Books' })
    const cards = within(list).getAllByRole('link')
    expect(cards.map((c) => within(c).getByText(/^(Anathem|Dune|emma)$/).textContent)).toEqual(['Anathem', 'Dune', 'emma'])
    expect(within(cards[1]).getByText('Available')).toBeInTheDocument()
    expect(within(cards[2]).getByText('Borrowed')).toBeInTheDocument()
    expect(within(cards[2]).getByText(/Ravi/)).toBeInTheDocument()
    expect(within(cards[2]).getByText('2026-02-01')).toBeInTheDocument()
    expect(screen.getByText(/of/, { selector: 'p' })).toHaveTextContent('3 of 3 books')
  })

  it('links each book to its detail page', async () => {
    renderApp({ sheets: libraryWithThreeBooks() })
    const dune = (await screen.findByText('Dune')).closest('a')
    expect(dune).toHaveAttribute('href', '/books/B-0001')
  })

  it('shows the cover for a book with a photo and a placeholder for one without', async () => {
    renderApp({ sheets: libraryWithThreeBooks() })
    const img = await screen.findByRole('img', { name: 'Cover of Dune' })
    expect(img).toHaveAttribute('src', 'blob:cover/1aBcDeFgHiJkLmNoPqRsTuVwXyZ123456/thumb')
    expect(screen.getByRole('img', { name: 'No cover for emma' })).toHaveTextContent('E')
  })
})

describe('book list (desktop: table)', () => {
  it('renders a table with the columns and one row per book', async () => {
    renderApp({ sheets: libraryWithThreeBooks(), viewport: 'desktop' })
    const table = await screen.findByRole('table')
    expect(within(table).getAllByRole('columnheader').map((h) => h.textContent)).toEqual(['Cover', 'Title', 'Author', 'Book ID', 'Status'])
    const rows = within(table).getAllByRole('row').slice(1)
    expect(rows).toHaveLength(3)
    expect(within(rows[0]).getByRole('link', { name: 'Anathem' })).toHaveAttribute('href', '/books/B-0003')
    expect(within(rows[2]).getByText('Borrowed')).toBeInTheDocument()
  })
})

describe('search and filter', () => {
  it('filters as you type and keeps the search in the URL', async () => {
    const { user } = renderApp({ sheets: libraryWithThreeBooks() })
    await screen.findByText('Dune')
    await user.type(screen.getByRole('searchbox', { name: /search books/i }), 'austen')
    expect(screen.queryByText('Dune')).not.toBeInTheDocument()
    expect(screen.getByText('emma')).toBeInTheDocument()
    expect(location()).toBe('/?q=austen')
  })

  it('starts from the URL, so a shared or restored link shows the same results', async () => {
    renderApp({ sheets: libraryWithThreeBooks(), route: '/?q=dune&status=available' })
    await screen.findByText('Dune')
    expect(screen.getByRole('searchbox')).toHaveValue('dune')
    expect(screen.getByRole('button', { name: 'Available' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.queryByText('emma')).not.toBeInTheDocument()
  })

  it('filters by status with pressed-state buttons', async () => {
    const { user } = renderApp({ sheets: libraryWithThreeBooks() })
    await screen.findByText('Dune')
    await user.click(screen.getByRole('button', { name: 'Borrowed' }))
    expect(screen.getByText('emma')).toBeInTheDocument()
    expect(screen.queryByText('Dune')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Borrowed' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'All' })).toHaveAttribute('aria-pressed', 'false')
    expect(location()).toBe('/?status=borrowed')
    await user.click(screen.getByRole('button', { name: 'All' }))
    expect(location()).toBe('/')
  })

  it('the Available filter hides borrowed books', async () => {
    const { user } = renderApp({ sheets: libraryWithThreeBooks() })
    await screen.findByText('Dune')
    await user.click(screen.getByRole('button', { name: 'Available' }))
    expect(screen.getByText('Dune')).toBeInTheDocument()
    expect(screen.getByText('Anathem')).toBeInTheDocument()
    expect(screen.queryByText('emma')).not.toBeInTheDocument()
    expect(location()).toBe('/?status=available')
  })

  it('says so when nothing matches, and clears the filters on request', async () => {
    const { user } = renderApp({ sheets: libraryWithThreeBooks(), route: '/?q=zzz&status=borrowed' })
    expect(await screen.findByText('No books match your search.')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /clear search and filter/i }))
    expect(await screen.findByText('Dune')).toBeInTheDocument()
    expect(location()).toBe('/')
  })

  it('ignores an unknown status in the URL', async () => {
    renderApp({ sheets: libraryWithThreeBooks(), route: '/?status=deleted' })
    expect(await screen.findByText('Dune')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'All' })).toHaveAttribute('aria-pressed', 'true')
  })
})

describe('loading, empty and error states', () => {
  it('shows a loading message while the Sheet is being read', async () => {
    renderApp({ fetchImpl: () => new Promise(() => undefined) })
    expect(await screen.findByRole('status')).toHaveTextContent('Loading your library')
  })

  it('says the library is empty for a Sheet with headers only', async () => {
    renderApp()
    expect(await screen.findByText('Your library is empty.')).toBeInTheDocument()
  })

  it('names the missing columns when the Sheet headers are wrong, and recovers on retry', async () => {
    const sheets = new FakeSheets()
    const goodHeader = sheets.tabs.Books[0]
    sheets.tabs.Books = [['Book ID', 'Title']]
    const { user } = renderApp({ sheets })
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Tab "Books" is missing column(s)')
    expect(alert).toHaveTextContent('Author')

    sheets.tabs.Books = [goodHeader, bookRow({ id: 'B-0001', title: 'Dune', author: 'Herbert' })]
    await user.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByText('Dune')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('tells the user which tab is missing when the Sheet is not set up (e.g. the first tab is still "Sheet1")', async () => {
    const sheets = new FakeSheets()
    delete sheets.tabs.Books
    delete sheets.tabs.Borrowers
    renderApp({ sheets })
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('The Sheet has no tab named "Books"')
    expect(alert).toHaveTextContent('README > Sheet setup')
    expect(screen.queryByText(/Unable to parse range/)).not.toBeInTheDocument()
  })

  it('explains an uploaded Excel file instead of showing Google’s bare 400', async () => {
    const sheets = new FakeSheets()
    sheets.notNativeSheet = true
    renderApp({ sheets })
    expect(await screen.findByRole('alert')).toHaveTextContent('Save as Google Sheets')
  })

  it('tells the user when the signed-in account cannot open the Sheet', async () => {
    const sheets = new FakeSheets()
    sheets.failNext = 403
    renderApp({ sheets })
    expect(await screen.findByRole('alert')).toHaveTextContent(/cannot open the library sheet/i)
  })

  it('keeps showing the books already loaded when a refresh fails', async () => {
    const sheets = libraryWithThreeBooks()
    const { user } = renderApp({ sheets })
    await screen.findByText('Dune')
    sheets.failNext = 500
    await user.click(screen.getByRole('button', { name: 'Sync' }))
    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(screen.getByText('Dune')).toBeInTheDocument()
  })
})

describe('refreshing is done by the one Sync button', () => {
  it('the list has no separate Refresh button (Sync sends unsent changes and reloads)', async () => {
    renderApp({ sheets: libraryWithThreeBooks() })
    await screen.findByText('Dune')
    expect(screen.queryByRole('button', { name: 'Refresh' })).not.toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: 'Sync' })).toHaveLength(1)
  })

  it('Sync picks up changes made directly in the Sheet', async () => {
    const sheets = libraryWithThreeBooks()
    const { user } = renderApp({ sheets })
    await screen.findByText('Dune')
    sheets.tabs.Books.push(bookRow({ id: 'B-0004', title: 'Neuromancer', author: 'Gibson' }))
    sheets.tabs.Borrowers.push(loanRow({ bookId: 'B-0001', borrower: 'Asha' }))
    await user.click(screen.getByRole('button', { name: 'Sync' }))
    expect(await screen.findByText('Neuromancer')).toBeInTheDocument()
    await waitFor(() => expect(within(screen.getByRole('list', { name: 'Books' })).getAllByText('Borrowed')).toHaveLength(2))
  })
})

describe('no destructive actions (ADR-0004)', () => {
  it('offers no delete or remove control on the list', async () => {
    renderApp({ sheets: libraryWithThreeBooks(), viewport: 'desktop' })
    await screen.findByRole('table')
    expect(screen.queryByRole('button', { name: /delete|remove|clear all/i })).not.toBeInTheDocument()
  })
})
