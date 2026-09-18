import { screen, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { BOOK_HEADER, FakeSheets } from '@/test/fakeSheets'
import { bookRow, optionRow } from '@/test/fixtures'
import { renderApp } from '@/test/render'
import { chooseOption, optionsOf, shownIn } from '@/test/select'

const CATEGORIES = 8 // column index of Books > Categories in the fake Sheet
const LANGUAGE = 9

function sheetWithLists() {
  const sheets = new FakeSheets()
  sheets.tabs.Categories.push(optionRow('Business'), optionRow('Psychology'), optionRow('Self-help'), optionRow('Retired', false))
  sheets.tabs.Languages.push(optionRow('English'), optionRow('Hindi'), optionRow('Tamil', false))
  return sheets
}

const writes = (sheets: FakeSheets) => sheets.calls.filter((c) => c.method === 'POST')

describe('category and language on the add form', () => {
  it('offers the active categories as checkboxes and the active languages in a select, never the archived ones', async () => {
    const { user } = renderApp({ route: '/books/new', sheets: sheetWithLists() })
    const group = await screen.findByRole('group', { name: 'Categories' })
    expect(screen.getAllByRole('checkbox').map((c) => c.closest('label')?.textContent)).toEqual(['Business', 'Psychology', 'Self-help'])
    expect(group).toBeInTheDocument()
    expect(await optionsOf(user, 'Language')).toEqual(['Not set', 'English', 'Hindi'])
  })

  it('saves the ticked categories and the language into the new book row', async () => {
    const { user, sheets } = renderApp({ route: '/books/new', sheets: sheetWithLists() })
    await screen.findByRole('group', { name: 'Categories' })
    await user.type(screen.getByLabelText(/^Title/), 'Atomic Habits')
    await user.type(screen.getByLabelText(/^Author/), 'James Clear')
    await user.click(screen.getByRole('checkbox', { name: 'Self-help' }))
    await user.click(screen.getByRole('checkbox', { name: 'Psychology' }))
    await chooseOption(user, 'Language', 'English')
    await user.click(screen.getByRole('button', { name: 'Save book' }))
    await screen.findByRole('heading', { level: 1, name: 'Atomic Habits' })
    const row = sheets.tabs.Books[1]
    expect(row[CATEGORIES]).toBe('Self-help, Psychology')
    expect(row[LANGUAGE]).toBe('English')
    expect(screen.getByText('Self-help, Psychology')).toBeInTheDocument() // detail page
  })

  it('a book with no category and no language saves as before', async () => {
    const { user, sheets } = renderApp({ route: '/books/new', sheets: sheetWithLists() })
    await screen.findByRole('group', { name: 'Categories' })
    await user.type(screen.getByLabelText(/^Title/), 'Dune')
    await user.type(screen.getByLabelText(/^Author/), 'Herbert')
    await user.click(screen.getByRole('button', { name: 'Save book' }))
    await screen.findByRole('heading', { level: 1, name: 'Dune' })
    expect(sheets.tabs.Books[1][CATEGORIES]).toBe('')
    expect(sheets.tabs.Books[1][LANGUAGE]).toBe('')
  })

  it('keeps the ticked categories in the draft across a reload', async () => {
    const sheets = sheetWithLists()
    const first = renderApp({ route: '/books/new', sheets })
    await screen.findByRole('group', { name: 'Categories' })
    await first.user.click(screen.getByRole('checkbox', { name: 'Business' }))
    first.unmount()
    renderApp({ route: '/books/new', sheets })
    await screen.findByRole('group', { name: 'Categories' })
    expect(screen.getByRole('checkbox', { name: 'Business' })).toBeChecked()
    expect(screen.getByRole('status', { name: '' })).toHaveTextContent('Restored your unsaved changes')
  })
})

describe('category and language on the edit form', () => {
  function tagged() {
    const sheets = sheetWithLists()
    sheets.tabs.Books.push(bookRow({ id: 'B-0001', title: 'Dune', author: 'Herbert', categories: 'Business, Retired', language: 'Tamil' }))
    return sheets
  }

  it('shows what the book has; a hidden (archived) category and language are kept when only the title changes', async () => {
    const { user, sheets } = renderApp({ route: '/books/B-0001/edit', sheets: tagged() })
    await screen.findByRole('group', { name: 'Categories' })
    expect(screen.getByRole('checkbox', { name: 'Business' })).toBeChecked()
    expect(screen.queryByRole('checkbox', { name: 'Retired' })).not.toBeInTheDocument()
    expect(shownIn('Language')).toBe('Tamil (archived)')
    expect(await optionsOf(user, 'Language')).toEqual(['Not set', 'English', 'Hindi', 'Tamil (archived)'])

    await user.clear(screen.getByLabelText(/^Title/))
    await user.type(screen.getByLabelText(/^Title/), 'Dune Messiah')
    await user.click(screen.getByRole('button', { name: 'Save changes' }))
    await screen.findByRole('heading', { level: 1, name: 'Dune Messiah' })
    expect(sheets.tabs.Books[1][CATEGORIES]).toBe('Business, Retired')
    expect(sheets.tabs.Books[1][LANGUAGE]).toBe('Tamil')
    const body = writes(sheets).at(-1)?.body as { data: { range: string }[] }
    expect(body.data.map((d) => d.range)).toEqual(['Books!B2']) // only the title cell
  })

  it('unticking, ticking and changing the language write just those cells', async () => {
    const { user, sheets } = renderApp({ route: '/books/B-0001/edit', sheets: tagged() })
    await screen.findByRole('group', { name: 'Categories' })
    await user.click(screen.getByRole('checkbox', { name: 'Business' }))
    await user.click(screen.getByRole('checkbox', { name: 'Self-help' }))
    await chooseOption(user, 'Language', 'Hindi')
    await user.click(screen.getByRole('button', { name: 'Save changes' }))
    await screen.findByRole('heading', { level: 1, name: 'Dune' })
    expect(sheets.tabs.Books[1][CATEGORIES]).toBe('Retired, Self-help') // the hidden one is still there
    expect(sheets.tabs.Books[1][LANGUAGE]).toBe('Hindi')
  })

  it('choosing "Not set" clears the language', async () => {
    const { user, sheets } = renderApp({ route: '/books/B-0001/edit', sheets: tagged() })
    await screen.findByRole('group', { name: 'Categories' })
    await chooseOption(user, 'Language', 'Not set')
    await user.click(screen.getByRole('button', { name: 'Save changes' }))
    await screen.findByRole('heading', { level: 1, name: 'Dune' })
    expect(sheets.tabs.Books[1][LANGUAGE]).toBe('')
  })
})

describe('a Sheet that is not set up for categories yet', () => {
  function oldSheet() {
    const sheets = new FakeSheets()
    delete sheets.tabs.Categories
    delete sheets.tabs.Languages
    sheets.tabs.Books[0] = BOOK_HEADER.slice(0, 8)
    return sheets
  }

  it('says what to add, disables the language select, and still saves books', async () => {
    const { user, sheets } = renderApp({ route: '/books/new', sheets: oldSheet() })
    expect(await screen.findByText(/Add a tab named "Categories"/)).toBeInTheDocument()
    expect(screen.getByText(/Add a tab named "Languages"/)).toBeInTheDocument()
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: 'Language' })).toBeDisabled()

    await user.type(screen.getByLabelText(/^Title/), 'Dune')
    await user.type(screen.getByLabelText(/^Author/), 'Herbert')
    await user.click(screen.getByRole('button', { name: 'Save book' }))
    await screen.findByRole('heading', { level: 1, name: 'Dune' })
    expect(sheets.tabs.Books[1]).toHaveLength(8)
  })

  it('a book saved before the tabs exist can be edited without touching the new columns', async () => {
    const sheets = oldSheet()
    sheets.tabs.Books.push(['B-0001', 'Dune', 'Herbert'])
    const { user } = renderApp({ route: '/books/B-0001/edit', sheets })
    await screen.findByText(/Add a tab named "Categories"/)
    await user.clear(screen.getByLabelText(/^Title/))
    await user.type(screen.getByLabelText(/^Title/), 'Dune 2')
    await user.click(screen.getByRole('button', { name: 'Save changes' }))
    await waitFor(() => expect(sheets.tabs.Books[1][1]).toBe('Dune 2'))
  })
})
