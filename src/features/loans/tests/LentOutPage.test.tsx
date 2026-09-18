import { screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { FakeSheets } from '@/test/fakeSheets'
import { bookRow, loanRow } from '@/test/fixtures'
import { renderApp } from '@/test/render'

function library() {
  const sheets = new FakeSheets()
  sheets.tabs.Books.push(
    bookRow({ id: 'B-0001', title: 'Dune', author: 'Herbert' }),
    bookRow({ id: 'B-0002', title: 'Emma', author: 'Austen' }),
    bookRow({ id: 'B-0003', title: 'Anathem', author: 'Stephenson' }),
    bookRow({ id: 'B-0004', title: 'Zen', author: 'Pirsig' }),
  )
  sheets.tabs.Borrowers.push(
    loanRow({ bookId: 'B-0001', borrower: 'Ravi', date: '2026-09-05', time: '10:00', place: 'Office' }),
    loanRow({ bookId: 'B-0002', borrower: 'Ravi', date: '2026-09-01', time: '09:00', place: 'Home' }),
    loanRow({ bookId: 'B-0003', borrower: 'Asha', date: '2026-09-10', time: '16:45', place: 'Cafe' }),
    loanRow({ bookId: 'B-0004', borrower: 'Zed', date: '2026-08-01', returnedDate: '2026-08-09' }), // already back
  )
  return sheets
}
const trigger = (name: RegExp) => screen.getByRole('button', { name })

describe('Lent out screen', () => {
  it('groups open loans by borrower (A-Z) with a count, and summarises them', async () => {
    renderApp({ route: '/lent-out', sheets: library() })
    expect(await screen.findByRole('heading', { name: 'Lent out' })).toBeInTheDocument()
    await screen.findByRole('button', { name: /Asha/ })
    const groups = screen.getAllByRole('button', { name: /\d books?$/ })
    expect(groups.map((g) => g.textContent)).toEqual(['Asha1 book', 'Ravi2 books'])
    expect(screen.getByText(/lent to/)).toHaveTextContent('3 books lent to 2 people')
    expect(screen.queryByText('Zed')).not.toBeInTheDocument() // returned loans are not "lent out"
    expect(screen.queryByText('Zen')).not.toBeInTheDocument()
  })

  it('opens the first group, and only one group is open at a time', async () => {
    const { user } = renderApp({ route: '/lent-out', sheets: library() })
    await screen.findByRole('button', { name: /Asha/ })
    expect(trigger(/Asha/)).toHaveAttribute('aria-expanded', 'true')
    expect(trigger(/Ravi/)).toHaveAttribute('aria-expanded', 'false')
    expect(screen.getByText('Anathem')).toBeInTheDocument()
    expect(screen.queryByText('Dune')).not.toBeInTheDocument()

    await user.click(trigger(/Ravi/))
    expect(trigger(/Ravi/)).toHaveAttribute('aria-expanded', 'true')
    expect(trigger(/Asha/)).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByText('Anathem')).not.toBeInTheDocument()
    expect(screen.getByText('Dune')).toBeInTheDocument()
  })

  it("lists a borrower's books oldest loan first, with since date/time and place, each linking to the book", async () => {
    const { user } = renderApp({ route: '/lent-out', sheets: library() })
    await user.click(await screen.findByRole('button', { name: /Ravi/ }))
    const items = within(screen.getByRole('region', { name: /Ravi/ })).getAllByRole('link')
    expect(items.map((i) => i.querySelector('.font-medium')?.textContent)).toEqual(['Emma', 'Dune'])
    expect(items[0]).toHaveTextContent('since 2026-09-01 09:00 · Home')
    expect(items[1]).toHaveTextContent('since 2026-09-05 10:00 · Office')
    expect(items[1]).toHaveAttribute('href', '/books/B-0001')
  })

  it('collapses the open group when its heading is pressed again', async () => {
    const { user } = renderApp({ route: '/lent-out', sheets: library() })
    await screen.findByRole('button', { name: /Asha/ })
    await user.click(trigger(/Asha/))
    expect(trigger(/Asha/)).toHaveAttribute('aria-expanded', 'false')
  })

  it('says so when nothing is lent out', async () => {
    const sheets = new FakeSheets()
    sheets.tabs.Books.push(bookRow({ id: 'B-0001', title: 'Dune', author: 'Herbert' }))
    renderApp({ route: '/lent-out', sheets })
    expect(await screen.findByText('Nothing is lent out right now.')).toBeInTheDocument()
    expect(screen.queryByText(/lent to/)).not.toBeInTheDocument()
  })

  it('shows a loading message, and the error if the library cannot be read', async () => {
    const pending = renderApp({ route: '/lent-out', fetchImpl: () => new Promise(() => undefined) })
    expect(await screen.findByRole('status')).toHaveTextContent('Loading your library')
    pending.unmount()

    const sheets = new FakeSheets()
    sheets.tabs.Books = [['Book ID', 'Title']]
    renderApp({ route: '/lent-out', sheets })
    expect(await screen.findByRole('alert')).toHaveTextContent('missing column')
  })

  it('offers no delete or remove control', async () => {
    renderApp({ route: '/lent-out', sheets: library() })
    await screen.findByRole('button', { name: /Asha/ })
    expect(screen.queryByRole('button', { name: /delete|remove/i })).not.toBeInTheDocument()
  })
})

describe('navigation to Lent out', () => {
  it('is in the bottom nav on phones and the header menu on desktop, marked when current', async () => {
    const phone = renderApp({ route: '/', sheets: library(), viewport: 'phone' })
    await phone.user.click(await screen.findByRole('link', { name: 'Lent out' }))
    expect(await screen.findByRole('heading', { name: 'Lent out' })).toBeInTheDocument()
    expect(within(screen.getByRole('navigation', { name: 'Main' })).getByRole('link', { name: 'Lent out' })).toHaveAttribute('aria-current', 'page')
    phone.unmount()

    renderApp({ route: '/lent-out', sheets: library(), viewport: 'desktop' })
    const nav = await screen.findByRole('navigation', { name: 'Main' })
    expect(within(nav).getByRole('link', { name: 'Lent out' })).toHaveAttribute('aria-current', 'page')
    expect(within(nav).getByRole('link', { name: 'Books' })).not.toHaveAttribute('aria-current')
  })
})

describe('the whole loan journey', () => {
  it('borrow on the book page -> appears under Lent out -> return -> gone', async () => {
    const sheets = new FakeSheets()
    sheets.tabs.Books.push(bookRow({ id: 'B-0001', title: 'Dune', author: 'Herbert' }))
    const { user, store } = renderApp({ route: '/books/B-0001', sheets })

    await user.click(await screen.findByRole('button', { name: 'Borrow' }))
    const dlg = screen.getByRole('dialog', { name: 'Borrow this book' })
    await user.type(within(dlg).getByLabelText(/^Borrower/), 'Ravi')
    await user.click(within(dlg).getByRole('button', { name: 'Borrow' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())

    await user.click(within(screen.getByRole('navigation', { name: 'Main' })).getByRole('link', { name: 'Lent out' }))
    expect(await screen.findByRole('button', { name: /Ravi/ })).toBeInTheDocument()
    await user.click(screen.getByRole('link', { name: /Dune/ }))

    await user.click(await screen.findByRole('button', { name: 'Mark returned' }))
    await waitFor(() => expect(screen.getByText(/^(Available|Borrowed)$/, { selector: '[data-slot="badge"]' })).toHaveTextContent('Available'))
    await user.click(within(screen.getByRole('navigation', { name: 'Main' })).getByRole('link', { name: 'Lent out' }))
    expect(await screen.findByText('Nothing is lent out right now.')).toBeInTheDocument()

    expect(sheets.tabs.Borrowers).toHaveLength(2) // history kept: one row, now closed
    expect(sheets.tabs.Borrowers[1].slice(5, 6)).toEqual(['Yes'])
    expect(store.getState().session.status).toBe('signedIn')
  })
})
