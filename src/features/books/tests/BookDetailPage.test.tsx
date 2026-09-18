import { screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { formatTimestamp } from '@/lib/datetime'
import { FakeSheets } from '@/test/fakeSheets'
import { bookRow, loanRow } from '@/test/fixtures'
import { renderApp } from '@/test/render'

const PHOTO = 'https://drive.google.com/file/d/1aBcDeFgHiJkLmNoPqRsTuVwXyZ123456/view?usp=drivesdk'

function library() {
  const sheets = new FakeSheets()
  sheets.tabs.Books.push(
    bookRow({ id: 'B-0001', title: 'Dune', author: 'Frank Herbert', purchaseDate: '2025-12-31', pricePaid: 500, marketPrice: 1200.5, photo: PHOTO, addedAt: '2026-01-01T00:00:00.000Z' }),
    bookRow({ id: 'B-0002', title: 'Emma', author: 'Jane Austen' }),
    bookRow({ id: 'B-0003', title: 'Anathem', author: 'Neal Stephenson' }),
  )
  sheets.tabs.Borrowers.push(
    loanRow({ bookId: 'B-0001', borrower: 'Ravi', date: '2026-01-10', time: '09:00', place: 'Office', returnedDate: '2026-01-20', returnedTime: '18:15' }),
    loanRow({ bookId: 'B-0001', borrower: 'Asha', date: '2026-03-01', time: '11:00', place: 'Cafe' }),
    loanRow({ bookId: 'B-0002', borrower: 'Ravi' }),
  )
  return sheets
}

describe('book detail', () => {
  it('shows the metadata, formatted prices, the full-size cover, and the status', async () => {
    renderApp({ sheets: library(), route: '/books/B-0001' })
    expect(await screen.findByRole('heading', { level: 1, name: 'Dune' })).toBeInTheDocument()
    expect(screen.getByText('Frank Herbert')).toBeInTheDocument()
    const details = screen.getByRole('article')
    expect(within(details).getByText('B-0001')).toBeInTheDocument()
    expect(within(details).getByText('2025-12-31')).toBeInTheDocument()
    expect(within(details).getByText(/500\.00/)).toBeInTheDocument()
    expect(within(details).getByText(/1,200\.50/)).toBeInTheDocument()
    expect(within(details).getByText(formatTimestamp('2026-01-01T00:00:00.000Z'))).toBeInTheDocument()
    expect(within(details).queryByText('2026-01-01T00:00:00.000Z')).not.toBeInTheDocument() // not the raw ISO string
    expect(within(details).getByRole('img', { name: 'Cover of Dune' })).toHaveAttribute('src', 'blob:cover/1aBcDeFgHiJkLmNoPqRsTuVwXyZ123456/full')
    expect(within(details).getByText('Borrowed', { selector: '[data-slot="badge"]' })).toBeInTheDocument()
    expect(within(details).getByText(/with Asha since/)).toBeInTheDocument()
  })

  it('shows dashes for empty fields and a placeholder cover', async () => {
    renderApp({ sheets: library(), route: '/books/B-0003' })
    await screen.findByRole('heading', { name: 'Anathem' })
    expect(screen.getAllByText('—')).toHaveLength(6) // purchase date, both prices, added, categories, language
    expect(screen.getByRole('img', { name: 'No cover for Anathem' })).toBeInTheDocument()
    expect(screen.getByText('Available')).toBeInTheDocument()
  })

  it('lists the borrow history newest first, marking loans that are still out', async () => {
    renderApp({ sheets: library(), route: '/books/B-0001' })
    await screen.findByRole('heading', { name: 'Dune' })
    const history = screen.getByRole('region', { name: 'Borrow history' })
    const entries = within(history).getAllByRole('listitem')
    expect(entries).toHaveLength(2)
    expect(entries[0]).toHaveTextContent('Asha')
    expect(entries[0]).toHaveTextContent('Cafe')
    expect(entries[0]).toHaveTextContent('2026-03-01 11:00')
    expect(entries[0]).toHaveTextContent('Still out')
    expect(entries[1]).toHaveTextContent('Ravi')
    expect(entries[1]).toHaveTextContent('Returned 2026-01-20 18:15')
    expect(within(history).queryByText('Still out', { selector: 'span' })).toBeInTheDocument()
  })

  it("does not show another book's loans", async () => {
    renderApp({ sheets: library(), route: '/books/B-0002' })
    await screen.findByRole('heading', { name: 'Emma' })
    const entries = within(screen.getByRole('region', { name: 'Borrow history' })).getAllByRole('listitem')
    expect(entries).toHaveLength(1)
    expect(entries[0]).toHaveTextContent('Ravi')
  })

  it('says a book has never been borrowed when it has no loans', async () => {
    renderApp({ sheets: library(), route: '/books/B-0003' })
    expect(await screen.findByText('This book has never been borrowed.')).toBeInTheDocument()
  })

  it('shows a loading message while the library loads, then not-found for an unknown ID', async () => {
    const sheets = library()
    renderApp({ sheets, route: '/books/B-9999' })
    expect(screen.getByRole('status')).toHaveTextContent('Loading your library')
    expect(await screen.findByRole('alert')).toHaveTextContent('B-9999 was not found')
  })

  it('links back to the list', async () => {
    const { user } = renderApp({ sheets: library(), route: '/books/B-0001' })
    await screen.findByRole('heading', { name: 'Dune' })
    await user.click(within(screen.getByRole('article')).getByRole('link', { name: /books/i }))
    expect(screen.getByTestId('location')).toHaveTextContent('/')
    expect(await screen.findByRole('heading', { name: 'Books' })).toBeInTheDocument()
  })

  it('the only delete-like control is "Delete book", which hides the book and never removes a row (ADR-0004, ADR-0009)', async () => {
    renderApp({ sheets: library(), route: '/books/B-0003' })
    await screen.findByRole('heading', { name: 'Anathem' })
    // Changed on purpose from "no delete or remove control at all": ADR-0009 allows exactly this one, and the
    // Sheets no-delete guard (src/test/tests/no-delete.test.ts) still forbids any call that could remove a row.
    expect(screen.getAllByRole('button', { name: /delete|remove/i }).map((b) => b.textContent)).toEqual(['Delete book'])
    expect(screen.queryByRole('link', { name: /delete|remove/i })).not.toBeInTheDocument()
  })
})
