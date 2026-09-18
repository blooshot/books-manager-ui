import { screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { booksSelectors } from '@/store/selectors'
import { BOOK_HEADER, FakeSheets } from '@/test/fakeSheets'
import { bookRow, optionRow } from '@/test/fixtures'
import { renderApp } from '@/test/render'

function library() {
  const sheets = new FakeSheets()
  sheets.tabs.Categories.push(optionRow('Business'), optionRow('Self help'), optionRow('Retired', false))
  sheets.tabs.Languages.push(optionRow('English'), optionRow('Hindi'))
  sheets.tabs.Books.push(
    bookRow({ id: 'B-0001', title: 'Atomic Habits', author: 'Clear', categories: 'Self help, Business', language: 'English' }),
    bookRow({ id: 'B-0002', title: 'Godan', author: 'Premchand', language: 'Hindi' }),
  )
  return sheets
}

const section = (name: string) => screen.getByRole('region', { name })
const posts = (sheets: FakeSheets) => sheets.calls.filter((c) => c.method === 'POST')

describe('Categories & languages page', () => {
  it('is in the header menu on desktop and the bottom nav on phones, and lists active and archived entries with book counts', async () => {
    const phone = renderApp({ route: '/', sheets: library(), viewport: 'phone' })
    await phone.user.click(await screen.findByRole('link', { name: 'Categories' }))
    expect(await screen.findByRole('heading', { level: 1, name: 'Categories & languages' })).toBeInTheDocument()
    phone.unmount()

    renderApp({ route: '/categories', sheets: library(), viewport: 'desktop' })
    const nav = await screen.findByRole('navigation', { name: 'Main' })
    expect(within(nav).getByRole('link', { name: 'Categories' })).toHaveAttribute('aria-current', 'page')
    const active = await screen.findByRole('list', { name: 'Active categories' })
    expect(within(active).getAllByRole('listitem').map((li) => li.textContent)).toEqual([
      expect.stringContaining('Business'),
      expect.stringContaining('Self help'),
    ])
    expect(within(active).getAllByRole('listitem')[0]).toHaveTextContent('1 book')
    expect(within(screen.getByRole('list', { name: 'Archived categories' })).getByText('Retired')).toBeInTheDocument()
    expect(within(section('Languages')).getByRole('list', { name: 'Active languages' })).toHaveTextContent('Hindi')
  })

  it('adds a category to the Sheet and the screen; a duplicate is refused with a message and nothing is written', async () => {
    const { user, sheets } = renderApp({ route: '/categories', sheets: library() })
    const categories = await screen.findByRole('region', { name: 'Categories' })
    await user.type(within(categories).getByLabelText('New category'), 'Psychology')
    await user.click(within(categories).getByRole('button', { name: 'Add' }))
    expect(await within(categories).findByText('Psychology')).toBeInTheDocument()
    expect(sheets.tabs.Categories.at(-1)).toEqual(['Psychology', 'Yes'])
    expect(within(categories).getByLabelText('New category')).toHaveValue('')

    const before = posts(sheets).length
    await user.type(within(categories).getByLabelText('New category'), 'business')
    await user.click(within(categories).getByRole('button', { name: 'Add' }))
    expect(await within(categories).findByRole('alert')).toHaveTextContent('Category "Business" already exists.')
    expect(posts(sheets)).toHaveLength(before)
  })

  it('refuses a comma in a name', async () => {
    const { user } = renderApp({ route: '/categories', sheets: library() })
    const languages = await screen.findByRole('region', { name: 'Languages' })
    await user.type(within(languages).getByLabelText('New language'), 'Hindi, Urdu')
    await user.click(within(languages).getByRole('button', { name: 'Add' }))
    expect(await within(languages).findByRole('alert')).toHaveTextContent('cannot contain commas')
  })

  it('renames a category everywhere: the list, the Sheet, and the books (in the store and on the Sheet)', async () => {
    const { user, sheets, store } = renderApp({ route: '/categories', sheets: library() })
    await screen.findByRole('list', { name: 'Active categories' })
    await user.click(screen.getByRole('button', { name: 'Rename Self help' }))
    const box = screen.getByLabelText('New name for Self help')
    await user.clear(box)
    await user.type(box, 'Self-help')
    await user.click(screen.getByRole('button', { name: 'Save name for Self help' }))
    expect(await screen.findByText('Self-help')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Rename Self help' })).not.toBeInTheDocument()
    expect(sheets.tabs.Categories[2]).toEqual(['Self-help', 'Yes'])
    expect(sheets.tabs.Books[1][8]).toBe('Self-help, Business')
    expect(booksSelectors.selectById(store.getState(), 'B-0001')?.categories).toEqual(['Self-help', 'Business'])
  })

  it('renames a language on the books that use it', async () => {
    const { user, sheets, store } = renderApp({ route: '/categories', sheets: library() })
    await screen.findByRole('list', { name: 'Active languages' })
    await user.click(screen.getByRole('button', { name: 'Rename Hindi' }))
    const box = screen.getByLabelText('New name for Hindi')
    await user.clear(box)
    await user.type(box, 'हिन्दी')
    await user.click(screen.getByRole('button', { name: 'Save name for Hindi' }))
    await waitFor(() => expect(sheets.tabs.Books[2][9]).toBe('हिन्दी'))
    expect(booksSelectors.selectById(store.getState(), 'B-0002')?.language).toBe('हिन्दी')
  })

  it('a rename into an existing name shows the reason, keeps the editor open, and changes nothing', async () => {
    const { user, sheets } = renderApp({ route: '/categories', sheets: library() })
    await screen.findByRole('list', { name: 'Active categories' })
    await user.click(screen.getByRole('button', { name: 'Rename Self help' }))
    const box = screen.getByLabelText('New name for Self help')
    await user.clear(box)
    await user.type(box, 'Business')
    await user.click(screen.getByRole('button', { name: 'Save name for Self help' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('already exists')
    expect(screen.getByLabelText('New name for Self help')).toBeInTheDocument()
    expect(sheets.tabs.Categories[2][0]).toBe('Self help')
  })

  it('Archive hides the entry (Active = No), keeps the row and every book, and Restore brings it back', async () => {
    const { user, sheets, store } = renderApp({ route: '/categories', sheets: library() })
    await screen.findByRole('list', { name: 'Active categories' })
    await user.click(screen.getByRole('button', { name: 'Archive Business' }))
    expect(await screen.findByRole('button', { name: 'Restore Business' })).toBeInTheDocument()
    expect(within(screen.getByRole('list', { name: 'Active categories' })).queryByText('Business')).not.toBeInTheDocument()
    expect(sheets.tabs.Categories[1]).toEqual(['Business', 'No'])
    expect(sheets.tabs.Categories).toHaveLength(4) // nothing removed
    expect(sheets.tabs.Books[1][8]).toBe('Self help, Business')
    expect(booksSelectors.selectById(store.getState(), 'B-0001')?.categories).toEqual(['Self help', 'Business'])

    await user.click(screen.getByRole('button', { name: 'Restore Business' }))
    expect(await screen.findByRole('button', { name: 'Archive Business' })).toBeInTheDocument()
    expect(sheets.tabs.Categories[1]).toEqual(['Business', 'Yes'])
  })

  it('adding the name of an archived category restores it instead of duplicating it', async () => {
    const { user, sheets } = renderApp({ route: '/categories', sheets: library() })
    const categories = await screen.findByRole('region', { name: 'Categories' })
    await user.type(within(categories).getByLabelText('New category'), 'retired')
    await user.click(within(categories).getByRole('button', { name: 'Add' }))
    expect(await within(categories).findByRole('button', { name: 'Archive Retired' })).toBeInTheDocument()
    expect(sheets.tabs.Categories).toHaveLength(4)
  })

  it('has no delete or remove control anywhere (ADR-0004, ADR-0008)', async () => {
    renderApp({ route: '/categories', sheets: library() })
    await screen.findByRole('list', { name: 'Active categories' })
    expect(screen.queryByRole('button', { name: /delete|remove|clear/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /delete|remove/i })).not.toBeInTheDocument()
  })
})

describe('when a change cannot be saved', () => {
  it('an expired session says to reconnect and changes nothing on screen or in the Sheet', async () => {
    const { user, sheets } = renderApp({ route: '/categories', sheets: library() })
    await screen.findByRole('list', { name: 'Active categories' })
    sheets.failNextMethod = { method: 'GET', status: 401 }
    await user.click(screen.getByRole('button', { name: 'Archive Business' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('session has expired')
    expect(screen.getByRole('button', { name: 'Archive Business' })).toBeInTheDocument()
    expect(sheets.tabs.Categories[1]).toEqual(['Business', 'Yes'])
  })

  it('a network failure says it needs a connection, is not queued, and changes nothing', async () => {
    const { user, sheets, store } = renderApp({
      route: '/categories',
      sheets: library(),
    })
    await screen.findByRole('list', { name: 'Active categories' })
    const categories = screen.getByRole('region', { name: 'Categories' })
    // The next Sheets request never arrives.
    const original = sheets.fetch
    sheets.fetch = (async () => {
      throw new TypeError('offline')
    }) as typeof fetch
    await user.type(within(categories).getByLabelText('New category'), 'Psychology')
    await user.click(within(categories).getByRole('button', { name: 'Add' }))
    expect(await within(categories).findByRole('alert')).toHaveTextContent('need a connection')
    expect(within(categories).queryByText('Psychology')).not.toBeInTheDocument()
    expect(store.getState().outbox.entries).toHaveLength(0)
    sheets.fetch = original
  })
})

describe('a Sheet not set up for one of the lists', () => {
  it('explains what to add instead of showing controls that cannot work', async () => {
    const sheets = library()
    delete sheets.tabs.Languages
    sheets.tabs.Books[0] = BOOK_HEADER.slice(0, 9) // no Language column
    renderApp({ route: '/categories', sheets })
    const languages = await screen.findByRole('region', { name: 'Languages' })
    expect(within(languages).getByRole('status')).toHaveTextContent('Add a tab named "Languages"')
    expect(within(languages).queryByRole('button', { name: 'Add' })).not.toBeInTheDocument()
    expect(within(screen.getByRole('region', { name: 'Categories' })).getByRole('button', { name: 'Add' })).toBeInTheDocument()
  })
})
