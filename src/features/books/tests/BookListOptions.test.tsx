import { screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { FakeSheets } from '@/test/fakeSheets'
import { bookRow, optionRow } from '@/test/fixtures'
import { renderApp } from '@/test/render'
import { chooseOption, optionsOf, shownIn } from '@/test/select'

function library() {
  const sheets = new FakeSheets()
  sheets.tabs.Categories.push(optionRow('Business'), optionRow('Psychology'), optionRow('Self-help'), optionRow('Retired', false))
  sheets.tabs.Languages.push(optionRow('English'), optionRow('Hindi'))
  sheets.tabs.Books.push(
    bookRow({ id: 'B-0001', title: 'Atomic Habits', author: 'Clear', categories: 'Self-help, Psychology', language: 'English', purchaseDate: '2025-01-01' }),
    bookRow({ id: 'B-0002', title: 'Zero to One', author: 'Thiel', categories: 'Business', language: 'English', purchaseDate: '2025-06-01' }),
    bookRow({ id: 'B-0003', title: 'Godan', author: 'Premchand', language: 'Hindi', purchaseDate: '2024-03-01' }),
    bookRow({ id: 'B-0004', title: 'Old Book', author: 'Anon', categories: 'Retired' }),
  )
  return sheets
}

const titles = () => within(screen.getByRole('list', { name: 'Books' })).getAllByRole('link').map((c) => c.getAttribute('href'))
const listNames = () => screen.getAllByRole('list', { name: /^Books/ }).map((l) => l.getAttribute('aria-label'))

describe('category and language filters', () => {
  it('offers only active categories and languages, each with an "All" choice', async () => {
    const { user } = renderApp({ sheets: library() })
    await screen.findByText('Atomic Habits')
    expect(await optionsOf(user, 'Category')).toEqual(['All categories', 'Business', 'Psychology', 'Self-help'])
    expect(await optionsOf(user, 'Language')).toEqual(['All languages', 'English', 'Hindi'])
  })

  it('filters by a category (a book in two categories matches both), and the choice lives in the URL', async () => {
    const { user } = renderApp({ sheets: library() })
    await screen.findByText('Atomic Habits')
    await chooseOption(user, 'Category', 'Psychology')
    expect(titles()).toEqual(['/books/B-0001'])
    expect(screen.getByTestId('location')).toHaveTextContent('/?category=Psychology')
    await chooseOption(user, 'Category', 'Self-help')
    expect(titles()).toEqual(['/books/B-0001'])
    await chooseOption(user, 'Category', 'All categories')
    expect(titles()).toHaveLength(4)
    expect(screen.getByTestId('location')).toHaveTextContent(/^\/$/)
  })

  it('filters by language and combines with category, status and search', async () => {
    const { user } = renderApp({ sheets: library() })
    await screen.findByText('Atomic Habits')
    await chooseOption(user, 'Language', 'English')
    expect(titles()).toEqual(['/books/B-0001', '/books/B-0002'])
    await chooseOption(user, 'Category', 'Business')
    expect(titles()).toEqual(['/books/B-0002'])
    await user.type(screen.getByRole('searchbox'), 'atomic')
    expect(screen.getByText('No books match your search.')).toBeInTheDocument()
  })

  it('starts from the URL', async () => {
    renderApp({ sheets: library(), route: '/?language=Hindi' })
    await screen.findByText('Godan')
    expect(shownIn('Language')).toBe('Hindi')
    expect(titles()).toEqual(['/books/B-0003'])
  })

  it('sorting by purchase date applies inside a filter', async () => {
    renderApp({ sheets: library(), route: '/?language=English&sort=newest' })
    await screen.findByText('Atomic Habits')
    expect(titles()).toEqual(['/books/B-0002', '/books/B-0001'])
  })

  it('a Sheet with no categories or languages shows no extra filters', async () => {
    const sheets = new FakeSheets()
    sheets.tabs.Books.push(bookRow({ id: 'B-0001', title: 'Dune', author: 'Herbert' }))
    renderApp({ sheets })
    await screen.findByText('Dune')
    expect(screen.queryByRole('combobox', { name: 'Category' })).not.toBeInTheDocument()
    expect(screen.queryByRole('combobox', { name: 'Language' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Group by category' })).not.toBeInTheDocument()
  })
})

describe('group by category', () => {
  it('is off by default (one flat list)', async () => {
    renderApp({ sheets: library() })
    await screen.findByText('Atomic Habits')
    expect(listNames()).toEqual(['Books'])
    expect(screen.getByRole('button', { name: 'Group by category' })).toHaveAttribute('aria-pressed', 'false')
  })

  it('splits the books under a heading per active category; a book in two categories appears in both; the rest go last', async () => {
    const { user } = renderApp({ sheets: library() })
    await screen.findByText('Atomic Habits')
    await user.click(screen.getByRole('button', { name: 'Group by category' }))
    expect(screen.getByTestId('location')).toHaveTextContent('/?group=category')
    expect(screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)).toEqual(['Business 1', 'Psychology 1', 'Self-help 1', 'Uncategorized 2'])
    expect(listNames()).toEqual(['Books in Business', 'Books in Psychology', 'Books in Self-help', 'Books in Uncategorized'])
    const atomic = screen.getAllByText('Atomic Habits')
    expect(atomic).toHaveLength(2) // Psychology and Self-help
    // "Old Book" only has an archived category, so it is uncategorized
    expect(within(screen.getByRole('list', { name: 'Books in Uncategorized' })).getByText('Old Book')).toBeInTheDocument()
    expect(within(screen.getByRole('list', { name: 'Books in Uncategorized' })).getByText('Godan')).toBeInTheDocument()
  })

  it('keeps the chosen sort inside each group', async () => {
    const sheets = library()
    sheets.tabs.Books.push(bookRow({ id: 'B-0005', title: 'Deep Work', author: 'Newport', categories: 'Business', purchaseDate: '2026-01-01' }))
    renderApp({ sheets, route: '/?group=category&sort=newest' })
    await screen.findByText('Deep Work')
    const business = within(screen.getByRole('list', { name: 'Books in Business' })).getAllByRole('link').map((a) => a.getAttribute('href'))
    expect(business).toEqual(['/books/B-0005', '/books/B-0002'])
  })

  it('works together with a filter, and groups nothing that was filtered out', async () => {
    renderApp({ sheets: library(), route: '/?group=category&language=Hindi' })
    await screen.findByText('Godan')
    expect(screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)).toEqual(['Uncategorized 1'])
  })

  it('works on desktop too', async () => {
    renderApp({ sheets: library(), route: '/?group=category', viewport: 'desktop' })
    await screen.findAllByText('Atomic Habits')
    expect(listNames()).toContain('Books in Business')
  })
})

describe('where categories and language show', () => {
  const tagsOf = (card: HTMLElement) => within(within(card).getByTestId('book-tags')).getAllByText(/./).map((t) => t.textContent)

  it('a card shows the language and the active categories as tags, but never an archived one', async () => {
    renderApp({ sheets: library() })
    await screen.findByText('Atomic Habits')
    const cards = within(screen.getByRole('list', { name: 'Books' })).getAllByRole('link')
    const byTitle = (name: string) => cards.find((c) => within(c).queryByText(name)) as HTMLElement
    expect(tagsOf(byTitle('Atomic Habits'))).toEqual(['English', 'Self-help', 'Psychology'])
    expect(tagsOf(byTitle('Godan'))).toEqual(['Hindi'])
    expect(byTitle('Old Book')).not.toHaveTextContent('Retired')
    expect(within(byTitle('Old Book')).queryByTestId('book-tags')).not.toBeInTheDocument()
  })

  it('shows at most two categories, then folds the rest into +N (on phone and desktop)', async () => {
    const sheets = library()
    sheets.tabs.Categories.push(optionRow('Fiction'), optionRow('Classics'))
    sheets.tabs.Books.push(bookRow({ id: 'B-0005', title: 'Many Tags', author: 'X', categories: 'Business, Classics, Fiction, Psychology', language: 'English' }))
    for (const viewport of ['phone', 'desktop'] as const) {
      const view = renderApp({ sheets, viewport })
      const card = (await screen.findByText('Many Tags')).closest('a') as HTMLElement
      expect(tagsOf(card)).toEqual(['English', 'Business', 'Classics', '+2'])
      view.unmount()
    }
  })

  it('the detail page lists the categories and the language, hiding archived categories', async () => {
    renderApp({ sheets: library(), route: '/books/B-0001' })
    const details = await screen.findByRole('article')
    expect(within(details).getByText('Self-help, Psychology')).toBeInTheDocument()
    expect(within(details).getByText('English')).toBeInTheDocument()
  })

  it('the detail page of a book with only an archived category shows a dash', async () => {
    renderApp({ sheets: library(), route: '/books/B-0004' })
    const details = await screen.findByRole('article')
    expect(details).not.toHaveTextContent('Retired')
  })
})
