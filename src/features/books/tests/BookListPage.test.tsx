import { screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { bookRow, loanRow } from '@/test/fixtures'
import { FakeSheets } from '@/test/fakeSheets'
import { renderApp } from '@/test/render'
import { chooseOption, shownIn } from '@/test/select'

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

describe('book list (desktop: product cards)', () => {
  function libraryWithPrices() {
    const sheets = libraryWithThreeBooks()
    sheets.tabs.Books[1] = bookRow({ id: 'B-0001', title: 'Dune', author: 'Frank Herbert', photo: PHOTO, pricePaid: 450, marketPrice: 600, purchaseDate: '2025-03-14' })
    return sheets
  }

  it('shows each book as a card: cover, title, author, prices, purchase date and status; no table', async () => {
    renderApp({ sheets: libraryWithPrices(), viewport: 'desktop' })
    await screen.findByText('Dune')
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
    const cards = within(screen.getByRole('list', { name: 'Books' })).getAllByRole('link')
    expect(cards).toHaveLength(3)
    expect(cards[0]).toHaveAttribute('href', '/books/B-0003') // Anathem first
    const dune = cards[1]
    expect(within(dune).getByRole('img', { name: 'Cover of Dune' })).toBeInTheDocument()
    expect(within(dune).getByText('Frank Herbert')).toBeInTheDocument()
    expect(within(dune).getByText(/600/)).toBeInTheDocument()
    expect(within(dune).getByText(/Paid.*450/)).toBeInTheDocument()
    expect(within(dune).getByText('Bought 2025-03-14')).toBeInTheDocument()
    expect(within(dune).getByText('Available')).toBeInTheDocument()
    expect(within(cards[2]).getByText('Borrowed')).toBeInTheDocument()
    expect(within(cards[2]).getByText(/Ravi/)).toBeInTheDocument()
  })

  it('leaves out price lines a book does not have', async () => {
    renderApp({ sheets: libraryWithThreeBooks(), viewport: 'desktop' })
    await screen.findByText('Dune')
    const card = screen.getByText('emma').closest('a') as HTMLElement
    expect(within(card).queryByText(/Paid/)).not.toBeInTheDocument()
    expect(within(card).queryByText(/Bought/)).not.toBeInTheDocument()
  })

  it('has no Add book button in the page body: it is in the header menu', async () => {
    renderApp({ sheets: libraryWithThreeBooks(), viewport: 'desktop' })
    await screen.findByText('Dune')
    const links = screen.getAllByRole('link', { name: 'Add book' })
    expect(links).toHaveLength(1)
    expect(within(screen.getByRole('banner')).getByRole('link', { name: 'Add book' })).toBeInTheDocument()
  })
})

describe('sorting', () => {
  function datedLibrary() {
    const sheets = new FakeSheets()
    sheets.tabs.Books.push(
      bookRow({ id: 'B-0001', title: 'Dune', author: 'A', purchaseDate: '2024-01-10' }),
      bookRow({ id: 'B-0002', title: 'Emma', author: 'B', purchaseDate: '2025-06-01' }),
      bookRow({ id: 'B-0003', title: 'Anathem', author: 'C' }),
      bookRow({ id: 'B-0004', title: 'Zen', author: 'D', purchaseDate: '2023-12-31' }),
    )
    return sheets
  }
  const titles = () => within(screen.getByRole('list', { name: 'Books' })).getAllByRole('link').map((c) => within(c).getByText(/^(Anathem|Dune|Emma|Zen)$/).textContent)

  it('defaults to title order and keeps it out of the URL', async () => {
    renderApp({ sheets: datedLibrary() })
    await screen.findByText('Dune')
    expect(titles()).toEqual(['Anathem', 'Dune', 'Emma', 'Zen'])
    expect(shownIn('Sort by')).toBe('Title A–Z')
    expect(location()).toBe('/')
  })

  it('newest purchase first, books with no purchase date last, and the choice lives in the URL', async () => {
    const { user } = renderApp({ sheets: datedLibrary() })
    await screen.findByText('Dune')
    await chooseOption(user, 'Sort by', 'Purchased: newest first')
    expect(titles()).toEqual(['Emma', 'Dune', 'Zen', 'Anathem'])
    expect(location()).toBe('/?sort=newest')
  })

  it('oldest purchase first still puts undated books last', async () => {
    renderApp({ sheets: datedLibrary(), route: '/?sort=oldest' })
    await screen.findByText('Dune')
    expect(shownIn('Sort by')).toBe('Purchased: oldest first')
    expect(titles()).toEqual(['Zen', 'Dune', 'Emma', 'Anathem'])
  })

  it('sorts the books that match the search, and an unknown sort in the URL means title order', async () => {
    renderApp({ sheets: datedLibrary(), route: '/?sort=sideways&q=e' })
    await screen.findByText('Dune')
    expect(titles()).toEqual(['Anathem', 'Dune', 'Emma', 'Zen'])
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
    await screen.findByText('Dune')
    expect(screen.queryByRole('button', { name: /delete|remove|clear all/i })).not.toBeInTheDocument()
  })
})
