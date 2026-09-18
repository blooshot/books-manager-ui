import { screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { archiveBook } from '@/store/libraryThunks'
import { booksSelectors } from '@/store/selectors'
import { BOOK_HEADER, FakeSheets } from '@/test/fakeSheets'
import { bookRow, loanRow, optionRow } from '@/test/fixtures'
import { renderApp } from '@/test/render'

const ACTIVE = 10 // column index of Books > Active in the fake Sheet (column K)

function library() {
  const sheets = new FakeSheets()
  sheets.tabs.Categories.push(optionRow('Business'))
  sheets.tabs.Books.push(
    bookRow({ id: 'B-0001', title: 'Dune', author: 'Herbert', categories: 'Business' }),
    bookRow({ id: 'B-0002', title: 'Emma', author: 'Austen' }),
    bookRow({ id: 'B-0003', title: 'Old Notes', author: 'Anon', archived: true, categories: 'Business' }),
  )
  sheets.tabs.Borrowers.push(loanRow({ bookId: 'B-0002', borrower: 'Ravi' }))
  return sheets
}

const posts = (sheets: FakeSheets) => sheets.calls.filter((c) => c.method === 'POST')
const location = () => screen.getByTestId('location').textContent

describe('Delete book', () => {
  it('asks first and says the book is hidden, not erased; Cancel writes nothing', async () => {
    const { user, sheets } = renderApp({ route: '/books/B-0001', sheets: library() })
    await user.click(await screen.findByRole('button', { name: 'Delete book' }))
    const dialog = screen.getByRole('dialog', { name: 'Delete this book?' })
    expect(dialog).toHaveTextContent('hidden from your library')
    expect(dialog).toHaveTextContent('not erased from your Sheet')
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }))
    expect(posts(sheets)).toHaveLength(0)
    expect(screen.getByRole('heading', { level: 1, name: 'Dune' })).toBeInTheDocument()
  })

  it('confirming sets Active to No on that row only, keeps every row, and returns to the list without the book', async () => {
    const { user, sheets } = renderApp({ route: '/books/B-0001', sheets: library() })
    await user.click(await screen.findByRole('button', { name: 'Delete book' }))
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Delete book' }))
    await waitFor(() => expect(location()).toBe('/'))
    expect(sheets.tabs.Books).toHaveLength(4) // header + 3 books: nothing removed
    expect(sheets.tabs.Books[1][ACTIVE]).toBe('No')
    expect(sheets.tabs.Books[1].slice(0, 3)).toEqual(['B-0001', 'Dune', 'Herbert']) // the rest of the row is untouched
    expect(posts(sheets)).toHaveLength(1)
    expect((posts(sheets)[0].body as { data: { range: string }[] }).data.map((d) => d.range)).toEqual(['Books!K2'])
    expect(await screen.findByText('Emma')).toBeInTheDocument()
    expect(screen.queryByText('Dune')).not.toBeInTheDocument()
  })

  it('is not possible while the book is lent out: disabled, and it says why', async () => {
    const { sheets } = renderApp({ route: '/books/B-0002', sheets: library() })
    const button = await screen.findByRole('button', { name: 'Delete book' })
    expect(button).toBeDisabled()
    expect(screen.getByText(/Lent to Ravi.*Mark it returned first/)).toBeInTheDocument()
    expect(posts(sheets)).toHaveLength(0)
  })

  it('the thunk itself refuses a lent-out book too, and nothing changes', async () => {
    const { store, sheets } = renderApp({ route: '/books/B-0002', sheets: library() })
    await screen.findByRole('heading', { name: 'Emma' })
    await expect(store.dispatch(archiveBook({ id: 'B-0002' })).unwrap()).rejects.toMatchObject({ name: 'ValidationError' })
    expect(booksSelectors.selectById(store.getState(), 'B-0002')?.archived).toBeUndefined()
    expect(posts(sheets)).toHaveLength(0)
  })

  it('a failed write is undone on screen and reported in the dialog (nothing hidden)', async () => {
    const { user, store, sheets } = renderApp({ route: '/books/B-0001', sheets: library() })
    await user.click(await screen.findByRole('button', { name: 'Delete book' }))
    sheets.failNextMethod = { method: 'POST', status: 500 }
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Delete book' }))
    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(booksSelectors.selectById(store.getState(), 'B-0001')?.archived).toBeUndefined()
    expect(sheets.tabs.Books[1][ACTIVE]).toBe('')
    expect(location()).toBe('/books/B-0001')
  })
})

describe('deleted books in the list', () => {
  it('All, Available and Borrowed leave them out, and the counts do too', async () => {
    const { user } = renderApp({ sheets: library() })
    await screen.findByText('Dune')
    expect(screen.queryByText('Old Notes')).not.toBeInTheDocument()
    expect(screen.getByText(/of/, { selector: 'p' })).toHaveTextContent('2 of 2 books')
    await user.click(screen.getByRole('button', { name: 'Available' }))
    expect(screen.queryByText('Old Notes')).not.toBeInTheDocument()
  })

  it('the Archived filter shows only deleted books and lives in the URL', async () => {
    const { user } = renderApp({ sheets: library() })
    await screen.findByText('Dune')
    await user.click(screen.getByRole('button', { name: 'Archived' }))
    expect(location()).toBe('/?status=archived')
    expect(screen.getByText('Old Notes')).toBeInTheDocument()
    expect(screen.queryByText('Dune')).not.toBeInTheDocument()
    expect(screen.getByText(/of/, { selector: 'p' })).toHaveTextContent('1 of 1 books')
  })

  it('says so when nothing is deleted', async () => {
    const sheets = library()
    sheets.tabs.Books.pop()
    renderApp({ sheets, route: '/?status=archived' })
    expect(await screen.findByText('No deleted books.')).toBeInTheDocument()
  })

  it('grouping by category and the category page counts ignore deleted books', async () => {
    renderApp({ sheets: library(), route: '/?group=category' })
    await screen.findByText('Dune')
    expect(screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)).toEqual(['Business 1', 'Uncategorized 1'])
    renderApp({ sheets: library(), route: '/categories' })
    const active = await screen.findByRole('list', { name: 'Active categories' })
    expect(within(active).getByText(/1 book$/)).toBeInTheDocument()
  })
})

describe('restoring', () => {
  it('a deleted book says so, offers only Restore, and Restore sets Active to Yes', async () => {
    const { user, sheets } = renderApp({ route: '/books/B-0003', sheets: library() })
    expect(await screen.findByText(/This book is deleted/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Borrow' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Delete book' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Edit' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Restore book' }))
    await waitFor(() => expect(sheets.tabs.Books[3][ACTIVE]).toBe('Yes'))
    expect(await screen.findByRole('button', { name: 'Borrow' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Delete book' })).toBeInTheDocument()
    expect(sheets.tabs.Books).toHaveLength(4)
  })

  it('a failed restore puts the book back as deleted and says why (the message survives the optimistic flip)', async () => {
    const { user, sheets } = renderApp({ route: '/books/B-0003', sheets: library() })
    await screen.findByText(/This book is deleted/)
    sheets.failNextMethod = { method: 'POST', status: 500 }
    await user.click(screen.getByRole('button', { name: 'Restore book' }))
    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(screen.getByText(/This book is deleted/)).toBeInTheDocument()
    expect(sheets.tabs.Books[3][ACTIVE]).toBe('No')
  })

  it('the restored book is back in the list', async () => {
    const { user } = renderApp({ route: '/books/B-0003', sheets: library() })
    await user.click(await screen.findByRole('button', { name: 'Restore book' }))
    await user.click(within(screen.getByRole('article')).getByRole('link', { name: /Books/ }))
    expect(await screen.findByText('Old Notes')).toBeInTheDocument()
  })
})

describe('a Sheet without the Active column', () => {
  function oldSheet() {
    const sheets = library()
    sheets.tabs.Books[0] = BOOK_HEADER.slice(0, 10)
    sheets.tabs.Books = sheets.tabs.Books.map((row, i) => (i === 0 ? row : row.slice(0, 10)))
    return sheets
  }

  it('says what to add and disables Delete; every book counts as active and editing still works', async () => {
    const { user, sheets } = renderApp({ route: '/books/B-0001', sheets: oldSheet() })
    expect(await screen.findByRole('button', { name: 'Delete book' })).toBeDisabled()
    expect(screen.getByText(/Add an "Active" column/)).toBeInTheDocument()
    await user.click(screen.getByRole('link', { name: 'Edit' }))
    await user.clear(await screen.findByLabelText(/^Title/))
    await user.type(screen.getByLabelText(/^Title/), 'Dune 2')
    await user.click(screen.getByRole('button', { name: 'Save changes' }))
    await waitFor(() => expect(sheets.tabs.Books[1][1]).toBe('Dune 2'))
  })
})
