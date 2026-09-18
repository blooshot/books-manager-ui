import { beforeEach, describe, expect, it } from 'vitest'
import { SheetSchemaError, SheetTabMissingError, ValidationError } from '@/services/sheets/errors'
import { addOption, appendBook, readAll, renameOption, setOptionActive, updateBook } from '@/services/sheets/api'
import { createSheetsClient } from '@/services/sheets/client'
import { BOOK_HEADER, FakeSheets } from '@/test/fakeSheets'
import { bookRow, optionRow } from '@/test/fixtures'

const NOW = new Date(2026, 8, 18, 14, 5)

let sheets: FakeSheets
const client = () => createSheetsClient({ sheetId: 'sheet-1', getAccessToken: () => sheets.token, fetchImpl: sheets.fetch })
const writes = () => sheets.calls.filter((c) => c.method !== 'GET')
const batchGets = () => sheets.calls.filter((c) => c.url.includes('values:batchGet'))

beforeEach(() => {
  sheets = new FakeSheets()
})

describe('readAll with the Categories and Languages tabs', () => {
  it('returns both lists, archived ones included (the UI decides what to show)', async () => {
    sheets.tabs.Categories.push(optionRow('Business'), optionRow('Old', false))
    sheets.tabs.Languages.push(optionRow('English'))
    const data = await readAll(client())
    expect(data.categories).toEqual([{ name: 'Business', active: true }, { name: 'Old', active: false }])
    expect(data.languages).toEqual([{ name: 'English', active: true }])
    expect(data.setup).toEqual({})
  })

  it('a Sheet without the two tabs still loads: it retries without them and says what to add', async () => {
    delete sheets.tabs.Categories
    delete sheets.tabs.Languages
    sheets.tabs.Books.push(bookRow({ id: 'B-0001', title: 'Dune', author: 'Herbert' }))
    const data = await readAll(client())
    expect(data.books.map((b) => b.id)).toEqual(['B-0001'])
    expect(data.categories).toEqual([])
    expect(data.setup.categories).toMatch(/tab named "Categories"/)
    expect(data.setup.languages).toMatch(/tab named "Languages"/)
    expect(batchGets().length).toBeLessThanOrEqual(3) // first try, then one retry per missing tab at most
    expect(batchGets().at(-1)?.url).not.toContain('Categories')
  })

  it('one missing tab does not hide the other list', async () => {
    delete sheets.tabs.Languages
    sheets.tabs.Categories.push(optionRow('Business'))
    const data = await readAll(client())
    expect(data.categories).toEqual([{ name: 'Business', active: true }])
    expect(data.setup.categories).toBeUndefined()
    expect(data.setup.languages).toMatch(/Languages/)
  })

  it('an older Books header (no Categories/Language columns) loads and says which column to add', async () => {
    sheets.tabs.Books[0] = BOOK_HEADER.slice(0, 8)
    const data = await readAll(client())
    expect(data.setup.categories).toMatch(/"Categories" column/)
    expect(data.setup.languages).toMatch(/"Language" column/)
  })

  it('Books and Borrowers stay required: their absence is still an error', async () => {
    delete sheets.tabs.Books
    await expect(readAll(client())).rejects.toThrow(SheetTabMissingError)
  })

  it('a Categories tab with the wrong header is reported, not ignored', async () => {
    sheets.tabs.Categories[0] = ['Label', 'On']
    await expect(readAll(client())).rejects.toThrow(SheetSchemaError)
  })
})

describe('writing categories and language on a book', () => {
  it('appendBook stores them as a joined list and a name', async () => {
    const book = await appendBook(client(), { title: 'Dune', author: 'Herbert', categories: ['Fiction', 'Classics'], language: 'English' }, NOW)
    expect(book.categories).toEqual(['Fiction', 'Classics'])
    const header = sheets.tabs.Books[0]
    const row = sheets.tabs.Books[1]
    expect(row[header.indexOf('Categories')]).toBe('Fiction, Classics')
    expect(row[header.indexOf('Language')]).toBe('English')
  })

  it('updateBook changes only those cells, and an empty list or null clears the cell', async () => {
    await appendBook(client(), { title: 'Dune', author: 'Herbert', categories: ['Fiction'], language: 'English' }, NOW)
    sheets.calls.length = 0
    const changed = await updateBook(client(), 'B-0001', { categories: ['Fiction', 'Business'], language: 'Hindi' })
    expect(changed.categories).toEqual(['Fiction', 'Business'])
    expect(writes()[0].body).toMatchObject({ data: [{ values: [['Fiction, Business']] }, { values: [['Hindi']] }] })
    const cleared = await updateBook(client(), 'B-0001', { categories: [], language: null })
    expect(cleared.categories).toBeUndefined()
    expect(cleared.language).toBeUndefined()
    const header = sheets.tabs.Books[0]
    expect(sheets.tabs.Books[1][header.indexOf('Categories')]).toBe('')
    expect(sheets.tabs.Books[1][header.indexOf('Language')]).toBe('')
  })

  it('refuses to write a category into a Sheet that has no Categories column, and writes nothing', async () => {
    sheets.tabs.Books[0] = BOOK_HEADER.slice(0, 8)
    await expect(appendBook(client(), { title: 'Dune', author: 'Herbert', categories: ['Fiction'] }, NOW)).rejects.toThrow(/missing column\(s\): Categories/)
    expect(writes()).toHaveLength(0)
  })

  it('does not run the cover upload hook when the column is missing (no orphan file)', async () => {
    sheets.tabs.Books[0] = BOOK_HEADER.slice(0, 8)
    let uploaded = false
    await expect(
      appendBook(client(), { title: 'Dune', author: 'Herbert', language: 'Hindi' }, NOW, async () => {
        uploaded = true
        return 'link'
      }),
    ).rejects.toThrow(SheetSchemaError)
    expect(uploaded).toBe(false)
  })

  it('an older Sheet still accepts a book that has no categories or language', async () => {
    sheets.tabs.Books[0] = BOOK_HEADER.slice(0, 8)
    await appendBook(client(), { title: 'Dune', author: 'Herbert' }, NOW)
    expect(sheets.tabs.Books[1]).toHaveLength(8)
    await expect(updateBook(client(), 'B-0001', { title: 'Dune Messiah' })).resolves.toMatchObject({ title: 'Dune Messiah' })
    await expect(updateBook(client(), 'B-0001', { language: 'Hindi' })).rejects.toThrow(SheetSchemaError)
  })
})

describe('addOption', () => {
  it('appends Name and Yes', async () => {
    await expect(addOption(client(), 'categories', '  Self   help ')).resolves.toEqual({ name: 'Self help', active: true })
    expect(sheets.tabs.Categories[1]).toEqual(['Self help', 'Yes'])
  })

  it('rejects an empty name, a comma, a very long name, and a name that exists (ignoring case)', async () => {
    sheets.tabs.Categories.push(optionRow('Business'))
    await expect(addOption(client(), 'categories', '   ')).rejects.toThrow(ValidationError)
    await expect(addOption(client(), 'categories', 'Sales, Marketing')).rejects.toThrow(/commas/)
    await expect(addOption(client(), 'categories', 'x'.repeat(61))).rejects.toThrow(/too long/)
    await expect(addOption(client(), 'categories', 'business')).rejects.toThrow(/already exists/)
    expect(writes()).toHaveLength(0)
  })

  it('adding an archived name restores it instead of adding a second row', async () => {
    sheets.tabs.Languages.push(optionRow('Tamil', false))
    await expect(addOption(client(), 'languages', 'tamil')).resolves.toEqual({ name: 'Tamil', active: true })
    expect(sheets.tabs.Languages).toHaveLength(2)
    expect(sheets.tabs.Languages[1]).toEqual(['Tamil', 'Yes'])
  })

  it('works on the Languages tab too', async () => {
    await addOption(client(), 'languages', 'Hindi')
    expect(sheets.tabs.Languages[1]).toEqual(['Hindi', 'Yes'])
    expect(sheets.tabs.Categories).toHaveLength(1)
  })
})

describe('setOptionActive (archive / restore)', () => {
  it('sets only the Active cell, never removes the row, and books keep their text', async () => {
    sheets.tabs.Categories.push(optionRow('Business'))
    sheets.tabs.Books.push(bookRow({ id: 'B-0001', title: 'Dune', author: 'Herbert', categories: 'Business' }))
    await setOptionActive(client(), 'categories', 'business', false)
    expect(sheets.tabs.Categories).toEqual([['Name', 'Active'], ['Business', 'No']])
    expect(sheets.tabs.Books[1][8]).toBe('Business')
    expect(writes()).toHaveLength(1)
    expect(writes()[0].body).toMatchObject({ data: [{ range: 'Categories!B2', values: [['No']] }] })
    await setOptionActive(client(), 'categories', 'Business', true)
    expect(sheets.tabs.Categories[1]).toEqual(['Business', 'Yes'])
  })

  it('makes no write when nothing changes, and rejects an unknown name', async () => {
    sheets.tabs.Categories.push(optionRow('Business'))
    await setOptionActive(client(), 'categories', 'Business', true)
    expect(writes()).toHaveLength(0)
    await expect(setOptionActive(client(), 'categories', 'Nope', false)).rejects.toThrow(/not found/)
  })

  it('finds the row by name even if the Sheet was re-sorted', async () => {
    sheets.tabs.Categories.push(optionRow('Business'), optionRow('Psychology'))
    await setOptionActive(client(), 'categories', 'Psychology', false)
    sheets.tabs.Categories = [sheets.tabs.Categories[0], sheets.tabs.Categories[2], sheets.tabs.Categories[1]]
    await setOptionActive(client(), 'categories', 'Business', false)
    expect(sheets.tabs.Categories.slice(1)).toEqual([['Psychology', 'No'], ['Business', 'No']])
  })
})

describe('renameOption', () => {
  function library() {
    sheets.tabs.Categories.push(optionRow('Self help'), optionRow('Business'))
    sheets.tabs.Languages.push(optionRow('Hindi'), optionRow('English'))
    sheets.tabs.Books.push(
      bookRow({ id: 'B-0001', title: 'A', author: 'x', categories: 'Business, Self help', language: 'Hindi' }),
      bookRow({ id: 'B-0002', title: 'B', author: 'x', categories: 'Business' }),
      bookRow({ id: 'B-0003', title: 'C', author: 'x', categories: 'Self help', language: 'English' }),
    )
  }

  it('renames the list row and the same text on every book, in one batchUpdate', async () => {
    library()
    await renameOption(client(), 'categories', 'Self help', 'Self-help')
    expect(sheets.tabs.Categories[1]).toEqual(['Self-help', 'Yes'])
    expect(sheets.tabs.Books[1][8]).toBe('Business, Self-help')
    expect(sheets.tabs.Books[2][8]).toBe('Business')
    expect(sheets.tabs.Books[3][8]).toBe('Self-help')
    expect(writes()).toHaveLength(1)
  })

  it('renames a language on the books that use it', async () => {
    library()
    await renameOption(client(), 'languages', 'Hindi', 'हिन्दी')
    expect(sheets.tabs.Languages[1][0]).toBe('हिन्दी')
    expect(sheets.tabs.Books[1][9]).toBe('हिन्दी')
    expect(sheets.tabs.Books[3][9]).toBe('English')
  })

  it('a repeat after the row was already renamed still fixes the books (safe to retry)', async () => {
    library()
    sheets.tabs.Categories[1][0] = 'Self-help' // the first attempt got this far
    await renameOption(client(), 'categories', 'Self help', 'Self-help')
    expect(sheets.tabs.Books[3][8]).toBe('Self-help')
    await renameOption(client(), 'categories', 'Self help', 'Self-help')
    expect(writes()).toHaveLength(1) // the second repeat found nothing left to change
  })

  it('renaming into an existing name, or renaming something that is not there, changes nothing', async () => {
    library()
    await expect(renameOption(client(), 'categories', 'Self help', 'business')).rejects.toThrow(/already exists/)
    await expect(renameOption(client(), 'categories', 'Ghost', 'Spirit')).rejects.toThrow(/not found/)
    await expect(renameOption(client(), 'categories', 'Business', 'A, B')).rejects.toThrow(/commas/)
    expect(writes()).toHaveLength(0)
  })

  it('a change of case only is allowed', async () => {
    library()
    await renameOption(client(), 'categories', 'Business', 'BUSINESS')
    expect(sheets.tabs.Categories[2][0]).toBe('BUSINESS')
    expect(sheets.tabs.Books[2][8]).toBe('BUSINESS')
  })

  it('keeps an archived category archived', async () => {
    sheets.tabs.Categories.push(optionRow('Old', false))
    await renameOption(client(), 'categories', 'Old', 'Older')
    expect(sheets.tabs.Categories[1]).toEqual(['Older', 'No'])
  })

  it('leaves the books alone when the Sheet has no Categories column', async () => {
    library()
    sheets.tabs.Books = [BOOK_HEADER.slice(0, 8), ...sheets.tabs.Books.slice(1).map((r) => r.slice(0, 8))]
    await renameOption(client(), 'categories', 'Business', 'Work')
    expect(sheets.tabs.Categories[2][0]).toBe('Work')
    expect(writes()).toHaveLength(1)
  })
})

describe('deleting a book (Active flag, ADR-0009)', () => {
  const activeCell = (row: number) => sheets.tabs.Books[row][10]
  beforeEach(() => {
    sheets.tabs.Books.push(bookRow({ id: 'B-0001', title: 'Dune', author: 'Herbert' }), bookRow({ id: 'B-0002', title: 'Emma', author: 'Austen' }))
  })

  it('archived: true writes No into that row\'s Active cell only', async () => {
    const book = await updateBook(client(), 'B-0002', { archived: true })
    expect(book.archived).toBe(true)
    expect(activeCell(2)).toBe('No')
    expect(activeCell(1)).toBe('')
    expect(writes()).toHaveLength(1)
    expect(writes()[0].body).toMatchObject({ data: [{ range: 'Books!K3', values: [['No']] }] })
  })

  it('archived: false restores it with Yes', async () => {
    await updateBook(client(), 'B-0001', { archived: true })
    const restored = await updateBook(client(), 'B-0001', { archived: false })
    expect(restored.archived).toBeUndefined()
    expect(activeCell(1)).toBe('Yes')
  })

  it('never removes a row', async () => {
    await updateBook(client(), 'B-0001', { archived: true })
    expect(sheets.tabs.Books).toHaveLength(3)
    expect(sheets.tabs.Books.map((r) => r[0])).toEqual(['Book ID', 'B-0001', 'B-0002'])
  })

  it('a Sheet without the Active column refuses, names the column, and writes nothing', async () => {
    sheets.tabs.Books = sheets.tabs.Books.map((r) => r.slice(0, 10))
    sheets.tabs.Books[0] = BOOK_HEADER.slice(0, 10)
    await expect(updateBook(client(), 'B-0001', { archived: true })).rejects.toThrow(/missing column\(s\): Active/)
    expect(writes()).toHaveLength(0)
    const data = await readAll(client())
    expect(data.archiveSetup).toMatch(/"Active" column/)
  })

  it('readAll has no setup hint when the column exists', async () => {
    expect((await readAll(client())).archiveSetup).toBeUndefined()
  })

  it('a deleted book\'s Book ID is never handed out again', async () => {
    await updateBook(client(), 'B-0001', { archived: true })
    await updateBook(client(), 'B-0002', { archived: true })
    const next = await appendBook(client(), { title: 'New', author: 'X' }, NOW)
    expect(next.id).toBe('B-0003')
  })
})
